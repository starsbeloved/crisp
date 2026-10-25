// @vitest-environment jsdom
// P22c consent and rendering checks live within the packet's owned test directory.
import { act, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { GeminiSees, GeminiSeesProvider } from '../../client/dashboard/GeminiSees.tsx';
import { demoFixture } from '../../client/dashboard/fixture.ts';
import type { Alert } from '../../shared/types.ts';

let root: Root;
let host: HTMLDivElement;
const alert = { ...demoFixture(1000).alerts[0], cameraId: 'A' };
const fetcher = vi.fn();
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('fetch', fetcher); fetcher.mockReset();
  fetcher.mockResolvedValue({ ok: true, json: async () => ({ description: 'A person is seated.', source: 'gemini' }) });
  host = document.createElement('div'); root = createRoot(host);
});
afterEach(async () => { await act(() => root.unmount()); vi.unstubAllGlobals(); });
async function render(enabled = false, alerts: Alert[] = [alert], synthetic = false, copies = 1) {
  await act(() => root.render(<StrictMode><GeminiSeesProvider enabled={enabled} alerts={alerts} synthetic={synthetic}>
    {alerts.map(item => Array.from({ length: copies }, (_, i) => <GeminiSees key={`${item.id}:${i}`} alert={item} />))}
  </GeminiSeesProvider></StrictMode>));
}

it('sends nothing while off, then sends exactly the selected frame after explicit consent', async () => {
  await render(); expect(fetcher).not.toHaveBeenCalled();
  expect(host.textContent).toContain('Sends one alert frame to Google Gemini; not stored');
  await act(() => host.querySelector('button')!.click());
  expect(fetcher).toHaveBeenCalledExactlyOnceWith(`/api/alerts/${alert.id}/vision`, expect.objectContaining({ method: 'POST' }));
  expect(host.textContent).toContain('✦ Gemini sees: A person is seated.');
  expect(host.querySelector('img')?.getAttribute('src')).toBe(`/api/alerts/${alert.id}/replay/74.jpg`);
});

it('automatically describes every open red request once across strict effects, SSE updates and duplicate mounts', async () => {
  await render(true, [alert, { ...alert, id: 'second' }], false, 2);
  expect(fetcher).toHaveBeenCalledTimes(2);
  await render(true, [{ ...alert, updatedAt: 2000 }, { ...alert, id: 'second' }], false, 2);
  await render(false); await render(true);
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it('does not send amber, closed or simulated requests; an amber-to-red upgrade sends once', async () => {
  await render(true, [{ ...alert, level: 'amber' }, { ...alert, id: 'closed', status: 'checked' }]);
  expect(fetcher).not.toHaveBeenCalled();
  await render(true, [alert], true); expect(fetcher).not.toHaveBeenCalled();
  expect(host.querySelector('button')?.disabled).toBe(true);
  await render(true); expect(fetcher).toHaveBeenCalledTimes(1);
});

it('does not show a completed description against a different request or a checked request', async () => {
  let finish: (result: unknown) => void = () => {};
  fetcher.mockReturnValue(new Promise(resolve => { finish = resolve; }));
  await render(true);
  await render(false, [{ ...alert, id: 'new-request' }]);
  await act(async () => finish({ ok: true, json: async () => ({ description: 'A person is seated.', source: 'gemini' }) }));
  expect(host.textContent).not.toContain('A person is seated.');
  await render(false, [{ ...alert, status: 'checked' }]);
  expect(host.textContent).not.toContain('Gemini sees');
});

it('shows unavailable status on route failure, permits manual retry, and never calls a fallback Gemini', async () => {
  fetcher.mockResolvedValueOnce({ ok: false, status: 501 });
  await render(true);
  expect(host.textContent).toContain('Image description unavailable');
  expect(host.textContent).not.toContain('✦ Gemini sees:');
  await act(() => host.querySelector('button')!.click());
  expect(host.textContent).toContain('✦ Gemini sees: A person is seated.');
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it('labels validation fallbacks as Template', async () => {
  fetcher.mockResolvedValue({ ok: true, json: async () => ({ description: 'Image description unavailable', source: 'template' }) });
  await render(true);
  expect(host.textContent).toContain('Image description unavailable');
  expect(host.textContent).toContain('Template');
  expect(host.textContent).not.toContain('✦ Gemini sees:');
});
