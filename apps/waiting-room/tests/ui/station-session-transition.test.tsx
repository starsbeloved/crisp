// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { StationVisionProvider } from '../../client/vision/StationVisionProvider.tsx';
import { useVisionResources } from '../../client/vision/resources.tsx';
import type { VisionResources } from '../../client/vision/resources.tsx';
const boundary=vi.hoisted(()=>({disposeWorker:vi.fn(),disposePort:vi.fn(),requests:[] as string[]}));
vi.mock('../../client/vision/worker-adapter.ts',()=>({makeFaceWorkerAdapter:()=>({modelId:'test',ready:async()=>{},dispose:boundary.disposeWorker,similarity:()=>1,detect:async()=>[]})}));
vi.mock('../../client/vision/session-client.ts',()=>({connectVisionSession:()=>({request:async(input:{mode:string})=>{boundary.requests.push(input.mode);return {revision:1,calibration:{modelId:'test',threshold:.8,margin:.1},enrollments:[{visitId:'same_visit',modelId:'test',samples:[[1],[1],[1]],capturedAtMs:100}]};},dispose:boundary.disposePort})}));
let current:VisionResources;
function Probe(){current=useVisionResources();return null;}
afterEach(()=>{cleanup();history.replaceState(null,'','/');vi.clearAllMocks();boundary.requests.length=0;});
it('retains the live face worker and session owner when the operator moves from check-in to vision',async()=>{
  history.replaceState(null,'','/check-in');
  const rendered=render(<StationVisionProvider><Probe/></StationVisionProvider>);
  await act(async()=>{await current.session!.connect();});const adapter=current!.adapter;
  expect(current!.gallery.list('test').map(v=>v.visitId)).toEqual(['same_visit']);
  history.replaceState(null,'','/vision');rendered.rerender(<StationVisionProvider><Probe/></StationVisionProvider>);
  await act(async()=>{await current.session!.refresh();});
  expect(boundary.disposeWorker).not.toHaveBeenCalled();expect(boundary.disposePort).not.toHaveBeenCalled();
  expect(current!.adapter).toBe(adapter);expect(boundary.requests.at(-1)).toBe('station');
  expect(current!.gallery.list('test').map(v=>v.visitId)).toEqual(['same_visit']);
  rendered.unmount();expect(boundary.disposeWorker).toHaveBeenCalledTimes(1);expect(boundary.disposePort).toHaveBeenCalledTimes(1);
});
