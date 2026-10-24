import { z } from 'zod';

const clientId=z.string().min(1).max(96).regex(/^[A-Za-z0-9_-]+$/);
const source=z.strictObject({sourceId:clientId,runId:clientId});
export type CameraSource=z.infer<typeof source>;
const candidate=z.strictObject({candidate:z.string().max(4096).optional(),sdpMid:z.string().max(256).nullable().optional(),sdpMLineIndex:z.number().int().nonnegative().max(65535).nullable().optional(),usernameFragment:z.string().max(256).nullable().optional()});
export const mediaSignalSchema=z.discriminatedUnion('type',[
  z.strictObject({type:z.literal('offer'),sdp:z.string().min(1).max(65536),source:source.optional()}),
  z.strictObject({type:z.literal('answer'),sdp:z.string().min(1).max(65536)}),
  z.strictObject({type:z.literal('candidate'),candidate}),
]);
export type MediaSignal=z.infer<typeof mediaSignalSchema>;
export const mediaRequestSchema=z.discriminatedUnion('action',[
  z.strictObject({action:z.literal('register'),clientId,role:z.enum(['publisher','receiver'])}),
  z.strictObject({action:z.literal('poll'),clientId,afterSeq:z.number().int().nonnegative()}),
  z.strictObject({action:z.literal('send'),clientId,targetId:clientId,message:mediaSignalSchema}),
  z.strictObject({action:z.literal('close'),clientId}),
]);
export type MediaRequest=z.infer<typeof mediaRequestSchema>;
export const mediaEventSchema=z.discriminatedUnion('type',[
  z.strictObject({seq:z.number().int().positive(),type:z.literal('peer'),peerId:clientId,role:z.enum(['publisher','receiver'])}),
  z.strictObject({seq:z.number().int().positive(),type:z.literal('left'),peerId:clientId}),
  z.strictObject({seq:z.number().int().positive(),type:z.literal('signal'),peerId:clientId,message:mediaSignalSchema}),
]);
export type MediaEvent=z.infer<typeof mediaEventSchema>;
export const mediaReplySchema=z.strictObject({events:z.array(mediaEventSchema).max(128)});
export type MediaReply=z.infer<typeof mediaReplySchema>;
