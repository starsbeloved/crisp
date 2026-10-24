import { createVisionSessionStore } from './session-store.ts';
import type { SessionMode } from './session-store.ts';
async function authorize(mode:SessionMode){
  const response=await fetch(mode==='station'?'/api/wr/room':'/api/wr/kiosk/session',{method:mode==='station'?'GET':'POST',credentials:'same-origin',cache:'no-store',...(mode==='kiosk'?{headers:{'Content-Type':'application/json'},body:'{}'}:{})});
  if(!response.ok)throw Error('Vision session expired or unauthorized. Reconnect the station.');
  const value=await response.json();
  if(mode==='station'){if(value.schemaVersion!==2||!Array.isArray(value.visits))throw Error('Invalid station authorization');return {role:'station' as const};}
  if(!value.visit||value.visit.completedAtMs!==null)return {role:'kiosk' as const,consent:false};
  return {role:'kiosk' as const,visitId:value.visit.id,consent:value.visit.consentAtMs!==null};
}
const store=createVisionSessionStore(authorize);
// No descriptors in persistence, BroadcastChannel, network requests or console output.
(globalThis as unknown as {onconnect:(event:MessageEvent)=>void}).onconnect=event=>{
  const port=event.ports[0];let chain=Promise.resolve();
  port.onmessage=message=>{
    chain=chain.then(async()=>{const {id,input}=message.data||{};try{const state=await store.request(input);port.postMessage({id,ok:true,state});}catch(error){port.postMessage({id,ok:false,error:error instanceof Error?error.message:'Vision session failed'});}});
  };port.start();
};
