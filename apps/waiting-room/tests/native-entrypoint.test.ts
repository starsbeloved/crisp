import { spawnSync } from 'node:child_process';
import { expect, it } from 'vitest';
it('loads the actual server dependency graph with native Node TypeScript stripping',()=>{
  const result=spawnSync(process.execPath,['-e',"import('./server/http.ts').then(()=>console.log('native-import-ok'))"],{cwd:process.cwd(),encoding:'utf8',timeout:10000});
  expect(result.status,result.stderr).toBe(0);
  expect(result.stdout).toContain('native-import-ok');
});
