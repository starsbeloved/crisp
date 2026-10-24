// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {act,cleanup,render} from '@testing-library/react';
import {StationVisionProvider} from '../client/vision/StationVisionProvider.tsx';
import {useVisionResources} from '../client/vision/resources.tsx';
import type {VisionResources} from '../client/vision/resources.tsx';
const session=vi.hoisted(()=>({state:{revision:1,calibrationRevision:1,calibration:{modelId:'test',threshold:.8,margin:.1},enrollments:[] as any[]}}));
vi.mock('../client/vision/session-client.ts',()=>({connectVisionSession:()=>({request:async()=>structuredClone(session.state),dispose(){}})}));
vi.mock('../client/vision/worker-adapter.ts',()=>({makeFaceWorkerAdapter:()=>({modelId:'test',ready:async()=>{},dispose(){},similarity:()=>1,detect:async()=>[]})}));
let current:VisionResources;
function Probe(){current=useVisionResources();return null;}
afterEach(()=>{cleanup();history.replaceState(null,'','/');});
it('preserves calibration identity across enrollment refresh so an in-progress save is not cancelled',async()=>{
  history.replaceState(null,'','/check-in');session.state.enrollments=[];
  render(<StationVisionProvider><Probe/></StationVisionProvider>);await act(async()=>{await current.session!.connect();});
  const calibration=current!.calibration;
  session.state.revision++;session.state.enrollments=[{visitId:'a',modelId:'test',samples:[[1],[1],[1]],capturedAtMs:100}];
  await act(async()=>{await current.saveEnrollment!(session.state.enrollments[0]);});
  expect(current!.calibration).toBe(calibration);expect(current!.gallery.list('test').map(e=>e.visitId)).toEqual(['a']);
});
it('clears the previous kiosk visit when authorization changes even at the same global revision',async()=>{
  history.replaceState(null,'','/check-in');session.state.enrollments=[{visitId:'a',modelId:'test',samples:[[1],[1],[1]],capturedAtMs:100}];
  render(<StationVisionProvider><Probe/></StationVisionProvider>);await act(async()=>{await current.session!.connect();});
  expect(current!.gallery.list('test')).toHaveLength(1);session.state.enrollments=[];
  await act(async()=>{await current.session!.refresh();});expect(current!.gallery.list('test')).toEqual([]);
});

it('invalidates the calibration object when recalibration repeats the same threshold',async()=>{
  history.replaceState(null,'','/check-in');session.state.enrollments=[];
  render(<StationVisionProvider><Probe/></StationVisionProvider>);await act(async()=>{await current.session!.connect();});const prior=current!.calibration;
  session.state.revision++;session.state.calibrationRevision++;await act(async()=>{await current.session!.refresh();});expect(current!.calibration).not.toBe(prior);
});
