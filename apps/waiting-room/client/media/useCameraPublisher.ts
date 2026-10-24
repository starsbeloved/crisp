import { useCallback, useEffect, useRef } from 'react';
import { createCameraTransport } from './transport.ts';
import type { CameraSource } from './protocol.ts';

const sources=new WeakMap<MediaStream,CameraSource>();
export function tagCameraStream(stream:MediaStream,source:CameraSource){sources.set(stream,{...source});}

/** Borrows Vision's only camera. Never opens/stops camera tracks, even on failure. */
export function useCameraPublisher():(stream:MediaStream|null)=>void {
  const current=useRef<ReturnType<typeof createCameraTransport>|null>(null),streamRef=useRef<MediaStream|null>(null);
  const cleanupEvents=useRef<(()=>void)|null>(null),queue=useRef<Promise<void>>(Promise.resolve()),mounted=useRef(true);
  const publish=useCallback((stream:MediaStream|null)=>{
    if(streamRef.current===stream)return;
    streamRef.current=stream;cleanupEvents.current?.();cleanupEvents.current=null;
    const old=current.current;current.current=null;
    queue.current=queue.current.then(async()=>{await old?.close();if(!mounted.current||!stream||streamRef.current!==stream)return;
      const transport=createCameraTransport({role:'publisher',stream,source:sources.get(stream)});current.current=transport;
      const stop=()=>{if(streamRef.current===stream){streamRef.current=null;current.current=null;void transport.close();}};
      const hidden=()=>{if(document.visibilityState==='hidden')stop();};
      const tracks=stream.getVideoTracks();for(const track of tracks){track.addEventListener('ended',stop);track.addEventListener('mute',stop);}
      document.addEventListener('visibilitychange',hidden);
      cleanupEvents.current=()=>{for(const track of tracks){track.removeEventListener('ended',stop);track.removeEventListener('mute',stop);}document.removeEventListener('visibilitychange',hidden);};
      await transport.start();
    }).catch(()=>{/* Publisher failure is reflected by the receiver; Vision retains its source ownership. */});
  },[]);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;cleanupEvents.current?.();cleanupEvents.current=null;streamRef.current=null;const old=current.current;current.current=null;void old?.close();};},[]);
  return publish;
}
