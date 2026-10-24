import {expect,it} from 'vitest';
import {providerConfiguration,patientOriginForClient} from '../environment.ts';
it('keeps provider calls opt-in and validates each authorized configuration independently',()=>{
  expect(providerConfiguration({GEMINI_API_KEY:'test-only',GEMINI_MODEL:'test-model'})).toEqual({gemini:false,speech:false});
  expect(()=>providerConfiguration({WR_ENABLE_GEMINI:'true'})).toThrow(/Gemini configuration/i);
  expect(()=>providerConfiguration({WR_ENABLE_ELEVENLABS:'true'})).toThrow(/ElevenLabs configuration/i);
  expect(providerConfiguration({WR_ENABLE_GEMINI:'true',GEMINI_API_KEY:'test-only',GEMINI_MODEL:'test-model'})).toEqual({gemini:true,speech:false});
  expect(providerConfiguration({WR_ENABLE_ELEVENLABS:'true',ELEVENLABS_API_KEY:'test-only',ELEVENLABS_VOICE_ID:'test-voice',ELEVENLABS_MODEL_ID:'test-model'})).toEqual({gemini:false,speech:true});
  expect(()=>providerConfiguration({WR_ENABLE_GEMINI:'yes'})).toThrow(/true or false/);
});
it('uses one exact trusted phone origin for QR configuration and rejects mismatched client overrides',()=>{
  expect(patientOriginForClient({})).toBe('');
  expect(patientOriginForClient({WR_PHONE_ORIGIN:'https://phone.waiting.test:8443'})).toBe('https://phone.waiting.test:8443');
  expect(()=>patientOriginForClient({WR_PHONE_ORIGIN:'https://phone.waiting.test:8443',VITE_PATIENT_ORIGIN:'https://other.test:8443'})).toThrow(/same/);
});
it('rejects a phone origin that points back at the phone itself',()=>{
  for(const host of ['localhost','demo.localhost','127.0.0.1','127.1','[::1]','0.0.0.0'])expect(()=>patientOriginForClient({WR_PHONE_ORIGIN:`https://${host}:8443`})).toThrow(/phone-accessible/i);
  expect(patientOriginForClient({WR_PHONE_ORIGIN:'https://192.168.1.10:8443'})).toBe('https://192.168.1.10:8443');
});
