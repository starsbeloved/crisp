// @vitest-environment jsdom
import { afterEach,expect,it,vi } from 'vitest';
import { act,cleanup,fireEvent,render,screen,waitFor } from '@testing-library/react';
import type { VisionPageProps } from '../client/vision/VisionPage.tsx';
const mocks=vi.hoisted(()=>({page:null as VisionPageProps|null,transportOptions:null as any,publish:vi.fn(),tag:vi.fn(),initialize:vi.fn(async()=>{}),push:vi.fn(),controls:vi.fn(),reset:vi.fn(),dispose:vi.fn(),bindings:vi.fn(),sendPose:vi.fn(),sendMeasurement:vi.fn(),clockDispose:vi.fn()}));
vi.mock('../client/vision/VisionPage.tsx',()=>({VisionPage:(props:VisionPageProps)=>{mocks.page=props;return <p>Vision capture controls</p>;}}));
vi.mock('../client/media/useCameraPublisher.ts',()=>({useCameraPublisher:()=>mocks.publish,tagCameraStream:mocks.tag}));
vi.mock('../client/runtime/sensor-worker-client.ts',()=>({createBrowserPoseWorker:()=>({initialize:async()=>{},infer:async()=>{},invalidate:()=>{},dispose:()=>{}})}));
vi.mock('../client/runtime/sensor-session.ts',()=>({createSensorSession:()=>({initialize:mocks.initialize,push:mocks.push,setReferenceControls:mocks.controls,reset:mocks.reset,dispose:mocks.dispose})}));
vi.mock('../client/runtime/sensor-clock.ts',()=>({createSensorClock:()=>({synchronize:async()=>{},nowMs:()=>1000,getSyncId:()=> 'sync',getContinuityKey:()=> 'continuity',mapping:()=>null,dispose:mocks.clockDispose})}));
vi.mock('../client/runtime/sensor-transport.ts',()=>({createSensorTransport:(options:any)=>{mocks.transportOptions=options;return {bindings:mocks.bindings,measurement:mocks.sendMeasurement,pose:mocks.sendPose,discardObservations:()=>{},dispose:()=>{}};}}));
import { VisionRoute } from '../client/vision/VisionRoute.tsx';
import { emptyRoom } from '../shared/fixtures.ts';
afterEach(()=>{cleanup();vi.useRealTimers();vi.unstubAllGlobals();vi.clearAllMocks();mocks.page=null;});
it('connects the actual frame, binding, worker, reference and same-feed publishing seams without automatic camera acquisition',async()=>{
 const camera=vi.fn();vi.stubGlobal('navigator',{mediaDevices:{getUserMedia:camera}});const room=structuredClone(emptyRoom);room.referenceControls=[{trackId:'track',visitId:'visit',identityEpoch:'epoch',generation:2}];
 vi.stubGlobal('fetch',async(url:string)=>Response.json(url.endsWith('/station')?{ok:true}:room));
 render(<VisionRoute/>);fireEvent.click(screen.getByRole('button',{name:'Connect vision station'}));await screen.findByText('Vision capture controls');await waitFor(()=>expect(mocks.controls).toHaveBeenCalledWith(room.referenceControls));
 expect(mocks.initialize).toHaveBeenCalled();expect(camera).not.toHaveBeenCalled();const stream={} as MediaStream;mocks.page!.onStream!(stream);expect(mocks.publish).toHaveBeenCalledWith(stream);expect(mocks.tag).toHaveBeenCalledWith(stream,{sourceId:mocks.page!.context.sourceId,runId:mocks.page!.context.runId});
 const f={} as Parameters<NonNullable<VisionPageProps['onFrame']>>[0];mocks.page!.onFrame!(f);expect(mocks.push).toHaveBeenCalledWith(f);
 const batch={} as Parameters<NonNullable<VisionPageProps['onBindings']>>[0];mocks.page!.onBindings!(batch);expect(mocks.bindings).toHaveBeenCalledWith(batch);
});
it('shows reference polling failure and allows a fresh explicit connection without silently retaining monitoring',async()=>{
 vi.stubGlobal('fetch',async(url:string)=>{if(url.endsWith('/station'))return Response.json({ok:true});throw Error('Disconnected');});
 render(<VisionRoute/>);fireEvent.click(screen.getByRole('button',{name:'Connect vision station'}));await screen.findByRole('alert');expect(mocks.reset).toHaveBeenCalled();expect(screen.queryByText('Vision capture controls')).toBeNull();expect(screen.getByRole('button',{name:/Reconnect vision station/})).toBeTruthy();
 expect(mocks.dispose).toHaveBeenCalledTimes(1);expect(mocks.clockDispose).toHaveBeenCalledTimes(1);
});

it('pauses a hung reference read at its deadline and unpublishes the borrowed stream',async()=>{
 vi.useFakeTimers();let aborted=false;
 vi.stubGlobal('fetch',async(url:string,init?:RequestInit)=>{if(url.endsWith('/station'))return Response.json({ok:true});return new Promise<Response>((_resolve,reject)=>{init?.signal?.addEventListener('abort',()=>{aborted=true;reject(new DOMException('Timed out','AbortError'));},{once:true});});});
 render(<VisionRoute/>);fireEvent.click(screen.getByRole('button',{name:'Connect vision station'}));await act(async()=>{for(let i=0;i<15;i++)await Promise.resolve();});
 expect(screen.getByText('Vision capture controls')).toBeTruthy();
 await act(async()=>{await vi.advanceTimersByTimeAsync(1501);});
 expect(aborted).toBe(true);expect(screen.getByRole('alert')).toBeTruthy();expect(screen.queryByText('Vision capture controls')).toBeNull();expect(mocks.publish).toHaveBeenLastCalledWith(null);
});

it('applies a newly checked server generation on a rejected old pose while keeping capture mounted',async()=>{
 const room=structuredClone(emptyRoom);room.referenceControls=[{trackId:'track',visitId:'visit',identityEpoch:'epoch',generation:1}];
 vi.stubGlobal('fetch',async(url:string)=>Response.json(url.endsWith('/station')?{ok:true}:room));
 render(<VisionRoute/>);fireEvent.click(screen.getByRole('button',{name:'Connect vision station'}));await screen.findByText('Vision capture controls');await waitFor(()=>expect(mocks.controls).toHaveBeenCalled());
 room.referenceControls[0].generation=2;
 const result=await mocks.transportOptions.onPoseRejected([{trackId:'track',visitId:'visit',identityEpoch:'epoch',referenceGeneration:1}]);
 expect(result).toBe(true);expect(mocks.controls).toHaveBeenLastCalledWith(room.referenceControls);expect(screen.queryByRole('alert')).toBeNull();expect(screen.getByText('Vision capture controls')).toBeTruthy();
});
