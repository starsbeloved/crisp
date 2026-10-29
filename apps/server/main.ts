import { createAppServer } from './http.ts';
const port = Number(process.env.API_PORT || 8787);
const host = process.env.HOST || '127.0.0.1';
const { server, store } = createAppServer();
server.listen(port, host, () => console.log(`Crisp API listening on http://${host}:${port}`));
server.on('error', error => { console.error(error.message); process.exitCode = 1; });
function stop() { store.flush(); server.close(); server.closeAllConnections(); }
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
