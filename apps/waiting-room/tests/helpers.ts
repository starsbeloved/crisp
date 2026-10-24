import type { Server } from 'node:http';
export async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', () => { server.off('error', reject); resolve(); }); });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected TCP address');
  return `http://127.0.0.1:${address.port}`;
}
export async function rawRequest(url: string, headers: Record<string,string>): Promise<{ status: number; body: unknown }> {
  const { request } = await import('node:http');
  return new Promise((resolve, reject) => {
    const req = request(url, { method: 'POST', headers }, res => { let body = ''; res.setEncoding('utf8'); res.on('data', chunk => { body += chunk; }); res.on('end', () => resolve({ status: res.statusCode!, body: JSON.parse(body) })); });
    req.on('error', reject); req.end('{}');
  });
}
