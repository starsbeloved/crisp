import type { Binding, CheckRequest, RoomSnapshot } from './contracts.ts';

/** The trigger track is immutable history; later snapshots may identify the visit on a new track. */
export function currentRequestBinding(room:RoomSnapshot,event:CheckRequest):Binding|null {
  const candidates=event.visitId
    ?room.bindings.filter(b=>b.visitId===event.visitId&&b.state==='matched')
    :room.bindings.filter(b=>b.trackId===event.trackId&&b.identityEpoch===event.identityEpoch&&b.visitId===null&&b.state!=='matched');
  if(candidates.length!==1)return null;
  const binding=candidates[0];
  if(event.snapshotVersion===1&&(binding.trackId!==event.trackId||binding.identityEpoch!==event.identityEpoch))return null;
  return binding;
}
