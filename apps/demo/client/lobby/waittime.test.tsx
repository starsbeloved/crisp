// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { WaitTimeBoard } from './WaitTimeBoard.tsx';

let root: Root;
let container: HTMLDivElement;
const fetchBoard = vi.fn();
const initialBoard = {
  minutesBetweenCalls: 12, usingFallback: true,
  waiting: [
    { queueNo: 3, initial: 'A.', peopleAhead: 0, minutes: 0 },
    { queueNo: 5, initial: 'B.', peopleAhead: 1, minutes: 12 },
    { queueNo: 7, initial: 'C.', peopleAhead: 2, minutes: 24 },
    { queueNo: 8, initial: 'D.', peopleAhead: 3, minutes: 36 },
  ],
};
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  fetchBoard.mockReset().mockResolvedValue({ ok: true, json: async () => initialBoard });
  vi.stubGlobal('fetch', fetchBoard);
  container = document.createElement('div');
  root = createRoot(container);
});
afterEach(async () => {
  await act(() => root.unmount());
  vi.useRealTimers(); vi.unstubAllGlobals();
});

it('shows every anonymized position with an estimate and the order caveat', async () => {
  await act(() => root.render(<WaitTimeBoard />));
  expect(container.querySelectorAll('li')).toHaveLength(4);
  expect(container.querySelectorAll('li')[1].textContent).toContain('#5 · B.');
  expect(container.querySelectorAll('li')[1].textContent).toContain('about 12 min');
  expect(container.querySelectorAll('li')[1].textContent).toContain('1 person ahead');
  expect(container.textContent).toContain('Estimate — the nurse may call people in a different order');
  expect(container.textContent).toContain('12 min between call-ins');
});

it('refreshes after 30 seconds and removes called patients with their old estimates', async () => {
  await act(() => root.render(<WaitTimeBoard />));
  fetchBoard.mockResolvedValue({ ok: true, json: async () => ({
    minutesBetweenCalls: 8, usingFallback: false,
    waiting: [{ queueNo: 5, initial: 'B.', peopleAhead: 0, minutes: 0 }],
  }) });
  await act(() => vi.advanceTimersByTimeAsync(29_999));
  expect(container.querySelectorAll('li')).toHaveLength(4);
  await act(() => vi.advanceTimersByTimeAsync(1));
  expect(container.querySelectorAll('li')).toHaveLength(1);
  expect(container.textContent).toContain('#5 · B.');
  expect(container.textContent).toContain('about 0 min');
  expect(container.textContent).not.toContain('12 min between call-ins');
});

it('refreshes immediately when the live queue changes', async () => {
  await act(() => root.render(<WaitTimeBoard refreshKey="before-call" />));
  fetchBoard.mockResolvedValue({ ok: true, json: async () => ({ ...initialBoard, waiting: [] }) });
  await act(() => root.render(<WaitTimeBoard refreshKey="after-call" />));
  expect(container.querySelectorAll('li')).toHaveLength(0);
  expect(container.textContent).toContain('No one is waiting');
});

it('clears stale estimates on failure and recovers on the next refresh', async () => {
  await act(() => root.render(<WaitTimeBoard />));
  fetchBoard.mockResolvedValue({ ok: false });
  await act(() => vi.advanceTimersByTimeAsync(30_000));
  expect(container.querySelectorAll('li')).toHaveLength(0);
  expect(container.textContent).toContain('Estimates unavailable');
  fetchBoard.mockResolvedValue({ ok: true, json: async () => initialBoard });
  await act(() => vi.advanceTimersByTimeAsync(30_000));
  expect(container.querySelectorAll('li')).toHaveLength(4);
});
