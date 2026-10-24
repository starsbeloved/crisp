// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import * as optical from '../../client/phone/capture.ts';
import { api } from '../../client/runtime/api.ts';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ClockSync, Measurement, SensorContext, TimedRGB } from '../../shared/contracts.ts';
import { ApiError } from '../../client/runtime/api.ts';
import { createPhoneSession, PhoneView, PhonePage } from '../../client/phone/PhonePage.tsx';
import type { PhoneCaptureHandle } from '../../client/phone/capture.ts';

const sync:ClockSync={id:'sync_phone',sourceId:'phone_1',runId:'run_1',offsetMs:0,uncertaintyMs:2,expiresAtMs:100000};
function harness() {
  let seq=0,id=0,sourceAt=1000;
  const context:SensorContext={sourceId:'phone_1',runId:'run_1',getSyncId:()=>sync.id,nextSeq:()=>++seq};
  let sample!:(value:TimedRGB)=>void, progress!:(s:{eligible:boolean;reason:string|null;usableMs:number;sampleCount:number})=>void;
  let ended!:(reason:string)=>void;
  const done=new Promise<string>(r=>{ended=r;});
  const stop=vi.fn(async()=>{ended('Stopped');});
  const requests:{captureId:string;input:{requestId:string;measurement:Omit<Measurement,'alignedStartAtMs'|'alignedEndAtMs'|'receivedAtMs'>}}[]=[];
  let saveFailure:Error|null=null, wrongResult=false, captureVisit='visit_A';
  const transport={
    join:vi.fn(async()=>({visitId:captureVisit,purpose:'ppg' as const})),
    createCapture:vi.fn(async()=>({visitId:captureVisit,captureId:'capture_A'})),
    cancelCapture:vi.fn(async()=>({cancelled:true as const})),
    completeCapture:vi.fn(async(captureId:string,input:typeof requests[number]['input'])=>{
      requests.push(structuredClone({captureId,input}));
      if(saveFailure)throw saveFailure;
      const m=input.measurement;
      return {...m,visitId:wrongResult?'visit_B':m.visitId,alignedStartAtMs:m.sourceStartAtMs,alignedEndAtMs:m.sourceEndAtMs,receivedAtMs:sourceAt};
    }),
  };
  const session=createPhoneSession({context,synchronize:async()=>sync,nowMs:()=>sourceAt},{transport,makeId:()=>`id_${++id}`,acquire:async(_video,onSample,options)=>{
    sample=onSample;progress=options?.onStatus??(()=>{});
    return {stop,done} satisfies PhoneCaptureHandle;
  }});
  return {session,transport,requests,stop,ended,context,
    fail:(error:Error|null)=>{saveFailure=error;},wrong:()=>{wrongResult=true;},visit:(v:string)=>{captureVisit=v;},
    feed:()=>{ for(let i=0;i<=900;i++) {sourceAt=3000+i*1000/30;const a=2*Math.PI*1.2*(sourceAt-3000)/1000;const n=.0003*Math.sin(i*1.713)+.0002*Math.cos(i*.917);progress({eligible:true,reason:null,usableMs:i*1000/30,sampleCount:i+1});sample({tMs:sourceAt,r:.75+.02*Math.sin(a)+n,g:.25+.014*Math.sin(a)+n,b:.12+.008*Math.sin(a)+n,saturationFraction:{r:0,g:0,b:0}});}},
  };
}
const video={} as HTMLVideoElement;
const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
async function start(h:ReturnType<typeof harness>) {await h.session.join('12345678');h.session.confirmVisit(true);await h.session.start(video);}
describe('phone pairing and save orchestration — synthetic transport',()=>{
  it('requires explicit visit confirmation before any capture request',async()=>{
    const h=harness();await h.session.join('12345678');await h.session.start(video);
    expect(h.session.getState().phase).toBe('paired');
    expect(h.transport.createCapture).not.toHaveBeenCalled();
    expect(h.session.getState().visitId).toBe('visit_A');
  });
  it('deduplicates simultaneous start actions before synchronization returns',async()=>{
    const h=harness();await h.session.join('12345678');h.session.confirmVisit(true);
    await Promise.all([h.session.start(video),h.session.start(video)]);
    expect(h.transport.createCapture).toHaveBeenCalledOnce();
    await h.session.dispose();
  });
  it('blocks acquisition without a real matching source clock',async()=>{
    const h=harness();h.context.getSyncId=()=>null;await start(h);
    expect(h.transport.createCapture).not.toHaveBeenCalled();
    expect(h.session.getState().phase).toBe('unavailable');
  });
  it('automatically submits exactly once and releases camera at thirty usable seconds',async()=>{
    const h=harness();await start(h);h.feed();h.feed();await flush();
    expect(h.requests).toHaveLength(1);
    expect(h.session.getState().phase).toBe('saved');
    expect(h.stop).toHaveBeenCalledOnce();
    expect(h.requests[0].input.measurement).toMatchObject({visitId:'visit_A',captureId:'capture_A',syncId:'sync_phone',provenance:'live_phone',method:'phone-camera-contact-ppg',trackId:null,identityEpoch:null});
    expect(h.requests[0].input.measurement.sourceEndAtMs-h.requests[0].input.measurement.sourceStartAtMs).toBe(30000);
    expect(h.requests[0].input.measurement.metrics.peakToNoise).toBeGreaterThanOrEqual(3);
  });
  it('retries the identical unsaved payload after sync expiry without retimestamping',async()=>{
    const h=harness();h.fail(new ApiError(0,'NETWORK_ERROR','Offline'));await start(h);h.feed();await flush();
    expect(h.session.getState().phase).toBe('unsaved');
    expect(h.requests).toHaveLength(1);
    h.context.getSyncId=()=>null;h.fail(null);await h.session.retry();
    expect(h.session.getState().phase).toBe('saved');
    expect(h.requests[1]).toEqual(h.requests[0]);
    expect(h.transport.createCapture).toHaveBeenCalledOnce();
  });
  it('does not accept a saved result for a different visit',async()=>{
    const h=harness();h.wrong();await start(h);h.feed();await flush();
    expect(h.session.getState().phase).toBe('unsaved');
    expect(h.session.getState().reason).toMatch(/match|visit/i);
  });
  it('expires explicitly and disallows retry of an expired capture',async()=>{
    const h=harness();h.fail(new ApiError(409,'CAPTURE_EXPIRED','Expired'));await start(h);h.feed();await flush();
    expect(h.session.getState().phase).toBe('unavailable');
    await h.session.retry();expect(h.requests).toHaveLength(1);
    expect(h.session.getState().reason).toMatch(/new capture/i);
  });
  it('late stop cancellation cannot overwrite a newly confirmed visit',async()=>{
    const h=harness();await start(h);
    let release!:()=>void;
    h.transport.cancelCapture.mockImplementation(()=>new Promise(resolve=>{release=()=>resolve({cancelled:true});}));
    const stopping=h.session.stop();await flush();
    h.visit('visit_B');await h.session.join('87654321');h.session.confirmVisit(true);
    const before=h.session.getState();release();await stopping;
    expect(h.session.getState()).toEqual(before);
  });
  it.each(['CAPTURE_CANCELLED','CLOCK_CAPTURE_EXPIRED','CAPTURE_COMPLETED'])('requires a new capture for terminal %s',async code=>{
    const h=harness();h.fail(new ApiError(409,code,'Capture no longer accepts completion'));await start(h);h.feed();await flush();
    expect(h.session.getState().phase).toBe('unavailable');
    await h.session.retry();expect(h.requests).toHaveLength(1);
  });
  it('re-pairing cancels old acquisition and never moves its samples to visit B',async()=>{
    const h=harness();await start(h);h.visit('visit_B');await h.session.join('87654321');h.feed();await flush();
    expect(h.session.getState().visitId).toBe('visit_B');
    expect(h.transport.cancelCapture).toHaveBeenCalledWith('capture_A',expect.any(String));
    expect(h.requests).toEqual([]);
    expect(h.stop).toHaveBeenCalledOnce();
  });
  it('background interruption is visibly unavailable and never submits',async()=>{
    const h=harness();await start(h);h.ended('Capture interrupted by backgrounding');await flush();
    expect(h.session.getState().phase).toBe('unavailable');
    expect(h.session.getState().reason).toMatch(/background/);
    expect(h.requests).toEqual([]);
  });
  it('unmount/disposal cancels acquisition and ignores late sample completion',async()=>{
    const h=harness();await start(h);await h.session.dispose();h.feed();await flush();
    expect(h.stop).toHaveBeenCalledOnce();
    expect(h.transport.cancelCapture).toHaveBeenCalledOnce();
    expect(h.requests).toEqual([]);
  });
  it('renders clear consent, collecting/unsupported/unsaved states and no placeholder BPM',()=>{
    const h=harness();const initial=h.session.getState();
    const actions={join:async()=>{},confirmVisit:()=>{},start:async()=>{},stop:async()=>{},retry:async()=>{}};
    const markup=(phase:typeof initial.phase,reason:string|null)=>renderToStaticMarkup(<PhoneView state={{...initial,phase,reason,visitId:phase==='unpaired'?null:'visit_A'}} actions={actions} videoRef={()=>{}} />);
    expect(markup('unpaired',null)).toContain('pairing code');
    expect(markup('paired',null)).toContain('Confirm visit');
    expect(markup('collecting',null)).toContain('Stop');
    expect(markup('unavailable','Flashlight unsupported')).toContain('Flashlight unsupported');
    expect(markup('unsaved','Offline')).toContain('Retry saving original reading');
    expect(markup('collecting',null)).not.toMatch(/72|SpO/);
  });
});


afterEach(()=>{cleanup();vi.restoreAllMocks();});
describe('mounted phone page — synthetic browser boundaries',()=>{
  it('can discard an unsaved capture without reopening the camera before continuing incomplete',async()=>{
    const h=harness();h.fail(new ApiError(0,'NETWORK_ERROR','Offline'));await start(h);h.feed();await flush();
    render(<PhoneView state={h.session.getState()} actions={{join:h.session.join,confirmVisit:h.session.confirmVisit,start:async()=>{},stop:h.session.stop,retry:h.session.retry}} videoRef={()=>{}}/>);
    fireEvent.click(screen.getByRole('button',{name:'Discard unsaved reading'}));
    await waitFor(()=>expect(h.session.getState().phase).toBe('paired'));
    expect(h.transport.cancelCapture).toHaveBeenCalledWith('capture_A',expect.any(String));
    await h.session.retry();expect(h.requests).toHaveLength(1);
  });
  it('uses a confirmed patient session without consuming another pairing grant and still waits for camera consent',async()=>{
    const h=harness();
    const join=vi.spyOn(api,'join');
    vi.spyOn(api,'createCapture').mockImplementation(h.transport.createCapture);
    vi.spyOn(api,'cancelCapture').mockImplementation(h.transport.cancelCapture);
    const stop=vi.fn(async()=>{});
    const acquire=vi.spyOn(optical,'openPhoneCapture').mockResolvedValue({stop,done:new Promise<string>(()=>{})});
    render(<PhonePage context={h.context} synchronize={async()=>sync} nowMs={()=>1000} confirmedPatient={{visitId:'visit_A',label:'Patient 021'}}/>);
    expect(screen.getByText('Patient 021')).toBeTruthy();
    expect(screen.queryByRole('button',{name:'Pair phone'})).toBeNull();
    expect(screen.getByRole('button',{name:'Start camera capture'}).hasAttribute('disabled')).toBe(true);
    expect(acquire).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button',{name:'Start camera capture'}));
    await screen.findByRole('button',{name:'Stop camera and flashlight now'});
    expect(join).not.toHaveBeenCalled();
    await waitFor(()=>expect(acquire).toHaveBeenCalledOnce());
  });
  it('joins, confirms consent, opens capture, and stops on user action in StrictMode',async()=>{
    const h=harness();
    vi.spyOn(api,'join').mockImplementation(h.transport.join);
    vi.spyOn(api,'createCapture').mockImplementation(h.transport.createCapture);
    vi.spyOn(api,'cancelCapture').mockImplementation(h.transport.cancelCapture);
    const done=new Promise<string>(()=>{}),stop=vi.fn(async()=>{});
    const acquire=vi.spyOn(optical,'openPhoneCapture').mockResolvedValue({stop,done});
    render(<StrictMode><PhonePage context={h.context} synchronize={async()=>sync} nowMs={()=>1000}/></StrictMode>);
    fireEvent.change(screen.getByRole('textbox',{name:'Eight-digit pairing code'}),{target:{value:'12345678'}});
    fireEvent.click(screen.getByRole('button',{name:'Pair phone'}));
    await screen.findByRole('heading',{name:'Confirm visit'});
    expect((screen.getByRole('button',{name:'Start camera capture'}) as HTMLButtonElement).disabled).toBe(true);
    expect(acquire).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button',{name:'Start camera capture'}));
    await screen.findByRole('button',{name:'Stop camera and flashlight now'});
    await waitFor(()=>expect(acquire).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole('button',{name:'Stop camera and flashlight now'}));
    await waitFor(()=>expect(stop).toHaveBeenCalledOnce());
    expect(screen.queryByText(/Contact pulse estimate/)).toBeNull();
  });
  it('preserves an active capture through parent rerenders with new callback identities and stops on unmount',async()=>{
    const h=harness();
    vi.spyOn(api,'join').mockImplementation(h.transport.join);
    vi.spyOn(api,'createCapture').mockImplementation(h.transport.createCapture);
    vi.spyOn(api,'cancelCapture').mockImplementation(h.transport.cancelCapture);
    const stop=vi.fn(async()=>{});
    vi.spyOn(optical,'openPhoneCapture').mockResolvedValue({stop,done:new Promise<string>(()=>{})});
    const mounted=render(<PhonePage context={h.context} synchronize={async()=>sync} nowMs={()=>1000}/>);
    fireEvent.change(screen.getByRole('textbox'),{target:{value:'12345678'}});
    fireEvent.click(screen.getByRole('button',{name:'Pair phone'}));await screen.findByRole('checkbox');
    fireEvent.click(screen.getByRole('checkbox'));fireEvent.click(screen.getByRole('button',{name:'Start camera capture'}));
    await screen.findByRole('button',{name:'Stop camera and flashlight now'});
    await waitFor(()=>expect(optical.openPhoneCapture).toHaveBeenCalledOnce());
    mounted.rerender(<PhonePage context={{...h.context}} synchronize={async()=>sync} nowMs={()=>1000}/>);
    expect(screen.getByRole('button',{name:'Stop camera and flashlight now'})).toBeTruthy();
    expect(stop).not.toHaveBeenCalled();
    mounted.unmount();await waitFor(()=>expect(stop).toHaveBeenCalledOnce());
  });
});
