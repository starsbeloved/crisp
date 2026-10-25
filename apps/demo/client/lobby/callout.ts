import type { NowCalling } from '../../shared/types.ts';
import { roomLabel } from '../staff/rooms.ts';

export function hallwaySpeech(call: Pick<NowCalling, 'name' | 'queueNo' | 'room'>): string {
  const name = call.name.trim().split(/\s+/)[0];
  return `${name}, number ${call.queueNo}, please come to ${roomLabel(call.room)}.`;
}
