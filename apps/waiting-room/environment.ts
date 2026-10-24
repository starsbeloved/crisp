import { readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import type { Plugin } from 'vite';
type Environment = Record<string,string|undefined>;
export function providerConfiguration(env:Environment):{gemini:boolean;speech:boolean} {
  for(const key of ['WR_ENABLE_GEMINI','WR_ENABLE_ELEVENLABS'])if(env[key]!==undefined && !['true','false'].includes(env[key]!))throw Error(`${key} must be true or false`);
  const gemini=env.WR_ENABLE_GEMINI==='true',speech=env.WR_ENABLE_ELEVENLABS==='true';
  if(gemini && (!env.GEMINI_API_KEY?.trim() || !env.GEMINI_MODEL?.trim()))throw Error('Gemini configuration requires a server API key and explicit model');
  if(speech && (!env.ELEVENLABS_API_KEY?.trim() || !/^[A-Za-z0-9_-]{1,96}$/.test(env.ELEVENLABS_VOICE_ID??'') || !env.ELEVENLABS_MODEL_ID?.trim()))throw Error('ElevenLabs configuration requires a server API key, voice and explicit model');
  return {gemini,speech};
}
export function patientOriginForClient(env:Environment):string {
  const origin=phoneOrigin(env)??'';
  if(env.VITE_PATIENT_ORIGIN && env.VITE_PATIENT_ORIGIN!==origin)throw Error('VITE_PATIENT_ORIGIN and WR_PHONE_ORIGIN must be the same exact HTTPS origin');
  return origin;
}
export function phoneOrigin(env:Environment):string|null {
  const value=env.WR_PHONE_ORIGIN;
  if(!value) return null;
  let url:URL;try{url=new URL(value);}catch{throw Error('WR_PHONE_ORIGIN must be an exact HTTPS origin with an explicit high port');}
  const host=url.hostname.toLowerCase();
  if(host==='localhost'||host.endsWith('.localhost')||host==='[::1]'||host==='0.0.0.0'||host.startsWith('127.'))throw Error('WR_PHONE_ORIGIN must use a phone-accessible laptop hostname, not loopback');
  if(url.protocol!=='https:' || url.origin!==value || url.username || url.password || !url.hostname || !url.port || Number(url.port)<1024) throw Error('WR_PHONE_ORIGIN must be an exact HTTPS origin with an explicit high port');
  return url.origin;
}
export function phoneTls(env:Environment,root:string):{origin:string;host:string;port:number;https:{cert:Buffer;key:Buffer}} {
  const origin=phoneOrigin(env);
  if(!origin) throw Error('Phone HTTPS requires WR_PHONE_ORIGIN');
  if(!env.WR_TLS_CERT_PATH || !env.WR_TLS_KEY_PATH) throw Error('Phone HTTPS requires existing certificate and key paths');
  const certRoot=resolve(root,'.local/certs');
  function inside(base:string,path:string) {const child=relative(base,path);return child!=='' && child!=='..' && !child.startsWith(`..${sep}`) && !isAbsolute(child);}
  function load(path:string):Buffer {
    const candidate=resolve(root,path);
    if(!inside(certRoot,candidate)) throw Error('TLS paths must be inside this project .local/certs directory');
    try {
      const realRoot=realpathSync(certRoot), realCandidate=realpathSync(candidate);
      if(realRoot!==resolve(realpathSync(root),'.local/certs') || !inside(realRoot,realCandidate)) throw Error('Certificate symlink leaves project directory');
      return readFileSync(realCandidate);
    } catch {throw Error('Configured project TLS certificate/key file is unavailable');}
  }
  const cert=load(env.WR_TLS_CERT_PATH), key=load(env.WR_TLS_KEY_PATH), url=new URL(origin);
  return {origin,host:url.hostname,port:Number(url.port),https:{cert,key}};
}
export function phoneBoundary(origin:string):Plugin {
  const expected=new URL(origin);
  return {name:'waiting-room-phone-boundary',configureServer(server){
    server.middlewares.use((req,res,next)=>{
      const reject=()=>{res.statusCode=403;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({error:{code:'PHONE_BOUNDARY_REJECTED',message:'Phone origin only; station access is local to the laptop'}}));};
      if(req.headers.host!==expected.host || (req.headers.origin!==undefined && req.headers.origin!==origin) || req.headers['sec-fetch-site']==='cross-site' || Object.keys(req.headers).some(h=>h==='forwarded'||h.startsWith('x-forwarded-'))) return reject();
      let path:string;
      try {path=decodeURIComponent(new URL(req.url??'/',origin).pathname).replace(/\\/g,'/').replace(/\/+/g,'/');}catch{return reject();}
      if(path==='/' || /^\/(station|staff|check-in|vision|gallery)(?:\/|$)/i.test(path))return reject();
      if(/^\/api\/wr(?:\/|$)/i.test(path) && !/^\/api\/wr\/(?:health|join|clock-sync|questionnaire-summary|patient\/(?:session|finish)|captures(?:\/[A-Za-z0-9_-]+\/(?:complete|cancel))?|visits\/[A-Za-z0-9_-]+\/questionnaire)$/.test(path))return reject();
      next();
    });
  }};
}
