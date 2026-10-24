import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMediaBroker } from '../server/media.ts';
import { createCameraTransport } from '../client/media/transport.ts';
import type { MediaRequest } from '../client/media/protocol.ts';

class Peer {
  connectionState:RTCPeerConnectionState='new';localDescription:RTCSessionDescriptionInit|null=null;remoteDescription:RTCSessionDescriptionInit|null=null;
  onicecandidate:((event:any)=>void)|null=null;ontrack:((event:any)=>void)|null=null;onconnectionstatechange:(()=>void)|null=null;
  tracks:MediaStreamTrack[]=[];candidates:RTCIceCandidateInit[]=[];closed=false;
  async createOffer(){return {type:'offer' as const,sdp:'synthetic sender offer'};}
  async createAnswer(){return {type:'answer' as const,sdp:'synthetic receiver answer'};}
  async setLocalDescription(d:RTCSessionDescriptionInit){this.localDescription=d;}
  async setRemoteDescription(d:RTCSessionDescriptionInit){this.remoteDescription=d;}
  async addIceCandidate(c:RTCIceCandidateInit){if(!this.remoteDescription)throw Error('candidate before remote SDP');this.candidates.push(c);}
  addTrack(track:MediaStreamTrack){this.tracks.push(track);}
  close(){this.closed=true;this.connectionState='closed';}
}
function harness(){
  const broker=createMediaBroker();const peers:Peer[]=[],requests:MediaRequest[]=[],states:string[]=[],streams:(MediaStream|null)[]=[],sources:unknown[]=[];
  const sourceTrack=new EventTarget() as MediaStreamTrack;Object.assign(sourceTrack,{kind:'video',readyState:'live',stop:vi.fn()});
  const source={getVideoTracks:()=>[sourceTrack]} as unknown as MediaStream;
  const post=async(input:MediaRequest)=>{requests.push(input);return broker.handle('station_A',input);};
  const env={post,authenticate:async()=>{},createPeer:()=>{const p=new Peer();peers.push(p);return p as unknown as RTCPeerConnection;},makeId:(()=>{let i=0;return()=>`media_${++i}`;})()};
  const publisher=createCameraTransport({role:'publisher',stream:source,source:{sourceId:'camera_A',runId:'run_A'},onState:state=>states.push(state.phase)},env);
  const receiver=createCameraTransport({role:'receiver',onStream:(s,source)=>{streams.push(s);sources.push(source);},onState:state=>states.push(state.phase)},env);
  return {broker,peers,requests,states,streams,sources,source,sourceTrack,env,publisher,receiver};
}
afterEach(()=>vi.useRealTimers());
describe('single-feed peer transport — fake WebRTC, real mailbox',()=>{
  it('authenticates before registering and never registers an unauthorized receiver',async()=>{
    const post=vi.fn();const transport=createCameraTransport({role:'receiver'}, {authenticate:async()=>{throw Error('Staff authentication required');},post});
    await transport.start();expect(post).not.toHaveBeenCalled();expect(transport.getState()).toMatchObject({phase:'unavailable',reason:'Staff authentication required'});
  });
  it('relays the original camera track through an offer/answer with no relay servers, then clears on publisher stop',async()=>{
    vi.useFakeTimers();const h=harness();await h.publisher.start();await h.receiver.start();
    await vi.advanceTimersByTimeAsync(1500);
    expect(h.peers).toHaveLength(2);expect(h.peers.find(p=>p.tracks.length)?.tracks[0]).toBe(h.sourceTrack);
    expect(h.peers.map(p=>p.remoteDescription?.type).sort()).toEqual(['answer','offer']);
    const remoteTrack=Object.assign(new EventTarget(),{kind:'video'});
    const remote={getVideoTracks:()=>[remoteTrack]} as unknown as MediaStream;
    h.peers.find(p=>p.ontrack)?.ontrack?.({streams:[remote],track:remoteTrack});
    expect(h.streams.at(-1)).toBe(remote);
    expect(h.sources.at(-1)).toEqual({sourceId:'camera_A',runId:'run_A'});
    await h.publisher.close();await vi.advanceTimersByTimeAsync(500);
    expect(h.streams.at(-1)).toBeNull();expect(h.peers.every(p=>p.closed)).toBe(true);
    expect(h.sourceTrack.stop).not.toHaveBeenCalled();await h.receiver.close();
  });
  it('does not revive a late authorization result after unmount',async()=>{
    let release!:()=>void;const post=vi.fn();
    const transport=createCameraTransport({role:'receiver'},{post,authenticate:()=>new Promise<void>(resolve=>{release=resolve;})});
    const starting=transport.start();await transport.close();release();await starting;
    expect(post).not.toHaveBeenCalled();expect(transport.getState().phase).toBe('off');
  });
  it('clears received tracks immediately on failed auth polling and preserves the source camera',async()=>{
    vi.useFakeTimers();const h=harness();await h.publisher.start();await h.receiver.start();await vi.advanceTimersByTimeAsync(1500);
    h.broker.reset();await vi.advanceTimersByTimeAsync(500);
    expect(h.receiver.getState().phase).toBe('unavailable');expect(h.streams.at(-1)).toBeNull();
    expect(h.peers.every(p=>p.closed)).toBe(true);expect(h.sourceTrack.stop).not.toHaveBeenCalled();
    await h.publisher.close();await h.receiver.close();
  });
  it('uses no configured STUN/TURN endpoints in the real peer factory',async()=>{
    const h=harness();const Constructor=vi.fn(function(this:Peer,config:RTCConfiguration){expect(config.iceServers).toEqual([]);return new Peer();});
    vi.stubGlobal('RTCPeerConnection',Constructor);
    const p=createCameraTransport({role:'publisher',stream:h.source},{post:h.env.post,authenticate:async()=>{},makeId:()=> 'real_factory'});
    await p.start();await h.receiver.start();await new Promise(resolve=>setTimeout(resolve,500));
    expect(Constructor).toHaveBeenCalledOnce();await p.close();await h.receiver.close();vi.unstubAllGlobals();
  });
});
