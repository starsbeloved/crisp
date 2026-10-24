import { mediaRequestSchema } from '../client/media/protocol.ts';
import type { MediaEvent, MediaReply } from '../client/media/protocol.ts';

export class MediaError extends Error {
  readonly status:number;readonly code:string;
  constructor(status:number,code:string,message:string){super(message);this.name='MediaError';this.status=status;this.code=code;}
}
type EventInput=MediaEvent extends infer E?E extends MediaEvent?Omit<E,'seq'>:never:never;
type Client={id:string;role:'publisher'|'receiver';seenAtMs:number;seq:number;ack:number;events:MediaEvent[]};
/** Caller MUST require current station authority before and after reading the request body. */
export function createMediaBroker({now=Date.now}:{now?:()=>number}={}) {
  const clients=new Map<string,Client>();let stationId:string|null=null;
  const fail=(status:number,code:string,message:string):never=>{throw new MediaError(status,code,message);};
  const reset=()=>{clients.clear();stationId=null;};
  const enqueue=(client:Client,event:EventInput)=>{
    if(client.events.length>=128){clients.delete(client.id);fail(409,'MEDIA_OVERFLOW','Media signaling fell behind. Reconnect this view.');}
    client.events.push({...event,seq:++client.seq} as MediaEvent);
  };
  const remove=(id:string)=>{
    const old=clients.get(id);if(!old)return;clients.delete(id);
    for(const peer of clients.values())if(old.role!==peer.role){
      if(peer.events.length>=128)clients.delete(peer.id);else enqueue(peer,{type:'left',peerId:id});
    }
  };
  return {
    reset,
    handle(sessionId:string,raw:unknown):MediaReply {
      if(!sessionId)fail(401,'STATION_REQUIRED','Current station authority required');
      const parsed=mediaRequestSchema.safeParse(raw);if(!parsed.success)fail(400,'MEDIA_INVALID','Invalid media signaling request');
      const input=parsed.data!;
      if(stationId!==sessionId){reset();stationId=sessionId;}
      const time=now();for(const client of clients.values())if(time-client.seenAtMs>6000||time<client.seenAtMs)remove(client.id);
      if(input.action==='register'){
        const old=clients.get(input.clientId);
        if(old){if(old.role!==input.role)fail(409,'MEDIA_ROLE','A media client cannot change roles');old.seenAtMs=time;return {events:old.events.map(e=>structuredClone(e))};}
        if(input.role==='publisher'&&[...clients.values()].some(c=>c.role==='publisher'))fail(409,'MEDIA_OWNER','Another camera publisher is active');
        if(input.role==='receiver'&&[...clients.values()].filter(c=>c.role==='receiver').length>=8)fail(429,'MEDIA_CAPACITY','Too many staff camera subscribers');
        const client:Client={id:input.clientId,role:input.role,seenAtMs:time,seq:0,ack:0,events:[]};
        clients.set(client.id,client);
        for(const peer of clients.values())if(peer.id!==client.id&&peer.role!==client.role){enqueue(peer,{type:'peer',peerId:client.id,role:client.role});enqueue(client,{type:'peer',peerId:peer.id,role:peer.role});}
        return {events:client.events.map(e=>structuredClone(e))};
      }
      const client=clients.get(input.clientId);if(!client)fail(410,'MEDIA_ENDED','Media connection ended. Reconnect this view.');
      client!.seenAtMs=time;
      if(input.action==='close'){remove(input.clientId);return {events:[]};}
      if(input.action==='poll'){
        if(input.afterSeq<client!.ack||input.afterSeq>client!.seq)fail(409,'MEDIA_CURSOR','Media cursor is no longer valid. Reconnect this view.');
        client!.ack=input.afterSeq;client!.events=client!.events.filter(e=>e.seq>input.afterSeq);
        return {events:client!.events.map(e=>structuredClone(e))};
      }
      const peer=clients.get(input.targetId);
      if(!peer)fail(410,'MEDIA_PEER_ENDED','The other media view has disconnected');
      if(peer!.role===client!.role||peer!.id===client!.id)fail(403,'MEDIA_ROLE','Media signaling must connect Vision and Staff roles');
      if(input.message.type==='offer'&&client!.role!=='publisher'||input.message.type==='answer'&&client!.role!=='receiver')fail(403,'MEDIA_ROLE','Invalid negotiation direction');
      enqueue(peer!,{type:'signal',peerId:client!.id,message:input.message});
      return {events:[]};
    },
  };
}
