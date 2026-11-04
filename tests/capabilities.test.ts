import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,readFile,writeFile,rm,cp,appendFile,realpath} from 'node:fs/promises';
import {join,dirname,resolve} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {engineRoot} from '../src/compiler/build.ts';
import {projectPlugins,writeLock,readLock} from '../src/plugins/registry.ts';
import {searchPlugins} from '../src/plugins/search.ts';
import {createPlugin,installUserPlugins} from '../src/plugins/library.ts';
import {installPackages,installedPackages} from '../src/packages/manager.ts';
import {officialCatalog} from '../src/packages/official-catalog.ts';
import {searchCapabilities,inspectCapability,capabilityExamples} from '../src/capabilities/index.ts';
import {capabilitiesCLI,runCapabilitiesCLI} from '../src/capabilities/cli.ts';
import {agentResult} from '../src/agent/result.ts';
import {EngineError} from '../src/core/errors.ts';

const parent=join(engineRoot,'.frameweave/acl-1-tests'),proof=join(engineRoot,'artifacts/acl-1'),dirs:string[]=[],exec=promisify(execFile),cli=join(engineRoot,'src/cli.ts');
let project:string,source:string,wasmSetup:Promise<string>|undefined;
const originalHome=process.env.FRAMEWEAVE_HOME;
const json=async(path:string)=>JSON.parse(await readFile(path,'utf8'));
async function temp(){await mkdir(parent,{recursive:true});const dir=await mkdtemp(join(parent,'case-'));dirs.push(dir);return dir;}
async function command(args:string[],env:NodeJS.ProcessEnv=process.env){try{const r=await exec(process.execPath,['--import','tsx',cli,...args],{cwd:engineRoot,env,windowsHide:true,timeout:90000,maxBuffer:1024*1024});return {exit:0,stdout:r.stdout,stderr:r.stderr,value:JSON.parse(r.stdout)};}catch(e){const r=e as any;return {exit:r.code,stdout:r.stdout,stderr:r.stderr,value:JSON.parse(r.stdout)};}}
function wasmFixture(){
  return wasmSetup??=(async()=>{
    const directory=await temp();
    await installPackages(directory,[join(engineRoot,'examples/rust-bindgen/lyon')],{trust:['local:frameweave.examples']});
    await writeLock(directory);
    return directory;
  })();
}
before(async()=>{
  const home=originalHome??join(engineRoot,'.frameweave/user-home');await mkdir(home,{recursive:true});
  process.env.FRAMEWEAVE_HOME=home;
  await mkdir(proof,{recursive:true});project=await temp();source=join(project,'plugins/example');await createPlugin(source,{id:'acl.example',description:'A small deterministic orbital example'});
  const manifest=await json(join(source,'effect.json'));manifest.engine='native-gpu';manifest.examples=["plugin('acl.example@1.0.0', {speed:2})"];await writeFile(join(source,'effect.json'),JSON.stringify(manifest));
  await writeFile(join(project,'frameweave.plugins.json'),JSON.stringify({schemaVersion:1,roots:['./plugins'],userLibrary:false}));await writeLock(project);
});
after(async()=>{if(originalHome===undefined)delete process.env.FRAMEWEAVE_HOME;else process.env.FRAMEWEAVE_HOME=originalHome;for(const dir of dirs){assert.equal(dirname(resolve(dir)),resolve(parent));await rm(dir,{recursive:true,force:true});}});

test('keyword results and scores are projections of existing P4 search, including typo/filter semantics',async()=>{
  const registry=(await projectPlugins(project)).registry;
  for(const query of ['particls','glow','orbital']){const expected=await searchPlugins(registry,query,{engine:'native-gpu'},{mode:'keyword',limit:5}),actual=await searchCapabilities({project,query,mode:'keyword',limit:5,filters:{engine:'native-gpu'}});
    assert.deepEqual(actual.items.map(r=>[r.identity.reference,r.ranking.score]),expected.map(r=>[`${r.record.manifest.id}@${r.record.manifest.version}`,r.score]));}
});

test('stable exact identity, hashes, lock verification and repeated query JSON are deterministic',async()=>{
  const a=await searchCapabilities({project,query:'orbital'}),b=await searchCapabilities({project,query:'orbital'});assert.equal(JSON.stringify(a),JSON.stringify(b));
  const item=a.items.find(r=>r.identity.reference==='acl.example@1.0.0')!;assert.equal(item.availability.state,'eligible');assert.equal(item.availability.runtimeVerified,false);assert.equal(item.locks.plugin,'verified');
  const info=await inspectCapability(item.identity.reference,{project,expectedIntegrity:item.identity.integrity});assert.deepEqual(info.identity,item.identity);assert.equal(info.parameters.schemaVersion,1);assert.equal(info.parameters.definitions.speed.default,1);assert.equal(info.api.state,'missing');
  await assert.rejects(()=>inspectCapability('acl.example',{project}),{code:'E_PLUGIN_VERSION'});
  await assert.rejects(()=>inspectCapability(item.identity.reference,{project,expectedIntegrity:'sha256-'+'0'.repeat(64)}),{code:'E_PACKAGE_INTEGRITY'});
});

test('R1 installed WASM exposes nested Schema v2, generated real types, verified resources and authored TSX',async()=>{
  const wasmProject=await wasmFixture();
  const installed=await installedPackages(wasmProject),record=installed.records[0],ref='kit.bindgen-lyon@1.0.0',info=await inspectCapability(ref,{project:wasmProject});
  assert.equal(info.identity.integrity,'sha256-'+record.integrity);assert.equal(info.identity.integrityKind,'package');assert.equal(info.identity.pluginIntegrity,'sha256-'+(await projectPlugins(wasmProject)).registry.get(ref).integrity);
  assert.equal(info.locks.package,'verified');assert.equal(info.locks.plugin,'verified');assert.equal(info.trust.state,'approved');assert.equal(info.parameters.schemaVersion,2);
  const shape=info.parameters.definitions.shape as any;assert.equal(shape.properties.scale.default,.8);assert.equal(shape.properties.coordinates.maxItems,256);
  assert.equal(info.api.state,'present');assert.ok(info.api.functions!.some(f=>f.name==='tessellate'&&f.signature.includes('Float32Array')));assert.deepEqual(info.execution.hostAuthorization,['allowWasm']);assert.equal(info.execution.worker.moduleSupport,true);assert.equal(info.execution.worker.hostSupport,'not-probed');
  assert.ok(info.resources.length>=5);assert.ok(info.resources.every(r=>/^sha256-[a-f0-9]{64}$/.test(r.integrity)));
  const examples=await capabilityExamples(ref,{project:wasmProject,expectedIntegrity:info.identity.integrity});assert.equal(examples.items[0].completeProject,true);assert.match(examples.items[0].code,/kit.bindgen-lyon@1.0.0/);assert.equal(examples.items[0].validation.typescript,'passed');
  await writeFile(join(proof,'inspect-wasm.json'),JSON.stringify(info,null,2));await writeFile(join(proof,'examples-wasm.json'),JSON.stringify(examples,null,2));
});

test('explicit local catalogs remain uninstalled/unapproved; queries do not write project state or grant WASM',async()=>{
  const empty=await temp(),catalog=join(engineRoot,'examples/rust-bindgen');const result=await searchCapabilities({project:empty,catalogs:[catalog],query:'lyon'});
  assert.deepEqual(result.items,[]);
  const item=await inspectCapability('kit.bindgen-lyon@1.0.0',{project:empty,catalogs:[catalog]});
  assert.equal(item.availability.installed,false);assert.equal(item.availability.state,'blocked');assert.equal(item.trust.state,'approval-required');assert.equal(item.locks.package,'not-installed');assert.equal(item.commands.install,null);
  assert.deepEqual((await installedPackages(empty)).records,[]);await assert.rejects(()=>readFile(join(empty,'frameweave.packages.json')),{code:'ENOENT'});
  const wasmProject=await wasmFixture(),before=await readFile(join(wasmProject,'frameweave.packages.json')),lock=await readFile(join(wasmProject,'frameweave.plugins.lock.json'));
  await searchCapabilities({project:wasmProject,query:'lyon'});assert.deepEqual(await readFile(join(wasmProject,'frameweave.packages.json')),before);assert.deepEqual(await readFile(join(wasmProject,'frameweave.plugins.lock.json')),lock);
  const denied=await capabilitiesCLI(['inspect','kit.bindgen-lyon@1.0.0','--project',wasmProject,'--allow-wasm']);assert.equal(denied.ok,false);
  await writeFile(join(proof,'search-local.json'),JSON.stringify(result,null,2));
});

test('missing dependencies and unsupported platforms are explicit, not executable availability',async()=>{
  const directory=await temp(),plugin=join(directory,'plugins/needs');await createPlugin(plugin,{id:'acl.needs'});const m=await json(join(plugin,'effect.json'));m.engine='native-gpu';m.dependencies={'acl.absent':'^1.0.0'};await writeFile(join(plugin,'effect.json'),JSON.stringify(m));
  await writeFile(join(directory,'frameweave.plugins.json'),JSON.stringify({schemaVersion:1,roots:['plugins'],userLibrary:false}));const result=await searchCapabilities({project:directory,query:'acl.needs'});
  assert.equal(result.items[0].availability.state,'missing-dependencies');assert.equal(result.items[0].dependencies[0].state,'missing');
  const info=await inspectCapability('kit.bindgen-lyon@1.0.0',{project:await wasmFixture(),platform:'node'});assert.equal(info.availability.state,'blocked');assert.equal(info.assessment.compatible,false);assert.ok(info.assessment.diagnostics.some(d=>d.code==='E_PACKAGE_PLATFORM'));
  await assert.rejects(()=>inspectCapability('acl.unknown@1.0.0',{project}),{code:'E_PLUGIN_MISSING'});
});

test('required fields, nested defaults and optional metadata are returned from the authoritative manifest',async()=>{
  const directory=await temp(),plugin=join(directory,'plugins/structured');await createPlugin(plugin,{id:'acl.structured'});const m=await json(join(plugin,'effect.json'));
  m.parameterSchemaVersion=2;m.parameters={settings:{type:'object',properties:{count:{type:'number',minimum:1,maximum:3,required:true},points:{type:'array',default:[1,2],items:{type:'number'},maxItems:4}},required:['count'],additionalProperties:false}};
  await writeFile(join(plugin,'effect.json'),JSON.stringify(m));await writeFile(join(directory,'frameweave.plugins.json'),JSON.stringify({schemaVersion:1,roots:['plugins'],userLibrary:false}));
  const info=await inspectCapability('acl.structured@1.0.0',{project:directory});assert.deepEqual(info.parameters.definitions,m.parameters);assert.equal(info.examples.state,'missing');assert.equal(info.api.state,'missing');
});

test('examples are authored, exact-version, P4 validated and typechecked; missing examples are errors',async()=>{
  const good=await capabilityExamples('acl.example@1.0.0',{project});assert.equal(good.items[0].code,"plugin('acl.example@1.0.0', {speed:2})");assert.equal(good.items[0].completeProject,false);
  await assert.rejects(()=>capabilityExamples('fw.glow@1.0.0',{project}),{code:'E_CAPABILITY_EXAMPLES_MISSING'});
  const directory=await temp();await cp(source,join(directory,'candidate'),{recursive:true});await writeFile(join(directory,'frameweave.plugins.json'),JSON.stringify({schemaVersion:1,roots:['candidate'],userLibrary:false}));
  const file=join(directory,'candidate/effect.json'),m=await json(file);m.examples=["plugin('acl.example@9.0.0', {speed:2})"];await writeFile(file,JSON.stringify(m));await assert.rejects(()=>capabilityExamples('acl.example@1.0.0',{project:directory}),{code:'E_CAPABILITY_EXAMPLE_VERSION'});
  m.examples=["plugin('acl.example@1.0.0', {speed:'wrong'})"];await writeFile(file,JSON.stringify(m));await assert.rejects(()=>capabilityExamples('acl.example@1.0.0',{project:directory}),{code:'E_PLUGIN_PARAM'});
  m.examples=["plugin('acl.example@1.0.0', {speed:unknownCode()})"];await writeFile(file,JSON.stringify(m));await assert.rejects(()=>capabilityExamples('acl.example@1.0.0',{project:directory}),{code:'E_CAPABILITY_EXAMPLE_UNSUPPORTED'});
});

test('stale generated metadata and tampered R1 snapshots are rejected; stale locks stay stale',async()=>{
  const directory=await temp(),candidate=join(directory,'candidate');await cp(join(engineRoot,'examples/rust-bindgen/lyon'),candidate,{recursive:true,filter:p=>!p.split(/[\\/]/).includes('.frameweave')});
  const file=join(candidate,'generated/agent-api.json'),api=await json(file);api.functions[0].signature='calls(): string;';await writeFile(file,JSON.stringify(api));
  await assert.rejects(()=>inspectCapability('kit.bindgen-lyon@1.0.0',{project:directory,catalogs:[candidate]}),{code:'E_CAPABILITY_METADATA'});
  const p=await temp();await cp(source,join(p,'candidate'),{recursive:true});await writeFile(join(p,'frameweave.plugins.json'),JSON.stringify({schemaVersion:1,roots:['candidate'],userLibrary:false}));await writeLock(p);const locked=await readFile(join(p,'frameweave.plugins.lock.json'));await appendFile(join(p,'candidate/index.ts'),'\n// changed');
  const stale=await inspectCapability('acl.example@1.0.0',{project:p});assert.equal(stale.locks.plugin,'stale');assert.equal(stale.availability.state,'requires-lock');assert.deepEqual(await readFile(join(p,'frameweave.plugins.lock.json')),locked);
  const install=await temp();await installPackages(install,[join(engineRoot,'examples/rust-bindgen/bindings')],{trust:['local:frameweave.examples']});const state=await installedPackages(install);await appendFile(join(state.records[0].directory,'dist/worker.js'),'\n// changed');await assert.rejects(()=>searchCapabilities({project:install,query:'bindings'}),{code:'E_PACKAGE_INTEGRITY'});
});

test('shared service envelope and standalone CLI wiring preserve Diagnostic and deterministic JSON/exit code',async()=>{
  const result=await agentResult(async()=>{throw new EngineError('E_TEST','failure',{details:{path:'field'}});});assert.deepEqual(result,{schemaVersion:1,ok:false,data:null,diagnostics:[{code:'E_TEST',severity:'error',message:'failure',details:{path:'field'}}]});
  const output:string[]=[],errors:string[]=[],exits:number[]=[];await runCapabilitiesCLI(['inspect','unknown'],{stdout:t=>output.push(t),stderr:t=>errors.push(t),setExitCode:c=>exits.push(c)});assert.equal(JSON.parse(output.join('')).ok,false);assert.deepEqual(exits,[1]);assert.match(errors.join(''),/E_PLUGIN_VERSION/);
  const a=await command(['capabilities','search','orbital','--project',project,'--mode','keyword','--json']),b=await command(['capabilities','search','orbital','--project',project,'--mode','keyword','--json']);assert.equal(a.exit,0);assert.equal(a.stdout,b.stdout);assert.equal(a.stderr,'');assert.equal(a.value.schemaVersion,1);
  const failure=await command(['capabilities','inspect','acl.missing@1.0.0','--project',project,'--json']);assert.equal(failure.exit,1);assert.equal(failure.value.ok,false);assert.equal(failure.value.diagnostics[0].code,'E_PLUGIN_MISSING');
  for(const args of [['search','x','--mode','invalid'],['search','x','--limit','0'],['search','x','--limit','1.5'],['search','x','--json','--json'],['inspect','fw.glow@1.0.0','--all-docs']])assert.equal((await capabilitiesCLI(args)).ok,false);
});

test('actual cached P4 semantic model works offline and is never silently replaced with keyword search',{timeout:120000},async()=>{
  const query='轨道上的动画',filters={engine:'native-gpu'},existing=await searchPlugins((await projectPlugins(project)).registry,query,filters,{mode:'semantic',offline:true,limit:3});
  const result=await searchCapabilities({project,query,mode:'semantic',limit:3,filters});assert.deepEqual(result.items.map(r=>[r.identity.reference,r.ranking.score]),existing.map(r=>[`${r.record.manifest.id}@${r.record.manifest.version}`,r.score]));assert.ok(result.items.some(r=>r.identity.id==='acl.example'));assert.ok(result.items.every(r=>r.ranking.semanticScore!==null));
  await writeFile(join(proof,'semantic-cached.json'),JSON.stringify(result,null,2));
});

test('a genuinely empty model cache gives E_SEARCH_MODEL and a machine-readable keyword alternative',{timeout:120000},async()=>{
  const empty=await temp(),result=await command(['capabilities','search','unseen semantic cache query','--project',project,'--mode','semantic','--json'],{...process.env,FRAMEWEAVE_HOME:empty});
  assert.equal(result.exit,1);assert.equal(result.value.ok,false);const d=result.value.diagnostics[0];assert.equal(d.code,'E_SEARCH_MODEL');assert.equal(d.details.mode,'semantic');assert.ok(d.details.alternative.args.includes('keyword'));
  const keyword=await command(['capabilities','search','glow','--project',project,'--mode','keyword','--json'],{...process.env,FRAMEWEAVE_HOME:empty});assert.equal(keyword.exit,0);assert.equal(keyword.value.data.mode,'keyword');
  await writeFile(join(proof,'semantic-missing.json'),JSON.stringify(result.value,null,2));
});

test('retired user-library Web entries stay inspectable by exact identity but do not appear in search',async()=>{
  const saved=process.env.FRAMEWEAVE_HOME!,home=await mkdtemp(join(saved,'acl-provenance-')),directory=await temp(),author=join(directory,'author');
  process.env.FRAMEWEAVE_HOME=home;
  try{
    await createPlugin(author,{id:'acl.user-source'});
    const file=join(author,'effect.json'),manifest=await json(file);
    manifest.engine='web';await writeFile(file,JSON.stringify(manifest));
    await installUserPlugins(author);
    const result=await searchCapabilities({project:directory,query:'acl.user-source'});
    assert.deepEqual(result.items,[]);
    const archived=await inspectCapability('acl.user-source@1.0.0',{project:directory});
    assert.equal(archived.source.kind,'user');assert.equal(archived.trust.state,'not-recorded');assert.equal(archived.availability.state,'blocked');
  }
  finally{process.env.FRAMEWEAVE_HOME=saved;assert.equal(dirname(resolve(home)),resolve(saved));await rm(home,{recursive:true,force:true});}
});

test('resource-only R1 packages have explicit descriptor coverage, without an invented callable capability',async()=>{
  const directory=await temp(),pack=join(directory,'data');await mkdir(pack);await writeFile(join(pack,'data.txt'),'data');
  await writeFile(join(pack,'frameweave.package.json'),JSON.stringify({schemaVersion:1,apiVersion:1,id:'acl.data-only',version:'1.0.0',name:'Data only',description:'Not a P4 callable',source:{kind:'local',authority:'test.reviewed'},compatible:'^0.1.0',platforms:['web'],capabilities:[],permissions:{filesystem:false,network:false,process:false},modules:{data:{format:'resource',path:'./data.txt'}}}));
  const result=await searchCapabilities({project:directory,catalogs:[pack],query:'acl.data-only'});assert.equal(result.items.length,0);assert.deepEqual(result.coverage.packageOnlyDescriptors,['acl.data-only@1.0.0']);
  await assert.rejects(()=>inspectCapability('acl.data-only@1.0.0',{project:directory,catalogs:[pack]}),{code:'E_CAPABILITY_DESCRIPTOR'});
});

test('installed Native package functions are discovered with examples and explicit low-level opt-in',async()=>{
  const directory=await temp(),library=join(directory,'library');
  await mkdir(library);
  await writeFile(join(library,'frameweave.package.json'),JSON.stringify({
    schemaVersion:1,apiVersion:1,id:'acl.authoring',version:'1.0.0',name:'Searchable functions',
    description:'Native authoring fixture',source:{kind:'local',authority:'test.reviewed'},compatible:'^0.1.0',platforms:['web'],
    permissions:{filesystem:false,network:false,process:false},capabilities:[],
    modules:{main:{format:'javascript',path:'./index.ts'}},entry:'main',
    bindings:{schemaVersion:2,engine:'native-gpu',module:'main',types:'./api.d.ts',initialize:'initialize'},
  }));
  await writeFile(join(library,'index.ts'),'export const initialize=()=>({exports:{orbitCard:(v)=>v,orbitKernel:(v)=>v}});');
  await writeFile(join(library,'api.d.ts'),'export declare function orbitCard(v:number):number;\nexport declare function orbitKernel(v:number):number;');
  const entries=[
    {name:'orbitCard',level:'authoring',description:'Rotate a card',example:'orbitCard(12)',
      presets:[{name:'tightOrbit',description:'小半径环绕',example:'orbitCard(4)',tags:['紧凑环绕']}]},
    {name:'orbitKernel',level:'low-level',description:'Build an orbit kernel',example:'orbitKernel(12)'},
  ];
  const metadata=join(library,'frameweave.functions.json'),query={project:directory,query:'orbitCard'};
  await writeFile(metadata,JSON.stringify({schemaVersion:1,functions:entries}));
  assert.deepEqual((await searchCapabilities(query)).functions,[]);
  await installPackages(directory,[library],{trust:['local:test.reviewed']});
  const [result]=(await searchCapabilities(query)).functions;
  assert.equal(result.name,'orbitCard');assert.equal(result.example,'orbitCard(12)');
  assert.equal(result.import,'import { orbitCard } from "acl.authoring";');
  assert.equal(result.package.installed,true);assert.equal(result.package.official,false);assert.equal(result.install,null);
  const preset=await searchCapabilities({...query,query:'紧凑环绕',filters:{kind:'preset'}});
  assert.deepEqual(preset.functions,[]);
  assert.ok(preset.presets.some(hit=>hit.name==='tightOrbit'&&hit.callable==='orbitCard'&&hit.import===result.import&&hit.example==='orbitCard(4)'));
  assert.deepEqual((await searchCapabilities({...query,query:'orbitKernel'})).functions,[]);
  const advanced=await command(['capabilities','search','orbitKernel','--project',directory,'--include-low-level','--json']);
  assert.equal(advanced.exit,0);assert.equal(advanced.value.data.functions[0].name,'orbitKernel');
  const [card]=entries;
  await writeFile(metadata,JSON.stringify({schemaVersion:1,functions:[{...card,presets:[card.presets![0],card.presets![0]]}]}));
  const another=await temp();
  await assert.rejects(()=>installPackages(another,[library],{trust:['local:test.reviewed']}),{code:'E_PACKAGE_FUNCTIONS'});
  await writeFile(metadata,JSON.stringify({schemaVersion:1,functions:[card,card]}));
  await assert.rejects(()=>installPackages(another,[library],{trust:['local:test.reviewed']}),{code:'E_PACKAGE_FUNCTIONS'});
});

test('spatial Stage presets are discoverable by localized terms and callable names',async()=>{
  const [crystal,exact,filtered]=await Promise.all([
    searchCapabilities({project,query:'水晶'}),
    searchCapabilities({project,query:'crystalSanctum'}),
    searchCapabilities({project,query:'spatialVfxStage',filters:{kind:'preset',input:'image'}}),
  ]);
  assert.deepEqual(crystal.presets.map(hit=>hit.name),['crystalSanctum','voronoiCrystal']);
  const hit=exact.presets[0];
  assert.equal(hit.name,'crystalSanctum');
  assert.equal(hit.callable,'spatialVfxStage');
  assert.match(hit.import,/@frameweave\/engine\/spatial-vfx/);
  assert.match(hit.example,/spatialVfxStage\("crystalSanctum"\)/);
  assert.deepEqual(filtered.presets.map(hit=>hit.name),['gravitationalLensing','heightFog']);
  assert.equal(crystal.indexedPresets,19);
});

test('official search uses published bindings and guides, with useful short-keyword and Chinese results',async t=>{
  if(!await officialCatalog()){t.skip('Build the official Native catalog first');return;}
  const results=await Promise.all(['辉光','lut','海岸','绸带'].map(query=>searchCapabilities({project,query})));
  const names=results.map(result=>result.functions.map(hit=>hit.name));
  for(const name of ['glowCreation','neonRing','scene2D','crystalScene'])assert.ok(names[0].includes(name));
  assert.deepEqual(names[1],['cubeLut']);
  assert.ok(names[2].includes('waveWorld'));
  assert.ok(names[3].includes('ribbonScene'));
  for(const result of results)assert.ok(result.functions.every(hit=>hit.level==='authoring'&&hit.package.official&&hit.example));
  const coast=results[2].functions.find(hit=>hit.name==='waveWorld')!;
  assert.match(coast.import,/waveWorld, waveTerrain, waveLineSource/);
  assert.ok(coast.install?.args.includes('spatial-creation@1.1.1'));
  const advanced=await searchCapabilities({project,query:'lut',includeLowLevel:true});
  assert.ok(advanced.functions.some(hit=>hit.name==='defineLut'&&hit.level==='low-level'));
  assert.ok(!advanced.functions.some(hit=>hit.name==='puppetFlutter'));
  const reference=await searchCapabilities({project,query:'curveInflections',includeLowLevel:true});
  assert.ok(reference.functions.some(hit=>hit.name==='curveInflections'&&hit.level==='reference'&&hit.example===null));
});

test('official discovery shows wrappers, callback contracts and paged authoring families',async t=>{
  if(!await officialCatalog()){t.skip('Build the official Native catalog first');return;}
  const [filters,method,web,puppet]=await Promise.all([
    searchCapabilities({project,query:'滤镜'}),searchCapabilities({project,query:'lut3D'}),
    searchCapabilities({project,query:'webstage'}),searchCapabilities({project,query:'puppet',limit:3}),
  ]);
  assert.ok(filters.typedCatalogPackages>0);
  assert.ok(filters.entrypoints.some(entry=>entry.name==='imageStage'&&entry.availability==='sdk'&&entry.import.includes('@frameweave/engine/image-effects')));
  assert.ok(filters.apiGroups.some(group=>group.path.startsWith('processRaster')&&group.methods.includes('glow')));
  assert.ok(method.apiGroups.some(group=>group.signatures.lut3D?.some(signature=>signature.returns.includes('GpuPixelImage'))));
  assert.ok(web.entrypoints.some(entry=>entry.name==='servoStage'&&entry.import?.includes('@frameweave/engine/servo')));
  assert.equal(puppet.functions.length,3);
  assert.ok(puppet.functionPage.total>puppet.functions.length);
  const next=await searchCapabilities({project,query:'puppet',limit:3,offset:puppet.functionPage.nextOffset!});
  assert.equal(next.functionPage.total,puppet.functionPage.total);
  assert.ok(next.functions.every(hit=>!puppet.functions.some(first=>first.name===hit.name)));
});

test('queries and example checking never evaluate executable plugin entries',async()=>{
  const directory=await temp(),candidate=join(directory,'candidate');await cp(source,candidate,{recursive:true});await writeFile(join(candidate,'index.ts'),"throw Error('PLUGIN_CODE_MUST_NOT_RUN');export default {};\n");await writeFile(join(directory,'frameweave.plugins.json'),JSON.stringify({schemaVersion:1,roots:['candidate'],userLibrary:false}));
  const result=await inspectCapability('acl.example@1.0.0',{project:directory});assert.equal(result.examples.state,'present');assert.equal(result.availability.runtimeVerified,false);assert.equal(result.assessment.execution,'not-verified');
});

test('API projections do not leak arbitrary source/vector fields and malformed profile types fail explicitly',async()=>{
  const directory=await temp(),candidate=join(directory,'candidate');await cp(join(engineRoot,'examples/rust-bindgen/lyon'),candidate,{recursive:true,filter:p=>!p.split(/[\\/]/).includes('.frameweave')});
  const file=join(candidate,'generated/agent-api.json'),api=await json(file);api.functions[0].sourceCode='PRIVATE_SOURCE_SHOULD_NOT_BE_RETURNED';api.environment.rawVector=Array(384).fill(.25);api.environment.sourceCode='PRIVATE_SOURCE_SHOULD_NOT_BE_RETURNED';await writeFile(file,JSON.stringify(api));
  const info=await inspectCapability('kit.bindgen-lyon@1.0.0',{project:directory,catalogs:[candidate]});assert.ok(!JSON.stringify(info.api).includes('PRIVATE_SOURCE'));assert.ok(!('rawVector' in info.api.environment!));assert.deepEqual(Object.keys(info.api.functions![0]),['name','signature','documentation']);
  api.profile=99;await writeFile(file,JSON.stringify(api));await assert.rejects(()=>inspectCapability('kit.bindgen-lyon@1.0.0',{project:directory,catalogs:[candidate]}),{code:'E_CAPABILITY_METADATA'});
});

test('TypeScript example failures locate the authored source and remain deterministic across temp checks',async()=>{
  const directory=await temp(),candidate=join(directory,'candidate');await cp(source,candidate,{recursive:true});await writeFile(join(directory,'frameweave.plugins.json'),JSON.stringify({schemaVersion:1,roots:['candidate'],userLibrary:false}));
  const file=join(candidate,'effect.json'),m=await json(file);m.examples=["plugin('acl.example@1.0.0', {speed:2}) as MissingExampleType"];await writeFile(file,JSON.stringify(m));
  const first=await agentResult(()=>capabilityExamples('acl.example@1.0.0',{project:directory})),second=await agentResult(()=>capabilityExamples('acl.example@1.0.0',{project:directory}));
  assert.deepEqual(first,second);assert.equal(first.ok,false);assert.equal(first.diagnostics[0].code,'E_TYPECHECK');const details=first.diagnostics[0].details as any;assert.equal(details.source.path,'effect.json');assert.equal(details.source.index,0);assert.ok(!JSON.stringify(first).includes('capability-examples'));
});
