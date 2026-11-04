import {spawnSync} from 'node:child_process';import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'../../..'),r=spawnSync(resolve(root,'.frameweave/pa3-shaping/python/Scripts/python.exe'),['modules/pro-animation/validation/prepare-vertical-fixtures.py'],{cwd:root,stdio:'inherit',windowsHide:true});if(r.error)throw r.error;process.exitCode=r.status??1;
