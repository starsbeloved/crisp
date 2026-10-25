import type { Alert, NowCalling, Visit } from '../shared/types.ts';
import * as providers from './providers/index.ts';
import type { RoomStore } from './store.ts';
import type { MjpegBuffer } from './mjpeg.ts';

async function withinSixSeconds<T>(work: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('Provider timeout')), 6_000);
        timer.unref();
      }),
    ]);
  } finally { if (timer) clearTimeout(timer); }
}

export class Orchestrator {
  private alertAudio = new Map<string, Uint8Array>();
  private callAudio = new Map<string, Uint8Array>();

  private store: RoomStore;
  private mjpeg: MjpegBuffer;
  constructor(store: RoomStore, mjpeg: MjpegBuffer) { this.store = store; this.mjpeg = mjpeg; }

  async onVisit(visit: Visit): Promise<void> {
    let summary: Visit['summary'];
    try { summary = await withinSixSeconds(providers.summarize(visit)); }
    catch { summary = { chiefComplaint: visit.answers.reason || 'Not provided', text: visit.answers.reason || 'No reason given.', source: 'template' }; }
    const current = this.store.state.visits.find(item => item.id === visit.id);
    if (!current) return;
    current.summary = summary;
    this.store.changed();
  }

  onAlerts(alerts: Alert[]): void {
    for (const alert of alerts) void this.processAlert(alert);
  }

  private async processAlert(alert: Alert): Promise<void> {
    alert.replayFrames = this.mjpeg.capture(alert.id, alert.cameraId);
    this.store.changed();
    let explanation: Alert['explanation'];
    try { explanation = await withinSixSeconds(providers.explainAlert(alert)); }
    catch {
      const text = `${alert.facts.name} may need a check.`;
      explanation = { bubble: text, speech: text, source: 'template' };
    }
    const current = this.store.state.alerts.find(item => item.id === alert.id);
    if (!current || current.status !== 'open') return;
    current.explanation = explanation;
    current.audio = 'pending';
    this.store.changed();
    try {
      const audio = await withinSixSeconds(providers.speak(explanation?.speech ?? '', 'alert'));
      if (audio) this.alertAudio.set(alert.id, audio);
      current.audio = audio ? 'ready' : 'failed';
    } catch { current.audio = 'failed'; }
    this.store.changed();
  }

  async onCall(call: NowCalling, visit: Visit): Promise<void> {
    const line = `${visit.name}, number ${visit.queueNo}, please come to room ${call.room}.`;
    const speech = withinSixSeconds(providers.speak(line, 'crisp')).then(audio => {
      if (audio) this.callAudio.set(call.id, audio);
      if (this.store.state.nowCalling?.id === call.id) {
        this.store.state.nowCalling.audio = audio ? 'ready' : 'failed';
        this.store.changed();
      }
    }).catch(() => {
      if (this.store.state.nowCalling?.id === call.id) {
        this.store.state.nowCalling.audio = 'failed';
        this.store.changed();
      }
    });
    const note = withinSixSeconds(providers.handoffNote(visit, this.store.state.vitals[visit.id],
      this.store.state.alerts.filter(alert => alert.visitId === visit.id))).catch(() => ({
      visitId: visit.id, text: `${visit.name}: ${visit.answers.reason || 'No reason given.'}`,
      source: 'template' as const, createdAt: Date.now(),
    })).then(result => {
      if (!this.store.state.visits.some(item => item.id === visit.id)) return;
      this.store.state.handoffs[visit.id] = result;
      this.store.changed();
    });
    await Promise.all([speech, note]);
  }

  getAlertAudio(id: string): Uint8Array | null { return this.alertAudio.get(id) ?? null; }
  getCallAudio(id: string): Uint8Array | null { return this.callAudio.get(id) ?? null; }
  reset(): void { this.alertAudio.clear(); this.callAudio.clear(); }
}
