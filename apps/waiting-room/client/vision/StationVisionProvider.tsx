import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { VisionProvider } from './resources.tsx';
import { createFaceGallery } from './identity.ts';
import { connectVisionSession } from './session-client.ts';
import { makeFaceWorkerAdapter } from './worker-adapter.ts';
import type { Calibration, Enrollment } from './types.ts';
import type { CalibrationCaptures, SessionMode, VisionSessionState } from './session-store.ts';
export function StationVisionProvider({children}:{children:ReactNode}){
  const mode:SessionMode|null=typeof location!=='undefined'&&location.pathname==='/check-in'?'kiosk':typeof location!=='undefined'&&location.pathname==='/vision'?'station':null;
  const modeRef=useRef(mode);modeRef.current=mode;
  const gallery=useMemo(()=>createFaceGallery(),[]),client=useRef<ReturnType<typeof connectVisionSession>|null>(null),worker=useRef<ReturnType<typeof makeFaceWorkerAdapter>|null>(null);
  const [adapter,setAdapter]=useState<ReturnType<typeof makeFaceWorkerAdapter>|null>(null),[calibration,setCalibration]=useState<Calibration|null>(null),[status,setStatus]=useState<'idle'|'loading'|'ready'|'error'>('idle'),[error,setError]=useState<string|null>(null);
  const active=useRef(true),revision=useRef(''),calibrationRevision=useRef(-1),connecting=useRef(false);
  const [snapshotVersion,setSnapshotVersion]=useState(0);
  function apply(state:VisionSessionState){
    // The kiosk response is filtered to its authorized visit. A changed visit can
    // produce a different gallery without changing the shared store revision.
    const key=JSON.stringify([state.revision,state.enrollments.map(e=>e.visitId)]);
    if(!active.current||key===revision.current)return;
    revision.current=key;gallery.clear();for(const enrollment of state.enrollments)gallery.enroll(enrollment);
    const sameCalibrationRevision=calibrationRevision.current===state.calibrationRevision;calibrationRevision.current=state.calibrationRevision;
    setCalibration(previous=>sameCalibrationRevision&&previous?.modelId===state.calibration?.modelId&&previous?.threshold===state.calibration?.threshold&&previous?.margin===state.calibration?.margin?previous:state.calibration);
    setSnapshotVersion(value=>value+1);
  }
  async function refresh(){
    const port=client.current,role=modeRef.current;if(!port||!role)return;
    try{const state=await port.request({kind:'read',mode:role});if(port!==client.current||role!==modeRef.current)return;apply(state);if(active.current)setError(null);}
    catch(error){if(port===client.current&&role===modeRef.current)throw error;}
  }
  async function connect(){
    if(!modeRef.current||connecting.current||adapter)return;connecting.current=true;setStatus('loading');setError(null);
    let next:ReturnType<typeof makeFaceWorkerAdapter>|null=null;
    try{
      client.current??=connectVisionSession();await refresh();next=makeFaceWorkerAdapter();worker.current=next;await next.ready();
      if(!active.current){next.dispose();return;}setAdapter(next);setStatus('ready');
    }catch(e){next?.dispose();worker.current=null;if(active.current){setAdapter(null);setStatus('error');setError(e instanceof Error?e.message:'Face models could not load');}}
    finally{connecting.current=false;}
  }
  async function saveEnrollment(enrollment:Enrollment){const role=modeRef.current;if(role!=='kiosk'||!client.current)throw Error('Connect the check-in face session first');const state=await client.current.request({kind:'enroll',mode:role,enrollment});if(modeRef.current===role)apply(state);}
  async function saveCalibration(captures:CalibrationCaptures){if(modeRef.current!=='station'||!client.current)throw Error('Connect the vision station first');const state=await client.current.request({kind:'calibrate',mode:'station',captures});if(modeRef.current==='station')apply(state);}
  useEffect(()=>{
    active.current=true;let inFlight=false;
    const timer=setInterval(()=>{if(!client.current||inFlight)return;inFlight=true;void refresh().catch(e=>{if(active.current){gallery.clear();revision.current='';calibrationRevision.current=-1;setCalibration(null);setSnapshotVersion(value=>value+1);setError(e instanceof Error?e.message:'Vision session unavailable');}}).finally(()=>{inFlight=false;});},1500);
    return()=>{active.current=false;clearInterval(timer);worker.current?.dispose();client.current?.dispose();worker.current=null;client.current=null;revision.current='';gallery.clear();};
  },[]);
  useEffect(()=>{
    // Keep one document's model/SharedWorker ports alive through operator SPA
    // navigation. Refresh the role-filtered gallery under the new authority.
    revision.current='';gallery.clear();setSnapshotVersion(value=>value+1);
    if(client.current&&mode)void refresh().catch(e=>{if(active.current){setCalibration(null);setError(e instanceof Error?e.message:'Vision session unavailable');}});
  },[mode]);
  const resources=useMemo(()=>({adapter,gallery,calibration,saveEnrollment,session:{mode,status,error,connect,refresh,saveCalibration}}),[adapter,gallery,calibration,status,error,mode,snapshotVersion]);
  return <VisionProvider resources={resources}>{children}</VisionProvider>;
}
