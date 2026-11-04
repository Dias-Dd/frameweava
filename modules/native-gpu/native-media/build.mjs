import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';import {createHash} from 'node:crypto';
const source=dirname(fileURLToPath(import.meta.url)),root=resolve(source,'../../..'),work=join(root,'.frameweave/native-media'),runtime=join(work,'runtime');
if(process.platform!=='win32')throw Error('E_NATIVE_MEDIA_PLATFORM: this explicit helper build targets Windows only');
const diagnostic=process.argv.includes('--diagnostics');if(process.argv.slice(3).some(a=>a!=='--diagnostics'))throw Error('Unknown build option');const env=process.argv[2];if(!env||!existsSync(env))throw Error('Pass the existing MSVC vcvars64.bat path; no tool downloads');
const sha=b=>createHash('sha256').update(b).digest('hex'),upstream=JSON.parse(readFileSync(join(source,'upstream.json')));
for(const f of upstream.files)if(sha(readFileSync(join(source,f.file)))!==f.sha256)throw Error('E_NATIVE_MEDIA_SOURCE_INTEGRITY: '+f.file);
mkdirSync(runtime,{recursive:true});
const shader=readFileSync(join(source,'video.hlsl'),'utf8');writeFileSync(join(work,'video-shader.generated.h'),'static const char video_shader[]=R"fwshader('+shader+')fwshader";\n');
const cmd=join(work,'build-runtime.cmd');
writeFileSync(cmd,['@echo off','call "'+resolve(env)+'" >nul','if errorlevel 1 exit /b 1',
 'cl.exe /nologo /std:c++17 /O2 /EHsc /LD '+(diagnostic?'/DFRAMEWEAVE_MEDIA_DIAGNOSTICS=1 ':'')+'"'+join(source,'bridge.cpp')+'" /I"'+work+'" /Fo"'+join(work,'bridge.obj')+'" /link mfplat.lib mfreadwrite.lib mfuuid.lib d3d11.lib dxgi.lib d3dcompiler.lib ole32.lib /OUT:"'+join(runtime,'frameweave_media.dll')+'" /IMPLIB:"'+join(work,'frameweave_media.lib')+'"'].join('\r\n'));
const started=performance.now(),r=spawnSync(process.env.ComSpec??'cmd.exe',['/d','/c',cmd],{cwd:root,windowsHide:true,stdio:'inherit'});
if(r.error)throw r.error;if(r.status!==0)process.exit(r.status??1);
const inputs=['bridge.cpp','bridge.h','encoder.h','file-stream.h','video.hlsl','upstream.json','vendor/nvEncodeAPI.h','build.mjs'];
writeFileSync(join(runtime,'media-runtime.json'),JSON.stringify({version:1,abi:1,trusted_local:true,features:diagnostic?['diagnostics']:[],files:{'frameweave_media.dll':sha(readFileSync(join(runtime,'frameweave_media.dll')))},sourceHashes:Object.fromEntries(inputs.map(f=>[f,sha(readFileSync(join(source,f)))])),wallMs:performance.now()-started},null,2)+'\n');
console.log(JSON.stringify({version:1,runtime,wallMs:performance.now()-started}));
