import type { RoomSnapshot } from '../../shared/contracts.ts';
import { currentRequestBinding } from '../../shared/request-binding.ts';

/** Semantic context excludes bounds, heartbeat and physiological updates. */
export function eligibilityStamp(room:RoomSnapshot,eventId:string,version:number,now:number):string|null {
  if(room.cameraState!=='live'||!Number.isFinite(now)||room.serverNowMs>now+1000||now-room.serverNowMs>1500)return null;
  const event=room.requests.find(e=>e.id===eventId);
  if(!event||event.state!=='open'||event.snapshotVersion!==version)return null;
  const binding=currentRequestBinding(room,event);
  if(!binding||binding.lastVerifiedAtMs>room.serverNowMs+1000||room.serverNowMs-binding.lastVerifiedAtMs>1500)return null;
  if(event.visitId?binding.state!=='matched':binding.state==='matched')return null;
  const location=binding.observedLocation;
  if((location?.label??null)!==event.location)return null;
  if(location&&(location.observedAtMs>room.serverNowMs+1000||room.serverNowMs-location.observedAtMs>1500))return null;
  return JSON.stringify([event.id,version,event.visitId,binding.trackId,binding.identityEpoch,event.location,binding.state,binding.sourceId,binding.runId]);
}
