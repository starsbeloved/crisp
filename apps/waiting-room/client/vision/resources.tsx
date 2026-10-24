import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import { createFaceGallery } from './identity.ts';
import type { FaceGallery } from './identity.ts';
import type { CalibrationCaptures, SessionMode } from './session-store.ts';
import type { Calibration, Enrollment, FaceAdapter, ObservedRegion } from './types.ts';

export type VisionResources={adapter:FaceAdapter|null;gallery:FaceGallery;calibration:Calibration|null;regions?:readonly ObservedRegion[];saveEnrollment?:(enrollment:Enrollment)=>Promise<void>;session?:{mode:SessionMode|null;status:'idle'|'loading'|'ready'|'error';error:string|null;connect:()=>Promise<void>;refresh:()=>Promise<void>;saveCalibration:(captures:CalibrationCaptures)=>Promise<void>}};
const unavailable:VisionResources={adapter:null,gallery:createFaceGallery(),calibration:null};
const Resources=createContext<VisionResources>(unavailable);
export function VisionProvider({resources,children}:{resources:VisionResources;children:ReactNode}) {
  return <Resources.Provider value={resources}>{children}</Resources.Provider>;
}
export const useVisionResources=()=>useContext(Resources);
