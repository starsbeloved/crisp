// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { loadProfile, saveProfile, selectionFromLocation, stationUrl } from './model.ts';

afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); sessionStorage.clear(); });

it.each([
  ['/check-in', '', { role: 'kiosk' }, '/check-in'],
  ['/room', '', { role: 'room' }, '/room'],
  ['/camera', '?cam=A', { role: 'room' }, '/room'],
  ['/dashboard', '', { role: 'command' }, '/dashboard'],
  ['/exam', '?room=1', { role: 'exam', room: '1' }, '/exam?room=1'],
  ['/exam', '?room=2', { role: 'exam', room: '2' }, '/exam?room=2'],
  ['/exam', '?room=3', { role: 'exam', room: '3' }, '/exam?room=3'],
  ['/lobby', '', { role: 'lobby' }, '/lobby'],
] as const)('maps %s%s to the existing page', (path, search, selection, url) => {
  expect(selectionFromLocation(path, search)).toEqual(selection);
  expect(stationUrl(selection)).toBe(url);
});

it('does not guess an exam room or assign the picker a role', () => {
  expect(selectionFromLocation('/exam', '?room=4')).toBeNull();
  expect(selectionFromLocation('/station', '')).toBeNull();
});

it('persists the same browser identity and selected room across reloads', () => {
  const profile = loadProfile();
  expect(profile.id).toBeTruthy();
  expect(saveProfile({ ...profile, name: 'Laptop B', selection: { role: 'exam', room: '2' } })).toBe(true);
  expect(loadProfile()).toEqual({ ...profile, name: 'Laptop B', selection: { role: 'exam', room: '2' } });
});

it('recovers from corrupt and invalid saved data without navigating to an arbitrary URL', () => {
  localStorage.setItem('crisp-station', '{');
  expect(loadProfile().selection).toBeNull();
  localStorage.setItem('crisp-station', JSON.stringify({ id: 'b', name: 'Laptop B', selection: { role: 'exam', room: '8' }, url: 'https://example.invalid' }));
  expect(loadProfile().selection).toBeNull();
});

it('continues with a usable identity when storage reads and writes are blocked', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('Blocked'); });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Blocked'); });
  const profile = loadProfile();
  expect(profile.id).toBeTruthy();
  expect(saveProfile(profile)).toBe(false);
});

it('stores roles per tab without inheriting another tab identity or role', () => {
  const first = loadProfile();
  saveProfile({ ...first, selection: { role: 'command' } });
  expect(localStorage.getItem('crisp-station')).toBeNull();
  expect(loadProfile().selection).toEqual({ role: 'command' });
  sessionStorage.clear();
  const second = loadProfile();
  expect(second.id).not.toBe(first.id);
  expect(second.selection).toBeNull();
});
it('falls back to localStorage when sessionStorage is unavailable', () => {
  vi.spyOn(window, 'sessionStorage', 'get').mockImplementation(() => { throw new DOMException('Blocked'); });
  const profile = { id: 'fallback', name: 'Fallback screen', selection: { role: 'lobby' as const } };
  expect(saveProfile(profile)).toBe(true);
  expect(loadProfile()).toEqual(profile);
});
it.each([
  ['?role=command', { role: 'command' }], ['?role=room', { role: 'room' }],
  ['?role=kiosk', { role: 'kiosk' }], ['?role=lobby', { role: 'lobby' }],
  ['?role=exam&room=1', { role: 'exam', room: '1' }],
] as const)('accepts explicit query role %s', (search, expected) => {
  expect(selectionFromLocation('/', search)).toEqual(expected);
});
