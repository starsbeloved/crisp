// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { StaffCamera } from '../client/media/StaffCamera.tsx';
import { emptyRoom } from '../shared/fixtures.ts';
import type { RoomSnapshot } from '../shared/contracts.ts';

const peers:FakePeer[]=[];
class FakePeer {
  connectionState='new';remoteDescription:unknown=null;localDescription:unknown=null;
  ontrack:((event:any)=>void)|null=null;onicecandidate:((event:any)=>void)|null=null;onconnectionstatechange:((event:any)=>void)|null=null;
  constructor(){peers.push(this);}
  async setRemoteDescription(d:unknown){this.remoteDescription=d;}
  async createAnswer(){return {type:'answer',sdp:'synthetic answer'};}
  async setLocalDescription(d:unknown){this.localDescription=d;}
  close(){this.connectionState='closed';}
}
let frameCallback:((at:number,metadata:VideoFrameCallbackMetadata)=>void)|null=null;
const room:RoomSnapshot={...emptyRoom,cameraState:'live',serverNowMs:2000,visits:[{id:'visit_A',label:'Patient 021',createdAtMs:1,preferredName:null,consentAtMs:1,completedAtMs:1,answers:null,summary:null,assignedSeat:null}],bindings:[{sourceId:'camera_A',runId:'run_A',trackId:'track_A',visitId:'visit_A',identityEpoch:'epoch_A',state:'matched',sinceMs:1000,lastVerifiedAtMs:1900,bounds:{x:.1,y:.2,width:.3,height:.4},observedLocation:{label:'Left chair',observedAtMs:1900}}]};
function fixture({authorized=true}={}){
  let polls=0;
  const fetch=vi.fn(async(url:string,init?:RequestInit)=>{
    if(url==='/api/wr/room')return Response.json(authorized?room:{error:{code:'STATION_REQUIRED',message:'Local station session required'}},{status:authorized?200:401});
    const input=JSON.parse(String(init?.body));
    if(input.action==='register')return Response.json({events:[{seq:1,type:'peer',peerId:'vision',role:'publisher'}]});
    if(input.action==='poll'&&!polls++)return Response.json({events:[{seq:2,type:'signal',peerId:'vision',message:{type:'offer',sdp:'synthetic offer',source:{sourceId:'camera_A',runId:'run_A'}}}]});
    return Response.json({events:[]});
  });
  vi.stubGlobal('fetch',fetch);vi.stubGlobal('RTCPeerConnection',FakePeer);
  vi.spyOn(HTMLMediaElement.prototype,'play').mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype,'pause').mockImplementation(()=>{});
  Object.defineProperty(HTMLVideoElement.prototype,'requestVideoFrameCallback',{configurable:true,value:(cb:typeof frameCallback)=>{frameCallback=cb;return 1;}});
  Object.defineProperty(HTMLVideoElement.prototype,'cancelVideoFrameCallback',{configurable:true,value:()=>{frameCallback=null;}});
  return {fetch};
}
async function deliver(){
  await waitFor(()=>expect(peers[0]?.remoteDescription).toBeTruthy());
  const track=Object.assign(new EventTarget(),{kind:'video',readyState:'live'});
  const stream={getVideoTracks:()=>[track]} as unknown as MediaStream;
  await act(async()=>{peers[0].ontrack?.({track,streams:[stream]});});
  return {track,stream};
}
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();vi.useRealTimers();peers.length=0;frameCallback=null;delete (HTMLVideoElement.prototype as any).requestVideoFrameCallback;delete (HTMLVideoElement.prototype as any).cancelVideoFrameCallback;});
it('authenticates a staff receiver before subscribing and does not expose video to an unauthorized page',async()=>{
  const h=fixture({authorized:false});render(<StaffCamera room={room} selectedPatientId={null} selectedRequestId={null}/>);
  expect(await screen.findByText('Local station session required')).toBeTruthy();
  expect(h.fetch.mock.calls.filter(([url])=>url==='/api/wr/media')).toHaveLength(0);
  expect(screen.queryByLabelText('Live shared Vision camera')).toBeNull();expect(peers).toHaveLength(0);
});
it('shows the same camera only after a new presented frame, highlights the verified selected track, and clears frozen footage',async()=>{
  vi.useFakeTimers({shouldAdvanceTime:true});
  fixture();render(<StaffCamera room={room} selectedPatientId="visit_A" selectedRequestId={null}/>);
  const {stream}=await deliver();
  const video=screen.getByLabelText('Shared Vision camera feed') as HTMLVideoElement;
  expect(video.srcObject).toBe(stream);expect(screen.queryByText('Live · same Vision camera')).toBeNull();
  await act(async()=>{frameCallback?.(performance.now(),{presentedFrames:1,width:1280,height:720} as VideoFrameCallbackMetadata);});
  expect(screen.getByText('Live · same Vision camera')).toBeTruthy();
  expect(screen.getByRole('img',{name:'Current camera tracks'}).textContent).toContain('Patient 021');
  expect(screen.getByText('Selected: Patient 021 · Left chair')).toBeTruthy();
  await act(async()=>{await vi.advanceTimersByTimeAsync(1500);});
  expect(screen.queryByText('Live · same Vision camera')).toBeNull();expect(video.srcObject).toBeNull();
  expect(screen.queryByRole('img',{name:'Current camera tracks'})).toBeNull();
});
it('removes received video on a hidden staff tab and requires an explicit reconnection on return',async()=>{
  fixture();render(<StaffCamera room={room} selectedPatientId="visit_A" selectedRequestId={null}/>);await deliver();
  const video=screen.getByLabelText('Shared Vision camera feed') as HTMLVideoElement;
  Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});
  fireEvent(document,new Event('visibilitychange'));
  await waitFor(()=>expect(video.srcObject).toBeNull());expect(peers[0].connectionState).toBe('closed');
  expect(screen.getByRole('button',{name:'Reconnect shared camera'})).toBeTruthy();
  Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'});
});
