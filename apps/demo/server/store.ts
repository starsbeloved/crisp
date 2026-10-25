import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { GalleryEntry, RoomState } from '../shared/types.ts';

type Listener = (state: RoomState) => void;
type Saved = { state: RoomState; descriptors: Record<string, number[][]> };

function emptyState(): RoomState {
  return {
    serverNow: Date.now(), visits: [], vitals: {}, alerts: [], cameras: {}, nowCalling: null,
    handoffs: {}, references: [], providers: { gemini: false, elevenlabs: false, agent: false },
  };
}

export class RoomStore {
  state: RoomState;
  descriptors: Record<string, number[][]> = {};
  private listeners = new Set<Listener>();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private dataDir: string | null;

  constructor(dataDir: string | null = null) {
    this.dataDir = dataDir;
    this.state = emptyState();
    if (dataDir) {
      try {
        const saved = JSON.parse(readFileSync(join(dataDir, 'state.json'), 'utf8')) as Saved;
        this.state = { ...emptyState(), ...saved.state, serverNow: Date.now() };
        this.descriptors = saved.descriptors ?? {};
      } catch (error) {
        if (existsSync(join(dataDir, 'state.json'))) console.warn('Could not restore room state:', error);
      }
    }
  }

  snapshot(): RoomState {
    return { ...this.state, serverNow: Date.now() };
  }

  changed(): void {
    this.state.serverNow = Date.now();
    for (const listener of this.listeners) listener(this.snapshot());
    if (this.dataDir && !this.saveTimer) {
      this.saveTimer = setTimeout(() => this.flush(), 200);
      this.saveTimer.unref();
    }
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  gallery(): GalleryEntry[] {
    return this.state.visits.filter(v => v.status === 'waiting').flatMap(visit =>
      (this.descriptors[visit.id] ?? []).map(descriptor => ({ visitId: visit.id, name: visit.name, descriptor })));
  }

  flush(): void {
    if (!this.dataDir) return;
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = null;
    mkdirSync(this.dataDir, { recursive: true });
    writeFileSync(join(this.dataDir, 'state.json'), JSON.stringify({ state: this.state, descriptors: this.descriptors }));
  }

  reset(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = null;
    if (this.dataDir) {
      const file = join(this.dataDir, 'state.json');
      if (existsSync(file)) {
        const trash = join(this.dataDir, 'trash');
        mkdirSync(trash, { recursive: true });
        renameSync(file, join(trash, `state-${Date.now()}-${Math.random().toString(36).slice(2)}.json`));
      }
    }
    this.state = emptyState();
    this.descriptors = {};
    this.changed();
  }
}
