import type { FramePacket } from '../../shared/contracts.ts';
import type { PoseLandmark } from '../sensing/pose.ts';
export type SensorWorkerRequest={kind:'sensor-init';id:number}|{kind:'sensor-pose';id:number;frame:FramePacket};
export type SensorWorkerResponse={kind:'sensor-ready';id:number}|{kind:'sensor-error';id:number;reason:string}|{kind:'sensor-pose-result';id:number;runId:string;frameSeq:number;sourceAtMs:number;landmarks:PoseLandmark[][]};
