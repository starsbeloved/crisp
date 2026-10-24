import { describe, expect, it } from 'vitest';
import type { TimedRGB } from '../shared/contracts.ts';
import { estimateContactPulse, contactWaveform } from '../client/phone/ppg.ts';

// Synthetic engineering fixtures only; they cannot establish fingertip coverage or accuracy.
function synthetic(hz = 1.2, seconds = 30, irregular = false): TimedRGB[] {
  return Array.from({length: seconds * 30 + 1}, (_, i) => {
    const tMs = i * 1000 / 30 + (irregular && i > 0 && i < seconds * 30 ? Math.sin(i * 2.4) * 8 : 0);
    const pulse = 0.02 * Math.sin(2 * Math.PI * hz * tMs / 1000);
    const noise = 0.0003 * Math.sin(i * 1.713) + 0.0002 * Math.cos(i * 0.917);
    return {tMs, r:0.75 + pulse + noise, g:0.25 + pulse * 0.7 + noise, b:0.12 + pulse * 0.4 + noise,
      saturationFraction:{r:0,g:0,b:0}};
  });
}
describe('contact DSP — synthetic fixtures', () => {
  it('extracts 72 BPM from 30 seconds with finite quality metrics and bounded local trace', () => {
    const result = estimateContactPulse(synthetic());
    expect(result.bpm).toBeCloseTo(72, 0);
    expect(result.quality).toBe('usable');
    expect(result.metrics.peakToNoise).toBeGreaterThanOrEqual(3);
    expect(result.metrics.beatAgreement).toBeGreaterThanOrEqual(0.8);
    expect(result.metrics.durationMs).toBe(30000);
    expect(Object.values(result.metrics).every(Number.isFinite)).toBe(true);
    const trace = contactWaveform(synthetic());
    expect(trace.length).toBeGreaterThan(100);
    expect(trace.length).toBeLessThanOrEqual(300);
    expect(trace.every(p => Number.isFinite(p.value))).toBe(true);
  });
  it('resamples actual irregular timestamps without changing the pulse', () => {
    expect(estimateContactPulse(synthetic(1.2,30,true)).bpm).toBeCloseTo(72, 0);
  });
  it('selects usable green when red alone clips', () => {
    const samples = synthetic().map(s => ({...s,r:1,saturationFraction:{r:1,g:0,b:0}}));
    const result = estimateContactPulse(samples);
    expect(result.bpm).toBeCloseTo(72,0);
    expect(result.metrics.channel).toBe(1);
  });
  it('rejects every saturated candidate at the inclusive five percent boundary', () => {
    expect(estimateContactPulse(synthetic().map(s=>({...s,saturationFraction:{r:0.05,g:0.05,b:0.05}}))).bpm).toBeNull();
  });
  it.each([
    ['flat', () => synthetic().map(s=>({...s,r:0.6,g:0.3,b:0.15}))],
    ['short', () => synthetic(1.2,29)],
    ['gap', () => synthetic().filter(s=>s.tMs < 10000 || s.tMs > 10200)],
    ['slow cadence', () => synthetic().filter((_,i)=>i%3===0)],
    ['unsupported high frequency', () => synthetic(3.8)],
    ['unsupported low frequency', () => synthetic(0.4)],
    ['nonfinite', () => synthetic().map((s,i)=>i===10?{...s,g:NaN}:s)],
    ['reversed', () => synthetic().reverse()],
    ['low periodicity', () => { let seed=7; return synthetic().map(s=>{ seed=(seed*1664525+1013904223)>>>0; const n=seed/2**32;return {...s,r:n*.1+.6,g:n*.1+.3,b:n*.1+.1};});}],
  ] as const)('returns unavailable pulse for %s', (_, build) => {
    const result = estimateContactPulse(build());
    expect(result.bpm).toBeNull();
    expect(result.quality).not.toBe('usable');
    expect(result.reason).toBeTruthy();
    expect(Object.values(result.metrics).every(Number.isFinite)).toBe(true);
  });
  it('does not manufacture a waveform for flat input', () => {
    expect(contactWaveform(synthetic().map(s=>({...s,r:0.5,g:0.5,b:0.5})))).toEqual([]);
  });
});

import { afterEach, vi } from 'vitest';
import { inspectContactFrame, openPhoneCapture } from '../client/phone/capture.ts';
function pixels(r:number,g:number,b:number, noisy=false): Uint8ClampedArray {
  return Uint8ClampedArray.from(Array.from({length:64},(_,i)=>[r+(noisy&&i%2?80:0),g,b,255]).flat());
}
describe('contact optical quality — synthetic image fixtures', () => {
  it('normalizes channels and preserves per-channel clipping', () => {
    const frame=inspectContactFrame(pixels(255,70,30));
    expect(frame.sample.r).toBe(1);
    expect(frame.sample.g).toBeCloseTo(70/255);
    expect(frame.sample.saturationFraction).toEqual({r:1,g:0,b:0});
    expect(frame.eligible).toBe(true);
  });
  it('rejects no-finger images using coverage, chromaticity and texture', () => {
    expect(inspectContactFrame(pixels(110,120,130)).eligible).toBe(false);
    expect(inspectContactFrame(pixels(0,0,0)).eligible).toBe(false);
    const mixed=pixels(180,60,25); for(let i=0;i<mixed.length/2;i+=4){mixed[i]=80;mixed[i+1]=140;mixed[i+2]=160;}
    expect(inspectContactFrame(mixed).eligible).toBe(false);
  });
  it('rejects movement independently of spectral periodicity', () => {
    expect(inspectContactFrame(pixels(220,90,30),pixels(140,40,20)).reason).toMatch(/movement/i);
  });
  it('rejects saturation when all channels clip', () => {
    expect(inspectContactFrame(pixels(255,255,255)).eligible).toBe(false);
  });
});

// External browser boundaries only: no real camera is opened by these tests.
function browserHarness(options:{torch?:boolean;applyFails?:boolean;denied?:boolean;rear?:boolean}={}) {
  vi.useFakeTimers();
  let hidden=false, next=1, mediaTime=0, image=pixels(180,60,25);
  const documentTarget=new EventTarget();
  const documentAdapter=Object.assign(documentTarget,{createElement:()=>({width:0,height:0,getContext:()=>({drawImage:()=>{},getImageData:()=>({data:image})})})});
  Object.defineProperty(documentAdapter,'hidden',{get:()=>hidden});
  const trackTarget=new EventTarget();
  const track=Object.assign(trackTarget,{getCapabilities:()=>({torch:options.torch??true}),getSettings:()=>({facingMode:options.rear===false?'user':'environment'}),applyConstraints:vi.fn(async()=>{if(options.applyFails)throw Error('torch failed');}),stop:vi.fn()});
  const stream={getTracks:()=>[track],getVideoTracks:()=>[track]};
  const media=vi.fn(async()=>{if(options.denied)throw Error('permission denied');return stream;});
  const frames=new Map<number,(now:number,meta:{mediaTime:number})=>void>();
  const video={srcObject:null,muted:false,playsInline:false,videoWidth:640,videoHeight:480,readyState:4,currentTime:0,play:async()=>{},pause:vi.fn(),requestVideoFrameCallback:(cb:(now:number,meta:{mediaTime:number})=>void)=>{frames.set(next,cb);return next++;},cancelVideoFrameCallback:(id:number)=>frames.delete(id)} as unknown as HTMLVideoElement;
  vi.stubGlobal('document',documentAdapter);vi.stubGlobal('window',new EventTarget());
  vi.stubGlobal('isSecureContext',true);vi.stubGlobal('navigator',{mediaDevices:{getUserMedia:media}});
  return {video,track,media,stream,setPixels:(data:Uint8ClampedArray)=>{image=data;},
    hide:()=>{hidden=true;documentTarget.dispatchEvent(new Event('visibilitychange'));},
    frame:(elapsed:number)=>{mediaTime+=elapsed/1000;vi.advanceTimersByTime(elapsed);const callbacks=[...frames.values()];frames.clear();callbacks.forEach(cb=>cb(performance.now(),{mediaTime}));},
  };
}
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
describe('phone capture resource lifecycle — browser adapters', () => {
  it('denied permission never produces samples', async()=>{
    const h=browserHarness({denied:true}),samples:TimedRGB[]=[];
    await expect(openPhoneCapture(h.video,s=>samples.push(s))).rejects.toThrow(/permission/i);
    expect(samples).toEqual([]);
  });
  it.each([{torch:false},{applyFails:true},{rear:false}])('releases tracks on unsupported camera/torch %o',async options=>{
    const h=browserHarness(options);
    await expect(openPhoneCapture(h.video,()=>{})).rejects.toThrow();
    expect(h.track.stop).toHaveBeenCalledOnce();
    expect(h.video.srcObject).toBeNull();
  });
  it('settles for two seconds, emits original frame times, and stops torch once on repeated stop',async()=>{
    const h=browserHarness(),samples:TimedRGB[]=[];
    const capture=await openPhoneCapture(h.video,s=>samples.push(s));
    for(let i=0;i<19;i++)h.frame(100);
    expect(samples).toEqual([]);
    h.frame(100);h.frame(100);h.frame(100);
    expect(samples.length).toBeGreaterThan(0);
    expect(samples.at(-1)!.tMs-samples[0].tMs).toBe(100);
    await Promise.all([capture.stop(),capture.stop()]);
    expect(h.track.stop).toHaveBeenCalledOnce();
    expect(h.track.applyConstraints).toHaveBeenLastCalledWith({advanced:[{torch:false}]});
    expect(h.video.srcObject).toBeNull();
  });
  it('a frame gap during settling restarts the two-second optical interval',async()=>{
    const h=browserHarness(),samples:TimedRGB[]=[];
    const capture=await openPhoneCapture(h.video,s=>samples.push(s));
    h.frame(100);h.frame(1000);
    for(let i=0;i<10;i++)h.frame(100);
    expect(samples).toEqual([]);
    await capture.stop();
  });
  it('coverage loss clears usable duration and requires fresh settling',async()=>{
    const h=browserHarness(),samples:TimedRGB[]=[];
    const capture=await openPhoneCapture(h.video,s=>samples.push(s));
    for(let i=0;i<25;i++)h.frame(100);
    const previous=samples.length;
    h.setPixels(pixels(100,120,140));h.frame(100);
    h.setPixels(pixels(180,60,25));
    for(let i=0;i<20;i++)h.frame(100);
    expect(samples).toHaveLength(previous);
    await capture.stop();
  });
  it('a naturally ended track releases torch and rejects further samples',async()=>{
    const h=browserHarness(),samples:TimedRGB[]=[];
    const capture=await openPhoneCapture(h.video,s=>samples.push(s));
    h.track.dispatchEvent(new Event('ended'));
    expect(await capture.done).toMatch(/track ended/);
    h.frame(100);expect(samples).toEqual([]);
    expect(h.track.stop).toHaveBeenCalledOnce();
  });
  it('hidden tab immediately ends attempt and releases camera',async()=>{
    const h=browserHarness(),capture=await openPhoneCapture(h.video,()=>{});
    h.hide();
    expect(await capture.done).toMatch(/background/i);
    expect(h.track.stop).toHaveBeenCalledOnce();
  });
  it('aborted permission request releases a late stream without enabling torch',async()=>{
    const h=browserHarness(),abort=new AbortController();
    const opening=openPhoneCapture(h.video,()=>{},{signal:abort.signal});abort.abort();
    await expect(opening).rejects.toThrow(/stop|cancel|abort/i);
    expect(h.track.stop).toHaveBeenCalledOnce();
    expect(h.track.applyConstraints).not.toHaveBeenCalledWith({advanced:[{torch:true}]});
  });
  it('ends attempts after sixty seconds even without decoded frames',async()=>{
    const h=browserHarness(),capture=await openPhoneCapture(h.video,()=>{});
    await vi.advanceTimersByTimeAsync(60000);
    expect(await capture.done).toMatch(/60/);
    expect(h.track.stop).toHaveBeenCalledOnce();
  });
  it('stops on ended track and on a throwing sample consumer',async()=>{
    const h=browserHarness(),capture=await openPhoneCapture(h.video,()=>{throw Error('consumer failed');});
    for(let i=0;i<22;i++)h.frame(100);
    expect(await capture.done).toMatch(/consumer failed/);
    expect(h.track.stop).toHaveBeenCalledOnce();
  });
});
