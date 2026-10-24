import type * as FaceApi from '@vladmandic/face-api/dist/face-api.esm.js';
let faceapi:typeof FaceApi;
import { FACE_ASSETS, FACE_MODEL_ID } from './model-assets.ts';
import { mapFaceResult, readVerifiedAsset } from './face-model.ts';
let tf:typeof FaceApi.tf & {env:()=>{set:(key:string,value:unknown)=>void};setBackend:(name:string)=>Promise<boolean>;ready:()=>Promise<void>;dispose:(value:unknown)=>void;getBackend:()=>string};
let loading:Promise<void>|null=null,busy=false;
async function load(){
  if(loading)return loading;
  loading=(async()=>{
    globalThis.postMessage({stage:'Importing local runtime'});faceapi=await import('@vladmandic/face-api/dist/face-api.esm.js');tf=faceapi.tf as typeof tf;
    // Tensor input bypasses DOM APIs; OffscreenCanvas is used only to read actual pixels.
    if(typeof OffscreenCanvas==='undefined')throw Error('OffscreenCanvas is required for local face processing');
    const blank=class {};
    faceapi.env.setEnv({Canvas:OffscreenCanvas,CanvasRenderingContext2D:blank,Image:blank,ImageData,Video:blank,createCanvasElement:()=>new OffscreenCanvas(1,1),createImageElement:()=>{throw Error('Images must be transferred bitmaps');},createVideoElement:()=>{throw Error('Worker cannot open cameras');},fetch:globalThis.fetch.bind(globalThis),readFile:()=>{throw Error('Filesystem unavailable');}} as unknown as Parameters<typeof faceapi.env.setEnv>[0]);
    // WebGL is attempted only inside this worker; CPU is an explicit backend fallback, never fake inference.
    globalThis.postMessage({stage:'Initializing TensorFlow backend'});
    try{tf.env().set('IS_BROWSER',true);await tf.setBackend('webgl');await tf.ready();}catch{await tf.setBackend('cpu');await tf.ready();}
    globalThis.postMessage({stage:`Backend ${tf.getBackend()} ready; checking assets`});
    const nets=[faceapi.nets.tinyFaceDetector,faceapi.nets.faceLandmark68TinyNet,faceapi.nets.faceRecognitionNet];
    for(let index=0;index<nets.length;index++){
      globalThis.postMessage({stage:`Checking model ${index+1}/3`});
      const manifestBytes=await readVerifiedAsset(FACE_ASSETS[index*2]);const weights=await readVerifiedAsset(FACE_ASSETS[index*2+1]);
      const manifest=JSON.parse(new TextDecoder().decode(manifestBytes));
      const decoded=tf.io.decodeWeights(weights,manifest.flatMap((group:{weights:unknown[]})=>group.weights));
      // loadFromWeightMap retains these tensors as network parameters. The worker owns
      // them until termination; disposing the map here would invalidate inference.
      nets[index].loadFromWeightMap(decoded);
    }
    // Warm actual kernels off-thread so the first enrollment frame is not used to load models.
    globalThis.postMessage({stage:'Warming detector kernels'});
    const tensor=tf.zeros([240,320,3]) as FaceApi.tf.Tensor3D;
    try{
      await faceapi.detectAllFaces(tensor,new faceapi.TinyFaceDetectorOptions({inputSize:320,scoreThreshold:.35}));
      globalThis.postMessage({stage:'Warming landmark and descriptor kernels'});
      await faceapi.nets.faceLandmark68TinyNet.detectLandmarks(tensor);
      const descriptor=await faceapi.nets.faceRecognitionNet.computeFaceDescriptor(tensor);
      if(!(descriptor instanceof Float32Array)||descriptor.length!==128||!Array.from(descriptor).every(Number.isFinite))throw Error('Face descriptor kernel verification failed');
    }finally{tensor.dispose();}

  })().catch(error=>{loading=null;throw error;});return loading;
}
async function detect(image:ImageBitmap){
  const canvas=new OffscreenCanvas(image.width,image.height),ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)throw Error('Worker pixel access unavailable');
  ctx.drawImage(image,0,0);const data=ctx.getImageData(0,0,image.width,image.height);const tensor=tf.browser.fromPixels(data);
  try{
    const results=await faceapi.detectAllFaces(tensor,new faceapi.TinyFaceDetectorOptions({inputSize:320,scoreThreshold:.35})).withFaceLandmarks(true).withFaceDescriptors();
    return results.map(result=>{
      const box=result.detection.box;let n=0,sum=0,square=0,clipped=0;
      for(let y=Math.max(0,Math.floor(box.y));y<Math.min(image.height,box.y+box.height);y+=3)for(let x=Math.max(0,Math.floor(box.x));x<Math.min(image.width,box.x+box.width);x+=3){const i=(y*image.width+x)*4,value=(data.data[i]+data.data[i+1]+data.data[i+2])/3;n++;sum+=value;square+=value*value;if(value<10||value>245)clipped++;}
      const mean=sum/Math.max(1,n);
      return mapFaceResult({box,score:result.detection.score,descriptor:Array.from(result.descriptor),landmarks:result.landmarks.positions},image.width,image.height,{mean,contrast:Math.sqrt(Math.max(0,square/Math.max(1,n)-mean*mean)),clipped:clipped/Math.max(1,n)});
    });
  }finally{tensor.dispose();canvas.width=0;canvas.height=0;}
}
globalThis.addEventListener('message',async(event:MessageEvent)=>{
  const {id,kind,image}=event.data||{};
  if(busy){image?.close();globalThis.postMessage({id,ok:false,error:'Face worker busy'});return;}
  busy=true;
  try{await load();if(kind==='load')globalThis.postMessage({id,ok:true,modelId:FACE_MODEL_ID,backend:tf.getBackend()});else if(kind==='detect'){if(!(image instanceof ImageBitmap))throw Error('Transferred image required');globalThis.postMessage({id,ok:true,faces:await detect(image)});}else throw Error('Unknown face request');}
  catch(error){globalThis.postMessage({id,ok:false,error:error instanceof Error?error.message:'Face worker failed'});}
  finally{image?.close();busy=false;}
});
