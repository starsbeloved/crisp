// Local, explicit synthetic browser fixture. Never imports production config or keys.
// Build first, then: node scripts/browser-fixture.mjs
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { openRequestRoom } from '../shared/fixtures.ts';
import { buildFactualFallback } from '../server/providers/grounding.ts';
import { createProviderService } from '../server/providers/service.ts';
const root=fileURLToPath(new URL('../dist/',import.meta.url));
let event=null,serial=0,syntheses=0,audioReads=0;
const base=structuredClone(openRequestRoom),anchor=base.serverNowMs;
function room(){
  const next=structuredClone(base),now=Date.now(),delta=now-anchor;
  next.serverNowMs=now;next.requests=event?[structuredClone(event)]:[];
  next.bindings.forEach(b=>{b.sinceMs+=delta;b.lastVerifiedAtMs=now;if(b.observedLocation)b.observedLocation.observedAtMs=now;});
  next.poses.forEach(p=>{p.alignedAtMs+=delta;p.receivedAtMs+=delta;});
  next.measurements.forEach(m=>{m.alignedStartAtMs+=delta;m.alignedEndAtMs+=delta;m.receivedAtMs+=delta;});
  next.explanations={};next.audioJobs=[];return next;
}
function snapshot(id){const r=room();if(!event||event.id!==id)throw Error('Synthetic event missing');return {eventId:id,version:event.snapshotVersion,event:r.requests[0],binding:r.bindings[0],visit:r.visits[0],measurements:r.measurements,facts:event.facts};}
function silence(){
  const samples=16000,bytes=Buffer.alloc(44+samples*2);
  bytes.write('RIFF');bytes.writeUInt32LE(bytes.length-8,4);bytes.write('WAVE',8);bytes.write('fmt ',12);bytes.writeUInt32LE(16,16);bytes.writeUInt16LE(1,20);bytes.writeUInt16LE(1,22);bytes.writeUInt32LE(16000,24);bytes.writeUInt32LE(32000,28);bytes.writeUInt16LE(2,32);bytes.writeUInt16LE(16,34);bytes.write('data',36);bytes.writeUInt32LE(samples*2,40);return bytes;
}
const service=createProviderService({stationId:'synthetic_fixture',getRoomSnapshot:room,getSnapshot:snapshot,now:Date.now,
  explain:async s=>({state:'fallback',value:buildFactualFallback(s,'unavailable')}),
  synthesize:async()=>{syntheses++;console.log(`Synthetic synthesis ${syntheses}; local silent WAV only, no ElevenLabs call`);return silence();},
});
const json=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
const banner=`<aside style="padding:16px;background:#fff4cc;border:2px solid #92400e;color:#1d1d1f;font:16px system-ui"><strong>SYNTHETIC BROWSER INTEGRATION · no camera or real providers</strong><p>The real dashboard/queue uses mocked HTTP evidence and local silent audio. This does not prove live sensing or audible speech.</p><button id="fixture-raise" style="min-height:44px">Create synthetic check request</button><output id="fixture-status" aria-live="polite"></output></aside><script>document.querySelector('#fixture-raise').onclick=async()=>{const response=await fetch('/__fixture/raise',{method:'POST'});document.querySelector('#fixture-status').textContent=response.ok?' Synthetic request created.':' Fixture action failed.';};</script>`;
const server=createServer(async(req,res)=>{
  try{
    const path=new URL(req.url,'http://127.0.0.1:8791').pathname;
    if(req.method==='POST'&&path==='/__fixture/raise'){
      if(req.headers.origin!=='http://127.0.0.1:8791')return json(res,403,{});
      event={...structuredClone(base.requests[0]),id:`request_browser_${++serial}`,createdAtMs:Date.now(),updatedAtMs:Date.now()};
      service.updateSnapshot(room());return json(res,200,{ok:true});
    }
    if(path.startsWith('/api/wr/')){
      if(req.method==='POST'&&path==='/api/wr/station'){res.setHeader('Set-Cookie','wr_fixture=synthetic; HttpOnly; SameSite=Strict; Path=/api/wr');return json(res,200,{ok:true});}
      if(!req.headers.cookie?.split(';').some(c=>c.trim()==='wr_fixture=synthetic'))return json(res,401,{error:{code:'STATION_REQUIRED',message:'Open the synthetic station first'}});
      service.updateSnapshot(room());
      if(path==='/api/wr/room'){
        const value=room();if(event)value.explanations[event.id]=service.getExplanation(event.id,event.snapshotVersion,'synthetic_fixture');value.audioJobs=service.listAudioJobs('synthetic_fixture');return json(res,200,value);
      }
      if(path==='/api/wr/media')return json(res,200,{events:[]});
      const route=path.match(/^\/api\/wr\/requests\/([^/]+)\/(explain|speech|acknowledge|check)$/);
      if(route&&event&&route[1]===event.id){
        let text='';for await(const chunk of req)text+=chunk;const body=JSON.parse(text||'{}');
        if(route[2]==='explain')return json(res,200,await service.requestExplanation(event.id,body.snapshotVersion,'synthetic_fixture'));
        if(route[2]==='speech')return json(res,200,await service.requestSpeech(event.id,body.snapshotVersion,'synthetic_fixture'));
        event.state=route[2]==='check'?'checked':'acknowledged';event.updatedAtMs=Date.now();service.updateSnapshot(room());
        console.log(`Synthetic request ${event.state}; syntheses=${syntheses}, audioReads=${audioReads}`);
        return json(res,200,route[2]==='check'?{request:event,referenceControl:null}:event);
      }
      if(path.startsWith('/api/wr/audio/')){const bytes=service.readAudio(path.split('/').at(-1),'synthetic_fixture');audioReads++;console.log(`Synthetic audio read ${audioReads}`);res.writeHead(200,{'Content-Type':'audio/mpeg','Cache-Control':'private, no-store'});return res.end(bytes);}
      return json(res,404,{error:{code:'NOT_FOUND',message:'Synthetic boundary does not implement this action'}});
    }
    if(req.method!=='GET')return json(res,405,{});
    const asset=path.startsWith('/assets/')&&/^\/assets\/[A-Za-z0-9_.-]+$/.test(path);
    const file=asset?`${root}${path.slice(1)}`:`${root}index.html`;
    const bytes=await readFile(file);const ext=asset?path.split('.').at(-1):'html';
    res.writeHead(200,{'Content-Type':ext==='js'?'text/javascript':ext==='css'?'text/css':'text/html','Cache-Control':'no-store'});
    res.end(ext==='html'?bytes.toString().replace('<body>',`<body>${banner}`):bytes);
  }catch(e){json(res,e.status??409,{error:{code:'SYNTHETIC_FIXTURE_ERROR',message:'Synthetic operation unavailable'}});}
});
server.listen(8791,'127.0.0.1',()=>console.log('Synthetic fixture only: http://127.0.0.1:8791/staff'));
function stop(){service.dispose();server.close(()=>process.exit(0));}
process.once('SIGINT',stop);process.once('SIGTERM',stop);
