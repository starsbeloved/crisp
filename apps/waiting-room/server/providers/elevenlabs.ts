import { z } from 'zod';
import { idSchema } from '../../shared/schemas.ts';
import { ProviderError, withProviderDeadline } from './common.ts';

export type NotificationInput={eventId:string;snapshotVersion:number;text:string};
const inputSchema=z.strictObject({eventId:idSchema,snapshotVersion:z.number().int().positive(),text:z.string().trim().min(1).max(300)});
const maxAudioBytes=2_000_000;
export function createNotificationSynthesizer(config:{apiKey:string;voiceId:string;modelId:string;fetch?:typeof fetch}) {
  if(!config.apiKey.trim()||!/^[A-Za-z0-9_-]{1,96}$/.test(config.voiceId)||!config.modelId.trim())throw new ProviderError('unavailable');
  const fetcher=config.fetch??fetch;
  return async function synthesizeNotification(input:NotificationInput,signal:AbortSignal):Promise<Uint8Array> {
    const parsed=inputSchema.safeParse(input);if(!parsed.success)throw new ProviderError('invalid-input');
    return withProviderDeadline(signal,async child=>{
      const response=await fetcher(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(config.voiceId)}?output_format=mp3_44100_128`,{
        method:'POST',headers:{'xi-api-key':config.apiKey,'Content-Type':'application/json',Accept:'audio/mpeg'},
        body:JSON.stringify({text:parsed.data.text,model_id:config.modelId}),signal:child,redirect:'error',
      });
      if(!response.ok||!response.headers.get('content-type')?.toLowerCase().startsWith('audio/mpeg')||!response.body) {
        await response.body?.cancel();throw new ProviderError('unavailable');
      }
      const length=response.headers.get('content-length');
      if(length&&(!Number.isFinite(Number(length))||Number(length)>maxAudioBytes)){
        await response.body.cancel();throw new ProviderError('unavailable');
      }
      const reader=response.body.getReader();let total=0;const chunks:Uint8Array[]=[];
      const cancel=()=>{void reader.cancel().catch(()=>{});};child.addEventListener('abort',cancel,{once:true});
      try {
        while(true){
          const part=await reader.read();if(child.aborted)throw new ProviderError('aborted');if(part.done)break;
          total+=part.value.byteLength;if(total>maxAudioBytes)throw new ProviderError('unavailable');chunks.push(part.value);
        }
        if(!total)throw new ProviderError('unavailable');
        const bytes=new Uint8Array(total);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
        return bytes;
      } finally {
        child.removeEventListener('abort',cancel);await reader.cancel().catch(()=>{});reader.releaseLock();
      }
    });
  };
}
export async function synthesizeNotification(input:NotificationInput,signal:AbortSignal):Promise<Uint8Array> {
  if(typeof window!=='undefined')throw new ProviderError('unavailable');
  return createNotificationSynthesizer({apiKey:process.env.ELEVENLABS_API_KEY??'',voiceId:process.env.ELEVENLABS_VOICE_ID??'',modelId:process.env.ELEVENLABS_MODEL_ID??''})(input,signal);
}
