import type { Bounds } from '../../shared/contracts.ts';
import { validBounds } from './identity.ts';

/** object-fit:contain; both video and overlays use unmirrored frame coordinates. */
export function overlayBounds(bounds:Bounds,source:{width:number;height:number},container:{width:number;height:number},mirrored=false):Bounds|null {
  if (!validBounds(bounds)||![source.width,source.height,container.width,container.height].every(n=>Number.isFinite(n)&&n>0)) return null;
  const scale=Math.min(container.width/source.width,container.height/source.height);
  const width=source.width*scale,height=source.height*scale;
  return {x:(container.width-width)/2+(mirrored?1-bounds.x-bounds.width:bounds.x)*width,y:(container.height-height)/2+bounds.y*height,width:bounds.width*width,height:bounds.height*height};
}
