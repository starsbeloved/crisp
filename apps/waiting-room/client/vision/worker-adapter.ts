import type { FaceAdapter, FaceDetection } from './types.ts';
import { FACE_MODEL_ID } from './model-assets.ts';
import { descriptorSimilarity } from './face-model.ts';
export function createFaceWorkerAdapter(worker:Worker,options:{clone?:(image:ImageBitmap)=>Promise<ImageBitmap>;timeoutMs?:number}={}){
  let serial=0,disposed=false,busy=false;
  const pending=new Map<number,{resolve:(value:any)=>void;reject:(error:Error)=>void;timer:ReturnType<typeof setTimeout>}>();
  const fail=(reason:string)=>{for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error(reason));}pending.clear();};
  const message=(event:MessageEvent)=>{const data=event.data,p=pending.get(data?.id);if(!p)return;clearTimeout(p.timer);pending.delete(data.id);data.ok?p.resolve(data):p.reject(Error(typeof data.error==='string'?data.error:'Face worker failed'));};
  const error=(event:ErrorEvent)=>{fail(event.message?`Face worker failed: ${event.message}`:'Face worker failed');};worker.addEventListener('message',message);worker.addEventListener('error',error);
  function request(data:object,transfer:Transferable[]=[]):Promise<any>{
    if(disposed)return Promise.reject(Error('Face adapter disposed'));
    return new Promise((resolve,reject)=>{const id=++serial;const timer=setTimeout(()=>{pending.delete(id);reject(Error('Face worker timed out'));},options.timeoutMs??20000);pending.set(id,{resolve,reject,timer});try{worker.postMessage({...data,id},transfer);}catch{clearTimeout(timer);pending.delete(id);reject(Error('Face worker transfer failed'));}});
  }
  const adapter:FaceAdapter&{ready:()=>Promise<void>;dispose:()=>void}={
    modelId:FACE_MODEL_ID,similarity:descriptorSimilarity,
    async ready(){const result=await request({kind:'load'});if(result.modelId!==FACE_MODEL_ID)throw Error('Face worker model mismatch');},
    async detect(image,metadata):Promise<FaceDetection[]>{
      if(disposed)throw Error('Face adapter disposed');if(busy)throw Error('Face worker busy');busy=true;
      let clone:ImageBitmap|null=null,transferred=false;
      try{clone=await (options.clone||createImageBitmap)(image);if(disposed)throw Error('Face adapter disposed');const promise=request({kind:'detect',image:clone,metadata},[clone]);transferred=true;const result=await promise;if(!Array.isArray(result.faces))throw Error('Invalid face worker result');return result.faces;}
      finally{if(clone&&!transferred)clone.close();busy=false;}
    },
    dispose(){if(disposed)return;disposed=true;fail('Face adapter disposed');worker.removeEventListener('message',message);worker.removeEventListener('error',error);worker.terminate();},
  };
  return adapter;
}
export function makeFaceWorkerAdapter(){return createFaceWorkerAdapter(new Worker(new URL('./face.worker.ts',import.meta.url),{type:'module',name:'local-face-recognition'}));}
