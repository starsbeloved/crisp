import { afterEach, expect, it } from 'vitest';
import { createServer } from 'vite';
import { createWaitingRoomServer } from '../server/http.ts';
import { phoneBoundary, phoneOrigin, phoneTls } from '../environment.ts';
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { request as httpRequest } from 'node:http';
import type { AddressInfo } from 'node:net';
const origin='https://phone.waiting.test:8443';
const cleanups:Array<()=>Promise<unknown>>=[];
afterEach(async()=>{for(const close of cleanups.splice(0).reverse()) await close();});
async function fixture() {
  const api=createWaitingRoomServer({databasePath:':memory:',phoneOrigins:[origin]});
  await new Promise<void>((resolve,reject)=>{api.server.once('error',reject);api.server.listen(0,'127.0.0.1',resolve);}); cleanups.push(()=>api.close());
  const apiPort=(api.server.address() as AddressInfo).port;
  const proxy=await createServer({configFile:false,root:process.cwd(),logLevel:'silent',plugins:[phoneBoundary(origin)],server:{host:'127.0.0.1',port:0,allowedHosts:['phone.waiting.test'],hmr:false,proxy:{'/api/wr':{target:`http://127.0.0.1:${apiPort}`,changeOrigin:false}}}});
  await proxy.listen();cleanups.push(()=>proxy.close());
  const port=(proxy.httpServer!.address() as AddressInfo).port;
  return {port,apiPort};
}
function send(port:number,path:string,method='GET',headers:Record<string,string>={},body?:unknown):Promise<{status:number;value:any;headers:import('node:http').IncomingHttpHeaders}> {
  return new Promise((resolve,reject)=>{const payload=body===undefined?undefined:JSON.stringify(body);const req=httpRequest({host:'127.0.0.1',port,path,method,headers:{Host:'phone.waiting.test:8443',...(payload?{'Content-Type':'application/json'}:{}),...headers}},res=>{let data='';res.on('data',chunk=>{data+=chunk;});res.on('end',()=>{let value:unknown=data;try{value=JSON.parse(data);}catch{}resolve({status:res.statusCode!,value,headers:res.headers});});});req.on('error',reject);req.end(payload);});
}
it('fails closed without exact HTTPS origin and explicitly existing project certificate paths',()=>{
  expect(phoneOrigin({})).toBeNull(); expect(phoneOrigin({WR_PHONE_ORIGIN:origin})).toBe(origin);
  for(const value of ['http://phone.waiting.test:8443',origin+'/phone','https://u:p@phone.waiting.test:8443','https://phone.waiting.test']) expect(()=>phoneOrigin({WR_PHONE_ORIGIN:value})).toThrow();
  expect(()=>phoneTls({},process.cwd())).toThrow(/origin/i);
  expect(()=>phoneTls({WR_PHONE_ORIGIN:origin},process.cwd())).toThrow(/certificate/i);
  expect(()=>phoneTls({WR_PHONE_ORIGIN:origin,WR_TLS_CERT_PATH:'/tmp/unknown-cert',WR_TLS_KEY_PATH:'/tmp/unknown-key'},process.cwd())).toThrow(/project/i);
});
it('blocks station bootstrap, spoofed hosts/origins and forwarding headers through the real Vite proxy',async()=>{
  const {port}=await fixture();
  for(const path of ['/','/station','/station/','/%73tation','/api/wr/station','/api/wr/%73tation']) expect((await send(port,path,'POST',{Origin:origin},{})).status).toBe(403);
  for(const headers of ([{Host:'evil.test:8443',Origin:origin},{Origin:'http://127.0.0.1:5173'},{Origin:origin,'X-Forwarded-Host':'127.0.0.1:5173'},{Origin:origin,'Sec-Fetch-Site':'cross-site'}] as Array<Record<string,string>>)) expect((await send(port,'/api/wr/join','POST',headers,{code:'00000000'})).status).toBe(403);
  expect((await send(port,'/phone')).status).toBe(200);
  expect((await send(port,'/api/wr/room')).status).toBe(403);
});
it('preserves same-origin purpose cookies and role checks while laptop bootstrap remains local',async()=>{
  const {port,apiPort}=await fixture();const local=`http://127.0.0.1:${apiPort}`;
  const station=await send(apiPort,'/api/wr/station','POST',{Host:`127.0.0.1:${apiPort}`,Origin:local},{});expect(station.status).toBe(200);
  const stationCookie=station.headers['set-cookie']![0].split(';')[0];
  const visit=await send(apiPort,'/api/wr/visits','POST',{Host:`127.0.0.1:${apiPort}`,Origin:local,Cookie:stationCookie},{requestId:'visit_request',label:'Test visit'});expect(visit.status).toBe(201);
  const pair=await send(apiPort,`/api/wr/visits/${visit.value.id}/pair`,'POST',{Host:`127.0.0.1:${apiPort}`,Origin:local,Cookie:stationCookie},{requestId:'pair_request',purpose:'ppg'});expect(pair.status).toBe(200);
  const joined=await send(port,'/api/wr/join','POST',{Origin:origin},{code:pair.value.code});expect(joined.status).toBe(200);expect(joined.headers['set-cookie']![0]).toContain('; Secure');
  const phoneCookie=joined.headers['set-cookie']![0].split(';')[0];
  expect((await send(port,'/api/wr/visits','POST',{Origin:origin,Cookie:phoneCookie},{requestId:'forbidden_visit'})).status).toBe(403);
  expect((await send(port,'/api/wr/clock-sync','POST',{Origin:origin,Cookie:phoneCookie},{phase:'start',sourceId:'phone_1',runId:'run_1',clientSendMs:1000})).status).toBe(200);
});

it('rejects a symlinked certificate directory before reading files outside the configured project directory',()=>{
  const auditRoot=resolve('.local/test-runs/P1-A2');mkdirSync(auditRoot,{recursive:true});
  const fixtureRoot=mkdtempSync(resolve(auditRoot,'tls-symlink-'));
  const external=resolve(fixtureRoot,'outside-cert-root');mkdirSync(external);
  writeFileSync(resolve(external,'cert.pem'),'Non-secret test sentinel');
  writeFileSync(resolve(external,'key.pem'),'Non-secret test sentinel');
  const project=resolve(fixtureRoot,'project');mkdirSync(resolve(project,'.local'),{recursive:true});
  symlinkSync(external,resolve(project,'.local/certs'),'dir');
  expect(()=>phoneTls({WR_PHONE_ORIGIN:origin,WR_TLS_CERT_PATH:'.local/certs/cert.pem',WR_TLS_KEY_PATH:'.local/certs/key.pem'},project)).toThrow(/project/i);
});

it('serves only patient entry pages and rejects staff, camera, media and source configuration routes at the public listener',async()=>{
  const {port}=await fixture();
  for(const path of ['/staff','/check-in','/vision','/gallery','/%73taff','//vision','/api/wr/kiosk','/api/wr/media/session','/api/wr/observations','/api/wr/requests/event/speech','/api/wr/audio/job'])expect((await send(port,path,'GET')).status,path).toBe(403);
  expect((await send(port,'/patient')).status).toBe(200);
});
