// Filming mode: API server without file watching + the optimized client build.
import { spawn } from 'node:child_process';
const run = (cmd, args) => spawn(cmd, args, { stdio: 'inherit', env: process.env });
const children = [run('node', ['server/main.ts']), run('npx', ['vite', 'preview'])];
const stop = () => { for (const child of children) child.kill('SIGTERM'); process.exit(0); };
process.on('SIGINT', stop); process.on('SIGTERM', stop);
for (const child of children) child.on('exit', code => { if (code) stop(); });
