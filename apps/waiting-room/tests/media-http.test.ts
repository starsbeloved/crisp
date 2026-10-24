import { afterEach, expect, it } from 'vitest';
import { createWaitingRoomServer } from '../server/http.ts';
import { listen } from './helpers.ts';

const cleanups:Array<()=>Promise<void>>=[];
afterEach(async()=>{for(const cleanup of cleanups.splice(0).reverse())await cleanup();});
it('gates the media mailbox on real current station authority and rejects a paired patient even with a guessed client ID',async()=>{
  const app=createWaitingRoomServer({databasePath:':memory:',phoneOrigins:['https://phone.waiting.test:8443']});cleanups.push(app.close);
  const origin=await listen(app.server);
  const post=async(path:string,body:unknown,cookie='',requestOrigin=origin)=>{
    const response=await fetch(`${origin}/api/wr${path}`,{method:'POST',headers:{Origin:requestOrigin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:JSON.stringify(body)});
    return {status:response.status,body:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]??''};
  };
  expect((await post('/media',{action:'register',clientId:'vision',role:'publisher'})).status).toBe(401);
  const station=await post('/station',{});expect(station.status).toBe(200);
  const publisher=await post('/media',{action:'register',clientId:'vision',role:'publisher'},station.cookie);expect(publisher.status).toBe(200);
  const visit=await post('/visits',{requestId:'media_visit',label:'Synthetic media auth visit'},station.cookie);
  const pair=await post(`/visits/${visit.body.id}/pair`,{requestId:'media_pair',purpose:'patient'},station.cookie);
  const phone=await post('/join',{code:pair.body.code});expect(phone.status).toBe(200);
  expect((await post('/media',{action:'poll',clientId:'vision',afterSeq:0},phone.cookie)).status).toBe(403);
  const receiver=await post('/media',{action:'register',clientId:'staff',role:'receiver'},station.cookie);
  expect(receiver.body.events).toMatchObject([{type:'peer',peerId:'vision'}]);
  expect((await post('/media',{action:'register',clientId:'other_vision',role:'publisher'},station.cookie)).status).toBe(409);
  expect((await post('/media',{action:'poll',clientId:'staff',afterSeq:0},station.cookie,'https://phone.waiting.test:8443')).status).toBe(403);
  const replacement=await post('/station',{});expect(replacement.cookie).not.toBe(station.cookie);
  expect((await post('/media',{action:'poll',clientId:'staff',afterSeq:0},station.cookie)).status).toBe(401);
  expect((await post('/media',{action:'poll',clientId:'staff',afterSeq:0},replacement.cookie)).status).toBe(410);
});
