import type { PulseEstimate, ScalarSample, TimedRGB } from '../../shared/contracts.ts';

// Prototype engineering gates, not a validated clinical signal-quality score.
const CHANNELS = ['r', 'g', 'b'] as const;
const RATE = 30;
const EPS = 1e-16;
type Spectrum = { re:number; im:number; power:number; hz:number };
type Analysis = { estimate:PulseEstimate; signal:number[]; start:number };
const unavailable = (reason:string, metrics:Record<string,number> = {}): Analysis => ({
  estimate:{quality:'low-quality',bpm:null,reason,metrics},signal:[],start:0,
});
function detrend(values:number[]):number[] {
  const n=values.length, mean=values.reduce((a,b)=>a+b,0)/n, mid=(n-1)/2;
  let numerator=0, denominator=0;
  for(let i=0;i<n;i++){numerator+=(i-mid)*(values[i]-mean);denominator+=(i-mid)**2;}
  const slope=numerator/denominator;
  return values.map((v,i)=>v-mean-slope*(i-mid));
}
function analyze(samples:TimedRGB[]):Analysis {
  if(samples.length<2) return unavailable('Collect 30 seconds of contiguous usable signal');
  if(samples.some(s=>!Number.isFinite(s.tMs)||CHANNELS.some(c=>!Number.isFinite(s[c])||s[c]<0||s[c]>1||!Number.isFinite(s.saturationFraction[c])||s.saturationFraction[c]<0||s.saturationFraction[c]>1))) return unavailable('Invalid optical samples');
  let maxGapMs=0;
  for(let i=1;i<samples.length;i++){
    const gap=samples[i].tMs-samples[i-1].tMs;
    if(gap<=0) return unavailable('Sample timestamps must increase');
    maxGapMs=Math.max(maxGapMs,gap);
  }
  const durationMs=samples.at(-1)!.tMs-samples[0].tMs;
  const cadenceHz=(samples.length-1)*1000/durationMs;
  const metrics:Record<string,number>={durationMs,sampleCount:samples.length,cadenceHz,maxGapMs};
  if(durationMs<30000) return unavailable('Collect 30 seconds of contiguous usable signal',metrics);
  if(durationMs>60000) return unavailable('Capture exceeds maximum attempt duration',metrics);
  if(maxGapMs>200) return unavailable('Signal interrupted by a gap over 200 ms',metrics);
  if(cadenceHz<15) return unavailable('Optical sampling below 15 Hz',metrics);
  const n=Math.floor(durationMs*RATE/1000), start=samples[0].tMs;
  const T=n/RATE, binHz=1/T;
  let best:Analysis|null=null;
  let failure='No usable unsaturated periodic channel';
  for(let channel=0;channel<3;channel++){
    const c=CHANNELS[channel];
    const saturation=Math.max(...samples.map(s=>s.saturationFraction[c]));
    metrics[`saturation_${c}`]=saturation;
    if(saturation>=0.05) continue;
    const resampled:number[]=[];
    let j=0;
    for(let i=0;i<n;i++){
      const t=start+i*1000/RATE;
      while(j+1<samples.length-1&&samples[j+1].tMs<t) j++;
      const a=samples[j], b=samples[j+1];
      resampled.push(a[c]+(b[c]-a[c])*(t-a.tMs)/(b.tMs-a.tMs));
    }
    const signal=detrend(resampled);
    const variance=signal.reduce((sum,v)=>sum+v*v,0)/n;
    if(variance<EPS){failure='Optical signal is flat';continue;}
    const windowed=signal.map((v,i)=>v*0.5*(1-Math.cos(2*Math.PI*i/(n-1))));
    const spectrum:Spectrum[]=[];
    // Inspect beyond the supported pulse band, so an out-of-band dominant
    // oscillation cannot be re-labelled as an in-band side lobe.
    for(let k=0;k<=Math.floor(5*T);k++){
      let re=0,im=0;
      for(let i=0;i<n;i++){const a=2*Math.PI*k*i/n;re+=windowed[i]*Math.cos(a);im-=windowed[i]*Math.sin(a);}
      spectrum.push({re,im,power:re*re+im*im,hz:k*binHz});
    }
    const band=spectrum.map((s,k)=>({s,k})).filter(({s})=>s.hz>=0.7&&s.hz<=3);
    const peak=band.reduce((a,b)=>a.s.power>b.s.power?a:b);
    const dominant=spectrum.slice(Math.ceil(0.2*T)).reduce((a,b)=>a.power>b.power?a:b);
    if((dominant.hz<0.7-binHz/2||dominant.hz>3+binHz/2)&&dominant.power>peak.s.power){failure='Dominant pulse frequency is outside supported 42–180 BPM';continue;}
    const peakBins=band.filter(({s})=>Math.abs(s.hz-peak.s.hz)<=binHz+1e-8);
    const noiseBins=band.filter(({s})=>Math.abs(s.hz-peak.s.hz)>binHz+1e-8);
    const noise=noiseBins.reduce((sum,{s})=>sum+s.power,0)/noiseBins.length*peakBins.length;
    if(noise<EPS){failure='Residual spectral noise is numerically zero';continue;}
    const peakToNoise=peakBins.reduce((sum,{s})=>sum+s.power,0)/noise;
    if(peakToNoise<3){failure='Insufficient pulse periodicity';continue;}
    const k=peak.k, left=spectrum[k-1],right=spectrum[k+1];
    let shift=0;
    if(left&&right&&left.power>EPS&&right.power>EPS){
      const a=Math.log(left.power),b=Math.log(peak.s.power),d=Math.log(right.power),den=a-2*b+d;
      if(Math.abs(den)>EPS) shift=Math.max(-0.5,Math.min(0.5,0.5*(a-d)/den));
    }
    const bpm=(k+shift)*binHz*60;
    if(bpm<42||bpm>180){failure='Pulse frequency is unsupported';continue;}
    // Reconstruct the band-limited unwindowed trace for independent beat intervals.
    const coefficients=band.map(({k})=>{
      let re=0,im=0;
      for(let i=0;i<n;i++){const a=2*Math.PI*k*i/n;re+=signal[i]*Math.cos(a);im-=signal[i]*Math.sin(a);}
      return {k,re,im};
    });
    const filtered=signal.map((_,i)=>coefficients.reduce((sum,{k,re,im})=>sum+2/n*(re*Math.cos(2*Math.PI*k*i/n)-im*Math.sin(2*Math.PI*k*i/n)),0));
    const rms=Math.sqrt(filtered.reduce((sum,v)=>sum+v*v,0)/n);
    const peaks:number[]=[];
    // Ignore one second at each band-pass boundary; retain only distinct positive peaks.
    for(let i=RATE;i<n-RATE;i++){
      if(filtered[i]>rms*0.25&&filtered[i]>=filtered[i-1]&&filtered[i]>filtered[i+1]){
        const previous=peaks.at(-1);
        if(previous===undefined||i-previous>=RATE*0.28) peaks.push(i);
        else if(filtered[i]>filtered[previous]) peaks[peaks.length-1]=i;
      }
    }
    const intervals=peaks.slice(1).map((p,i)=>(p-peaks[i])/RATE);
    if(intervals.length<10){failure='Not enough consistent pulse beats';continue;}
    const ordered=[...intervals].sort((a,b)=>a-b),median=ordered[Math.floor(ordered.length/2)];
    const beatAgreement=intervals.filter(v=>Math.abs(v-median)<=median*0.2).length/intervals.length;
    const beatBpm=60/median;
    const channelMetrics={...metrics,channel,variance,peakToNoise,beatAgreement,beatBpm,beatCount:peaks.length,binHz};
    if(beatAgreement<0.8||Math.abs(beatBpm-bpm)>bpm*0.2){failure='Pulse beats do not agree with spectral estimate';continue;}
    if(!best||peakToNoise>best.estimate.metrics.peakToNoise) best={estimate:{quality:'usable',bpm,reason:null,metrics:channelMetrics},signal:filtered,start};
  }
  if(best){best.estimate.metrics={...metrics,...best.estimate.metrics};return best;}
  return unavailable(failure,metrics);
}
export function estimateContactPulse(samples:TimedRGB[]):PulseEstimate { return analyze(samples).estimate; }
/** Local display only. Bounded derived values, never a synthetic replacement. */
export function contactWaveform(samples:TimedRGB[]):ScalarSample[] {
  const result=analyze(samples);
  if(!result.signal.length) return [];
  const stride=Math.ceil(result.signal.length/300);
  return result.signal.flatMap((value,i)=>i%stride===0?[{tMs:result.start+i*1000/RATE,value}]:[]);
}
