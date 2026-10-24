import { spawn } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// Isolated local model smoke test. Does not use a camera or a patient/staff cookie.
const profile=await mkdtemp(join(tmpdir(),'waiting-room-sensor-browser-'));
const chrome=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless','--disable-background-networking','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{stdio:['ignore','ignore','pipe']});
let socket;
try {
 const endpoint=await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('Browser launch timed out')),10000);chrome.stderr.on('data',chunk=>{const match=String(chunk).match(/DevTools listening on (ws:\/\/[^\s]+)/);if(match){clearTimeout(timeout);resolve(match[1]);}});chrome.once('exit',code=>{clearTimeout(timeout);reject(Error(`Browser exited ${code}`));});});
 socket=new WebSocket(endpoint);await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
 let id=0;const pending=new Map();socket.addEventListener('message',event=>{const value=JSON.parse(event.data);if(value.id){const p=pending.get(value.id);pending.delete(value.id);if(value.error)p?.reject(Error(value.error.message));else p?.resolve(value.result);}});
 const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const requestId=++id;pending.set(requestId,{resolve,reject});socket.send(JSON.stringify({id:requestId,method,params,...(sessionId?{sessionId}:{})}));});
 const target=await send('Target.createTarget',{url:'about:blank'}),session=await send('Target.attachToTarget',{targetId:target.targetId,flatten:true});
 await send('Page.enable',{},session.sessionId);await send('Runtime.enable',{},session.sessionId);
 const loaded=new Promise((resolve,reject)=>{const timeout=setTimeout(()=>{socket.removeEventListener('message',listener);reject(Error('Probe page load timed out'));},10000);const listener=event=>{const value=JSON.parse(event.data);if(value.method==='Page.loadEventFired'&&value.sessionId===session.sessionId){clearTimeout(timeout);socket.removeEventListener('message',listener);resolve();}};socket.addEventListener('message',listener);});
 await send('Page.navigate',{url:`http://127.0.0.1:5173/tests/sensor-integration-probe.html${process.argv.includes('--loader')?'?loader':''}`},session.sessionId);await loaded;
 let result='';const deadline=Date.now()+22000;
 while(Date.now()<deadline){
  try{const evaluation=await send('Runtime.evaluate',{expression:`document.querySelector('#result')?.textContent??''`,returnByValue:true},session.sessionId);result=evaluation.result?.value??'';if(result.includes('PASS')||result.includes('FAIL'))break;}catch(error){if(!/navigated|context/i.test(error.message))throw error;}
  await new Promise(resolve=>setTimeout(resolve,100));
 }
 console.log(result||'FAIL: page did not load');if(!String(result).includes('PASS'))process.exitCode=1;
 await send('Browser.close').catch(()=>{});
} catch(error){console.error(error.message);process.exitCode=1;}
finally{socket?.close();chrome.kill('SIGTERM');}
