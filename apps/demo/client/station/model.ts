export type StationSelection = { role: 'kiosk' | 'room' | 'command' | 'lobby' } | { role: 'exam'; room: '1' | '2' | '3' };
export type StationProfile = { id: string; name: string; selection: StationSelection | null };
export type StationPresence = StationSelection & { id: string; name: string; lastSeenAt: number; online: boolean };

export const stationChoices: { selection: StationSelection; label: string; description: string }[] = [
  { selection: { role: 'kiosk' }, label: 'Kiosk', description: 'Check-in' },
  { selection: { role: 'room' }, label: 'Room view', description: 'Waiting-room camera + hallway call-outs (camera laptop)' },
  { selection: { role: 'command' }, label: 'Command Center', description: 'Staff screen' },
  ...(['1'] as const).map(room => ({ selection: { role: 'exam' as const, room }, label: `Exam room ${room}`, description: "Doctor’s screen" })),
  { selection: { role: 'lobby' }, label: 'Lobby', description: 'Public TV without camera' },
];

export function stationLabel(selection: StationSelection) {
  if (selection.role === 'exam') return `Exam room ${selection.room}`;
  return stationChoices.find(choice => choice.selection.role === selection.role)!.label;
}

export function stationUrl(selection: StationSelection): string {
  switch (selection.role) {
    case 'kiosk': return '/check-in';
    case 'room': return '/room';
    case 'command': return '/dashboard';
    case 'exam': return `/exam?room=${selection.room}`;
    case 'lobby': return '/lobby';
  }
}

export function selectionFromLocation(path: string, search: string): StationSelection | null {
  const query = new URLSearchParams(search);
  const role = query.get('role');
  if (role === 'exam') {
    const room = query.get('room') ?? '1';
    return room === '1' || room === '2' || room === '3' ? { role, room } : null;
  }
  if (role === 'kiosk' || role === 'room' || role === 'command' || role === 'lobby') return { role };
  if (path === '/camera') return { role: 'room' };
  if (path === '/exam') {
    const room = new URLSearchParams(search).get('room') ?? '1';
    return room === '1' || room === '2' || room === '3' ? { role: 'exam', room } : null;
  }
  return stationChoices.find(choice => stationUrl(choice.selection) === path)?.selection ?? null;
}

export function loadProfile(): StationProfile {
  const id = globalThis.crypto?.randomUUID?.() ?? `station-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const fallback: StationProfile = { id, name: `Screen ${id.slice(-4)}`, selection: null };
  try {
    let raw: string | null;
    try { raw = sessionStorage.getItem('crisp-station'); }
    catch { raw = localStorage.getItem('crisp-station'); }
    const saved = JSON.parse(raw ?? 'null');
    if (!saved || typeof saved.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(saved.id) || typeof saved.name !== 'string' || !saved.name.trim() || saved.name.length > 60) return fallback;
    const examRoom = saved.selection?.role === 'exam' && ['1', '2', '3'].includes(saved.selection.room) ? saved.selection.room as '1' | '2' | '3' : null;
    const selection: StationSelection | null = examRoom ? { role: 'exam', room: examRoom } : stationChoices.find(({ selection }) => selection.role === saved.selection?.role && (selection.role !== 'exam' || selection.room === saved.selection?.room))?.selection ?? null;
    return { id: saved.id, name: saved.name.trim(), selection };
  } catch { return fallback; }
}

export function saveProfile(profile: StationProfile): boolean {
  try { sessionStorage.setItem('crisp-station', JSON.stringify(profile)); return true; }
  catch {
    try { localStorage.setItem('crisp-station', JSON.stringify(profile)); return true; }
    catch { return false; }
  }
}
