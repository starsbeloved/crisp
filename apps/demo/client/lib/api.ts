import type { Alert, CheckInAnswers, GalleryEntry, NewVisitInput, NowCalling, Observation, ProviderSource, ReferenceSample, Visit } from '../../shared/types.ts';
async function request<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api${path}`, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`Request failed (${response.status})`);
  return response.json() as Promise<T>;
}
export const api = {
  health: () => request<{ ok: boolean; serverNow: number }>('/health'),
  config: () => request<{ apiPort: number; webPort: number }>('/config'),
  createVisit: (input: NewVisitInput) => request<Visit>('/visits', input),
  gallery: () => request<GalleryEntry[]>('/gallery'),
  addDescriptor: (visitId: string, descriptor: number[]) => request<{ ok: boolean }>(`/gallery/${encodeURIComponent(visitId)}/descriptor`, { descriptor }),
  observations: (observations: Observation[]) => request<{ ok: boolean }>('/observations', { observations }),
  async frame(cam: string, jpeg: Blob, source: 'live' | 'replay' = 'live', visible = !document.hidden): Promise<{ ok: boolean }> {
    const response = await fetch(`/api/frame?${new URLSearchParams({ cam, source, visible: visible ? '1' : '0' })}`, { method: 'POST', headers: { 'Content-Type': 'image/jpeg' }, body: jpeg });
    if (!response.ok) throw new Error(`Frame upload failed (${response.status})`);
    return response.json();
  },
  streamUrl: (cam: string) => `/api/stream.mjpg?cam=${encodeURIComponent(cam)}`,
  replayUrl: (id: string, i: number) => `/api/alerts/${encodeURIComponent(id)}/replay/${i}.jpg`,
  vision: (id: string) => request<{ description: string; source: ProviderSource }>(`/alerts/${encodeURIComponent(id)}/vision`, {}),
  acknowledge: (id: string) => request<Alert>(`/alerts/${encodeURIComponent(id)}/acknowledge`, {}),
  checked: (id: string) => request<Alert>(`/alerts/${encodeURIComponent(id)}/checked`, {}),
  callIn: (id: string, room: string) => request<NowCalling>(`/visits/${encodeURIComponent(id)}/call-in`, { room }),
  alertAudioUrl: (id: string) => `/api/alerts/${encodeURIComponent(id)}/audio`,
  callAudioUrl: (id: string) => `/api/calls/${encodeURIComponent(id)}/audio`,
  followUp: (answers: CheckInAnswers) => request<{ question: string; source: ProviderSource }>('/checkin/follow-up', { answers }),
  ask: (question: string) => request<{ answer: string; source: ProviderSource }>('/ask', { question }),
  signedUrl: (mode: 'checkin' | 'nurse') => request<{ signedUrl: string }>(`/agent/signed-url?mode=${mode}`),
  reference: (visitId: string, referenceBpm: number) => request<ReferenceSample>('/reference', { visitId, referenceBpm }),
  reset: () => request<{ ok: boolean }>('/reset', {}),
};
