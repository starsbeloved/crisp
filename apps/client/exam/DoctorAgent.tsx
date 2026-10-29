import type { RoomState } from '../../shared/types.ts';
import { AskCrispVoice } from '../dashboard/AskCrispVoice.tsx';
export function DoctorAgent({ state, room, visitId, onRecord }: { state: RoomState | null; room: string; visitId?: string; onRecord?: (result: unknown) => void }) {
  return <section className="exam-agent" aria-label="Doctor voice agent"><AskCrispVoice room={room} visitId={visitId} onRecord={onRecord} enabled={Boolean(state)} /></section>;
}
