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
    followUpPrompt: null, setFollowUpPrompt: vi.fn(prompt => { controller.followUpPrompt = prompt; }),
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
  it('continues a conversation with only their own words and never requires unstated onset or trend', async () => {
    const c = mockController(); c.name = 'Anna';
    const tools = createCheckInTools(() => c, vi.fn().mockResolvedValue(new Response('{"question":"Where is the tightness?","source":"gemini"}')));
    const saved = await tools.save_answers({ reason: 'My chest feels tight' });
    expect(saved).not.toMatch(/all three|onset|trend/);
    expect(await tools.get_follow_up_question()).toContain('Where is the tightness?');
    await tools.save_follow_up({ question: 'Where is the tightness?', answer: 'In the middle' });
    expect(await tools.get_follow_up_question()).toMatch(/wrap up|finish_check_in/i);
    await tools.finish_check_in();
    expect(c.finish).toHaveBeenCalledOnce();
    expect(c.answers).toMatchObject({ reason: 'My chest feels tight', onset: null, trend: null });
  });
  it('caps follow-ups at two even when the patient corrects the complaint', async () => {
    const c = mockController(); c.name = 'Anna';
    const fetcher = vi.fn().mockImplementation(async () => new Response('{"question":"Where is the chest tightness?","source":"gemini"}'));
    const tools = createCheckInTools(() => c, fetcher);
    for (const reason of ['Chest tightness', 'Chest tightness after walking']) {
      await tools.save_answers({ reason }); await tools.get_follow_up_question();
      await tools.save_follow_up({ question: 'Where is the chest tightness?', answer: 'In the middle' });
    }
    await tools.save_answers({ reason: 'Chest tightness after walking upstairs' });
    expect(await tools.get_follow_up_question()).toMatch(/limit|wrap up/i);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(await tools.finish_check_in()).toContain('Queue number 3');
  });
  it('fills the shared controller, scans, asks one follow-up and returns the actual queue number', async () => {
    const controller = mockController();
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('{"question":"Where is the tightness?","source":"gemini"}'));
    const tools = createCheckInTools(() => controller, fetcher);
    expect(await tools.set_name({ name: ' Ama ' })).toContain('Ama');
    expect(controller.setName).toHaveBeenCalledWith('Ama');
    expect(await tools.start_face_scan()).toMatch(/^saved Next:/);
    expect(controller.startFaceScan).toHaveBeenCalledOnce();
    expect(await tools.save_answers({ reason: 'My chest feels tight', onset: 'since this morning', trend: 'getting worse' })).toContain('saved');
    expect(controller.answers).toMatchObject({ reason: 'My chest feels tight', onset: 'today', trend: 'worse', via: 'voice' });
    expect(await tools.get_follow_up_question()).toContain('Where is the tightness?');
    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toMatchObject({ answers: { reason: 'My chest feels tight', via: 'voice' } });
    expect(await tools.save_follow_up({ question: 'Where is the tightness?', answer: 'Nothing else' })).toContain('saved');
    expect(controller.setFollowUp).toHaveBeenCalledWith('Where is the tightness?', 'Nothing else');
    expect(await tools.finish_check_in()).toMatch(/^Queue number 3\. Please take a seat — Crisp will call you\. Next:/);
    expect(controller.finish).toHaveBeenCalledOnce();
  });
  it.each(['June 15th 1994', '15 June 1994', 'June fifteenth 1994', '15/6/94'])('normalizes spoken date %s in the tool itself', async dateOfBirth => {
    const controller = mockController();
    const result = await createCheckInTools(() => controller).set_patient_details({ dateOfBirth, phone: '202-555-0100' });
    expect(controller.answers.dateOfBirth).toBe('1994-06-15');
    expect(result).toMatch(/Next:.*face scan/i);
  });
  it('gives spoken guidance for ambiguous and impossible dates without changing saved details', async () => {
    const controller = mockController(); controller.answers.dateOfBirth = '1994-06-15';
    const tools = createCheckInTools(() => controller);
    for (const dateOfBirth of ['6/7/94', 'February 30th 1994']) {
      const result = await tools.set_patient_details({ dateOfBirth });
      expect(result).toMatch(/Next:/);
      expect(result).not.toContain('YYYY-MM-DD');
      expect(controller.answers.dateOfBirth).toBe('1994-06-15');
    }
  });
  it('collects DOB and phone without guessing and preserves them on answer corrections', async () => {
    const controller = mockController();
    const tools = createCheckInTools(() => controller);
    await tools.set_name({ name: 'Ama' });
    expect(await tools.set_patient_details({ dateOfBirth: '1995-05-14', phone: '+1 202-555-0100' })).toContain('saved');
    expect(controller.answers).toMatchObject({ dateOfBirth: '1995-05-14', phone: '+1 202-555-0100' });
    expect(await tools.set_patient_details({ dateOfBirth: '1995-02-30' })).toContain('date of birth');
    expect(controller.answers.dateOfBirth).toBe('1995-05-14');
    await tools.save_answers({ reason: 'Headache', onset: 'today', trend: 'same' });
    expect(controller.answers.phone).toBe('+1 202-555-0100');
  });
  it('requires the follow-up tool before saving or finishing and rejects an invented question', async () => {
    const controller = mockController(); controller.name = 'Ama';
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => new Response('{"question":"Where is the tightness?","source":"gemini"}'));
    const tools = createCheckInTools(() => controller, fetcher);
    await tools.save_answers({ reason: 'Chest tightness', onset: 'today', trend: 'worse' });
    expect(await tools.save_follow_up({ question: 'Invented?', answer: 'No' })).toContain('get_follow_up_question');
    expect(await tools.finish_check_in()).toContain('get_follow_up_question');
    expect(controller.finish).not.toHaveBeenCalled();
    expect(await tools.get_follow_up_question()).toContain('Where is the tightness?');
    expect(controller.followUpPrompt).toMatchObject({ source: 'gemini', why: 'Because you mentioned “Chest tightness”.' });
    expect(await tools.save_follow_up({ question: 'Invented?', answer: 'No' })).toContain('returned question');
    expect(controller.setFollowUp).not.toHaveBeenCalled();
    expect(await tools.save_follow_up({ question: 'Where is the tightness?', answer: 'In the middle' })).toContain('saved');
    await tools.finish_check_in();
    expect(controller.finish).toHaveBeenCalledOnce();
  });
  it('requests a fresh follow-up after a complaint correction', async () => {
    const controller = mockController(); controller.name = 'Ama';
    const tools = createCheckInTools(() => controller, vi.fn().mockImplementation(async () => new Response('{"question":"Where?","source":"template"}')));
    await tools.save_answers({ reason: 'Headache', onset: 'today', trend: 'same' });
    await tools.get_follow_up_question();
    await tools.save_answers({ reason: 'Ankle injury' });
    expect(await tools.finish_check_in()).toContain('get_follow_up_question');
    expect(controller.finish).not.toHaveBeenCalled();
  });
  it('returns scan failures and does not invent unsupported answer chips', async () => {
    const controller = mockController();
    vi.mocked(controller.startFaceScan).mockResolvedValue({ ok: false, reason: 'Only one person please' });
    const tools = createCheckInTools(() => controller);
    expect(await tools.start_face_scan()).toMatch(/^Only one person please Next:/);
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
    const controller = mockController(); controller.name = 'Ama'; controller.answers.reason = 'Headache'; controller.answers.onset = 'today'; controller.answers.trend = 'same';
    const tools = createCheckInTools(() => controller, vi.fn().mockRejectedValue(new Error('offline')));
    expect(await tools.get_follow_up_question()).toContain('headache');
    vi.mocked(controller.finish).mockRejectedValueOnce(new Error('offline'));
    expect(await tools.finish_check_in()).toContain('try');
  });
});
