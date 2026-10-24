import type { DashboardViewProps } from './view-model.ts';
import { toDashboardView } from './view-model.ts';
import * as rooms from './fixtures.ts';
export type FixtureAction = { action: string; id?: string };
export function makeDashboardFixtures(onAction: (event: FixtureAction) => void = () => {}): Record<string, DashboardViewProps> {
  const result: Record<string, DashboardViewProps> = {};
  for (const [name, room] of Object.entries(rooms)) {
    const data = toDashboardView(room, { patientId: room.visits[0]?.id ?? null, requestId: room.requests[0]?.id ?? null });
    result[name] = { ...data, videoSlot: <div className="wr-synthetic-video" role="img" aria-label="Synthetic fixture; no camera stream">Synthetic fixture — no camera stream</div>, cameraLabel: 'Synthetic fixture — no live camera', systemStatuses: [{ label: 'Sensors not started', tone: 'neutral' }, { label: 'Providers not connected', tone: 'neutral' }], connectionLabel: 'Synthetic fixture · local preview', statusAnnouncement: '', canRetryCamera: false, audioEnabled: false, muted: true, onSelectPatient: id => onAction({ action: 'selectPatient', id }), onSelectRequest: id => onAction({ action: 'selectRequest', id }), onAcknowledge: id => onAction({ action: 'acknowledge', id }), onChecked: id => onAction({ action: 'checked', id }), onEnableAudio: () => onAction({ action: 'enableAudio' }), onToggleMute: () => onAction({ action: 'toggleMute' }), onTestAudio: () => onAction({ action: 'testAudio' }), onRetryCamera: () => onAction({ action: 'retryCamera' }) };
  }
  result.pendingAction = { ...result.openRequestRoom, requests: result.openRequestRoom.requests.map(r => ({ ...r, actionPending: true })) };
  result.failedAction = { ...result.openRequestRoom, requests: result.openRequestRoom.requests.map(r => ({ ...r, actionError: 'Could not save. Please retry.' })) };
  return result;
}
export const dashboardFixtures = makeDashboardFixtures();
