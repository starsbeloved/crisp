import { useEffect, useRef, useState } from 'react';
import type { RoomSnapshot, Visit } from '../../shared/contracts.ts';
import { toDashboardView } from '../../shared/view-model.ts';
import { api } from '../runtime/api.ts';
import { DashboardView } from '../ui/dashboard/DashboardView.tsx';
import { StaffCamera } from '../media/StaffCamera.tsx';
import { VoiceControls } from './VoiceControls.tsx';

function SeatEditor({visit,onSaved}:{visit:Visit;onSaved:(visit:Visit)=>void}) {
  const [label,setLabel]=useState(visit.assignedSeat?.label??'');
  const [pending,setPending]=useState(false),[error,setError]=useState<string|null>(null);
  const retry=useRef<{label:string|null;requestId:string}|null>(null),lock=useRef(false);
  async function save(){
    if(lock.current)return;lock.current=true;setPending(true);setError(null);
    const value=label.trim()||null;
    if(!retry.current||retry.current.label!==value)retry.current={label:value,requestId:crypto.randomUUID()};
    try{onSaved(await api.assignSeat(visit.id,retry.current));retry.current=null;}
    catch(e){setError(`${e instanceof Error?e.message:'Seat save failed'}. Assigned seat save is not confirmed; retry.`);}
    finally{lock.current=false;setPending(false);}
  }
  return <form className="wr-seat-editor" onSubmit={e=>{e.preventDefault();void save();}}><label htmlFor="wr-seat">Assigned seat (optional)</label><div><input id="wr-seat" value={label} maxLength={40} disabled={pending} onChange={e=>setLabel(e.target.value)}/><button disabled={pending}>{pending?'Saving seat…':'Save assigned seat'}</button></div><p>Leave blank to clear. This does not change camera-observed location or identity.</p>{error&&<p role="alert">{error}</p>}</form>;
}

/** Real service readback; never uses gallery fixtures as runtime evidence. */
export function StaffPage() {
  const [room,setRoom]=useState<RoomSnapshot|null>(null);
  const [enabled,setEnabled]=useState(false),[pending,setPending]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [selection,setSelection]=useState<{patientId:string|null;requestId:string|null}>({patientId:null,requestId:null});
  const [actions,setActions]=useState<Record<string,{pending:boolean;error:string|null}>>({});
  const actionLocks=useRef(new Set<string>());
  const retryKeys=useRef(new Map<string,string>());
  const receivedAt=useRef<number|null>(null);
  const [elapsed,setElapsed]=useState(0);
  const actionEpoch=useRef(0);
  const [voiceEpoch,setVoiceEpoch]=useState(0);
  const invalidateVoice=()=>{actionEpoch.current++;setVoiceEpoch(actionEpoch.current);};
  const live=useRef(true);
  useEffect(()=>{live.current=true;return()=>{live.current=false;};},[]);
  useEffect(()=>{const timer=setInterval(()=>{if(receivedAt.current!==null)setElapsed(Math.max(0,performance.now()-receivedAt.current));},250);return()=>clearInterval(timer);},[]);
  useEffect(()=>{
    if(!enabled)return;
    let cancelled=false,timer:ReturnType<typeof setTimeout>;
    async function refresh(){
      const generation=actionEpoch.current;
      try {const next=await api.getRoom();if(!cancelled&&generation===actionEpoch.current){receivedAt.current=performance.now();setElapsed(0);setRoom(next);setError(null);}}
      catch(e){if(!cancelled)setError(e instanceof Error?e.message:'Connection unavailable');}
      finally{if(!cancelled)timer=setTimeout(()=>void refresh(),1000);}
    }
    void refresh();return()=>{cancelled=true;clearTimeout(timer);};
  },[enabled]);
  async function open(){
    if(pending)return;setPending(true);setError(null);
    try{await api.startStation();const next=await api.getRoom();if(live.current){receivedAt.current=performance.now();setElapsed(0);setRoom(next);setEnabled(true);}}
    catch(e){if(live.current)setError(e instanceof Error?e.message:'Staff connection unavailable');}
    finally{if(live.current)setPending(false);}
  }
  async function saveAction(eventId:string,kind:'acknowledge'|'check'){
    if(actionLocks.current.has(eventId))return;
    actionLocks.current.add(eventId);
    invalidateVoice();
    const key=`${eventId}_${kind}`;
    const requestId=retryKeys.current.get(key)??crypto.randomUUID();
    retryKeys.current.set(key,requestId);
    setActions(old=>({...old,[eventId]:{pending:true,error:null}}));
    try{
      const result=kind==='acknowledge'?await api.acknowledge(eventId,requestId):(await api.markChecked(eventId,requestId)).request;
      if(live.current){
        invalidateVoice();
        setRoom(old=>old?{...old,requests:old.requests.map(r=>r.id===result.id?result:r)}:old);
        setActions(old=>({...old,[eventId]:{pending:false,error:null}}));
      }
      retryKeys.current.delete(key);
    }catch(e){if(live.current)setActions(old=>({...old,[eventId]:{pending:false,error:`${e instanceof Error?e.message:'Could not save action'}. Retry this action; its save is not confirmed.`}}));}
    finally{actionLocks.current.delete(eventId);}
  }
  const stale=elapsed>1500;
  const connectionError=error??(stale?'No fresh service snapshot. Previously received evidence is stale.':null);
  const view=room?toDashboardView({...room,serverNowMs:room.serverNowMs+elapsed,...(connectionError?{cameraState:'stale' as const}:{})},selection):null;
  const selectedVisit=room?.visits.find(v=>v.id===view?.selectedPatientId);
  return <main className="wr-staff-shell">
    <header className="wr-app-bar"><a className="wr-brand" href="/">Waiting Room <span>Staff</span></a><nav aria-label="Operator views"><a href="/check-in">Check-in</a><a href="/vision">Vision</a></nav></header>
    {!room?<section className="wr-welcome"><span className="wr-eyebrow">STAFF WORKSPACE</span><h1>A clear view.<br/>A human response.</h1><p>Review saved check-ins and the evidence behind each request to check a patient.</p><button className="wr-primary" disabled={pending} onClick={()=>void open()}>{pending?'Connecting…':'Open local staff view'}</button><p className="wr-caption">Supervised local prototype. Not medical triage.</p></section>:null}
    {connectionError&&<p role="alert" className="wr-error">{connectionError}</p>}
    {room&&view&&<DashboardView {...view}
      requests={view.requests.map(r=>({...r,actionPending:actions[r.id]?.pending??false,actionError:actions[r.id]?.error??null}))}
      videoSlot={<StaffCamera room={room} selectedPatientId={selection.patientId} selectedRequestId={selection.requestId}/>}
      voiceSlot={<VoiceControls room={room} connected={!connectionError} actionEpoch={voiceEpoch}/>}
      patientActions={selectedVisit&&<SeatEditor key={selectedVisit.id} visit={selectedVisit} onSaved={visit=>setRoom(old=>old?{...old,visits:old.visits.map(v=>v.id===visit.id?visit:v)}:old)}/>}
      cameraLabel="Shared camera · frame freshness verified in the view below"
      connectionLabel={connectionError?'Disconnected · saved snapshot only':'Connected to local service'}
      systemStatuses={[{label:`Observation source: ${connectionError?'stale':room.cameraState}`,tone:!connectionError&&room.cameraState==='live'?'info':'warning'},{label:'Identity and measurements require fresh, verified evidence. Provider and playback status appear above.',tone:'neutral'}]}
      statusAnnouncement={error??''} canRetryCamera={false} audioEnabled={false} muted={true}
      onSelectPatient={patientId=>setSelection({patientId,requestId:null})}
      onSelectRequest={requestId=>setSelection({patientId:null,requestId})}
      onAcknowledge={eventId=>void saveAction(eventId,'acknowledge')}
      onChecked={eventId=>void saveAction(eventId,'check')}
      onEnableAudio={()=>{}}
      onToggleMute={()=>{}}
      onTestAudio={()=>{}}
      onRetryCamera={()=>setError('Open the Vision view to manage the camera')}
    />}
  </main>;
}
