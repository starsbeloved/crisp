import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { CheckInAnswers } from '../../shared/types.ts';
import { api } from '../lib/api.ts';
import { replaySource } from '../lib/camera.ts';
import { detectFaces, loadFaceModels } from '../lib/face.ts';
import { useVideoSource } from '../lib/useVideoSource.ts';
import type { CheckInController, Step } from './controller-types.ts';
import { assessFace, averageDescriptors } from './enrollment.ts';
import { detailsError } from './details.ts';
import { loadFollowUp } from './followup.ts';
import { useKioskPulse } from './useKioskPulse.ts';
import { sharePulse, type KioskPulseSample, type KioskPulseView } from './pulse.ts';

type ScanResult = { ok: boolean; reason: string | null };
type FormState = Pick<CheckInController, 'step' | 'name' | 'answers' | 'face' | 'queueNo' | 'via' | 'followUpPrompt'> & {
  descriptor: number[] | null; busy: boolean; error: string;
  followUpQuestion: string; followUpLoading: boolean;
  pulseNotice: string;
};
export type CheckInState = CheckInController & Pick<FormState, 'busy' | 'error' | 'followUpQuestion' | 'followUpLoading' | 'pulseNotice'> & {
  videoRef: RefObject<HTMLVideoElement | null>; replay: string | null; cameraMessage: string;
  prepareFollowUp(): Promise<void>;
  pulse: KioskPulseView | null;
  completePulse(samples: KioskPulseSample[], outcome: 'complete' | 'timeout' | 'skipped'): void;
};
function initialState(): FormState {
  return { step: 'welcome', name: '', answers: { reason: '', reasonChips: [], onset: null, trend: null, followUp: null, via: 'form' },
    face: { status: 'idle', message: 'Face scan optional' }, queueNo: null, via: 'form', descriptor: null,
    busy: false, error: '', followUpQuestion: '', followUpPrompt: null, followUpLoading: false, pulseNotice: '' };
}
let warmup: Promise<void> | null = null;
function warmFaceModels(): Promise<void> {
  if (!warmup) warmup = loadFaceModels().then(async () => {
    const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 240;
    await detectFaces(canvas);
  }).catch(error => { warmup = null; throw error; });
  return warmup;
}

export function useCheckIn(): CheckInState {
  const [state, setState] = useState(initialState);
  // Voice tools can make several edits before React renders; keep their next read current.
  const latest = useRef(state);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [replay] = useState(replaySource);
  const pendingScan = useRef<{ promise: Promise<ScanResult>; resolve(result: ScanResult): void } | null>(null);
  const pendingPulse = useRef<{ promise: Promise<boolean>; resolve(ok: boolean): void } | null>(null);
  const pulseSamples = useRef<KioskPulseSample[]>([]);
  const submission = useRef<Promise<{ queueNo: number }> | null>(null);
  const followUpRequest = useRef<Promise<void> | null>(null);
  const update = useCallback((patch: Partial<FormState>) => {
    latest.current = { ...latest.current, ...patch }; setState(latest.current);
  }, []);
  const settleScan = useCallback((result: ScanResult) => {
    pendingScan.current?.resolve(result); pendingScan.current = null;
  }, []);
  const reset = useCallback(() => {
    settleScan({ ok: false, reason: 'Check-in reset' });
    pendingPulse.current?.resolve(false); pendingPulse.current = null; pulseSamples.current = [];
    submission.current = null; followUpRequest.current = null;
    latest.current = initialState(); setState(latest.current);
  }, [settleScan]);
  const goTo = useCallback((step: Step) => {
    if (pendingPulse.current && ['questions', 'followup', 'done', 'pulse'].includes(step)) return;
    if (step === 'pulse') return;
    if (pendingPulse.current) { pendingPulse.current.resolve(false); pendingPulse.current = null; pulseSamples.current = []; }
    const patch: Partial<FormState> = { step, error: '' };
    if (step !== 'face' && latest.current.face.status === 'scanning') {
      settleScan({ ok: false, reason: 'Face scan cancelled' });
      patch.face = { status: 'idle', message: 'Face scan optional' };
    }
    update(patch);
  }, [settleScan, update]);
  const startFaceScan = useCallback((): Promise<ScanResult> => {
    if (pendingScan.current) return pendingScan.current.promise;
    let resolve!: (value: ScanResult) => void;
    const promise = new Promise<ScanResult>(done => { resolve = done; });
    pendingScan.current = { promise, resolve };
    pendingPulse.current?.resolve(false); pendingPulse.current = null; pulseSamples.current = [];
    update({ step: 'face', descriptor: null, face: { status: 'scanning', message: 'Preparing face scan…' }, error: '' });
    return promise;
  }, [update]);
  const skipFace = useCallback(() => {
    pendingPulse.current?.resolve(false); pendingPulse.current = null; pulseSamples.current = [];
    settleScan({ ok: false, reason: 'Skipped — staff will help' });
    update({ step: 'questions', descriptor: null, face: { status: 'skipped', message: 'Skipped — staff will help' }, error: '' });
  }, [settleScan, update]);
  const { ready, message: cameraMessage } = useVideoSource(videoRef,
    state.step === 'pulse' || (state.step === 'face' && (state.face.status === 'scanning' || state.face.status === 'saved')), replay);
  const completePulse = useCallback((samples: KioskPulseSample[], outcome: 'complete' | 'timeout' | 'skipped') => {
    pulseSamples.current = outcome === 'skipped' ? [] : samples;
    const last = samples.at(-1);
    update({ step: 'questions', pulseNotice: outcome === 'skipped' ? 'Pulse check skipped — that’s okay.' :
      outcome === 'timeout' ? 'Couldn’t get a clear reading — that’s okay.' : last ?
        `Pulse check: ${Math.round(last.bpm)} bpm · ${last.quality} · camera estimate · measured at ${new Date(last.at).toLocaleTimeString()}` : 'No pulse reading saved.' });
    pendingPulse.current?.resolve(true); pendingPulse.current = null;
  }, [update]);
  const pulse = useKioskPulse(videoRef, state.step === 'pulse', ready, state.descriptor, completePulse);

  useEffect(() => { void warmFaceModels().catch(() => { /* The form and Skip remain usable without models. */ }); }, []);
  useEffect(() => () => { settleScan({ ok: false, reason: 'Check-in closed' }); pendingPulse.current?.resolve(false); pendingPulse.current = null; submission.current = null; followUpRequest.current = null; }, [settleScan]);
  useEffect(() => {
    if (state.face.status !== 'scanning') return;
    const timer = setTimeout(() => {
      const reason = 'Face scan timed out. Try again or skip — staff will help.';
      settleScan({ ok: false, reason }); update({ face: { status: 'failed', message: reason } });
    }, 20_000);
    return () => clearTimeout(timer);
  }, [state.face.status, settleScan, update]);
  useEffect(() => {
    if (state.step !== 'face' || state.face.status !== 'scanning' || !ready) return;
    const video = videoRef.current;
    if (!video) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let samples: number[][] = [];
    let firstSampleAt = 0;
    async function scan() {
      try {
        await warmFaceModels();
        if (stopped) return;
        if (video!.readyState >= 2) {
          const result = assessFace(await detectFaces(video!));
          if (stopped) return;
          const now = performance.now();
          if (!result.descriptor || now - firstSampleAt > 3000) samples = [];
          if (result.descriptor) {
            if (!samples.length) firstSampleAt = now;
            samples.push(result.descriptor);
          }
          if (samples.length >= 5) {
            let resolve!: (ok: boolean) => void;
            const promise = new Promise<boolean>(done => { resolve = done; });
            pendingPulse.current = { promise, resolve };
            update({ step: 'pulse', descriptor: averageDescriptors(samples), face: { status: 'saved', message: '✓ Face saved' }, pulseNotice: '' });
            settleScan({ ok: true, reason: null }); return;
          }
          update({ face: { status: 'scanning', message: result.descriptor ? `Hold still… ${samples.length}/5` : result.message } });
        }
        if (!stopped) timer = setTimeout(() => void scan(), 200);
      } catch {
        if (stopped) return;
        const reason = 'Face models unavailable. Try again or skip — staff will help.';
        update({ face: { status: 'failed', message: reason } }); settleScan({ ok: false, reason });
      }
    }
    void scan();
    return () => { stopped = true; clearTimeout(timer); };
  }, [state.step, state.face.status, ready, settleScan, update]);
  useEffect(() => {
    if (state.step !== 'done') return;
    const timer = setTimeout(reset, 10_000);
    return () => clearTimeout(timer);
  }, [state.step, reset]);

  const finish = useCallback((): Promise<{ queueNo: number }> => {
    if (submission.current) return submission.current;
    if (pendingPulse.current) return pendingPulse.current.promise.then(ok => {
      if (!ok) throw new Error('Pulse check cancelled');
      return finish();
    });
    const value = latest.current;
    const reason = value.answers.reason.trim() || value.answers.reasonChips.join(', ');
    const error = !value.name.trim() ? 'Please enter your preferred name or alias.' : !reason ? 'Please tell Crisp what brings you in today.' : detailsError(value.answers);
    if (error) { update({ error }); return Promise.reject(new Error(error)); }
    settleScan({ ok: false, reason: 'Check-in submitted' });
    update({ busy: true, error: '', step: value.step === 'face' ? 'questions' : value.step,
      ...(value.face.status === 'scanning' ? { face: { status: 'skipped', message: 'Skipped — staff will help' } } : {}) });
    const promise = api.createVisit({ name: value.name.trim(), descriptor: value.descriptor,
      answers: { ...value.answers, reason, via: value.via } }).then(async visit => {
      if (submission.current === promise && pulseSamples.current.length) {
        // Separate normal requests preserve chronological sample order through the existing route.
        try {
          await sharePulse(pulseSamples.current, visit.id, Boolean(replay));
        } catch {
          if (submission.current === promise) update({ pulseNotice: 'You’re checked in. The pulse reading could not be shared with staff.' });
        }
      }
      if (submission.current === promise) update({ queueNo: visit.queueNo, step: 'done', busy: false });
      return { queueNo: visit.queueNo };
    }).catch(error => {
      if (submission.current === promise) {
        submission.current = null; update({ busy: false, error: 'Could not save your check-in. Please retry or ask staff for help.' });
      }
      throw error;
    });
    submission.current = promise;
    return promise;
  }, [settleScan, update, replay]);
  const prepareFollowUp = useCallback((): Promise<void> => {
    goTo('followup');
    if (latest.current.followUpQuestion) return Promise.resolve();
    if (followUpRequest.current) return followUpRequest.current;
    update({ followUpLoading: true });
    const request = loadFollowUp(latest.current.answers).then(prompt => {
      if (followUpRequest.current === request) update({ followUpQuestion: prompt.question, followUpPrompt: prompt, followUpLoading: false });
    });
    followUpRequest.current = request;
    return request;
  }, [goTo, update]);
  return { ...state, pulse, completePulse, videoRef, replay, cameraMessage, reset, goTo, startFaceScan, skipFace, finish, prepareFollowUp,
    // Tool calls can arrive back to back, before React commits the next render.
    get name() { return latest.current.name; },
    get answers() { return latest.current.answers; },
    setVia(via) { update({ via, answers: { ...latest.current.answers, via } }); },
    setName(name) { update({ name }); },
    setAnswers(patch: Partial<CheckInAnswers>) {
      const changesComplaint = (['reason', 'reasonChips', 'onset', 'trend'] as const).some(key => key in patch && JSON.stringify(patch[key]) !== JSON.stringify(latest.current.answers[key]));
      const answers = { ...latest.current.answers, ...(changesComplaint ? { followUp: null } : {}), ...patch };
      if (changesComplaint) followUpRequest.current = null;
      update({ answers, via: answers.via, ...(changesComplaint ? { followUpQuestion: '', followUpPrompt: null, followUpLoading: false } : {}) });
    },
    setFollowUpPrompt(prompt) {
      followUpRequest.current = null;
      update({ followUpPrompt: prompt, followUpQuestion: prompt.question, followUpLoading: false });
    },
    setFollowUp(question, answer) {
      followUpRequest.current = null;
      update({ answers: { ...latest.current.answers, followUp: { question, answer } }, followUpQuestion: question, followUpLoading: false });
    },
  };
}
