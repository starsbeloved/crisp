import type { BindingInput, Bounds } from '../../shared/contracts.ts';
import type { Calibration, Enrollment, FaceDetection, FrameIdentity, ObservedRegion } from './types.ts';

const validDescriptor = (d:readonly number[]) => d.length > 0 && d.every(Number.isFinite) && d.some(x=>x!==0);
export function validBounds(b:Bounds):boolean {
  return [b.x,b.y,b.width,b.height].every(Number.isFinite) && b.x>=0 && b.y>=0 && b.width>0 && b.height>0 && b.x+b.width<=1 && b.y+b.height<=1;
}
export function overlap(a:Bounds,b:Bounds):number {
  const intersection=Math.max(0,Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y));
  return intersection/(a.width*a.height+b.width*b.height-intersection);
}
export function calibrateSimilarity(modelId:string,genuine:readonly number[],unknown:readonly number[]):Calibration|null {
  if (!modelId || !genuine.length || !unknown.length || ![...genuine,...unknown].every(n=>Number.isFinite(n)&&n>=0&&n<=1)) return null;
  const low=Math.min(...genuine),high=Math.max(...unknown);
  return low-high+1e-12>=.1 ? {modelId,threshold:(low+high)/2,margin:.1} : null;
}
const copyEnrollment=(e:Enrollment):Enrollment=>({...e,samples:e.samples.map(d=>[...d])});
export function createFaceGallery() {
  const records=new Map<string,Enrollment>();
  let revision=0;
  return {
    get revision(){return revision;},
    enroll(enrollment:Enrollment) {
      if (!enrollment.visitId || !enrollment.modelId || !Number.isFinite(enrollment.capturedAtMs) || enrollment.samples.length<3 || !enrollment.samples.every(d=>validDescriptor(d)&&d.length===enrollment.samples[0].length)) throw new Error('Enrollment needs three valid same-model samples');
      records.set(enrollment.visitId,copyEnrollment(enrollment));revision++;
    },
    list(modelId:string) { return [...records.values()].filter(e=>e.modelId===modelId).map(copyEnrollment); },
    /** Memory/session retirement only; no files or persistent records are removed. */
    clear() { records.clear();revision++; },
  };
}
export type FaceGallery=ReturnType<typeof createFaceGallery>;
export function createEnrollmentSession(visitId:string,modelId:string,consistency?:{similarity:(a:readonly number[],b:readonly number[])=>number;threshold:number}) {
  let samples:number[][]=[],last:FrameIdentity|null=null;
  return {
    add(frame:FrameIdentity,faces:readonly FaceDetection[]) {
      if (last && last.runId!==frame.runId) {samples=[];last=null;}
      let reason:string|null=null;
      if (!Number.isFinite(frame.sourceAtMs) || !Number.isSafeInteger(frame.seq) || frame.seq<1) reason='Invalid capture timestamp';
      else if (last && (frame.seq<=last.seq || frame.sourceAtMs-last.sourceAtMs<150)) reason='Use a distinct later capture';
      else if (faces.length!==1) reason='Keep exactly one person in frame';
      else if (!faces[0].usable || !validBounds(faces[0].bounds) || !validDescriptor(faces[0].descriptor)) reason=faces[0].reason||'Face quality is insufficient';
      else if (samples.length && faces[0].descriptor.length!==samples[0].length) reason='Descriptor model changed';
      else if (samples.length && consistency) {
        try {
          const score=consistency.similarity(samples[0],faces[0].descriptor);
          if(!Number.isFinite(consistency.threshold)||consistency.threshold<0||consistency.threshold>1||!Number.isFinite(score)||score<consistency.threshold||score>1)reason='Face changed during the scan; keep the same person in frame';
        }catch{reason='Face comparison failed';}
      }
      if (reason) return {accepted:false,count:samples.length,reason};
      samples.push([...faces[0].descriptor]);last={...frame};
      return {accepted:true,count:samples.length,reason:null};
    },
    finish():Enrollment|null {return samples.length>=3 && last ? {visitId,modelId,samples:samples.map(d=>[...d]),capturedAtMs:last.sourceAtMs}:null;},
  };
}

type Track={binding:BindingInput;candidate:string|null;streak:number;descriptor:number[];lastAtMs:number};
let instance=0;
/** Thresholds are demo engineering gates, never probabilities or clinical identity assurance. */
export function createIdentityTracker(options:{gallery:FaceGallery;modelId:string;similarity:(a:readonly number[],b:readonly number[])=>number;calibration:Calibration|null;regions?:readonly ObservedRegion[]}) {
  const prefix=`vision_${++instance}`;
  let serial=0,tracks:Track[]=[],runId:string|null=null,lastSeq=-1,lastAtMs=-Infinity,galleryRevision=options.gallery.revision;
  const next=(kind:string)=>`${prefix}_${kind}_${++serial}`;
  function reset(){tracks=[];runId=null;lastSeq=-1;lastAtMs=-Infinity;}
  function safeSimilarity(a:readonly number[],b:readonly number[]) {
    if (!validDescriptor(a)||!validDescriptor(b)||a.length!==b.length) return -Infinity;
    try {const value=options.similarity(a,b);return Number.isFinite(value)&&value>=0&&value<=1?value:-Infinity;}catch{return -Infinity;}
  }
  return {
    reset,
    update(frame:FrameIdentity,faces:readonly FaceDetection[],nowMs:number):BindingInput[]|null {
      if (!Number.isFinite(nowMs)||!Number.isFinite(frame.sourceAtMs)||nowMs<frame.sourceAtMs||nowMs-frame.sourceAtMs>500) return null;
      if (runId!==frame.runId || galleryRevision!==options.gallery.revision) {reset();runId=frame.runId;galleryRevision=options.gallery.revision;}
      if (frame.seq<=lastSeq || frame.sourceAtMs<=lastAtMs) return null;
      if (frame.sourceAtMs-lastAtMs>500) tracks=[];
      lastSeq=frame.seq;lastAtMs=frame.sourceAtMs;
      const calibration=options.calibration;
      const calibrated=!!calibration && calibration.modelId===options.modelId && Number.isFinite(calibration.threshold)&&calibration.threshold>=0&&calibration.threshold<=1&&Number.isFinite(calibration.margin)&&calibration.margin>=.1;
      const enrolled=options.gallery.list(options.modelId);
      const candidates=faces.map(face=>{
        if (!face.usable||!validBounds(face.bounds)||!validDescriptor(face.descriptor)||!calibrated) return {candidate:null,state:'uncertain' as const};
        const scores=enrolled.map(e=>({visitId:e.visitId,score:Math.max(...e.samples.map(d=>safeSimilarity(face.descriptor,d)))})).sort((a,b)=>b.score-a.score);
        if (!scores.length || scores[0].score<calibration!.threshold) return {candidate:null,state:'unknown' as const};
        if (scores.length>1 && scores[0].score-scores[1].score+1e-12<calibration!.margin) return {candidate:null,state:'uncertain' as const};
        return {candidate:scores[0].visitId,state:'uncertain' as const};
      });
      // Competing detections for one visit, or overlapping faces, invalidate all involved.
      const blocked=new Set<number>();
      for(let i=0;i<faces.length;i++)for(let j=i+1;j<faces.length;j++) {
        if ((candidates[i].candidate && candidates[i].candidate===candidates[j].candidate) || overlap(faces[i].bounds,faces[j].bounds)>.15) {blocked.add(i);blocked.add(j);}
      }
      const used=new Set<Track>();
      const nextTracks:Track[]=[];
      faces.forEach((face,index)=>{
        if (!validBounds(face.bounds)) return;
        const proposal=candidates[index];
        const candidate=blocked.has(index)?null:proposal.candidate;
        // Geometry alone may retain an anonymous box, never an enrolled visit.
        const previous=tracks.filter(t=>!used.has(t)&&t.candidate===candidate&&overlap(t.binding.bounds,face.bounds)>=.1&&(candidate===null||safeSimilarity(t.descriptor,face.descriptor)>=calibration!.threshold)).sort((a,b)=>overlap(b.binding.bounds,face.bounds)-overlap(a.binding.bounds,face.bounds))[0];
        if(previous)used.add(previous);
        const streak=candidate?(previous?.streak||0)+1:0;
        const state=blocked.has(index)?'uncertain':candidate&&streak>=3?'matched':proposal.state;
        const visitId=state==='matched'?candidate:null;
        const continuous=previous && previous.binding.state===state && previous.binding.visitId===visitId;
        const regions=(options.regions||[]).filter(region=>validBounds(region.bounds)&&face.bounds.x+face.bounds.width/2>=region.bounds.x&&face.bounds.x+face.bounds.width/2<=region.bounds.x+region.bounds.width&&face.bounds.y+face.bounds.height/2>=region.bounds.y&&face.bounds.y+face.bounds.height/2<=region.bounds.y+region.bounds.height);
        const binding:BindingInput={trackId:previous?.binding.trackId||next('track'),visitId,identityEpoch:continuous?previous.binding.identityEpoch:next('epoch'),state,bounds:{...face.bounds},sourceSinceAtMs:continuous?previous.binding.sourceSinceAtMs:frame.sourceAtMs,sourceLastVerifiedAtMs:frame.sourceAtMs,observedLocation:regions.length===1?{label:regions[0].label,sourceObservedAtMs:frame.sourceAtMs}:null};
        nextTracks.push({binding,candidate,streak,descriptor:[...face.descriptor],lastAtMs:frame.sourceAtMs});
      });
      tracks=nextTracks;
      return tracks.map(t=>({...t.binding,bounds:{...t.binding.bounds},observedLocation:t.binding.observedLocation?{...t.binding.observedLocation}:null}));
    },
  };
}
