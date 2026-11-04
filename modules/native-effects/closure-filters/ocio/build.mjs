import {spawnSync} from 'node:child_process';
import {join,resolve} from 'node:path';
import {homedir} from 'node:os';
import {mkdirSync,existsSync} from 'node:fs';
const root=resolve('.'),cargo=process.env.CARGO??join(homedir(),'.cargo/bin/cargo.exe');
let drive,shortRoot=root;
if(process.platform==='win32'&&root.length>100){for(const letter of ['Q','R','S','T','U','V','W','X','Y','Z']){if(existsSync(letter+':/'))continue;const r=spawnSync('subst',[letter+':',root],{windowsHide:true});if(r.status===0){drive=letter+':';shortRoot=drive+'/';break;}}if(!drive)throw Error('Need a shorter path for the isolated compiler target');}
try{mkdirSync(join(root,'.frameweave/ocio-target'),{recursive:true});const r=spawnSync(cargo,['build','--locked','--release','--manifest-path','modules/native-effects/closure-filters/ocio/compiler/Cargo.toml'],{cwd:shortRoot,stdio:'inherit',windowsHide:true,env:{...process.env,CARGO_TARGET_DIR:join(shortRoot,'.frameweave/ocio-target')}});if(r.error)throw r.error;process.exitCode=r.status??1;}finally{if(drive)spawnSync('subst',[drive,'/d'],{windowsHide:true});}
