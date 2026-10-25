// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { RoomView } from './RoomView.tsx';

let root: Root;
let container: HTMLDivElement;
let header: HTMLElement;
let previousOverflow: string;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  header = document.createElement('header');
  const app = document.createElement('div'); app.id = 'root'; app.append(header); document.body.append(app);
  container = document.createElement('div'); app.append(container); root = createRoot(container);
  previousOverflow = document.body.style.overflow;
});
afterEach(async () => {
  await act(() => root.unmount());
  document.body.replaceChildren(); document.body.style.overflow = previousOverflow;
  vi.restoreAllMocks(); vi.unstubAllGlobals();
  Reflect.deleteProperty(document, 'fullscreenElement'); Reflect.deleteProperty(document, 'exitFullscreen');
});
async function render() {
  await act(() => root.render(<RoomView call={null} connected><canvas aria-label="Local camera overlay" /></RoomView>));
}
function fullscreenButton() { return Array.from(container.querySelectorAll('button')).find(button => /fullscreen/i.test(button.textContent ?? ''))!; }

it('composes the local camera and public hallway, and releases page chrome on unmount', async () => {
  header.inert = true; document.body.style.overflow = 'scroll';
  await render();
  expect(container.querySelector('.room-camera canvas')).not.toBeNull();
  expect(container.querySelector('[aria-label="Hallway call-out"]')).not.toBeNull();
  expect(document.body.style.overflow).toBe('hidden');
  await act(() => root.render(null));
  expect(header.inert).toBe(true);
  expect(document.body.style.overflow).toBe('scroll');
});

it('keeps the visible navigation interactive while the room is open', async () => {
  header.inert = false;
  await render();
  expect(header.inert).toBe(false);
  await act(() => root.render(null));
  expect(header.inert).toBe(false);
});

it('requests fullscreen for both panels and follows browser fullscreen changes', async () => {
  await render();
  const room = container.querySelector<HTMLElement>('.room-view')!;
  let current: Element | null = null;
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => current });
  const request = vi.fn(async () => { current = room; document.dispatchEvent(new Event('fullscreenchange')); });
  Object.defineProperty(room, 'requestFullscreen', { configurable: true, value: request });
  const exit = vi.fn(async () => { current = null; document.dispatchEvent(new Event('fullscreenchange')); });
  Object.defineProperty(document, 'exitFullscreen', { configurable: true, value: exit });
  await act(() => fullscreenButton().click());
  expect(fullscreenButton().textContent).toBe('Exit fullscreen');
  await act(() => fullscreenButton().click());
  expect(fullscreenButton().textContent).toBe('Fullscreen');
});

it('keeps the room usable and explains a rejected fullscreen request', async () => {
  await render();
  Object.defineProperty(container.querySelector('.room-view'), 'requestFullscreen', { configurable: true, value: () => Promise.reject(new Error('blocked')) });
  await act(() => fullscreenButton().click());
  expect(container.textContent).toContain('Use your browser’s fullscreen command');
  expect(container.querySelector('.room-camera canvas')).not.toBeNull();
});
