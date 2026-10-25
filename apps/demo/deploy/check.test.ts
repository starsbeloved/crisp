import { createServer, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { checkDeployment } from './check.mjs';

const servers: ReturnType<typeof createServer>[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => {
    server.closeAllConnections();
    server.close(() => resolve());
  })));
});

// A real HTTP boundary catches stripped /api prefixes, SPA fallbacks for assets,
// buffered streams, and false-positive health checks without touching demo data.
async function fixture(override?: (path: string, response: ServerResponse) => boolean) {
  const requests: string[] = [];
  const server = createServer((request, response) => {
    const path = request.url!;
    requests.push(`${request.method} ${path}`);
    if (override?.(path, response)) return;
    if (path === '/api/health') {
      response.setHeader('Content-Type', 'application/json');
      response.end('{"ok":true,"serverNow":123}');
    } else if (path === '/api/events') {
      response.setHeader('Content-Type', 'text/event-stream');
      response.write(`: heartbeat\n\nevent: state\ndata: ${JSON.stringify({ visits: [], serverNow: 123, cameras: { A: { lastFrameAt: Date.now() } } })}\n\n`);
    } else if (path === '/api/stream.mjpg?cam=A') {
      response.setHeader('Content-Type', 'multipart/x-mixed-replace; boundary=frame');
      response.flushHeaders();
    } else if (path === '/assets/app.js') {
      response.setHeader('Content-Type', 'text/javascript');
      response.end('console.log("fixture bundle");');
    } else {
      response.setHeader('Content-Type', 'text/html');
      response.end('<!doctype html><div id="root"></div><script type="module" src="/assets/app.js"></script>');
    }
  });
  servers.push(server);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  return { origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, requests };
}

describe('deployment smoke check', () => {
  it('checks built deep links, API, SSE data and MJPEG headers using only GET', async () => {
    const { origin, requests } = await fixture();
    const messages = await checkDeployment(origin);
    expect(messages).toContain('SSE: received a room state');
    expect(messages).toContain('MJPEG: headers received (live frames still need a camera)');
    for (const path of ['/check-in', '/camera', '/dashboard', '/lobby', '/station', '/room', '/exam']) {
      expect(requests).toContain(`GET ${path}`);
    }
    expect(requests).toContain('GET /assets/app.js');
    expect(requests.every(request => request.startsWith('GET '))).toBe(true);
  });

  it.each(['http://example.com', 'ftp://localhost', 'https://user:password@example.com',
    'https://example.com/subpath', 'https://example.com/?key=value', 'https://example.com/#fragment'])
  ('rejects an unsafe or non-origin target: %s', async target => {
    await expect(checkDeployment(target)).rejects.toThrow('Use an HTTPS origin');
  });

  it('rejects an API request accidentally rewritten to the SPA', async () => {
    const { origin } = await fixture((path, response) => {
      if (path !== '/api/health') return false;
      response.setHeader('Content-Type', 'text/html');
      response.end('<html>not the API</html>');
      return true;
    });
    await expect(checkDeployment(origin)).rejects.toThrow('/api/health: expected JSON');
  });

  it('rejects a false health response without printing its contents', async () => {
    const { origin } = await fixture((path, response) => {
      if (path !== '/api/health') return false;
      response.setHeader('Content-Type', 'application/json');
      response.end('{"ok":false,"private":"do not print"}');
      return true;
    });
    await expect(checkDeployment(origin)).rejects.toThrow('/api/health: API is not healthy');
  });

  it('rejects a deep link that is not served', async () => {
    const { origin } = await fixture((path, response) => {
      if (path !== '/exam') return false;
      response.writeHead(404); response.end('missing'); return true;
    });
    await expect(checkDeployment(origin)).rejects.toThrow('/exam: HTTP 404');
  });

  it('rejects a module path that falls back to HTML', async () => {
    const { origin } = await fixture((path, response) => {
      if (path !== '/assets/app.js') return false;
      response.setHeader('Content-Type', 'text/html');
      response.end('<html>wrong fallback</html>'); return true;
    });
    await expect(checkDeployment(origin)).rejects.toThrow('/assets/app.js: expected JavaScript');
  });

  it('reads an SSE event split across network writes', async () => {
    const { origin } = await fixture((path, response) => {
      if (path !== '/api/events') return false;
      response.setHeader('Content-Type', 'text/event-stream');
      response.write(': heartbeat\r\n\r\nevent: sta');
      setImmediate(() => response.write('te\r\ndata: {"visits":[],"serverNow":123}\r\n\r\n'));
      return true;
    });
    await expect(checkDeployment(origin)).resolves.toContain('SSE: received a room state');
  });

  it('fails promptly when SSE headers arrive but no state is flushed', async () => {
    const { origin } = await fixture((path, response) => {
      if (path !== '/api/events') return false;
      response.setHeader('Content-Type', 'text/event-stream');
      response.flushHeaders(); return true;
    });
    await expect(checkDeployment(origin, { timeoutMs: 150 })).rejects.toThrow('/api/events: request failed or timed out');
  });

  it('rejects an SSE response without a room state', async () => {
    const { origin } = await fixture((path, response) => {
      if (path !== '/api/events') return false;
      response.setHeader('Content-Type', 'text/event-stream');
      response.end('event: state\ndata: {"wrong":true}\n\n'); return true;
    });
    await expect(checkDeployment(origin)).rejects.toThrow('/api/events: invalid room state');
  });

  it('rejects MJPEG rewritten to a non-stream response', async () => {
    const { origin } = await fixture((path, response) => {
      if (path !== '/api/stream.mjpg?cam=A') return false;
      response.setHeader('Content-Type', 'text/html');
      response.end('not a stream'); return true;
    });
    await expect(checkDeployment(origin)).rejects.toThrow('/api/stream.mjpg?cam=A: expected MJPEG');
  });

  it.each([undefined, { A: { lastFrameAt: Date.now() - 60_000 } }])
  ('reports video as not checked when camera A has no fresh frame: %j', async cameras => {
    const { origin, requests } = await fixture((path, response) => {
      if (path !== '/api/events') return false;
      response.setHeader('Content-Type', 'text/event-stream');
      response.write(`event: state\ndata: ${JSON.stringify({ visits: [], serverNow: 123, cameras })}\n\n`);
      return true;
    });
    const messages = await checkDeployment(origin);
    expect(messages).toContain('MJPEG: NOT CHECKED (start camera A, then rerun)');
    expect(requests).not.toContain('GET /api/stream.mjpg?cam=A');
  });
});
