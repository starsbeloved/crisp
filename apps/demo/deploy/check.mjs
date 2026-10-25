import { pathToFileURL } from 'node:url';

/** Read-only checks. Never create patients, submit frames, or call providers. */
export async function checkDeployment(origin, { timeoutMs = 10_000 } = {}) {
  const targetError = 'Use an HTTPS origin (or HTTP localhost for local testing), with no credentials, path, query or fragment.';
  let target;
  try { target = new URL(origin); } catch { throw new Error(targetError); }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(target.hostname);
  if (!(target.protocol === 'https:' || (target.protocol === 'http:' && local)) ||
      target.username || target.password || target.pathname !== '/' || target.search || target.hash) {
    throw new Error(targetError);
  }

  async function get(path, inspect) {
    let response;
    try {
      response = await fetch(new URL(path, target), {
        signal: AbortSignal.timeout(timeoutMs), redirect: 'error',
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await inspect(response);
    } catch (error) {
      // Do not echo response bodies, room state, provider data, or target credentials.
      const message = error.name === 'TimeoutError' || error.name === 'AbortError' || error instanceof TypeError
        ? 'request failed or timed out' : error.message;
      throw new Error(`${path}: ${message}`);
    } finally {
      if (response?.body && !response.body.locked) await response.body.cancel();
    }
  }
  const hasType = (response, type) => (response.headers.get('content-type') || '').toLowerCase().includes(type);
  const messages = [];
  await get('/api/health', async response => {
    if (!hasType(response, 'application/json')) throw new Error('expected JSON');
    let health;
    try { health = await response.json(); } catch { throw new Error('expected JSON'); }
    if (health?.ok !== true || !Number.isFinite(health.serverNow)) throw new Error('API is not healthy');
  });
  messages.push('API: healthy');

  const bundles = new Set();
  for (const path of ['/', '/check-in', '/camera', '/dashboard', '/lobby', '/station', '/room', '/exam']) {
    await get(path, async response => {
      if (!hasType(response, 'text/html')) throw new Error('expected HTML');
      const html = await response.text();
      const bundle = html.match(/<script\b[^>]*\bsrc=["'](\/assets\/[^"']+\.js)["']/i)?.[1];
      if (!bundle) throw new Error('expected a production /assets/*.js module');
      bundles.add(bundle);
    });
  }
  for (const path of bundles) {
    await get(path, async response => {
      if (!hasType(response, 'javascript')) throw new Error('expected JavaScript');
      if (!(await response.text()).trim()) throw new Error('empty JavaScript bundle');
    });
  }
  messages.push('Client: built routes and JavaScript served');

  const state = await get('/api/events', async response => {
    if (!hasType(response, 'text/event-stream')) throw new Error('expected SSE');
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let pending = '';
    try {
      while (pending.length < 5_000_000) {
        const { value, done } = await reader.read();
        if (done) break;
        pending += decoder.decode(value, { stream: true });
        let end;
        while ((end = pending.search(/\r?\n\r?\n/)) >= 0) {
          const event = pending.slice(0, end);
          pending = pending.slice(end).replace(/^\r?\n\r?\n/, '');
          if (!/^event: state\r?$/m.test(event)) continue;
          let state;
          try { state = JSON.parse(event.match(/^data: (.+)\r?$/m)?.[1] || ''); }
          catch { throw new Error('invalid room state'); }
          if (!Array.isArray(state?.visits) || !Number.isFinite(state.serverNow)) throw new Error('invalid room state');
          return state;
        }
      }
      throw new Error('no room state received');
    } finally { await reader.cancel(); }
  });
  messages.push('SSE: received a room state');

  if (Date.now() - state.cameras?.A?.lastFrameAt < 5000) {
    await get('/api/stream.mjpg?cam=A', response => {
      if (!hasType(response, 'multipart/x-mixed-replace') || !/boundary=/i.test(response.headers.get('content-type'))) {
        throw new Error('expected MJPEG');
      }
    });
    messages.push('MJPEG: headers received (live frames still need a camera)');
  } else messages.push('MJPEG: NOT CHECKED (start camera A, then rerun)');
  return messages;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  checkDeployment(process.argv[2]).then(messages => {
    for (const message of messages) console.log(`${message.includes('NOT CHECKED') ? 'SKIP' : 'PASS'} ${message}`);
    console.log('Still required: browser HTTPS, camera/mic, models, sound and live video checks in docs/deploy-vultr.md.');
  }).catch(error => {
    console.error(`FAIL ${error.message}`);
    process.exitCode = 1;
  });
}
