import { GoogleGenAI } from '@google/genai';
import type { GenerateContentParameters } from '@google/genai';
import { ProviderError } from './common.ts';

export type StructuredRequest={system:string;data:unknown;schema:unknown;signal:AbortSignal};
export type GeminiTransport=(request:StructuredRequest)=>Promise<string>;
type GeminiClient={models:{generateContent:(request:GenerateContentParameters)=>Promise<{text?:string}>}};

// No key/model resolution or network activity at import time. Inject a client for tests.
export function createGeminiTransport(config:{model:string;apiKey?:string;client?:GeminiClient}):GeminiTransport {
  if(!config.model.trim()||(!config.client&&!config.apiKey?.trim()))throw new ProviderError('unavailable');
  const client=config.client??new GoogleGenAI({apiKey:config.apiKey,vertexai:false,httpOptions:{timeout:8000,retryOptions:{attempts:1}}});
  return async request=>{
    const response=await client.models.generateContent({model:config.model,contents:JSON.stringify(request.data),config:{
      systemInstruction:request.system,responseMimeType:'application/json',responseJsonSchema:request.schema,
      abortSignal:request.signal,maxOutputTokens:4096,automaticContinuation:false,httpOptions:{timeout:8000,retryOptions:{attempts:1}},
    }});
    if(!response.text)throw new ProviderError('invalid-output');
    return response.text;
  };
}

export const serverGeminiTransport:GeminiTransport=async request=>{
  if(typeof window!=='undefined')throw new ProviderError('unavailable');
  // Read only when an authorized route invokes the adapter; never log configuration.
  return createGeminiTransport({model:process.env.GEMINI_MODEL??'',apiKey:process.env.GEMINI_API_KEY})(request);
};
