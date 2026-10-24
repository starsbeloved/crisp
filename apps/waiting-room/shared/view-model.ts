import type { ID, RoomSnapshot, Measurement, Binding, RequestState, Bounds } from './contracts.ts';
import { currentRequestBinding } from './request-binding.ts';
export type Tone = 'neutral'|'info'|'warning'|'danger';
export type StatusBadgeProps = { label:string; tone:Tone };
export type ProvenanceLabelProps = { label:string; tone:Tone };
export type ReadingView = { label:string; displayValue:string; unit:string; qualityLabel:string;
  sourceLabel:string; timeLabel:string; reasonLabel:string; trendSummary:string;
  points:Array<{atMs:number; value:number|null}>; axis:{startMs:number;endMs:number;min:number;max:number};
  axisLabels:{start:string;end:string;min:string;max:string};
  recentValues:Array<{timeLabel:string;valueLabel:string;qualityLabel:string}> };
export type PoseView = { postureLabel:string; activityLabel:string; qualityLabel:string;
  referenceLabel:string; timeLabel:string; reasonLabel:string };
export type PatientView = { id:ID; label:string; identityLabel:string; locationLabel:string;
  assignedSeatLabel:string; seatMismatchLabel:string|null; reportText:string; originalAnswers:Array<{question:string;answer:string}>;
  summaryStatusLabel:string; readings:ReadingView[]; pose:PoseView };
export type RequestView = { id:ID; patientId:ID|null; patientLabel:string; locationLabel:string;
  reason:string; state:RequestState; createdLabel:string; durationLabel:string;
  evidence:Array<{id:ID;label:string;timeLabel:string;sourceLabel:string}>;
  explanation:string; providerLabel:string; voiceLabel:string;
  canAcknowledge:boolean; canCheck:boolean; actionPending:boolean; actionError:string|null };
export type OverlayView = { trackId:ID; patientId:ID|null; label:string; bounds:Bounds; tone:Tone };
export type DashboardViewProps = { patients:PatientView[]; requests:RequestView[]; selectedPatientId:ID|null;
  overlays:OverlayView[]; cameraLabel:string; selectedRequestId:ID|null;
  videoSlot:import('react').ReactNode; onSelectPatient:(id:ID)=>void; onSelectRequest:(id:ID)=>void;
  onAcknowledge:(id:ID)=>void; onChecked:(id:ID)=>void; onEnableAudio:()=>void; onToggleMute:()=>void;
  onTestAudio:()=>void; onRetryCamera:()=>void;
  systemStatuses:Array<{label:string;tone:Tone}>; connectionLabel:string; statusAnnouncement:string;
  canRetryCamera:boolean; audioEnabled:boolean; muted:boolean };
export type DashboardDataProps = Pick<DashboardViewProps,'patients'|'requests'|'selectedPatientId'|'selectedRequestId'|'overlays'>;
const clock = (ms: number) => `${new Date(ms).toISOString().slice(11, 19)} UTC`;
const qualityLabels = { collecting: 'Collecting', usable: 'Usable estimate', 'low-quality': 'Low quality', unavailable: 'Unavailable', stale: 'Stale' };
const sources = { live_phone: 'Phone camera contact PPG', live_camera: 'Room camera', manual: 'Manual entry', synthetic: 'Synthetic fixture', replay: 'Replay' };
const onsetLabels = { today: 'Today', yesterday: 'Yesterday', 'several-days': 'Several days ago', longer: 'Longer ago', 'not-sure': 'Not sure' };
const courseLabels = { better: 'Getting better', same: 'Staying the same', worse: 'Getting worse', intermittent: 'Comes and goes', 'not-applicable': 'Not applicable' };
function currentBinding(snapshot: RoomSnapshot, visitId: ID): Binding | undefined {
  const candidates = snapshot.bindings.filter(b => b.visitId === visitId && b.state === 'matched' && snapshot.serverNowMs >= b.lastVerifiedAtMs && snapshot.serverNowMs - b.lastVerifiedAtMs <= 1000 && snapshot.cameraState === 'live');
  return candidates.length === 1 ? candidates[0] : undefined;
}
function reading(snapshot: RoomSnapshot, visitId: ID, streamId: Measurement['streamId'], binding: Binding | undefined): ReadingView {
  const rows = snapshot.measurements.filter(m => m.visitId === visitId && m.streamId === streamId).sort((a,b) => a.alignedEndAtMs - b.alignedEndAtMs);
  const historical = streamId === 'phone';
  const latest = rows.at(-1);
  const eligible = historical || !!binding && latest?.trackId === binding.trackId && latest?.identityEpoch === binding.identityEpoch;
  const stale = !historical && !!latest && (snapshot.serverNowMs - latest.alignedEndAtMs > 5000 || latest.alignedEndAtMs > snapshot.serverNowMs);
  const value = latest?.quality === 'usable' && !stale && eligible ? latest.value : null;
  const points:ReadingView['points']=[];
  if(!historical)rows.forEach((m,i)=>{
    const previous=rows[i-1];
    if(previous&&(m.alignedEndAtMs-previous.alignedEndAtMs>6000||m.sourceId!==previous.sourceId||m.runId!==previous.runId||m.identityEpoch!==previous.identityEpoch||m.trackId!==previous.trackId||m.provenance!==previous.provenance))points.push({atMs:(previous.alignedEndAtMs+m.alignedEndAtMs)/2,value:null});
    points.push({atMs:m.alignedEndAtMs,value:m.quality==='usable'?m.value:null});
  });
  const values = points.flatMap(p => p.value === null ? [] : [p.value]);
  const startMs = rows[0]?.alignedStartAtMs ?? snapshot.serverNowMs - 60000;
  const endMs = Math.max(rows.at(-1)?.alignedEndAtMs ?? snapshot.serverNowMs, startMs + 1);
  const min = values.length ? Math.min(...values) - 1 : 0;
  const max = values.length ? Math.max(...values) + 1 : 1;
  return { label: historical ? 'Contact pulse — historical' : streamId === 'rppg' ? 'Camera pulse' : 'Camera breathing', displayValue: value === null ? '—' : String(value), unit: streamId === 'breathing' ? 'breaths/min' : 'bpm', qualityLabel: stale ? 'Stale' : latest && eligible ? qualityLabels[latest.quality] : 'Unavailable', sourceLabel: latest ? `${sources[latest.provenance]} · ${latest.method}` : 'Not measured', timeLabel: latest ? `${clock(latest.alignedStartAtMs)} – ${clock(latest.alignedEndAtMs)}` : 'No measurement interval', reasonLabel: stale ? 'No fresh eligible estimate' : latest?.reason ?? (latest ? historical ? 'Timestamped comparison; not a calibration offset' : '' : 'No eligible measurement for the current identity'), trendSummary: historical ? 'Historical contact reading; separate from camera estimates' : values.length < 4 ? 'Not enough values for a trend' : 'Observed values; gaps indicate unavailable windows', points, axis: { startMs, endMs, min, max }, axisLabels: { start: clock(startMs), end: clock(endMs), min: String(min), max: String(max) }, recentValues: rows.slice(-5).reverse().map(m => ({ timeLabel: `${clock(m.alignedStartAtMs)} – ${clock(m.alignedEndAtMs)}`, valueLabel: m.value === null ? '—' : `${m.value} ${m.unit}`, qualityLabel: qualityLabels[m.quality] })) };
}
export function toDashboardView(snapshot: RoomSnapshot, selection: { patientId: ID|null; requestId: ID|null }): DashboardDataProps {
  const selectedRequest = snapshot.requests.find(r => r.id === selection.requestId);
  const requestedPatientId = selectedRequest ? selectedRequest.visitId : selection.patientId;
  return {
    selectedPatientId: snapshot.visits.some(v => v.id === requestedPatientId) ? requestedPatientId : null,
    selectedRequestId: selectedRequest?.id ?? null,
    patients: snapshot.visits.map(visit => {
      const binding = currentBinding(snapshot, visit.id);
      const involvedTracks = snapshot.requests.filter(r => r.visitId === visit.id).map(r => r.trackId);
      const uncertain = snapshot.bindings.some(b => involvedTracks.includes(b.trackId) && b.state !== 'matched');
      const pose = snapshot.poses.filter(p => p.visitId === visit.id).sort((a,b) => b.alignedAtMs - a.alignedAtMs)[0];
      const poseStale = !binding || !pose || pose.trackId !== binding.trackId || pose.identityEpoch !== binding.identityEpoch || snapshot.serverNowMs - pose.alignedAtMs > 1000 || pose.alignedAtMs > snapshot.serverNowMs;
      const control = snapshot.referenceControls.find(c => c.visitId === visit.id && c.trackId === binding?.trackId && c.identityEpoch === binding?.identityEpoch);
      const ready = !!pose && !poseStale && pose.referenceReady && !!control && pose.referenceGeneration === control.generation;
      return { seatMismatchLabel: visit.assignedSeat && binding?.observedLocation && snapshot.serverNowMs>=binding.observedLocation.observedAtMs && snapshot.serverNowMs-binding.observedLocation.observedAtMs<=1000 && visit.assignedSeat.label!==binding.observedLocation.label ? 'Assigned seat differs from current observed location.' : null, id: visit.id, label: visit.label, identityLabel: binding ? 'Matched identity' : uncertain ? 'Identity uncertain' : 'Identity not currently verified', locationLabel: binding?.observedLocation && snapshot.serverNowMs - binding.observedLocation.observedAtMs <= 1000 ? binding.observedLocation.label : 'Location uncertain', assignedSeatLabel: visit.assignedSeat ? `Assigned seat: ${visit.assignedSeat.label}` : 'No assigned seat', reportText: visit.summary?.confirmed ? visit.summary.complaint : 'No confirmed summary', originalAnswers: visit.answers ? [{ question: 'What brings you here today?', answer: visit.answers.reason }, { question: 'When did this start?', answer: `${onsetLabels[visit.answers.onset]}${visit.answers.onsetNote ? ` — ${visit.answers.onsetNote}` : ''}` }, { question: 'How has it changed since it started?', answer: courseLabels[visit.answers.course] }] : [], summaryStatusLabel: visit.summary?.confirmed ? 'Confirmed summary' : 'Original answers only; summary not confirmed', readings: ['phone','rppg','breathing'].map(s => reading(snapshot, visit.id, s as Measurement['streamId'], binding)), pose: { postureLabel: poseStale ? 'Unknown' : pose.qualifyingSlump ? 'Seated posture change' : pose.seated === true ? 'Seated' : pose.seated === false ? 'Not seated' : 'Unknown', activityLabel: poseStale ? 'Unknown' : pose.activity === 'stationary' ? 'Stationary' : pose.activity === 'moving' ? 'Moving' : 'Unknown', qualityLabel: poseStale ? pose ? 'Stale' : 'Unavailable' : qualityLabels[pose.quality], referenceLabel: ready ? 'Reference ready' : control && control.generation > 1 ? 'Collecting new reference' : 'Collecting reference', timeLabel: pose ? `${clock(pose.alignedAtMs)} · ${sources[pose.provenance]}` : 'No pose observation', reasonLabel: poseStale ? 'No fresh eligible pose' : pose.reason ?? '' } };
    }),
    requests: [...snapshot.requests].sort((a,b) => (a.state === 'open' ? 0 : 1) - (b.state === 'open' ? 0 : 1) || b.createdAtMs - a.createdAtMs || a.id.localeCompare(b.id)).map(request => {
      const visit = snapshot.visits.find(v => v.id === request.visitId);
      const binding = currentRequestBinding(snapshot,request);
      const eligible = !!binding;
      const provider = snapshot.explanations[request.id];
      const audio = snapshot.audioJobs.filter(j => j.eventId === request.id && j.snapshotVersion === request.snapshotVersion).at(-1);
      const providerLabels = { idle: 'Gemini idle', pending: 'Gemini pending', ready: 'Validated Gemini explanation', fallback: 'Factual template · Gemini unavailable', unavailable: 'Gemini unavailable' };
      return { id: request.id, patientId: request.visitId, patientLabel: visit?.label ?? 'Identity uncertain', locationLabel: eligible && binding.observedLocation && snapshot.serverNowMs - binding.observedLocation.observedAtMs <= 1000 ? binding.observedLocation.label : 'Location uncertain', reason: 'Sustained change in seated posture', state: request.state, createdLabel: clock(request.createdAtMs), durationLabel: `${request.durationMs / 1000} seconds`, evidence: request.facts.map(f => ({ id: f.id, label: f.text, timeLabel: clock(f.atMs), sourceLabel: f.provenance ? sources[f.provenance] : 'Source unavailable' })), explanation: provider?.state === 'ready' && provider.value?.snapshotVersion === request.snapshotVersion ? provider.value.explanation : 'A sustained change in seated posture was detected. Please check the patient.', providerLabel: provider ? providerLabels[provider.state] : 'Gemini idle', voiceLabel: audio ? `Voice ${audio.state}` : 'Voice not queued', canAcknowledge: request.state === 'open', canCheck: request.state !== 'checked', actionPending: false, actionError: null };
    }),
    overlays: snapshot.bindings.filter(b => snapshot.serverNowMs - b.lastVerifiedAtMs <= 1000 && snapshot.serverNowMs >= b.lastVerifiedAtMs && snapshot.cameraState === 'live').map(b => { const matched = b.state === 'matched' && currentBinding(snapshot, b.visitId ?? '')?.trackId === b.trackId; return { trackId: b.trackId, patientId: matched ? b.visitId : null, label: matched ? snapshot.visits.find(v => v.id === b.visitId)?.label ?? 'Unknown visit' : b.state === 'unknown' ? 'Unrecognized track' : 'Identity uncertain', bounds: b.bounds, tone: matched ? 'info' : 'warning' }; }),
  };
}
