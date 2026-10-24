export type ProviderErrorCode = 'invalid-input'|'invalid-output'|'unavailable'|'timeout'|'aborted'|'ineligible'|'forbidden'|'expired'|'capacity';
export class ProviderError extends Error {
  readonly code:ProviderErrorCode;
  constructor(code:ProviderErrorCode) {
    const messages:Record<ProviderErrorCode,string>={
      'invalid-input':'Invalid provider input','invalid-output':'Invalid provider output',unavailable:'Provider unavailable',
      timeout:'Provider timed out',aborted:'Provider operation aborted',ineligible:'Request is no longer eligible',
      forbidden:'Station authorization required',expired:'Audio expired',capacity:'Provider capacity reached',
    };
    super(messages[code]);this.name='ProviderError';this.code=code;
  }
}

/** Deadline includes response-body consumption. Also settles if an injected transport ignores abort. */
export async function withProviderDeadline<T>(parent:AbortSignal,work:(signal:AbortSignal)=>Promise<T>):Promise<T> {
  if(parent.aborted)throw new ProviderError('aborted');
  const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
  let rejectAbort!:(reason:ProviderError)=>void;
  const interrupted=new Promise<never>((_resolve,reject)=>{rejectAbort=reject;});
  const interrupt=(code:'aborted'|'timeout')=>{controller.abort();rejectAbort(new ProviderError(code));};
  const onAbort=()=>interrupt('aborted');parent.addEventListener('abort',onAbort,{once:true});
  timer=setTimeout(()=>interrupt('timeout'),8000);
  try {
    return await Promise.race([interrupted,Promise.resolve().then(()=>{
      if(controller.signal.aborted)throw new ProviderError('aborted');
      return work(controller.signal);
    })]);
  } catch(error) {
    if(error instanceof ProviderError)throw error;
    throw new ProviderError('unavailable');
  } finally {
    clearTimeout(timer);parent.removeEventListener('abort',onAbort);
  }
}

export function parseProviderJson(text:string):unknown {
  if(typeof text!=='string'||text.length>32000)throw new ProviderError('invalid-output');
  try{return JSON.parse(text);}catch{throw new ProviderError('invalid-output');}
}
