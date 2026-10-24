import { createSensorWorkerHandler } from './sensor-worker.ts';
import { loadLocalPoseModel } from '../sensing/pose-model.ts';
import type { SensorWorkerRequest } from './sensor-protocol.ts';
// Independent local worker: expensive pose inference cannot serialize 30Hz color sampling.
const handle=createSensorWorkerHandler({load:loadLocalPoseModel,post:message=>self.postMessage(message)});
self.addEventListener('message',(event:MessageEvent<SensorWorkerRequest>)=>{void handle(event.data);});
