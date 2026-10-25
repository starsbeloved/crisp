export type AlertLevel = 'none' | 'amber' | 'red';
export type Quality = 'good' | 'fair' | 'low' | 'none';
export type Onset = '<1h' | 'today' | '1-3d' | 'longer';
export type Trend = 'worse' | 'same' | 'better';
export type ProviderSource = 'gemini' | 'template';

export interface CheckInAnswers {
  reason: string; reasonChips: string[]; onset: Onset | null; trend: Trend | null;
  followUp: { question: string; answer: string } | null;
  via: 'form' | 'voice';
  dateOfBirth?: string | null;   // YYYY-MM-DD, used only to match demo records
  phone?: string | null;
}
export interface NewVisitInput { name: string; descriptor: number[] | null; answers: CheckInAnswers }
export interface Visit {
  id: string; queueNo: number; name: string; createdAt: number; faceEnrolled: boolean;
  answers: CheckInAnswers;
  summary: { chiefComplaint: string; text: string; source: ProviderSource } | null;
  status: 'waiting' | 'called'; calledAt: number | null; room: string | null;
}
export interface GalleryEntry { visitId: string; name: string; descriptor: number[] }

export interface PostureState { slumpSec: number; headDropSec: number; stillSec: number; fallSuspected: boolean }
export interface Observation {
  cameraId: string; trackId: string; at: number;
  visitId: string | null; matchScore: number | null;
  box: { x: number; y: number; w: number; h: number };            // normalized 0..1
  hrBpm: number | null; hrQuality: Quality;
  rrBpm: number | null; rrQuality: Quality;
  posture: PostureState | null;
  hint: string | null;                                              // "too dark" | "move closer" | "hold still"
  pulseTrace: number[] | null;                                      // last ~6 s of filtered rPPG signal, ~60 points, normalized -1..1
  source: 'live' | 'replay';
}
export interface VitalsPoint { t: number; hr: number | null; rr: number | null }
export interface Vitals {
  visitId: string; lastSeenAt: number; cameraId: string; box: Observation['box'];
  hrBpm: number | null; hrQuality: Quality; rrBpm: number | null; rrQuality: Quality;
  baselineHr: number | null; baselineRr: number | null;
  posture: PostureState | null; hint: string | null; source: 'live' | 'replay';
  pulseTrace: number[] | null;
  level: AlertLevel;
  history: VitalsPoint[];                                           // last 10 min, ~1 Hz
}
export type PostureEventKind = 'slump' | 'headDrop' | 'still' | 'fall';
export interface AlertFacts {
  name: string; queueNo: number; chiefComplaint: string | null; answers: CheckInAnswers;
  hrBpm: number | null; baselineHr: number | null; rrBpm: number | null; baselineRr: number | null;
  hrReason: 'news2-high' | 'news2-low' | 'baseline-delta' | null;
  rrReason: 'news2-high' | 'news2-low' | null;
  postureEvents: { kind: PostureEventKind; seconds: number }[];
  waitedMin: number;
}
export interface Alert {
  id: string; visitId: string; level: 'amber' | 'red'; reasons: string[]; facts: AlertFacts;
  openedAt: number; updatedAt: number;
  status: 'open' | 'acknowledged' | 'checked'; acknowledgedAt: number | null; checkedAt: number | null;
  explanation: { bubble: string; speech: string; source: ProviderSource } | null;
  audio: 'pending' | 'ready' | 'failed' | null;                      // GET /api/alerts/:id/audio when ready
  replayFrames: number;                                             // frames saved for instant replay (0 = none)
  cameraId: string | null;
}
export interface Handoff { visitId: string; text: string; source: ProviderSource; createdAt: number }
export interface NowCalling { id: string; visitId: string; name: string; queueNo: number; room: string; at: number; audio: Alert['audio'] }
export interface CameraStatus { cameraId: string; lastFrameAt: number; source: 'live' | 'replay'; fps: number; visible: boolean }
export interface ReferenceSample { visitId: string; at: number; referenceBpm: number; cameraBpm: number | null }
export interface RoomState {
  serverNow: number;
  visits: Visit[]; vitals: Record<string, Vitals>; alerts: Alert[];
  cameras: Record<string, CameraStatus>; nowCalling: NowCalling | null;
  handoffs: Record<string, Handoff>; references: ReferenceSample[];
  providers: { gemini: boolean; elevenlabs: boolean; agent: boolean };
}
