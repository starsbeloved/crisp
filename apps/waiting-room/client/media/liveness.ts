/** Presentation counters, never currentTime, drive receiver liveness. */
export function createFrameLiveness(){
  let count=0,lastAt:number|null=null;
  return {
    reset(){count=0;lastAt=null;},
    frame(presentedFrames:number,at:number){
      if(!Number.isFinite(presentedFrames)||presentedFrames<=count||!Number.isFinite(at)||at<0||lastAt!==null&&at<lastAt)return false;
      count=presentedFrames;lastAt=at;return true;
    },
    read(at:number):{phase:'waiting'|'live'|'stale';ageMs:number|null}{
      if(lastAt===null)return {phase:'waiting',ageMs:null};
      const ageMs=at-lastAt;return {phase:Number.isFinite(ageMs)&&ageMs>=0&&ageMs<=1000?'live':'stale',ageMs};
    },
  };
}
