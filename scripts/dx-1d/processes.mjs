// External OS observation, not a Renderer hook. Only record/clean descendants of our CLI.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec=promisify(execFile);
export async function processes(){
  if(process.platform==='win32'){
    const {stdout}=await exec('powershell.exe',['-NoProfile','-Command',"Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,CreationDate | ConvertTo-Json -Compress"],{windowsHide:true,maxBuffer:4*1024*1024,timeout:10000});
    return JSON.parse(stdout).map(p=>({pid:p.ProcessId,parent:p.ParentProcessId,name:p.Name,created:String(p.CreationDate)}));
  }
  const {stdout}=await exec('ps',['-eo','pid=,ppid=,comm='],{timeout:10000});
  return stdout.trim().split('\n').map(line=>{const [pid,parent,...name]=line.trim().split(/\s+/);return {pid:Number(pid),parent:Number(parent),name:name.join(' '),created:null};});
}
export function descendants(snapshot,root,known=new Map()){
  const activeKnown=[...known.values()].filter(k=>snapshot.some(p=>p.pid===k.pid&&p.created===k.created));
  const owners=new Set([root,...activeKnown.map(p=>p.pid)]);let changed=true;
  while(changed){changed=false;for(const p of snapshot)if(owners.has(p.parent)&&!owners.has(p.pid)){owners.add(p.pid);changed=true;}}
  for(const p of snapshot)if(owners.has(p.pid)&&p.pid!==root)known.set(p.pid,p);return known;
}
export const browsers=rows=>rows.filter(p=>/chrome|chromium|msedge/i.test(p.name));
export async function cleanupOwned(rows){
  const now=await processes(),killed=[];
  for(const p of rows)if(now.some(n=>n.pid===p.pid&&n.created===p.created)){
    try{if(process.platform==='win32')await exec('taskkill',['/PID',String(p.pid),'/T','/F'],{windowsHide:true});else process.kill(p.pid,'SIGKILL');killed.push(p.pid);}catch{}
  }return killed;
}
