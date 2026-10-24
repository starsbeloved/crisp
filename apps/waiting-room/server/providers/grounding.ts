import { z } from 'zod';
import type { AlertExplanation, AlertSnapshot, EvidenceFact, GroundedStatement, Measurement } from '../../shared/contracts.ts';
import { idSchema } from '../../shared/schemas.ts';
import { ProviderError } from './common.ts';

export const alertExplanationSchema=z.strictObject({eventId:idSchema,snapshotVersion:z.number().int().positive(),
  statements:z.array(z.strictObject({evidenceId:idSchema,phraseKey:z.enum(['observed','reported','missing','simulated'])})).min(1).max(32),
  explanation:z.string().max(20000),notificationText:z.string().min(1).max(300),evidenceIds:z.array(idSchema).max(32),limitations:z.array(z.string().max(300)).max(8)});
const limitations=['Camera estimates are not a diagnosis or a medical urgency assessment.','Recorded measurements describe their capture intervals; missing data remains unavailable.'];
export function canonicalLimitations():string[]{return [...limitations];}
const safeLocation=(label:string)=>/^[A-Za-z]{1,4}[- ]?\d{1,3}$/.test(label);
export function verifiedLocation(s:AlertSnapshot):string|null {
  const b=s.binding,e=s.event;
  if(!b||b.state!=='matched'||!e.visitId||b.visitId!==e.visitId||(s.version===1&&(b.trackId!==e.trackId||b.identityEpoch!==e.identityEpoch))||!b.observedLocation||b.observedLocation.label!==e.location||!safeLocation(b.observedLocation.label))return null;
  return b.observedLocation.label;
}
function assertSnapshot(s:AlertSnapshot):void {
  if(s.eventId!==s.event.id||s.version!==s.event.snapshotVersion||!Number.isSafeInteger(s.version)||s.version<1||s.event.reason!=='sustained-seated-posture-change'||!Number.isFinite(s.event.durationMs)||s.event.durationMs<0||s.facts.length>32||new Set(s.facts.map(f=>f.id)).size!==s.facts.length)throw new ProviderError('invalid-input');
  if(!s.facts.some(f=>f.kind==='detector')||!s.facts.every(f=>idSchema.safeParse(f.id).success))throw new ProviderError('invalid-input');
}
function prefix(provenance:EvidenceFact['provenance']|Measurement['provenance']):string {
  return provenance==='synthetic'?'Simulated ':provenance==='replay'?'Replay ':'';
}
function measurementText(m:Measurement,s:AlertSnapshot):string {
  const associated=m.visitId===s.event.visitId&&(m.streamId==='phone'||(m.trackId===s.event.trackId&&m.identityEpoch===s.event.identityEpoch));
  const available=associated&&m.quality==='usable'&&m.value!==null&&Number.isFinite(m.value)&&Number.isFinite(m.alignedStartAtMs)&&Number.isFinite(m.alignedEndAtMs)&&m.alignedStartAtMs<=m.alignedEndAtMs;
  const label=m.streamId==='phone'?'contact pulse':m.channel==='pulse'?'camera pulse':'camera breathing';
  if(!available)return `${prefix(m.provenance)}${label} evidence is unavailable.`;
  const unit=m.channel==='pulse'?'bpm':'breaths/min';
  return `${prefix(m.provenance)}${label} estimate was ${m.value} ${unit} in the recorded interval ${m.alignedStartAtMs}–${m.alignedEndAtMs} ms (${m.method}).`;
}
function phraseKey(f:EvidenceFact):GroundedStatement['phraseKey'] {
  if(f.provenance==='synthetic'||f.provenance==='replay')return 'simulated';
  return f.kind==='reported'?'reported':f.kind==='missing'?'missing':'observed';
}
function factText(f:EvidenceFact,s:AlertSnapshot):string {
  if(f.kind==='detector')return `${prefix(f.provenance)}recorded seated posture change persisted for ${s.event.durationMs/1000} seconds.`;
  if(f.kind==='reported')return `${prefix(f.provenance)}patient-reported context is recorded separately and does not establish a medical cause.`;
  if(f.kind==='missing')return `${prefix(f.provenance)}additional measurement evidence is unavailable.`;
  if(f.kind==='scenario') {
    if(!prefix(f.provenance))throw new ProviderError('invalid-input');
    return `${prefix(f.provenance)}scenario context is present; it is not a live observation.`;
  }
  const measurements=s.measurements.filter(m=>f.sourceIds.includes(m.id));
  if(!measurements.length)return `${prefix(f.provenance)}measurement evidence is unavailable.`;
  // Preserve both evidence and source provenance if inconsistent, rather than presenting either as live.
  return `${prefix(f.provenance)}${measurements.map(m=>measurementText(m,s)).join(' ')}`;
}
export function groundingCatalogue(s:AlertSnapshot):Array<{statement:GroundedStatement;text:string}> {
  assertSnapshot(s);
  return s.facts.map(f=>({statement:{evidenceId:f.id,phraseKey:phraseKey(f)},text:factText(f,s)}));
}
export function renderGroundedText(statements:GroundedStatement[],s:AlertSnapshot):{explanation:string;notificationText:string} {
  const catalogue=groundingCatalogue(s);const seen=new Set<string>();
  const pieces=statements.map(statement=>{
    const entry=catalogue.find(v=>v.statement.evidenceId===statement.evidenceId&&v.statement.phraseKey===statement.phraseKey);
    if(!entry||seen.has(statement.evidenceId))throw new ProviderError('invalid-output');seen.add(statement.evidenceId);return entry.text;
  });
  const context=[...new Set(s.facts.filter(f=>f.kind==='detector'||f.kind==='scenario').map(f=>prefix(f.provenance).trim()).filter(Boolean))];
  const qualifier=context.length?`${context.join(' / ')} check request. `:'';
  const location=verifiedLocation(s);
  return {explanation:pieces.join(' '),notificationText:`${qualifier}A sustained seated posture change was recorded. ${location?`Observed location ${location}.`:'Identity or current location is unverified; review the camera track.'} Please check the patient.`};
}
export function validateAlertExplanation(input:unknown,s:AlertSnapshot):AlertExplanation {
  const parsed=alertExplanationSchema.safeParse(input);if(!parsed.success)throw new ProviderError('invalid-output');const v=parsed.data;
  if(v.eventId!==s.eventId||v.snapshotVersion!==s.version)throw new ProviderError('invalid-output');
  const required=s.facts.filter(f=>f.kind==='detector'||f.kind==='missing'||f.kind==='scenario');
  if(!required.every(f=>v.statements.some(t=>t.evidenceId===f.id)))throw new ProviderError('invalid-output');
  const rendered=renderGroundedText(v.statements,s);
  if(v.explanation!==rendered.explanation||v.notificationText!==rendered.notificationText||JSON.stringify(v.evidenceIds)!==JSON.stringify(v.statements.map(t=>t.evidenceId)))throw new ProviderError('invalid-output');
  const base=canonicalLimitations();
  if(v.limitations.length!==base.length&&v.limitations.length!==base.length+1)throw new ProviderError('invalid-output');
  if(!base.every((l,i)=>v.limitations[i]===l))throw new ProviderError('invalid-output');
  if(v.limitations.length>base.length&&!/^Provider fallback: (unavailable|timeout|invalid-output)\.$/.test(v.limitations[base.length]))throw new ProviderError('invalid-output');
  return v;
}
export function buildFactualFallback(s:AlertSnapshot,reason?:'unavailable'|'timeout'|'invalid-output'):AlertExplanation {
  const statements=groundingCatalogue(s).map(v=>v.statement);
  return {eventId:s.eventId,snapshotVersion:s.version,statements,...renderGroundedText(statements,s),evidenceIds:statements.map(v=>v.evidenceId),limitations:[...canonicalLimitations(),...(reason?[`Provider fallback: ${reason}.`]:[])]};
}
