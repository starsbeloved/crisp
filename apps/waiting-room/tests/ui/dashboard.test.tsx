import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { toDashboardView } from '../../shared/view-model.ts';
import { dashboardFixtures } from '../../shared/dashboard-fixtures.tsx';
import { DashboardView } from '../../client/ui/dashboard/DashboardView.tsx';
import { checkedRearmingRoom, movedPatientRoom, openRequestRoom, postureWithoutRequestRoom, staleCameraRoom, uncertainIdentityRoom } from '../../shared/fixtures.ts';

it('maps a request to its visit and only the current verified track/location', () => {
  const view = toDashboardView(movedPatientRoom, { patientId: null, requestId: 'request_014' });
  expect(view.selectedPatientId).toBe('visit_014');
  expect(view.patients[0].locationLabel).toBe('C2');
  expect(view.patients[0].assignedSeatLabel).toBe('Assigned seat: B4');
  expect(view.patients[0].seatMismatchLabel).toBe('Assigned seat differs from current observed location.');
  expect(view.requests[0].locationLabel).toBe('C2');
  expect(view.overlays[0].patientId).toBe('visit_014');
  const uncertain = toDashboardView(uncertainIdentityRoom, { patientId: 'visit_014', requestId: 'request_014' });
  expect(uncertain.selectedPatientId).toBe('visit_014');
  expect(uncertain.requests[0].locationLabel).toBe('Location uncertain');
  expect(uncertain.overlays.every(o => o.patientId === null)).toBe(true);
  expect(uncertain.patients[0].identityLabel).toBe('Identity uncertain');
});
it('uses a verified reidentified current track for a newer request version',()=>{
  const room=structuredClone(movedPatientRoom);room.bindings[0].trackId='current_track';room.bindings[0].identityEpoch='current_epoch';
  const view=toDashboardView(room,{patientId:null,requestId:room.requests[0].id});
  expect(view.requests[0].locationLabel).toBe('C2');expect(view.selectedPatientId).toBe(room.visits[0].id);
});
it('breaks historical trend lines across long gaps and different camera runs',()=>{
  const room=structuredClone(openRequestRoom),last=room.measurements.filter(m=>m.streamId==='rppg').at(-1)!;
  room.measurements.push({...last,id:'new_run_reading',runId:'different_run',seq:1,alignedStartAtMs:last.alignedStartAtMs+60000,alignedEndAtMs:last.alignedEndAtMs+60000});
  const points=toDashboardView(room,{patientId:room.visits[0].id,requestId:null}).patients[0].readings[1].points;
  expect(points.at(-2)?.value).toBeNull();expect(points.at(-1)?.value).toBe(72);
});
it('keeps posture visible before an event and rearms after checked', () => {
  const before = toDashboardView(postureWithoutRequestRoom, { patientId: 'visit_014', requestId: null });
  expect(before.requests).toHaveLength(0);
  expect(before.patients[0].pose.postureLabel).toBe('Seated posture change');
  expect(before.patients[0].pose.activityLabel).toBe('Stationary');
  const after = toDashboardView(checkedRearmingRoom, { patientId: 'visit_014', requestId: 'request_014' });
  expect(after.patients[0].pose.referenceLabel).toBe('Collecting new reference');
  expect(after.requests[0].canCheck).toBe(false);
});
it('preserves originals, historical contact interval, unchanged pulse and stale gaps', () => {
  const p = toDashboardView(openRequestRoom, { patientId: 'visit_014', requestId: null }).patients[0];
  expect(p.originalAnswers).toHaveLength(3);
  expect(p.originalAnswers[0].answer).toBe('Synthetic example: feeling dizzy');
  expect(p.readings[0].label).toBe('Contact pulse — historical');
  expect(p.readings[0].timeLabel).toContain('–');
  expect(p.readings[0].sourceLabel).toContain('Synthetic');
  expect(p.readings[1].displayValue).toBe('72');
  const stale = toDashboardView(staleCameraRoom, { patientId: 'visit_014', requestId: null }).patients[0];
  expect(stale.readings[1].displayValue).toBe('—');
  expect(stale.readings[1].qualityLabel).toBe('Stale');
  expect(stale.pose.qualityLabel).toBe('Stale');
});
it('renders all synthetic fixtures without temperature while preserving action errors and provenance', () => {
  for (const props of Object.values(dashboardFixtures)) {
    const html = renderToStaticMarkup(<DashboardView {...props} />);
    expect(html).toContain('Synthetic fixture');
    expect(html).not.toContain('Live camera');
    expect(html).not.toMatch(/temperature|°C/i);
  }
  expect(renderToStaticMarkup(<DashboardView {...dashboardFixtures.pendingAction} />)).toContain('Saving');
  expect(renderToStaticMarkup(<DashboardView {...dashboardFixtures.failedAction} />)).toContain('Could not save');
});
it('supplies a synthetic camera trend with an explicit missing window and separate contact history', async () => {
  const { usableRoom } = await import('../../shared/fixtures.ts');
  const p = toDashboardView(usableRoom, { patientId: 'visit_014', requestId: null }).patients[0];
  expect(p.readings[1].points.map(p => p.value)).toEqual([72,73,null,72,72]);
  expect(p.readings[0].points).toEqual([]);
  expect(p.readings[2].points.map(p => p.value)).toEqual([14]);
});
it('suppresses current identity, overlays and camera values immediately when the camera is off', async () => {
  const { usableRoom } = await import('../../shared/fixtures.ts');
  const room = { ...usableRoom, cameraState: 'off' as const };
  const view = toDashboardView(room, { patientId: 'visit_014', requestId: null });
  expect(view.overlays).toEqual([]);
  expect(view.patients[0].identityLabel).toBe('Identity not currently verified');
  expect(view.patients[0].readings[1].displayValue).toBe('—');
  expect(view.patients[0].readings[0].displayValue).toBe('72');
});
it('renders accessible camera trends with gaps and a historical contact reading without a fabricated curve',()=>{
  const html=renderToStaticMarkup(<DashboardView {...dashboardFixtures.usableRoom} selectedPatientId="visit_014"/>);
  expect(html).toContain('aria-label="Camera pulse observed trend"');
  expect(html).toContain('<svg');expect(html).toContain('Gaps indicate unavailable windows');
  expect(html).not.toContain('aria-label="Contact pulse — historical observed trend"');
});
