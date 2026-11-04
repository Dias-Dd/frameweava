import{spawnSync}from'node:child_process';import{resolve}from'node:path';import{homedir}from'node:os';
const out=resolve('.frameweave/servo-authoring/capacity-tests.exe'),rustc=resolve(homedir(),'.cargo/bin/rustc.exe');
for(const [exe,args]of [[rustc,['--edition=2024','--test','modules/servo/native/capacity.rs','-o',out]],[out,[]]]){const r=spawnSync(exe,args,{stdio:'inherit',windowsHide:true});if(r.status!==0)process.exit(r.status??1);}
