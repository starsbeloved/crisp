import type { FaceDetection } from './types.ts';
import { validBounds } from './identity.ts';
export async function readVerifiedAsset(asset:{path:string;sha256:string;bytes:number},fetcher:typeof fetch=fetch):Promise<ArrayBuffer>{
  if(!asset.path.startsWith('/models/'))throw Error('Local model path required');
  const response=await fetcher(asset.path,{cache:'no-store',credentials:'same-origin'});
  if(!response.ok)throw Error(`Local face model load failed (${response.status})`);
  const bytes=await response.arrayBuffer();
  const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
  if(bytes.byteLength!==asset.bytes||digest!==asset.sha256)throw Error('Face model integrity mismatch');
  return bytes;
}
/** Fixed descriptor metric only; recognition threshold is learned from this session's real captures. */
export function descriptorSimilarity(a:readonly number[],b:readonly number[]):number{
  if(a.length!==128||b.length!==128||!a.every(Number.isFinite)||!b.every(Number.isFinite))return -Infinity;
  return Math.max(0,1-Math.sqrt(a.reduce((sum,value,i)=>sum+(value-b[i])**2,0)));
}
export type FaceModelResult={score:number;box:{x:number;y:number;width:number;height:number};descriptor:readonly number[];landmarks:readonly {x:number;y:number}[]};
export type FacePixels={mean:number;contrast:number;clipped:number};
export function mapFaceResult(raw:FaceModelResult,width:number,height:number,pixels:FacePixels):FaceDetection{
  const x=Math.max(0,raw.box.x/width),y=Math.max(0,raw.box.y/height);
  const bounds={x,y,width:Math.min(1-x,raw.box.width/width),height:Math.min(1-y,raw.box.height/height)};
  const descriptor=[...raw.descriptor];
  const reason=!validBounds(bounds)?'Face outside usable frame':raw.score<.7?'Face detection confidence is low':raw.box.width<70||raw.box.height<70?'Move closer to the camera':descriptor.length!==128||!descriptor.every(Number.isFinite)||!descriptor.some(n=>n!==0)?'Face descriptor unavailable':pixels.mean<35||pixels.mean>225||pixels.contrast<8||pixels.clipped>.1?'Improve face lighting and keep still':raw.landmarks.length!==68?'Face landmarks unavailable':null;
  // Conservative inner cheek patches derived from eye/nose/mouth landmarks; never the entire face box.
  const skin:FaceDetection['faceSkin']=[];
  if(!reason){
    const lm=raw.landmarks,eyeY=(lm[36].y+lm[45].y)/2,noseY=lm[33].y,mouthY=(lm[48].y+lm[54].y)/2;
    const top=Math.max(eyeY+(noseY-eyeY)*.45,raw.box.y),bottom=Math.min(mouthY,raw.box.y+raw.box.height);
    for(const [left,right] of [[lm[36].x,lm[31].x],[lm[35].x,lm[45].x]]){
      const patch={x:(left+(right-left)*.2)/width,y:top/height,width:(right-left)*.6/width,height:(bottom-top)*.65/height};
      if(validBounds(patch)&&patch.width*width>=5&&patch.height*height>=5)skin.push(patch);
    }
  }
  return {bounds,descriptor,usable:reason===null,reason,faceSkin:skin};
}
