import { createWaitingRoomServer } from './http.ts';
import { phoneOrigin,providerConfiguration } from '../environment.ts';
import {explainWithStatus} from './providers/gemini.ts';
import {summarizeQuestionnaire} from './providers/questionnaire.ts';
import {synthesizeNotification} from './providers/elevenlabs.ts';
import {buildFactualFallback} from './providers/grounding.ts';
import {ProviderError} from './providers/common.ts';
const origin = phoneOrigin(process.env);
const enabled=providerConfiguration(process.env);
const app = createWaitingRoomServer({ databasePath: '.local/data/waiting-room.sqlite', phoneOrigins: origin ? [origin] : [],
  ...(enabled.gemini?{summarize:summarizeQuestionnaire}:{}),
  ...(enabled.gemini||enabled.speech?{providers:{
    explain:enabled.gemini?explainWithStatus:async snapshot=>({state:'fallback' as const,value:buildFactualFallback(snapshot,'unavailable')}),
    synthesize:enabled.speech?synthesizeNotification:async()=>{throw new ProviderError('unavailable');},
  }}:{}),
});
app.server.listen(8787, '127.0.0.1', () => console.log('Waiting Room API: http://127.0.0.1:8787 (loopback only; local SQLite persistence)'));
app.server.on('error', e => { console.error(e.message); process.exitCode = 1; });
for (const signal of ['SIGINT','SIGTERM'] as const) process.once(signal, () => { void app.close().then(() => process.exit(0)); });
