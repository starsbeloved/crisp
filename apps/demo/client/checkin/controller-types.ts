import React, { createContext } from 'react';
import type { CheckInAnswers } from '../../shared/types.ts';
import type { FollowUpPrompt } from './followup.ts';
export type Step = 'welcome' | 'name' | 'face' | 'questions' | 'followup' | 'done';
export interface CheckInController {
  step: Step; name: string; answers: CheckInAnswers;
  face: { status: 'idle' | 'scanning' | 'saved' | 'failed' | 'skipped'; message: string };
  queueNo: number | null; via: 'form' | 'voice';
  followUpPrompt: FollowUpPrompt | null;
  setFollowUpPrompt(prompt: FollowUpPrompt): void;
  setVia(v: 'form' | 'voice'): void;
  setName(n: string): void; startFaceScan(): Promise<{ ok: boolean; reason: string | null }>; skipFace(): void;
  setAnswers(p: Partial<CheckInAnswers>): void; setFollowUp(q: string, a: string): void;
  finish(): Promise<{ queueNo: number }>; reset(): void; goTo(s: Step): void;
}
export const CheckInContext: React.Context<CheckInController | null> = createContext<CheckInController | null>(null);
