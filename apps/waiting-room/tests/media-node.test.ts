import { execFileSync } from 'node:child_process';
import { expect,it } from 'vitest';
it('loads the signaling broker in the same strip-only Node runtime as the development server',()=>{
  const output=execFileSync(process.execPath,['--input-type=module','--eval',"import {createMediaBroker} from './server/media.ts'; const b=createMediaBroker(); b.handle('station',{action:'register',clientId:'vision',role:'publisher'}); console.log(JSON.stringify(b.handle('station',{action:'register',clientId:'staff',role:'receiver'})));"],{encoding:'utf8'});
  expect(JSON.parse(output).events).toMatchObject([{type:'peer',peerId:'vision',role:'publisher'}]);
});
