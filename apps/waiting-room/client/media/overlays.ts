import type { Binding, RoomSnapshot } from '../../shared/contracts.ts';
import type { CameraSource } from './protocol.ts';

export type CameraOverlay={trackId:string;label:string;location:string;bounds:Binding['bounds'];selected:boolean;verified:boolean};
export function cameraOverlays(room:RoomSnapshot,source:CameraSource|null,selectedPatientId:string|null,selectedRequestId:string|null):CameraOverlay[] {
  if(!source||room.cameraState!=='live')return [];
  const current=room.bindings.filter(b=>b.sourceId===source.sourceId&&b.runId===source.runId&&room.serverNowMs>=b.lastVerifiedAtMs&&room.serverNowMs-b.lastVerifiedAtMs<=1000&&Object.values(b.bounds).every(Number.isFinite)&&b.bounds.x>=0&&b.bounds.y>=0&&b.bounds.width>0&&b.bounds.height>0&&b.bounds.x+b.bounds.width<=1.000001&&b.bounds.y+b.bounds.height<=1.000001);
  const request=room.requests.find(r=>r.id===selectedRequestId);
  const selected=request?request.visitId:selectedPatientId;
  return current.map(b=>{
    const visit=room.visits.find(v=>v.id===b.visitId);
    const verified=b.state==='matched'&&b.visitId!==null&&!!visit&&current.filter(other=>other.visitId===b.visitId&&other.state==='matched').length===1;
    const location=b.observedLocation&&room.serverNowMs>=b.observedLocation.observedAtMs&&room.serverNowMs-b.observedLocation.observedAtMs<=1000?b.observedLocation.label:'Current location uncertain';
    return {trackId:b.trackId,bounds:b.bounds,verified,selected:verified&&b.visitId===selected,label:verified?visit!.label:b.state==='unknown'?'Unrecognized track':'Identity uncertain',location};
  });
}
