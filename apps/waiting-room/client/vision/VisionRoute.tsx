import { useEffect, useRef, useState } from 'react';
import { api } from '../runtime/api.ts';
import { createSensorClock } from '../runtime/sensor-clock.ts';
import type { SensorClock } from '../runtime/sensor-clock.ts';
import { createBrowserPoseWorker } from '../runtime/sensor-worker-client.ts';
import { createSensorSession } from '../runtime/sensor-session.ts';
import type { SensorSession, SensingStatus } from '../runtime/sensor-session.ts';
import { createSensorTransport } from '../runtime/sensor-transport.ts';
import type { DeliveryStatus, SensorMeasurement, SensorTransport } from '../runtime/sensor-transport.ts';
import { tagCameraStream, useCameraPublisher } from '../media/useCameraPublisher.ts';
import { roomSnapshotSchema } from '../../shared/schemas.ts';
import { VisionPage } from './VisionPage.tsx';
import type { RoomSnapshot, SensorContext } from '../../shared/contracts.ts';

type ConnectedStation={clock:SensorClock;context:SensorContext;sensors:SensorSession;delivery:SensorTransport;active:boolean;timer:ReturnType<typeof setTimeout>|null;requests:Set<AbortController>};
const initialDelivery:DeliveryStatus={state:'idle',reason:null,pending:0,accepted:0,discarded:0};
/** Authentication, clock and model loading do not acquire a camera. VisionPage's
 * explicit consent action owns the only stream. Staff receives that same stream.
 */
export function VisionRoute(){
 const publish=useCameraPublisher(),publisher=useRef(publish);publisher.current=publish;
 const [station,setStation]=useState<ConnectedStation|null>(null),[pending,setPending]=useState(false),[error,setError]=useState<string|null>(null),[failed,setFailed]=useState(false);
 const [sensing,setSensing]=useState<SensingStatus>({state:'initializing',reason:'Connect the station to prepare sensing',poseLatencyMs:null}),[deliveryStatus,setDeliveryStatus]=useState(initialDelivery);
 const [readings,setReadings]=useState<Partial<Record<'rppg'|'breathing',SensorMeasurement>>>({});
 const mounted=useRef(false),current=useRef<ConnectedStation|null>(null),connecting=useRef(false),connectionEpoch=useRef(0);
 function release(){
  const old=current.current;current.current=null;
  if(!old)return;old.active=false;if(old.timer)clearTimeout(old.timer);old.requests.forEach(c=>c.abort());old.requests.clear();old.delivery.dispose();old.sensors.dispose();old.clock.dispose();publisher.current(null);
 }
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;connectionEpoch.current++;release();};},[]);
 function stopForFailure(runtime:ConnectedStation,reason:string){
  if(!mounted.current||current.current!==runtime||!runtime.active)return;
  runtime.active=false;if(runtime.timer)clearTimeout(runtime.timer);runtime.requests.forEach(c=>c.abort());runtime.requests.clear();runtime.sensors.reset(reason);runtime.delivery.discardObservations(reason);runtime.delivery.dispose();runtime.sensors.dispose();runtime.clock.dispose();publisher.current(null);setFailed(true);setError(reason);setReadings({});
 }
 async function readRoom(runtime:ConnectedStation):Promise<RoomSnapshot>{
  const controller=new AbortController();runtime.requests.add(controller);const timeout=setTimeout(()=>controller.abort(),1500);
  try{
   if(!runtime.clock.getSyncId())throw Error('Source clock mapping is unavailable. Reconnect for fresh windows.');
   const response=await fetch('/api/wr/room',{credentials:'same-origin',cache:'no-store',signal:controller.signal});
   if(!response.ok)throw Error(`Nurse reference readback failed (${response.status}). Reconnect the station.`);
   return roomSnapshotSchema.parse(await response.json());
  }finally{clearTimeout(timeout);runtime.requests.delete(controller);}
 }
 async function poll(runtime:ConnectedStation){
  if(!runtime.active||current.current!==runtime)return;
  try{const room=await readRoom(runtime);if(runtime.active&&current.current===runtime)runtime.sensors.setReferenceControls(room.referenceControls);}
  catch(e){if(runtime.active&&current.current===runtime)stopForFailure(runtime,e instanceof Error?`Monitoring paused: ${e.message}`:'Nurse reference readback unavailable. Reconnect the station.');}
  finally{if(runtime.active&&current.current===runtime)runtime.timer=setTimeout(()=>void poll(runtime),500);}
 }

 async function connect(){
  if(connecting.current)return;connecting.current=true;const epoch=++connectionEpoch.current;
  release();setStation(null);setPending(true);setError(null);setFailed(false);setReadings({});setDeliveryStatus(initialDelivery);
  let clock:SensorClock|null=null,runtime:ConnectedStation|null=null;
  try{
   await api.startStation();if(!mounted.current||epoch!==connectionEpoch.current)return;
   const sourceId=`camera_${crypto.randomUUID()}`,runId=crypto.randomUUID();
   clock=createSensorClock({sourceId,runId,onError:()=>{if(runtime)stopForFailure(runtime,'Clock synchronization unavailable. Reconnect for fresh identity and sensing windows.');}});
   await clock.synchronize();if(!mounted.current||epoch!==connectionEpoch.current){clock.dispose();return;}
   const sourceClock=clock;let bindingSeq=0;
   const context:SensorContext={sourceId,runId,getSyncId:sourceClock.getSyncId,nextSeq:()=>++bindingSeq};
   const delivery=createSensorTransport({sourceId,runId,nowMs:sourceClock.nowMs,mapping:sourceClock.mapping,onStatus:status=>{if(mounted.current&&runtime&&current.current===runtime)setDeliveryStatus(status);},onFailure:reason=>{if(runtime)stopForFailure(runtime,reason);},onPoseRejected:async poses=>{
    if(!runtime?.active)return false;
    const room=await readRoom(runtime);
    if(!runtime.active||current.current!==runtime)return false;
    const advanced=poses.every(p=>room.referenceControls.some(c=>c.trackId===p.trackId&&c.visitId===p.visitId&&c.identityEpoch===p.identityEpoch&&c.generation>p.referenceGeneration));
    if(!advanced)return false;
    runtime.sensors.setReferenceControls(room.referenceControls);runtime.delivery.discardObservations('Discarded packets from the previous nurse reference');return true;
   }});
   const sensors=createSensorSession({sourceId,runId,getSyncId:sourceClock.getSyncId,getContinuityKey:sourceClock.getContinuityKey,nowMs:sourceClock.nowMs,worker:createBrowserPoseWorker(),emitMeasurement:measurement=>{
    if(!runtime?.active)return;delivery.measurement(measurement);if(mounted.current)setReadings(old=>({...old,[measurement.streamId]:measurement}));
   },emitPose:pose=>{if(runtime?.active)delivery.pose(pose);},onStatus:status=>{if(mounted.current&&runtime&&current.current===runtime)setSensing(status);}});
   runtime={clock:sourceClock,context,sensors,delivery,active:true,timer:null,requests:new Set()};current.current=runtime;
   setStation(runtime);void sensors.initialize();void poll(runtime);
  }catch(e){runtime?.delivery.dispose();runtime?.sensors.dispose();clock?.dispose();if(mounted.current&&epoch===connectionEpoch.current){setError(e instanceof Error?e.message:'Could not connect vision station');setFailed(true);}}
  finally{connecting.current=false;if(mounted.current&&epoch===connectionEpoch.current)setPending(false);}
 }
 function streamChanged(stream:MediaStream|null){
  const runtime=current.current;
  if(!stream&&runtime){runtime.sensors.reset('Camera stopped or view changed');runtime.delivery.discardObservations('Camera is not streaming');setReadings({});}
  if(stream&&runtime?.active)tagCameraStream(stream,{sourceId:runtime.context.sourceId,runId:runtime.context.runId});
  publisher.current(stream&&runtime?.active?stream:null);
 }
 return <>
  <header className="wr-app-bar"><a className="wr-brand" href="/">Waiting Room <span>Vision</span></a><nav aria-label="Operator views"><a href="/check-in">Check-in</a><a href="/staff">Nurse dashboard</a></nav></header>
  {error&&<p role="alert" className="wr-error">{error}</p>}
  {!station||failed?<main className="wr-welcome"><p className="wr-eyebrow">CAMERA STATION</p><h1>Room vision</h1><p>Connect the local service first. Camera capture starts only when you press Start camera with the volunteer’s consent.</p><button className="wr-primary" disabled={pending} onClick={()=>void connect()}>{pending?'Connecting…':failed?'Reconnect vision station':'Connect vision station'}</button><p>Live estimates need usable framing, lighting and verified identity. An unavailable reading remains unavailable.</p></main>:<>
   <section className="vision-card" aria-label="Sensing connection"><h2>Camera evidence</h2><p role="status">{deliveryStatus.state==='failed'?'Observation delivery failed':`Local service: ${deliveryStatus.state}. ${deliveryStatus.accepted} observations and bindings accepted.`}</p>{deliveryStatus.reason&&<p>{deliveryStatus.reason}</p>}<p>Pose: {sensing.state}{sensing.reason?` · ${sensing.reason}`:''}{sensing.poseLatencyMs!==null?` · ${Math.round(sensing.poseLatencyMs)} ms inference age`:''}</p><p>Camera pulse: {readings.rppg?.value!==null&&readings.rppg?.value!==undefined?`${Math.round(readings.rppg.value)} bpm · local estimate`:(readings.rppg?.reason??'Waiting for usable face frames')}</p><p>Camera breathing: {readings.breathing?.value!==null&&readings.breathing?.value!==undefined?`${readings.breathing.value.toFixed(1)} breaths/min · local estimate`:(readings.breathing?.reason??'Waiting for fresh stationary torso pose')}</p><p>Accepted evidence appears on the nurse dashboard. Pulse needs 30 seconds; breathing needs 45 seconds of contiguous usable frames.</p></section>
   <VisionPage context={station.context} nowMs={station.clock.nowMs} onStream={streamChanged} onFrame={frame=>{if(station.active)station.sensors.push(frame);}} onBindings={batch=>{if(station.active)station.delivery.bindings(batch);}}/>
  </>}
 </>;
}
