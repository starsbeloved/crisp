import { expect,it } from 'vitest';
import { createVisionSessionStore, deriveCaptureCalibration } from '../client/vision/session-store.ts';
import { FACE_MODEL_ID } from '../client/vision/model-assets.ts';
const d=(n:number)=>[n,...Array(127).fill(0)];
const captures={reference:[d(1),d(1.01),d(.99)],genuine:[d(1.02),d(.98),d(1.03)],unknown:[d(2),d(2.01),d(1.95)]};
it('derives calibration only from sufficient finite same-person/unknown captured vectors',()=>{
  const value=deriveCaptureCalibration(captures);expect(value?.modelId).toBe(FACE_MODEL_ID);expect(value!.threshold).toBeGreaterThan(.4);expect(value!.threshold).toBeLessThan(.7);
  expect(deriveCaptureCalibration({...captures,unknown:[d(1),d(1),d(1)]})).toBeNull();expect(deriveCaptureCalibration({...captures,genuine:[]})).toBeNull();
});
it('keeps enrolled visits available to the station in memory without exposing other visits to kiosk',async()=>{
  let authority:{role:'station'|'kiosk';visitId?:string;consent?:boolean}={role:'station'};
  const store=createVisionSessionStore(async()=>authority);
  await store.request({kind:'calibrate',mode:'station',captures});
  authority={role:'kiosk',visitId:'a',consent:true};await store.request({kind:'enroll',mode:'kiosk',enrollment:{visitId:'a',modelId:FACE_MODEL_ID,samples:[d(1),d(1),d(1)],capturedAtMs:1}});
  authority={role:'kiosk',visitId:'b',consent:true};expect((await store.request({kind:'read',mode:'kiosk'})).enrollments).toEqual([]);
  await expect(store.request({kind:'enroll',mode:'kiosk',enrollment:{visitId:'a',modelId:FACE_MODEL_ID,samples:[d(1),d(1),d(1)],capturedAtMs:1}})).rejects.toThrow(/visit/);
  authority={role:'station'};expect((await store.request({kind:'read',mode:'station'})).enrollments.map(e=>e.visitId)).toEqual(['a']);
});
it('rejects unconsented, expired or model-mismatched writes and invalid calibration',async()=>{
  let allowed=true;const store=createVisionSessionStore(async()=>{if(!allowed)throw Error('expired');return {role:'kiosk',visitId:'a',consent:false};});
  await expect(store.request({kind:'enroll',mode:'kiosk',enrollment:{visitId:'a',modelId:FACE_MODEL_ID,samples:[d(1),d(1),d(1)],capturedAtMs:1}})).rejects.toThrow(/consent/);
  await expect(store.request({kind:'calibrate',mode:'station',captures})).rejects.toThrow(/station/);allowed=false;
  await expect(store.request({kind:'read',mode:'kiosk'})).rejects.toThrow(/expired/);
});
it('rejects wrong-dimension or internally inconsistent descriptor enrollments',async()=>{
  let authority:{role:'station'|'kiosk';visitId?:string;consent?:boolean}={role:'station'};
  const store=createVisionSessionStore(async()=>authority);await store.request({kind:'calibrate',mode:'station',captures});authority={role:'kiosk',visitId:'a',consent:true};
  const enroll=(samples:number[][])=>store.request({kind:'enroll',mode:'kiosk',enrollment:{visitId:'a',modelId:FACE_MODEL_ID,samples,capturedAtMs:1}});
  await expect(enroll([[1],[1],[1]])).rejects.toThrow(/descriptor/i);
  await expect(enroll([d(1),d(1),d(3)])).rejects.toThrow(/consistent/i);
});
