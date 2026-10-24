import { useVisionResources } from './resources.tsx';
import { FaceCalibration } from './FaceCalibration.tsx';
export function IdentitySetup(){
  const resources=useVisionResources(),session=resources.session;
  if(!session)return null;
  return <section className="vision-model-setup" aria-label="Local face model setup"><h2>Face identity setup</h2>
    <p>{session.status==='ready'?'Local face models loaded.':session.status==='loading'?'Loading and checking local face models…':'Load the local face models before scanning. This does not start the camera.'}</p>
    {session.error&&<p role="alert">{session.error}</p>}
    <button type="button" className="vision-setup-button" disabled={session.status==='loading'||session.status==='ready'} onClick={()=>void session.connect()}>{session.status==='loading'?'Loading models…':'Load face models'}</button>
    <p>{resources.calibration?'Session calibration ready. Recognition still needs held-out device checks.':'Calibration is needed. Capture a consenting reference person, that same person again, then a different consenting person.'}</p>
    {session.mode==='station'&&session.status==='ready'&&<FaceCalibration/>}
    {session.mode==='kiosk'&&<p><a href="/vision" target="_blank" rel="noopener noreferrer">Open room vision setup in another tab</a>. Connect there, load models and calibrate before enrolling. Keep that tab open to retain the in-memory face session; camera capture stops while hidden.</p>}
    <p className="vision-secondary">Face data stays in the same-origin session worker's memory. Closing all station tabs ends this session; a new session requires calibration and enrollment again.</p>
  </section>;
}
