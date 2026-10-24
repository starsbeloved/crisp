import { afterEach, describe, expect, it, vi } from 'vitest';
import { createProviderClient, createBrowserAudioPlayer } from '../client/staff/provider-client.ts';
import { openRequestRoom } from '../shared/fixtures.ts';
import type { AudioJob } from '../shared/contracts.ts';

afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
const proposal={complaint:'Reported: Original words',onset:'Today, reported',course:'Staying the same, reported',confirmed:false};
const answers={reason:'Original words',onset:'today' as const,onsetNote:'',course:'same' as const};
describe('typed local provider client',()=>{
  it('sends visit-scoped original answers with same-origin/no-store and an abort signal',async()=>{
    const fetcher=vi.fn(async()=>Response.json(proposal));const client=createProviderClient(fetcher);
    expect(await client.summarizeQuestionnaire('visit',answers,new AbortController().signal)).toEqual(proposal);
    expect(fetcher).toHaveBeenCalledWith('/api/wr/questionnaire-summary',expect.objectContaining({method:'POST',credentials:'same-origin',cache:'no-store',body:JSON.stringify({visitId:'visit',answers}),signal:expect.any(AbortSignal)}));
  });
  it('rejects a self-confirmed proposal and an event/version mismatch',async()=>{
    const fetcher=vi.fn(async()=>Response.json({...proposal,confirmed:true}));const client=createProviderClient(fetcher);
    await expect(client.summarizeQuestionnaire('visit',answers,new AbortController().signal)).rejects.toMatchObject({code:'INVALID_RESPONSE'});
    fetcher.mockResolvedValue(Response.json({id:'job',eventId:'wrong',snapshotVersion:2,state:'ready',text:'Please check.',url:'/api/wr/audio/job',createdAtMs:1}));
    await expect(client.requestSpeech('event',1,new AbortController().signal)).rejects.toMatchObject({code:'INVALID_RESPONSE'});
  });
  it('validates room payloads, input and structured service errors',async()=>{
    const fetcher=vi.fn(async()=>Response.json(openRequestRoom));const client=createProviderClient(fetcher);
    expect((await client.fetchSnapshot(new AbortController().signal)).requests[0].id).toBe('request_014');
    await expect(client.summarizeQuestionnaire('../invalid',answers,new AbortController().signal)).rejects.toMatchObject({code:'INVALID_REQUEST'});
    fetcher.mockResolvedValue(Response.json({error:{code:'SESSION_REQUIRED',message:'Session ended'}},{status:401}));
    await expect(client.summarizeQuestionnaire('visit',answers,new AbortController().signal)).rejects.toMatchObject({status:401,code:'SESSION_REQUIRED'});
  });
  it('aborts hung room validation at 1s, parent cancellation immediately, releases timers',async()=>{
    vi.useFakeTimers();let signal:AbortSignal|undefined;
    const client=createProviderClient(async(_url,init)=>{signal=init?.signal as AbortSignal;return new Promise<Response>(()=>{});});
    const pending=client.fetchSnapshot(new AbortController().signal);const check=expect(pending).rejects.toMatchObject({code:'TIMEOUT'});
    await vi.advanceTimersByTimeAsync(1000);await check;expect(signal?.aborted).toBe(true);expect(vi.getTimerCount()).toBe(0);
    const controller=new AbortController();const next=client.requestSpeech('event',1,controller.signal);const cancelled=expect(next).rejects.toMatchObject({code:'ABORTED'});controller.abort();await cancelled;expect(vi.getTimerCount()).toBe(0);
  });
});
class FakeAudio extends EventTarget {
  src='';preload='';volume=1;pause=vi.fn();load=vi.fn();removeAttribute=vi.fn((name:string)=>{if(name==='src')this.src='';});
  play=vi.fn(async()=>{});
}
const job:AudioJob={id:'job',eventId:'event',snapshotVersion:1,state:'ready',text:'Please check.',url:'/api/wr/audio/job',createdAtMs:1};
async function flush(){for(let i=0;i<12;i++)await Promise.resolve();}
describe('actual browser Audio adapter with injected element/HTTP',()=>{
  function fixture(){
    const audio=new FakeAudio();const fetcher=vi.fn(async(_url:RequestInfo|URL,_init?:RequestInit)=>new Response(new Uint8Array([1,2]),{headers:{'content-type':'audio/mpeg'}}));
    const createObjectURL=vi.fn((_blob:Blob)=>`blob:synthetic-${Math.random()}`),revokeObjectURL=vi.fn((_url:string)=>{});
    const player=createBrowserAudioPlayer({audio:audio as unknown as HTMLAudioElement,fetch:fetcher,createObjectURL,revokeObjectURL});return {audio,fetcher,createObjectURL,revokeObjectURL,player};
  }
  it('fetches only authenticated transient audio, resolves on ended, clears/revokes on completion',async()=>{
    const f=fixture();let settled=false;const pending=f.player.play(job,new AbortController().signal).then(()=>settled=true);await flush();
    expect(f.audio.play).toHaveBeenCalledTimes(1);expect(settled).toBe(false);
    expect(f.fetcher).toHaveBeenCalledWith(job.url,expect.objectContaining({credentials:'same-origin',cache:'no-store',signal:expect.any(AbortSignal)}));
    f.audio.dispatchEvent(new Event('ended'));await pending;expect(settled).toBe(true);expect(f.audio.pause).toHaveBeenCalled();expect(f.audio.src).toBe('');expect(f.revokeObjectURL).toHaveBeenCalledTimes(1);f.player.dispose();
  });
  it('synchronously pauses, clears src, revokes URL and aborts HTTP on cancellation during playback',async()=>{
    const f=fixture();const controller=new AbortController();const pending=f.player.play(job,controller.signal);const check=expect(pending).rejects.toMatchObject({name:'AbortError'});await flush();
    const fetchSignal=f.fetcher.mock.calls[0][1]?.signal;controller.abort();
    expect(f.audio.src).toBe('');expect(f.audio.pause).toHaveBeenCalled();expect(f.revokeObjectURL).toHaveBeenCalledTimes(1);expect(fetchSignal?.aborted).toBe(true);await check;f.player.dispose();
  });
  it('aborts pending fetch and never plays its late bytes',async()=>{
    const f=fixture();let complete!:(r:Response)=>void;f.fetcher.mockImplementation(()=>new Promise(resolve=>complete=resolve));
    const controller=new AbortController();const pending=f.player.play(job,controller.signal);const check=expect(pending).rejects.toMatchObject({name:'AbortError'});controller.abort();await check;
    complete(new Response(new Uint8Array([1]),{headers:{'content-type':'audio/mpeg'}}));await flush();expect(f.audio.play).not.toHaveBeenCalled();expect(f.createObjectURL).not.toHaveBeenCalled();f.player.dispose();
  });
  it('unlocks using local silent WAV in the click turn and tests a local audible WAV without providers',async()=>{
    const f=fixture();const unlock=f.player.unlock();expect(f.audio.play).toHaveBeenCalledTimes(1);await unlock;
    expect(f.fetcher).not.toHaveBeenCalled();expect(f.audio.src).toBe('');
    const test=f.player.test(new AbortController().signal);expect(f.audio.play).toHaveBeenCalledTimes(2);f.audio.dispatchEvent(new Event('ended'));await test;
    expect(f.fetcher).not.toHaveBeenCalled();expect(f.createObjectURL.mock.calls[0][0].type).toBe('audio/wav');f.player.dispose();
  });
  it('exposes autoplay denial and cleans up; rejects arbitrary/external URLs',async()=>{
    const f=fixture();f.audio.play.mockRejectedValue(new DOMException('blocked','NotAllowedError'));
    await expect(f.player.unlock()).rejects.toThrow();expect(f.audio.src).toBe('');expect(f.revokeObjectURL).toHaveBeenCalledTimes(1);
    await expect(f.player.play({...job,url:'https://untrusted.invalid/audio'},new AbortController().signal)).rejects.toThrow();expect(f.fetcher).not.toHaveBeenCalled();f.player.dispose();
  });
  it('times out browser unlock and local speaker test, releases their source and timers',async()=>{
    vi.useFakeTimers();const f=fixture();f.audio.play.mockImplementation(()=>new Promise(()=>{}));
    const unlock=f.player.unlock();const check=expect(unlock).rejects.toThrow();await vi.advanceTimersByTimeAsync(3000);await check;expect(f.audio.src).toBe('');expect(vi.getTimerCount()).toBe(0);
    f.audio.play.mockResolvedValue();const test=f.player.test(new AbortController().signal);const failed=expect(test).rejects.toThrow();await vi.advanceTimersByTimeAsync(3000);await failed;expect(f.audio.src).toBe('');f.player.dispose();expect(vi.getTimerCount()).toBe(0);
  });
});
