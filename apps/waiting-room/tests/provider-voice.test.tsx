// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createVoiceController, VoiceControls } from '../client/staff/VoiceControls.tsx';
import type { AudioJob, RoomSnapshot } from '../shared/contracts.ts';
import { emptyRoom, openRequestRoom } from '../shared/fixtures.ts';
import { buildFactualFallback } from '../server/providers/grounding.ts';
import type { BrowserAudioPlayer, ProviderClient } from '../client/staff/provider-client.ts';

async function flush(){for(let i=0;i<50;i++)await Promise.resolve();}
afterEach(()=>{cleanup();vi.useRealTimers();vi.unstubAllGlobals();sessionStorage.clear();});
function fixture(){
  let room=structuredClone(emptyRoom);room.serverNowMs=openRequestRoom.serverNowMs;
  const client={fetchSnapshot:vi.fn(async(_signal:AbortSignal)=>structuredClone(room)),requestExplanation:vi.fn(async(id:string,version:number,_signal:AbortSignal)=>{
    const event=room.requests.find(e=>e.id===id)!;return {state:'fallback' as const,value:buildFactualFallback({eventId:id,version,event,binding:room.bindings[0],visit:room.visits[0],measurements:room.measurements,facts:event.facts},'unavailable')};
  }),requestSpeech:vi.fn(async(id:string,version:number,_signal:AbortSignal)=>room.audioJobs.find(j=>j.eventId===id&&j.snapshotVersion===version)!),summarizeQuestionnaire:vi.fn()} satisfies ProviderClient;
  const player={unlock:vi.fn(async()=>{}),play:vi.fn(async(_job:AudioJob,_signal:AbortSignal)=>{}),test:vi.fn(async(_signal:AbortSignal)=>{}),cancel:vi.fn(),dispose:vi.fn()} satisfies BrowserAudioPlayer;
  const changes=vi.fn();const controller=createVoiceController({client,player,storage:sessionStorage,onChange:changes});
  controller.update({room,connected:true,actionEpoch:0});
  function next(){room=structuredClone(openRequestRoom);const event=room.requests[0];room.audioJobs=[{id:'new_job',eventId:event.id,snapshotVersion:event.snapshotVersion,state:'ready',text:'Please check the patient.',url:'/api/wr/audio/new_job',createdAtMs:room.serverNowMs}];return room;}
  return {client,player,controller,changes,next,setRoom:(r:RoomSnapshot)=>room=r,getRoom:()=>room};
}
describe('full browser voice controller with injected browser/provider boundaries',()=>{
  it('does not speak or call TTS before enable and does not burst requests observed while disabled',async()=>{
    const f=fixture();const room=f.next();f.controller.update({room,connected:true,actionEpoch:0});await flush();
    expect(f.client.requestExplanation).toHaveBeenCalledTimes(1);expect(f.client.requestSpeech).not.toHaveBeenCalled();
    await f.controller.enable();await flush();expect(f.player.unlock).toHaveBeenCalledTimes(1);expect(f.client.requestSpeech).not.toHaveBeenCalled();f.controller.dispose();
  });
  it('automatically explains and speaks one new event after enable, repeats neither across polls',async()=>{
    const f=fixture();await f.controller.enable();const room=f.next();f.controller.update({room,connected:true,actionEpoch:0});await flush();
    expect(f.client.requestExplanation).toHaveBeenCalledTimes(1);expect(f.client.requestSpeech).toHaveBeenCalledTimes(1);expect(f.player.play).toHaveBeenCalledTimes(1);
    for(let i=0;i<4;i++)f.controller.update({room:{...room,revision:room.revision+i},connected:true,actionEpoch:0});await flush();
    expect(f.player.play).toHaveBeenCalledTimes(1);expect(f.controller.status().items[0].explanation).toBe('fallback');
    expect(JSON.parse(sessionStorage.getItem('wr.voice.started.v1')!)).toContain(room.requests[0].id);f.controller.dispose();
  });
  it.each(['action','mute','hidden','disconnect','identity','location'])('cancels %s during actual playback and retains visible request state',async kind=>{
    const f=fixture();let child:AbortSignal|undefined;
    f.player.play.mockImplementation(async(_job:AudioJob,s:AbortSignal)=>{child=s;return new Promise<void>((_resolve,reject)=>s.addEventListener('abort',()=>reject(new Error('aborted')),{once:true}));});
    await f.controller.enable();const room=f.next();f.controller.update({room,connected:true,actionEpoch:0});await flush();expect(child?.aborted).toBe(false);
    if(kind==='mute')f.controller.setMuted(true);
    else if(kind==='hidden')f.controller.setVisible(false);
    else {const next=structuredClone(room);if(kind==='identity')next.bindings[0].identityEpoch='other';if(kind==='location')next.bindings[0].observedLocation!.label='C2';f.setRoom(next);f.controller.update({room:next,connected:kind!=='disconnect',actionEpoch:kind==='action'?1:0});}
    expect(child?.aborted).toBe(true);expect(room.requests[0].state).toBe('open');await flush();f.controller.dispose();
  });
  it('invalidates a pending provider response on action and never plays delayed bytes',async()=>{
    const f=fixture();let complete!:(job:AudioJob)=>void;let child:AbortSignal|undefined;
    f.client.requestSpeech.mockImplementation(async(_id:string,_version:number,s:AbortSignal)=>{child=s;return new Promise<AudioJob>(resolve=>complete=resolve);});
    await f.controller.enable();const room=f.next();f.controller.update({room,connected:true,actionEpoch:0});await flush();
    f.controller.update({room,connected:true,actionEpoch:1});expect(child?.aborted).toBe(true);complete(room.audioJobs[0]);await flush();expect(f.player.play).not.toHaveBeenCalled();f.controller.dispose();
  });
  it('checks remote state at <=1s and stops playback when the server acknowledges',async()=>{
    vi.useFakeTimers();const f=fixture();let child:AbortSignal|undefined;
    f.player.play.mockImplementation(async(_job:AudioJob,s:AbortSignal)=>{child=s;return new Promise<void>((_resolve,reject)=>s.addEventListener('abort',()=>reject(new Error('aborted')),{once:true}));});
    await f.controller.enable();const room=f.next();f.controller.update({room,connected:true,actionEpoch:0});await flush();
    const changed=structuredClone(room);changed.requests[0].state='acknowledged';f.setRoom(changed);await vi.advanceTimersByTimeAsync(750);expect(child?.aborted).toBe(true);f.controller.dispose();expect(vi.getTimerCount()).toBe(0);
  });
  it('keeps playing across harmless heartbeat/bounds updates, fails closed on room polling failure',async()=>{
    vi.useFakeTimers();const f=fixture();let child:AbortSignal|undefined;
    f.player.play.mockImplementation(async(_job:AudioJob,s:AbortSignal)=>{child=s;return new Promise<void>((_resolve,reject)=>s.addEventListener('abort',()=>reject(new Error('aborted')),{once:true}));});
    await f.controller.enable();const room=f.next();f.controller.update({room,connected:true,actionEpoch:0});await flush();
    const next=structuredClone(room);next.bindings[0].bounds.x+=.01;next.bindings[0].lastVerifiedAtMs+=50;f.setRoom(next);f.controller.update({room:next,connected:true,actionEpoch:0});expect(child?.aborted).toBe(false);
    f.client.fetchSnapshot.mockRejectedValue(new Error('offline'));await vi.advanceTimersByTimeAsync(750);expect(child?.aborted).toBe(true);expect(f.controller.status().error).toContain('connection');f.controller.dispose();
  });
  it('restores starts on reload, never auto-speaks initial requests, and tests only local audio',async()=>{
    const f=fixture();await f.controller.enable();const room=f.next();f.controller.update({room,connected:true,actionEpoch:0});await flush();f.controller.dispose();
    const another=createVoiceController({client:f.client,player:f.player,storage:sessionStorage,onChange:vi.fn()});another.update({room,connected:true,actionEpoch:0});await another.enable();await flush();expect(f.player.play).toHaveBeenCalledTimes(1);
    await another.testAudio();expect(f.player.test).toHaveBeenCalledTimes(1);expect(f.client.requestSpeech).toHaveBeenCalledTimes(1);another.dispose();
  });
  it('shows disabled providers and browser permission failures truthfully; no automatic retries',async()=>{
    const f=fixture();f.client.requestExplanation.mockRejectedValue(new Error('disabled'));f.player.unlock.mockRejectedValue(new Error('blocked'));
    await f.controller.enable();expect(f.controller.status().enabled).toBe(false);expect(f.controller.status().error).toContain('audio');
    const room=f.next();f.controller.update({room,connected:true,actionEpoch:0});await flush();expect(f.controller.status().items[0].explanation).toBe('unavailable');
    f.controller.update({room,connected:true,actionEpoch:0});await flush();expect(f.client.requestExplanation).toHaveBeenCalledTimes(1);f.controller.dispose();
  });
  it('turns off voice after real playback denial so enable can be retried without replaying the started event',async()=>{
    const f=fixture();f.player.play.mockRejectedValue(new Error('autoplay blocked'));await f.controller.enable();const room=f.next();f.controller.update({room,connected:true,actionEpoch:0});await flush();
    expect(f.controller.status().enabled).toBe(false);expect(f.controller.status().error).toContain('audio');
    await f.controller.enable();f.controller.update({room,connected:true,actionEpoch:0});await flush();expect(f.player.play).toHaveBeenCalledTimes(1);f.controller.dispose();
  });
  it('stops hidden pending synthesis before a late server result and prevents unmute bursts',async()=>{
    const f=fixture();await f.controller.enable();f.controller.setMuted(true);const room=f.next();f.controller.update({room,connected:true,actionEpoch:0});await flush();
    f.controller.setMuted(false);f.controller.update({room,connected:true,actionEpoch:0});await flush();expect(f.client.requestSpeech).not.toHaveBeenCalled();f.controller.dispose();
  });
});

it('mounts accessible voice controls and hides no request on audio enable failure',async()=>{
  // No audio is actually played. jsdom has no native audio implementation.
  vi.spyOn(HTMLMediaElement.prototype,'play').mockRejectedValue(new DOMException('blocked','NotAllowedError'));
  vi.spyOn(HTMLMediaElement.prototype,'pause').mockImplementation(()=>{});vi.spyOn(HTMLMediaElement.prototype,'load').mockImplementation(()=>{});
  vi.stubGlobal('fetch',vi.fn(async()=>Response.json({error:{code:'unavailable',message:'Provider unavailable'}},{status:503})));
  vi.stubGlobal('URL',class extends URL {static createObjectURL=vi.fn(()=> 'blob:test');static revokeObjectURL=vi.fn();});
  render(<VoiceControls room={null} connected={false} actionEpoch={0}/>);
  fireEvent.click(screen.getByRole('button',{name:'Enable voice notifications'}));
  await waitFor(()=>expect(screen.getByRole('alert').textContent).toContain('audio'));
  expect(screen.getByRole('button',{name:'Enable voice notifications'})).toBeTruthy();expect(screen.getByRole('button',{name:'Test speaker with local tone'})).toBeTruthy();
});
