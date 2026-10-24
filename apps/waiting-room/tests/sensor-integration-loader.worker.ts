import { loadLocalPoseModel } from '../client/sensing/pose-model.ts';
// Developer-only smoke test. No camera acquisition, credentials or patient input.
try {
  const model=await loadLocalPoseModel();
  const canvas=new OffscreenCanvas(160,160),context=canvas.getContext('2d')!;context.fillStyle='#808080';context.fillRect(0,0,160,160);
  const image=canvas.transferToImageBitmap();
  const landmarks=model.detect(image,1000);image.close();model.close();
  self.postMessage({kind:'probe-result',status:'PASS',poseCount:landmarks.length});
}catch(error){self.postMessage({kind:'probe-result',status:'FAIL',reason:error instanceof Error?error.message:String(error)});}
