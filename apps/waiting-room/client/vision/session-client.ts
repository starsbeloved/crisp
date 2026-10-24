import type { VisionSessionRequest, VisionSessionState } from './session-store.ts';
export function connectVisionSession(){
  if(typeof SharedWorker==='undefined')throw Error('SharedWorker support is required to keep face enrollment across station tabs');
  const worker=new SharedWorker(new URL('./session.worker.ts',import.meta.url),{type:'module',name:'waiting-room-face-session-v1'}),port=worker.port;
  let serial=0,closed=false;const pending=new Map<number,{resolve:(state:VisionSessionState)=>void;reject:(e:Error)=>void;timer:ReturnType<typeof setTimeout>}>();
  port.onmessage=event=>{const data=event.data,p=pending.get(data?.id);if(!p)return;pending.delete(data.id);clearTimeout(p.timer);data.ok?p.resolve(data.state):p.reject(Error(data.error||'Vision session failed'));};port.start();
  return {request(input:VisionSessionRequest):Promise<VisionSessionState>{if(closed)return Promise.reject(Error('Vision session closed'));return new Promise((resolve,reject)=>{const id=++serial,timer=setTimeout(()=>{pending.delete(id);reject(Error('Vision session timed out'));},6000);pending.set(id,{resolve,reject,timer});port.postMessage({id,input});});},dispose(){closed=true;for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('Vision session closed'));}pending.clear();port.close();}};
}
