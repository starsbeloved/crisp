import { spawn } from 'node:child_process';
// Local processes only, no runtime download, tunnel or LAN exposure.
const children = [spawn(process.execPath, ['--watch','server/main.ts'], { stdio: 'inherit' }), spawn(process.execPath, ['node_modules/vite/bin/vite.js'], { stdio: 'inherit' })];
let stopping = false;
function stop(code = 0) { if (stopping) return; stopping = true; process.exitCode = code; for (const child of children) child.kill('SIGTERM'); }
for (const child of children) { child.on('error', e => { console.error(e.message); stop(1); }); child.on('exit', code => { if (!stopping) stop(code ?? 1); }); }
process.once('SIGINT', () => stop()); process.once('SIGTERM', () => stop());
