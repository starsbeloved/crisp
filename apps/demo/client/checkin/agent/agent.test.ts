import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AddressInfo } from 'node:net';
import { signedUrl } from '../../../server/agent.ts';
import { createAppServer } from '../../../server/http.ts';
import type { CheckInController } from '../controller-types.ts';
import { createCheckInTools } from './tools.ts';

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('agent signing', () => {
  function configure() {
    vi.stubEnv('PROVIDERS_ENV', '/tmp/crisp-p7-no-provider-file');
    vi.stubEnv('ELEVENLABS_API_KEY', 'test-only');
    vi.stubEnv('ELEVENLABS_AGENT_ID', 'checkin-test');
    vi.stubEnv('ELEVENLABS_NURSE_AGENT_ID', 'nurse-test');
  }
  it('does not contact a provider without an agent id', async () => {
    configure(); vi.stubEnv('ELEVENLABS_AGENT_ID', '');
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    expect(await signedUrl('checkin')).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('signs for each configured agent and sends the key only as a provider header', async () => {
    configure();
    const fetcher = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ signed_url: 'wss://api.elevenlabs.io/v1/convai/conversation?test=1' })));
    vi.stubGlobal('fetch', fetcher);
    for (const mode of ['checkin', 'nurse'] as const) expect(await signedUrl(mode)).toContain('wss://');
    expect(new URL(fetcher.mock.calls[0][0]).searchParams.get('agent_id')).toBe('checkin-test');
    expect(new URL(fetcher.mock.calls[1][0]).searchParams.get('agent_id')).toBe('nurse-test');
    expect(fetcher.mock.calls[0][1].headers).toEqual({ 'xi-api-key': 'test-only' });
    expect(String(fetcher.mock.calls[0][0])).not.toContain('test-only');
  });
  it('uses the check-in id as the nurse fallback and degrades on provider failure', async () => {
    configure(); vi.stubEnv('ELEVENLABS_NURSE_AGENT_ID', '');
    const fetcher = vi.fn().mockResolvedValue(new Response('{}', { status: 429 }));
    vi.stubGlobal('fetch', fetcher);
    expect(await signedUrl('nurse')).toBeNull();
    expect(new URL(fetcher.mock.calls[0][0]).searchParams.get('agent_id')).toBe('checkin-test');
    fetcher.mockRejectedValueOnce(new Error('offline'));
    expect(await signedUrl('checkin')).toBeNull();
    fetcher.mockResolvedValueOnce(new Response('{"signed_url":"https://example.org"}'));
    expect(await signedUrl('checkin')).toBeNull();
  });
  it('returns 503 without ids and a URL through the frozen HTTP route with a mocked provider', async () => {
    configure(); vi.stubEnv('ELEVENLABS_AGENT_ID', '');
    const realFetch = fetch;
    const { server } = createAppServer({ dataDir: null, readProviders: false });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    try {
      expect((await realFetch(`${base}/api/agent/signed-url?mode=checkin`)).status).toBe(503);
      vi.stubEnv('ELEVENLABS_AGENT_ID', 'checkin-test');
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"signed_url":"wss://api.elevenlabs.io/v1/convai/conversation?test=1"}')));
      const response = await realFetch(`${base}/api/agent/signed-url?mode=checkin`);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ signedUrl: 'wss://api.elevenlabs.io/v1/convai/conversation?test=1' });
    } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
  });
});

function mockController(): CheckInController {
  const controller: CheckInController = {
    step: 'welcome', name: '', answers: { reason: '', reasonChips: [], onset: null, trend: null, followUp: null, via: 'form' },
    face: { status: 'idle', message: '' }, queueNo: null, via: 'form',
    setVia: vi.fn(v => { controller.via = v; controller.answers.via = v; }),
    setName: vi.fn(n => { controller.name = n; }),
    startFaceScan: vi.fn(async () => ({ ok: true, reason: null })), skipFace: vi.fn(),
    setAnswers: vi.fn(p => { Object.assign(controller.answers, p); }), setFollowUp: vi.fn(),
    finish: vi.fn(async () => ({ queueNo: 3 })), reset: vi.fn(), goTo: vi.fn(),
  };
  return controller;
}

describe('check-in client tools', () => {
  it('fills the shared controller, scans, asks one follow-up and returns the actual queue number', async () => {
    const controller = mockController();
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('{"question":"What would you like the nurse to know?","source":"gemini"}'));
    const tools = createCheckInTools(() => controller, fetcher);
    expect(await tools.set_name({ name: ' Ama ' })).toContain('Ama');
    expect(controller.setName).toHaveBeenCalledWith('Ama');
    expect(await tools.start_face_scan()).toBe('saved');
    expect(controller.startFaceScan).toHaveBeenCalledOnce();
    expect(await tools.save_answers({ reason: 'My chest feels tight', onset: 'since this morning', trend: 'getting worse' })).toContain('saved');
    expect(controller.answers).toMatchObject({ reason: 'My chest feels tight', onset: 'today', trend: 'worse', via: 'voice' });
    expect(await tools.get_follow_up_question()).toBe('What would you like the nurse to know?');
    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toMatchObject({ answers: { reason: 'My chest feels tight', via: 'voice' } });
    expect(await tools.save_follow_up({ question: 'What else?', answer: 'Nothing else' })).toContain('saved');
    expect(controller.setFollowUp).toHaveBeenCalledWith('What else?', 'Nothing else');
    expect(await tools.finish_check_in()).toBe('queue number 3');
    expect(controller.finish).toHaveBeenCalledOnce();
  });
  it('returns scan failures and does not invent unsupported answer chips', async () => {
    const controller = mockController();
    vi.mocked(controller.startFaceScan).mockResolvedValue({ ok: false, reason: 'Only one person please' });
    const tools = createCheckInTools(() => controller);
    expect(await tools.start_face_scan()).toBe('Only one person please');
    await tools.save_answers({ reason: 'Not sure', onset: 'sometime', trend: 'unsure' });
    expect(controller.answers.onset).toBeNull(); expect(controller.answers.trend).toBeNull();
    expect(await tools.set_name({ name: '' })).toContain('name');
    expect(await tools.finish_check_in()).toContain('name');
    expect(controller.finish).not.toHaveBeenCalled();
  });
  it('uses the latest controller after rerenders and keeps previous answers on partial correction', async () => {
    let current = mockController();
    const tools = createCheckInTools(() => current);
    current = mockController();
    await tools.set_name({ name: 'Ama' });
    await tools.save_answers({ reason: 'Headache', onset: 'today', trend: 'same' });
    await tools.save_answers({ reason: 'A bad headache' });
    expect(current.answers).toMatchObject({ reason: 'A bad headache', onset: 'today', trend: 'same' });
  });
  it('returns a usable follow-up on an offline provider and a recoverable finish failure', async () => {
    const controller = mockController(); controller.name = 'Ama'; controller.answers.reason = 'Headache';
    const tools = createCheckInTools(() => controller, vi.fn().mockRejectedValue(new Error('offline')));
    expect(await tools.get_follow_up_question()).toContain('nurse');
    vi.mocked(controller.finish).mockRejectedValueOnce(new Error('offline'));
    expect(await tools.finish_check_in()).toContain('try');
  });
});
