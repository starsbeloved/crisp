import { describe, expect, it } from 'vitest';
import { createMediaBroker, MediaError } from '../server/media.ts';

describe('authenticated media signaling mailbox — synthetic SDP, no video',()=>{
  it('pairs one publisher with receivers and only relays the correct negotiation direction',()=>{
    const b=createMediaBroker();
    b.handle('station_A',{action:'register',clientId:'vision',role:'publisher'});
    const r=b.handle('station_A',{action:'register',clientId:'staff',role:'receiver'});
    expect(r.events[0]).toMatchObject({type:'peer',peerId:'vision',role:'publisher'});
    expect(b.handle('station_A',{action:'poll',clientId:'vision',afterSeq:0}).events).toMatchObject([{type:'peer',peerId:'staff',role:'receiver'}]);
    b.handle('station_A',{action:'send',clientId:'vision',targetId:'staff',message:{type:'offer',sdp:'synthetic offer'}});
    const messages=b.handle('station_A',{action:'poll',clientId:'staff',afterSeq:r.events.at(-1)!.seq});
    expect(messages.events).toMatchObject([{type:'signal',peerId:'vision',message:{type:'offer',sdp:'synthetic offer'}}]);
    // An interrupted poll response can be retried without losing the offer.
    expect(b.handle('station_A',{action:'poll',clientId:'staff',afterSeq:r.events.at(-1)!.seq})).toEqual(messages);
    expect(()=>b.handle('station_A',{action:'send',clientId:'staff',targetId:'vision',message:{type:'offer',sdp:'wrong role'}})).toThrow(MediaError);
  });
  it('rejects missing authority, unregistered clients, peer-to-peer receivers, malformed and oversized payloads',()=>{
    const b=createMediaBroker();
    expect(()=>b.handle('',{action:'register',clientId:'x',role:'receiver'})).toThrow(MediaError);
    expect(()=>b.handle('station_A',{action:'poll',clientId:'unknown',afterSeq:0})).toThrow(MediaError);
    b.handle('station_A',{action:'register',clientId:'r1',role:'receiver'});b.handle('station_A',{action:'register',clientId:'r2',role:'receiver'});
    expect(()=>b.handle('station_A',{action:'send',clientId:'r1',targetId:'r2',message:{type:'answer',sdp:'x'}})).toThrow(MediaError);
    expect(()=>b.handle('station_A',{action:'send',clientId:'r1',targetId:'missing',message:{type:'answer',sdp:'x'}})).toThrow(MediaError);
    expect(()=>b.handle('station_A',{action:'send',clientId:'r1',targetId:'r2',message:{type:'candidate',candidate:{candidate:'x'.repeat(5000)}}})).toThrow(MediaError);
    expect(()=>b.handle('station_A',{action:'register',clientId:'x',role:'receiver',unexpected:true})).toThrow(MediaError);
  });
  it('allows exactly one publisher, bounds receivers, and clears old authority on session replacement',()=>{
    const b=createMediaBroker();b.handle('station_A',{action:'register',clientId:'vision',role:'publisher'});
    expect(()=>b.handle('station_A',{action:'register',clientId:'other_vision',role:'publisher'})).toThrow(MediaError);
    for(let i=0;i<8;i++)b.handle('station_A',{action:'register',clientId:`r${i}`,role:'receiver'});
    expect(()=>b.handle('station_A',{action:'register',clientId:'r8',role:'receiver'})).toThrow(MediaError);
    b.handle('station_B',{action:'register',clientId:'new_vision',role:'publisher'});
    expect(()=>b.handle('station_B',{action:'poll',clientId:'vision',afterSeq:0})).toThrow(MediaError);
    b.reset();expect(()=>b.handle('station_B',{action:'poll',clientId:'new_vision',afterSeq:0})).toThrow(MediaError);
  });
  it('expires silent clients and notifies live peers without reviving an expired connection',()=>{
    let now=1000;const b=createMediaBroker({now:()=>now});
    b.handle('station_A',{action:'register',clientId:'vision',role:'publisher'});
    const r=b.handle('station_A',{action:'register',clientId:'staff',role:'receiver'});
    now=5000;b.handle('station_A',{action:'poll',clientId:'staff',afterSeq:r.events.at(-1)!.seq});
    now=7100;
    expect(b.handle('station_A',{action:'poll',clientId:'staff',afterSeq:r.events.at(-1)!.seq}).events).toMatchObject([{type:'left',peerId:'vision'}]);
    expect(()=>b.handle('station_A',{action:'poll',clientId:'vision',afterSeq:0})).toThrow(MediaError);
  });
  it('rejects impossible poll cursors and fails closed if a receiver cannot drain bounded messages',()=>{
    const b=createMediaBroker();b.handle('station_A',{action:'register',clientId:'vision',role:'publisher'});
    b.handle('station_A',{action:'register',clientId:'staff',role:'receiver'});
    expect(()=>b.handle('station_A',{action:'poll',clientId:'staff',afterSeq:999})).toThrow(MediaError);
    for(let i=0;i<127;i++)b.handle('station_A',{action:'send',clientId:'vision',targetId:'staff',message:{type:'candidate',candidate:{candidate:`candidate:${i}`}}});
    expect(()=>b.handle('station_A',{action:'send',clientId:'vision',targetId:'staff',message:{type:'candidate',candidate:{candidate:'overflow'}}})).toThrow(MediaError);
    expect(()=>b.handle('station_A',{action:'poll',clientId:'staff',afterSeq:0})).toThrow(MediaError);
  });
});
