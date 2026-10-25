// @vitest-environment jsdom
import React, { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { StationShell } from './StationShell.tsx';
import { StationStatus } from './StationStatus.tsx';
import { saveProfile } from './model.ts';

let container: HTMLDivElement, root: Root;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  localStorage.clear(); sessionStorage.clear(); history.replaceState(null, '', '/station');
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ stations: [] }) }));
});
afterEach(async () => {
  await act(async () => root.unmount()); container.remove();
  vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals();
});
function button(label: string) { return [...container.querySelectorAll('button')].find(button => button.textContent?.includes(label))!; }

it('shows four explained roles and saves the screen name and Exam room 1', async () => {
  const navigate = vi.fn();
  await act(async () => root.render(<StationShell path="/station" navigate={navigate}><p>Old page</p></StationShell>));
  expect(container.textContent).not.toContain('Old page');
  for (const label of ['Kiosk', 'Room view', 'Command Center', 'Exam room 1']) expect(button(label)).toBeDefined();
  expect(button('Lobby')).toBeUndefined();
  expect(button('Exam room 2')).toBeUndefined();
  expect(container.textContent).toContain('Screen name (shown in Command Center)');
  const input = container.querySelector('input')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'Laptop B');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => button('Exam room 1').click());
  expect(navigate).toHaveBeenCalledWith('/exam?room=1');
  expect(JSON.parse(sessionStorage.getItem('crisp-station')!)).toMatchObject({ name: 'Laptop B', selection: { role: 'exam', room: '1' } });
});

it('reopens a remembered role and lets the explicit picker override it', async () => {
  saveProfile({ id: 'b', name: 'Laptop B', selection: { role: 'exam', room: '1' } });
  const navigate = vi.fn();
  await act(async () => root.render(<StationShell path="/station" navigate={navigate}>Page</StationShell>));
  expect(navigate).toHaveBeenCalledWith('/exam?room=1');
  await act(async () => root.unmount()); root = createRoot(container);
  history.replaceState(null, '', '/station?choose=1'); navigate.mockClear();
  await act(async () => root.render(<StationShell path="/station" navigate={navigate}>Page</StationShell>));
  expect(navigate).not.toHaveBeenCalled(); expect(button('Kiosk')).toBeDefined();
});

it('registers immediately, heartbeats every ten seconds, and stops on unmount', async () => {
  vi.useFakeTimers(); history.replaceState(null, '', '/check-in');
  saveProfile({ id: 'b', name: 'Laptop B', selection: null });
  await act(async () => root.render(<StationShell path="/check-in" navigate={vi.fn()}>Kiosk content</StationShell>));
  expect(container.textContent).toContain('Kiosk content');
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string)).toEqual({ id: 'b', name: 'Laptop B', role: 'kiosk' });
  await act(async () => vi.advanceTimersByTime(10_000)); expect(fetch).toHaveBeenCalledTimes(2);
  const signal = vi.mocked(fetch).mock.calls[0][1]!.signal!;
  await act(async () => root.unmount()); root = createRoot(container);
  await act(async () => vi.advanceTimersByTime(30_000));
  expect(fetch).toHaveBeenCalledTimes(2); expect(signal.aborted).toBe(true);
});

it('opens the picker with Shift+S and releases the old page on role navigation', async () => {
  const cleanup = vi.fn(), navigate = vi.fn();
  function Camera() { useEffect(() => cleanup, []); return <p>Camera</p>; }
  await act(async () => root.render(<StationShell path="/room" navigate={navigate}><Camera /></StationShell>));
  await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'S', shiftKey: true, bubbles: true })));
  expect(navigate).toHaveBeenCalledWith('/station?choose=1');
  await act(async () => root.render(<StationShell path="/station" navigate={navigate}>Picker</StationShell>));
  expect(cleanup).toHaveBeenCalledTimes(1);
});

it('requires a two-second hold and cancels an interrupted press', async () => {
  vi.useFakeTimers(); const navigate = vi.fn();
  await act(async () => root.render(<StationShell path="/lobby" navigate={navigate}>Lobby</StationShell>));
  const corner = container.querySelector<HTMLButtonElement>('[aria-label="Switch station role"]')!;
  await act(async () => corner.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 })));
  await act(async () => vi.advanceTimersByTime(1999)); expect(navigate).not.toHaveBeenCalled();
  await act(async () => corner.dispatchEvent(new Event('pointercancel', { bubbles: true })));
  await act(async () => vi.advanceTimersByTime(1)); expect(navigate).not.toHaveBeenCalled();
  await act(async () => corner.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 })));
  await act(async () => vi.advanceTimersByTime(2000));
  expect(navigate).toHaveBeenCalledWith('/station?choose=1');
});

it('does not intercept Shift+S when a person types into a field', async () => {
  const navigate = vi.fn();
  await act(async () => root.render(<StationShell path="/check-in" navigate={navigate}><input /></StationShell>));
  await act(async () => container.querySelector('input')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'S', shiftKey: true, bubbles: true })));
  expect(navigate).not.toHaveBeenCalled();
});

it('adds the station list to the existing dashboard System popover', async () => {
  history.replaceState(null, '', '/dashboard');
  vi.mocked(fetch).mockImplementation(async (_url, options) => ({ ok: true, json: async () => options?.method === 'POST' ? {} : ({ stations: [{ id: 'b', name: 'Laptop B', role: 'exam', room: '1', online: true, lastSeenAt: Date.now() }] }) }) as Response);
  await act(async () => root.render(<StationShell path="/dashboard" navigate={vi.fn()}><div className="system-popover">System</div></StationShell>));
  expect(container.querySelector('.system-popover')?.textContent).toContain('Laptop B · Exam room 1 · online');
});

it('shows offline stations and reports unavailable status after a fetch failure', async () => {
  vi.useFakeTimers();
  vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => ({ stations: [{ id: 'b', name: 'Laptop B', role: 'kiosk', online: false, lastSeenAt: Date.now() - 30_000 }] }) } as Response);
  await act(async () => root.render(<StationStatus />));
  expect(container.textContent).toContain('Laptop B · Kiosk · offline');
  vi.mocked(fetch).mockRejectedValueOnce(new Error('Network down'));
  await act(async () => vi.advanceTimersByTime(10_000));
  expect(container.textContent).toContain('Station status unavailable'); expect(container.textContent).not.toContain('online');
});

it('opens Stations with an ordinary click on a full-screen view', async () => {
  const navigate = vi.fn();
  await act(async () => root.render(<StationShell path="/room" navigate={navigate}>Room</StationShell>));
  expect(button('Stations')).toBeDefined();
  await act(async () => button('Stations').click());
  expect(navigate).toHaveBeenCalledWith('/station?choose=1');
});
