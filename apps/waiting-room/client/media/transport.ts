import { api, ApiError } from '../runtime/api.ts';
import { mediaReplySchema } from './protocol.ts';
import type { CameraSource, MediaEvent, MediaReply, MediaRequest, MediaSignal } from './protocol.ts';

export type MediaState={phase:'off'|'connecting'|'waiting'|'receiving'|'publishing'|'unavailable';reason:string};
type Options={role:'publisher'|'receiver';stream?:MediaStream;source?:CameraSource;onStream?:(stream:MediaStream|null,source:CameraSource|null)=>void;onState?:(state:MediaState)=>void};
type Environment={post?:(input:MediaRequest)=>Promise<MediaReply>;authenticate?:()=>Promise<unknown>;createPeer?:()=>RTCPeerConnection;makeId?:()=>string};
type Peer={pc:RTCPeerConnection;candidates:RTCIceCandidateInit[];remote:boolean;source:CameraSource|null};

async function postMedia(input:MediaRequest):Promise<MediaReply> {
  let response:Response;
  try{response=await fetch('/api/wr/media',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify(input),signal:AbortSignal.timeout(2500)});}
  catch{throw Error('Camera sharing service did not respond. Reconnect this view.');}
  const value:unknown=await response.json().catch(()=>null);
  if(!response.ok){const e=value as {error?:{message?:string;code?:string}}|null;throw new ApiError(response.status,e?.error?.code??'MEDIA_UNAVAILABLE',e?.error?.message??'Camera sharing is unavailable.');}
  const parsed=mediaReplySchema.safeParse(value);if(!parsed.success)throw Error('Camera sharing returned an invalid response.');return parsed.data;
}

/** No camera acquisition. Only the publisher borrows an existing camera stream. */
export function createCameraTransport(options:Options,environment:Environment={}) {
  const post=environment.post??postMedia,authenticate=environment.authenticate??api.getRoom;
  const createPeer=environment.createPeer??(()=>new RTCPeerConnection({iceServers:[],bundlePolicy:'max-bundle'}));
  const clientId=(environment.makeId??(()=>crypto.randomUUID()))();
  const peers=new Map<string,Peer>();
  let state:MediaState={phase:'off',reason:'Camera sharing is off'},generation=0,afterSeq=0,registered=false,closed=false;
  let pollTimer:ReturnType<typeof setTimeout>|undefined,starting=false;
  const set=(phase:MediaState['phase'],reason:string)=>{state={phase,reason};options.onState?.(state);};
  const drop=(id:string)=>{const peer=peers.get(id);if(!peer)return;peers.delete(id);peer.pc.ontrack=null;peer.pc.onicecandidate=null;peer.pc.onconnectionstatechange=null;peer.pc.close();if(options.role==='receiver')options.onStream?.(null,null);};
  const cleanup=()=>{clearTimeout(pollTimer);for(const id of peers.keys())drop(id);if(options.role==='receiver')options.onStream?.(null,null);};
  const retire=async()=>{const wasRegistered=registered;registered=false;if(wasRegistered)await post({action:'close',clientId}).catch(()=>{});};
  const fail=(error:unknown)=>{
    if(closed)return;closed=true;generation++;cleanup();set('unavailable',error instanceof Error?error.message:'Camera sharing unavailable');void retire();
  };
  const send=async(id:string,message:MediaSignal,version:number)=>{
    if(closed||generation!==version||!peers.has(id))return;
    try{await post({action:'send',clientId,targetId:id,message});}
    catch(e){if(generation===version&&!closed)fail(e);}
  };
  const addPeer=(id:string,version:number)=>{
    if(peers.has(id))return peers.get(id)!;
    const pc=createPeer(),peer:Peer={pc,candidates:[],remote:false,source:null};peers.set(id,peer);
    pc.onicecandidate=event=>{if(event.candidate)void send(id,{type:'candidate',candidate:event.candidate.toJSON()},version);};
    pc.onconnectionstatechange=()=>{
      if(closed||generation!==version)return;
      if(['failed','disconnected','closed'].includes(pc.connectionState)){drop(id);if(options.role==='receiver')set('waiting','Shared video disconnected. Waiting for Vision; reconnect if it does not return.');}
    };
    if(options.role==='receiver')pc.ontrack=event=>{
      if(closed||generation!==version||peers.get(id)!==peer)return;
      if(event.track.kind!=='video')return;
      const stream=event.streams[0]??new MediaStream([event.track]);
      options.onStream?.(stream,peer.source);set('receiving','Shared camera connected. Waiting for freshly presented frames.');
      const lost=()=>{if(!closed&&generation===version&&peers.get(id)===peer){drop(id);set('waiting','The shared camera track stopped. Waiting for Vision.');}};
      event.track.addEventListener('ended',lost,{once:true});event.track.addEventListener('mute',lost,{once:true});
    };
    return peer;
  };
  const flushCandidates=async(peer:Peer)=>{while(peer.candidates.length)await peer.pc.addIceCandidate(peer.candidates.shift()!);};
  const event=async(value:MediaEvent,version:number)=>{
    if(value.seq<=afterSeq)return;
    if(value.type==='left'){
      drop(value.peerId);
      if(options.role==='receiver')set('waiting','Vision camera is stopped or no longer sharing.');
    }else if(value.type==='peer'){
      if(options.role==='publisher'&&value.role==='receiver'){
        const peer=addPeer(value.peerId,version);
        for(const track of options.stream!.getVideoTracks())peer.pc.addTrack(track,options.stream!);
        const offer=await peer.pc.createOffer();if(closed||generation!==version)return;
        await peer.pc.setLocalDescription(offer);await send(value.peerId,{type:'offer',sdp:peer.pc.localDescription?.sdp??offer.sdp??'',...(options.source?{source:options.source}:{})},version);
      }else if(options.role==='receiver'&&value.role==='publisher'){addPeer(value.peerId,version);set('connecting','Connecting to the Vision camera…');}
    }else{
      const peer=peers.get(value.peerId);if(!peer)throw Error('Media signal arrived for an unknown camera connection. Reconnect.');
      if(value.message.type==='candidate'){
        if(peer.remote)await peer.pc.addIceCandidate(value.message.candidate);
        else{if(peer.candidates.length>=128)throw Error('Too many pending camera connection candidates.');peer.candidates.push(value.message.candidate);}
      }else if(value.message.type==='offer'&&options.role==='receiver'){
        peer.source=value.message.source??null;
        await peer.pc.setRemoteDescription(value.message);peer.remote=true;await flushCandidates(peer);
        const answer=await peer.pc.createAnswer();if(closed||generation!==version)return;
        await peer.pc.setLocalDescription(answer);await send(value.peerId,{type:'answer',sdp:peer.pc.localDescription?.sdp??answer.sdp??''},version);
      }else if(value.message.type==='answer'&&options.role==='publisher'){
        await peer.pc.setRemoteDescription(value.message);peer.remote=true;await flushCandidates(peer);
      }else throw Error('Unexpected camera negotiation. Reconnect this view.');
    }
    if(!closed&&generation===version)afterSeq=value.seq;
  };
  const consume=async(reply:MediaReply,version:number)=>{for(const value of reply.events){if(closed||generation!==version)return;await event(value,version);}};
  const poll=async(version:number)=>{
    try{const reply=await post({action:'poll',clientId,afterSeq});if(closed||generation!==version)return;await consume(reply,version);}
    catch(e){if(generation===version&&!closed)fail(e);}
    if(!closed&&generation===version)pollTimer=setTimeout(()=>void poll(version),400);
  };
  return {
    getState:()=>state,
    async start(){
      if(starting||registered||closed)return;starting=true;const version=generation;set('connecting','Checking staff access for camera sharing…');
      try{
        await authenticate();if(closed||generation!==version)return;
        if(options.role==='publisher'&&(!options.stream||!options.stream.getVideoTracks().some(t=>t.readyState==='live')))throw Error('Vision has no live camera track to share.');
        const reply=await post({action:'register',clientId,role:options.role});registered=true;
        if(closed||generation!==version){await retire();return;}
        set(options.role==='publisher'?'publishing':'waiting',options.role==='publisher'?'Sharing Vision camera with authenticated staff tabs':'Waiting for the Vision camera. No camera is opened here.');
        await consume(reply,version);if(!closed&&generation===version)pollTimer=setTimeout(()=>void poll(version),400);
      }catch(e){if(!closed&&generation===version)fail(e);}
      finally{starting=false;}
    },
    async close(){if(!closed){closed=true;generation++;cleanup();set('off','Camera sharing stopped');}await retire();},
  };
}
