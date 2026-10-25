import type { GalleryEntry, Observation } from '../../shared/types.ts';
import type { DetectedFace } from '../lib/face.ts';
import type { PoseSample } from './signals/index.ts';
import { createFaceMotionSignals, type FaceMotionReading } from './signals/faceMotion.ts';

export type Match = { visitId: string; name: string; score: number };
export interface FaceTrack {
  id: string;
  face: DetectedFace;
  lastSeen: number;
  votes: (Match | null)[];
  match: Match | null;
  identity: 'identified' | 'identifying' | 'unknown';
  source?: 'face' | 'body';
  faceMotion?: FaceMotionReading;
  faceMissing?: boolean;
}
type Box = DetectedFace['box'];

function distance(a: number[], b: number[]): number {
  if (!a.length || a.length !== b.length || !a.every(Number.isFinite) || !b.every(Number.isFinite)) return Infinity;
  return Math.sqrt(a.reduce((sum, value, i) => sum + (value - b[i]) ** 2, 0));
}
function matchDescriptor(descriptor: number[], gallery: GalleryEntry[]): Match | null {
  let best: Match | null = null;
  for (const entry of gallery) {
    const score = 1 - distance(descriptor, entry.descriptor);
    if (score >= 0.5 && (!best || score > best.score)) best = { visitId: entry.visitId, name: entry.name, score };
  }
  return best;
}
function overlap(a: Box, b: Box): number {
  const intersection = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) *
    Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  return intersection / Math.max(1, a.w * a.h + b.w * b.h - intersection);
}

/** Small greedy tracker; descriptor affinity prevents a seat swap inheriting the old name. */
export class FaceTracker {
  private tracks: FaceTrack[] = [];
  private nextId = 1;
  private motion = new Map<string, ReturnType<typeof createFaceMotionSignals>>();
  private lastUpdate = -Infinity;

  update(faces: DetectedFace[], gallery: GalleryEntry[], now: number): void {
    if (!Number.isFinite(now) || now <= this.lastUpdate) return;
    this.lastUpdate = now;
    this.tracks = this.tracks.filter(track => now - track.lastSeen < 1000 || this.motion.get(track.id)?.read(now).fallSuspected);
    const candidates: { track: FaceTrack; index: number; cost: number }[] = [];
    for (const track of this.tracks) for (const [index, face] of faces.entries()) {
      const descriptorDistance = distance(track.face.descriptor, face.descriptor);
      const a = track.face.box, b = face.box;
      const shift = Math.hypot(a.x + a.w / 2 - b.x - b.w / 2, a.y + a.h / 2 - b.y - b.h / 2) / Math.max(a.w, b.w, 1);
      if (descriptorDistance < 0.55 && (overlap(a, b) > 0.05 || shift < 1.5 || descriptorDistance < 0.3)) {
        candidates.push({ track, index, cost: descriptorDistance * 3 + Math.min(shift, 4) * 0.15 - overlap(a, b) * 0.2 });
      }
    }
    candidates.sort((a, b) => a.cost - b.cost);
    const usedTracks = new Set<string>(), usedFaces = new Set<number>();
    for (const { track, index } of candidates) {
      if (usedTracks.has(track.id) || usedFaces.has(index)) continue;
      track.face = faces[index]; track.lastSeen = now;
      usedTracks.add(track.id); usedFaces.add(index);
    }
    // Stop rendering old occupants as soon as a different descriptor occupies their box.
    this.tracks = this.tracks.filter(track => usedTracks.has(track.id) || !faces.some(face => overlap(track.face.box, face.box) > 0.35));
    for (const [index, face] of faces.entries()) {
      if (!usedFaces.has(index)) this.tracks.push({ id: `face-${this.nextId++}`, face, lastSeen: now, votes: [], match: null, identity: 'identifying' });
    }
    for (const track of this.tracks) {
      let motion = this.motion.get(track.id);
      if (!motion) { motion = createFaceMotionSignals(); this.motion.set(track.id, motion); }
      track.faceMissing = track.lastSeen !== now;
      motion.push(now, track.faceMissing ? null : track.face.box);
      if (track.lastSeen !== now) continue;
      track.votes.push(matchDescriptor(track.face.descriptor, gallery));
      track.votes = track.votes.slice(-10);
    }
    const activeIds = new Set(this.tracks.map(t => t.id));
    for (const id of this.motion.keys()) if (!activeIds.has(id)) this.motion.delete(id);
    this.setGallery(gallery);
  }

  setGallery(gallery: GalleryEntry[]): void {
    const waiting = new Set(gallery.map(entry => entry.visitId));
    for (const track of this.tracks) {
      track.votes = track.votes.map(vote => vote && waiting.has(vote.visitId) ? vote : null);
    }
    this.resolve();
  }

  assign(trackId: string, match: Match): void {
    const track = this.tracks.find(item => item.id === trackId);
    if (!track) return;
    // Clear competing votes so a staff correction takes effect immediately.
    for (const other of this.tracks) if (other !== track) other.votes = other.votes.map(vote => vote?.visitId === match.visitId ? null : vote);
    track.votes = Array.from({ length: 10 }, () => ({ ...match }));
    this.resolve();
  }

  current(now: number): FaceTrack[] {
    return this.tracks.map(track => ({ ...track, faceMotion: this.motion.get(track.id)?.read(now) }))
      .filter(track => now - track.lastSeen < 700 || track.faceMotion?.fallSuspected);
  }

  private resolve(): void {
    for (const track of this.tracks) {
      track.match = null; track.identity = 'identifying';
      const groups = new Map<string, Match[]>();
      for (const vote of track.votes) if (vote) groups.set(vote.visitId, [...(groups.get(vote.visitId) ?? []), vote]);
      const winner = [...groups.values()].sort((a, b) => b.length - a.length)[0];
      if (winner && winner.length >= 3 && winner.length > track.votes.length / 2) {
        track.match = { ...winner[0], score: winner.reduce((sum, vote) => sum + vote.score, 0) / winner.length };
        track.identity = 'identified';
      } else if (track.votes.filter(vote => vote === null).length >= 3 && track.votes.filter(vote => vote === null).length > track.votes.length / 2) track.identity = 'unknown';
    }
    const winners = new Map<string, FaceTrack>();
    for (const track of this.tracks) {
      if (!track.match) continue;
      const previous = winners.get(track.match.visitId);
      if (!previous || track.match.score > previous.match!.score) {
        if (previous) { previous.match = null; previous.identity = 'identifying'; }
        winners.set(track.match.visitId, track);
      } else { track.match = null; track.identity = 'identifying'; }
    }
  }
}

export function normalizedBox(box: Box, width: number, height: number): Observation['box'] {
  const left = Math.max(0, Math.min(width, box.x)), top = Math.max(0, Math.min(height, box.y));
  return { x: left / width, y: top / height,
    w: Math.max(0, Math.min(width, box.x + box.w) - left) / width,
    h: Math.max(0, Math.min(height, box.y + box.h) - top) / height };
}

export function poseForFace(box: Box, poses: PoseSample['landmarks'][], width: number, height: number): PoseSample['landmarks'] | null {
  const candidates = poses.filter(pose => {
    const nose = pose[0];
    return nose && nose.visibility >= 0.4 && nose.x * width >= box.x - box.w * 0.3 && nose.x * width <= box.x + box.w * 1.3 &&
      nose.y * height >= box.y - box.h * 0.3 && nose.y * height <= box.y + box.h * 1.3;
  });
  candidates.sort((a, b) => Math.hypot(a[0].x * width - box.x - box.w / 2, a[0].y * height - box.y - box.h / 2) -
    Math.hypot(b[0].x * width - box.x - box.w / 2, b[0].y * height - box.y - box.h / 2));
  return candidates[0] ?? null;
}

export interface BodyTrack extends FaceTrack {
  pose: PoseSample['landmarks'];
  source: 'face' | 'body';
  lastFaceAt: number;
  faceTrackId?: string;
}
type Torso = { x: number; y: number; size: number };
function torso(p: PoseSample['landmarks']): Torso | null {
  // Seated hips are often hidden by the chair. Visible shoulders still form a usable body track.
  if (![11, 12].every(i => p[i] && Number.isFinite(p[i].x) && Number.isFinite(p[i].y) && p[i].visibility >= .3)) return null;
  const sx = (p[11].x + p[12].x) / 2, sy = (p[11].y + p[12].y) / 2;
  const size = Math.hypot(p[11].x - p[12].x, p[11].y - p[12].y);
  return size >= .03 ? { x: sx, y: sy, size } : null;
}

/** Identity survives a hidden face only on an unambiguous, continuously visible torso. */
export class BodyTracker {
  private tracks: BodyTrack[] = [];
  private nextId = 1;

  update(poses: PoseSample['landmarks'][], faces: FaceTrack[], gallery: GalleryEntry[], now: number, width: number, height: number): void {
    const previous = this.tracks.filter(t => now - t.lastSeen <= 1000);
    const visible = poses.filter(p => torso(p) !== null);
    const candidates: { track: BodyTrack; index: number; cost: number }[] = [];
    for (const track of previous) for (const [index, p] of visible.entries()) {
      const a = torso(track.pose)!, b = torso(p)!;
      const ratio = b.size / a.size, cost = Math.hypot(a.x - b.x, a.y - b.y) / Math.max(a.size, b.size);
      const fastDownward = now - track.lastSeen <= 400 && b.y > a.y &&
        b.y - a.y < Math.max(a.size, b.size) * 3 && Math.abs(b.x - a.x) < Math.max(a.size, b.size) * .5;
      if (ratio >= .5 && ratio <= 2 && (cost < 1.7 || fastDownward)) candidates.push({ track, index, cost });
    }
    const assigned = new Map<number, BodyTrack>(), used = new Set<string>();
    for (const candidate of candidates.sort((a, b) => a.cost - b.cost)) {
      const { track, index, cost } = candidate;
      // Crossings and overlapping torsos must lose identity rather than exchange it.
      if (used.has(track.id) || assigned.has(index) || candidates.some(other => other !== candidate &&
        (other.track === track || other.index === index) && other.cost <= cost + .3)) continue;
      assigned.set(index, track); used.add(track.id);
    }
    const waiting = new Set(gallery.map(entry => entry.visitId));
    const freshFaces = faces.filter(face => now - face.lastSeen <= 700);
    this.tracks = visible.map((p, index) => {
      const points = [0, 11, 12, 23, 24].map(i => p[i]).filter(point => point && point.visibility >= .3);
      const x = Math.min(...points.map(point => point.x)) * width, y = Math.min(...points.map(point => point.y)) * height;
      const box = { x, y, w: Math.max(...points.map(point => point.x)) * width - x, h: Math.max(...points.map(point => point.y)) * height - y };
      const track: BodyTrack = assigned.get(index) ?? { id: `body-${this.nextId++}`, pose: p, lastSeen: now,
        lastFaceAt: -Infinity, face: { box, descriptor: [], landmarks: [], score: 0 }, votes: [], match: null, identity: 'identifying', source: 'body' };
      track.pose = p; track.lastSeen = now; track.source = 'body';
      track.face = { ...track.face, box, landmarks: [] };
      if (now - track.lastFaceAt > 60_000 || !waiting.has(track.match?.visitId ?? '')) track.match = null;
      const attached = freshFaces.filter(face => poseForFace(face.face.box, visible, width, height) === p);
      if (attached.length === 1) {
        const face = attached[0];
        track.match = face.match && waiting.has(face.match.visitId) ? { ...face.match } : null;
        track.face = face.face; track.source = 'face';
        track.faceTrackId = face.id; track.faceMissing = face.faceMissing;
        track.lastFaceAt = face.lastSeen;
      }
      track.identity = track.match ? 'identified' : 'identifying';
      return track;
    });
    // A re-confirmed face wins over a body-only claim; one visit can never label two bodies.
    const claims = new Map<string, BodyTrack>();
    for (const track of [...this.tracks].sort((a, b) => Number(b.source === 'face') - Number(a.source === 'face'))) {
      if (!track.match) continue;
      if (claims.has(track.match.visitId)) { track.match = null; track.identity = 'identifying'; }
      else claims.set(track.match.visitId, track);
    }
  }

  current(now: number): BodyTrack[] { return this.tracks.filter(t => now - t.lastSeen < 700); }
}
