import { calibrateSimilarity, createFaceGallery } from './identity.ts';
import { descriptorSimilarity } from './face-model.ts';
import { FACE_MODEL_ID } from './model-assets.ts';
import type { Calibration, Enrollment } from './types.ts';
export type CalibrationCaptures={reference:number[][];genuine:number[][];unknown:number[][]};
export type SessionMode='station'|'kiosk';
export type VisionSessionRequest={kind:'read';mode:SessionMode}|{kind:'enroll';mode:SessionMode;enrollment:Enrollment}|{kind:'calibrate';mode:SessionMode;captures:CalibrationCaptures};
export type VisionSessionState={revision:number;calibrationRevision:number;calibration:Calibration|null;enrollments:Enrollment[]};
export type VisionAuthority={role:SessionMode;visitId?:string;consent?:boolean};
export function deriveCaptureCalibration(captures:CalibrationCaptures):Calibration|null{
  const {reference,genuine,unknown}=captures;
  if(![reference,genuine,unknown].every(list=>Array.isArray(list)&&list.length>=3&&list.length<=12&&list.every(d=>d.length===128&&d.every(Number.isFinite)&&d.some(n=>n!==0))))return null;
  const scores=(list:number[][])=>list.map(d=>Math.max(...reference.map(r=>descriptorSimilarity(r,d))));
  return calibrateSimilarity(FACE_MODEL_ID,scores(genuine),scores(unknown));
}
/** SharedWorker memory only; authorizes every read/write against the existing backend session. */
export function createVisionSessionStore(authorize:(mode:SessionMode)=>Promise<VisionAuthority>){
  const gallery=createFaceGallery();let calibration:Calibration|null=null,revision=0,calibrationRevision=0;
  return {async request(input:VisionSessionRequest):Promise<VisionSessionState>{
    if(!input||!['station','kiosk'].includes(input.mode))throw Error('Invalid vision role');
    const authority=await authorize(input.mode);
    if(authority.role!==input.mode)throw Error('Authorized station session required');
    if(input.kind==='calibrate'){
      if(authority.role!=='station')throw Error('Authorized station calibration required');
      const value=deriveCaptureCalibration(input.captures);if(!value)throw Error('Calibration failed: capture distributions overlap or samples are insufficient');
      calibration=value;gallery.clear();revision++;calibrationRevision++;
    }else if(input.kind==='enroll'){
      if(authority.role!=='kiosk'||!authority.consent)throw Error('Current kiosk visit camera consent required');
      if(input.enrollment.visitId!==authority.visitId)throw Error('Enrollment does not match the current kiosk visit');
      if(!calibration||input.enrollment.modelId!==FACE_MODEL_ID)throw Error('Calibrate the matching model before enrollment');
      const samples=input.enrollment.samples;
      if(!Array.isArray(samples)||samples.length<3||samples.length>12||!samples.every(d=>Array.isArray(d)&&d.length===128&&d.every(Number.isFinite)&&d.some(n=>n!==0)))throw Error('Enrollment needs 3–12 valid 128D descriptors');
      if(!samples.every(d=>descriptorSimilarity(samples[0],d)>=calibration!.threshold))throw Error('Enrollment face descriptors are not consistent');
      gallery.enroll(input.enrollment);revision++;
    }else if(input.kind!=='read')throw Error('Unknown vision session operation');
    return {revision,calibrationRevision,calibration:calibration?{...calibration}:null,enrollments:gallery.list(FACE_MODEL_ID).filter(e=>authority.role==='station'||e.visitId===authority.visitId)};
  }};
}
