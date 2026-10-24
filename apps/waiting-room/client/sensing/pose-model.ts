import type { PoseLandmark } from './pose.ts';
export type LocalPoseModel={detect:(image:ImageBitmap,monotonicMs:number)=>PoseLandmark[][];close:()=>void};
/** This loader is called in the dedicated inference worker. No camera/network CDN. */
export async function loadLocalPoseModel():Promise<LocalPoseModel>{
 const {FilesetResolver,PoseLandmarker}=await import('@mediapipe/tasks-vision');
 const files=await FilesetResolver.forVisionTasks('/models/mediapipe-1.1.1/wasm',true);
 // MediaPipe exposes this module-worker import hook. Keep the static public
 // loader out of Vite's source transform (?import), which rejects public assets.
 const scope=globalThis as typeof globalThis&{import?: (url:string)=>Promise<unknown>};
 const previousImport=scope.import;
 scope.import=(url:string)=>import(/* @vite-ignore */ new URL(url,location.origin).href);
 let model:Awaited<ReturnType<typeof PoseLandmarker.createFromOptions>>;
 try{model=await PoseLandmarker.createFromOptions(files,{baseOptions:{modelAssetPath:'/models/pose/pose_landmarker_lite.task',delegate:'CPU'},runningMode:'VIDEO',numPoses:2,minPoseDetectionConfidence:0.7,minPosePresenceConfidence:0.7,minTrackingConfidence:0.7,outputSegmentationMasks:false});}
 finally{if(previousImport)scope.import=previousImport;else delete scope.import;}
 return {detect:(image,timestamp)=>model.detectForVideo(image,timestamp).landmarks,close:()=>model.close()};
}
