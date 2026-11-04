import {readdir,readFile,writeFile,mkdir,cp} from 'node:fs/promises';
import {join,resolve,relative,dirname} from 'node:path';
import {createHash} from 'node:crypto';
const root=resolve('.'),base=resolve('artifacts/native-effects/closure-filters'),target=resolve('docs/native-closure-filters-evidence'),ledger=JSON.parse(await readFile(join(base,'campaign.json'),'utf8'));
const latest=phase=>{const a=ledger.attempts.filter(a=>a.phase===phase).at(-1);if(!a||a.code!==0)throw Error('Latest '+phase+' is not qualified');return a;};
const result=async phase=>JSON.parse(await readFile(join(dirname(latest(phase).stdout),'result.json'),'utf8'));
for(const phase of ['build','prepare','syntax','types','unit','gpu','media','performance'])latest(phase);
const gpu=await result('gpu'),media=await result('media'),performance=await result('performance');if(!gpu.ok||!media.ok||!performance.ok)throw Error('Incomplete qualification');
const path='modules/gpu-image-effects/INVENTORY.md';let inventory=await readFile(path,'utf8');
const mapping={
 'ec.blur.cccross':'crossBlur: normalized cross PSF',
 'ec.blur.ccradial':'existing radialBlur; existing qualified spatial contract reused',
 'ec.blur.ccradialfast':'fastRadialBlur: mean/brightest/darkest finite radial integration',
 'ec.blur.ccvector':'vectorBlur: typed full-origin image-pixel dx/dy field',
 'ec.blur.camerashakedeblur':'motionDeblur: supplied-PSF circular Landweber/Tikhonov; no blind shake estimation',
 'ec.channel.cccomposite':'existing over and composite22: explicit original/effected source recombination',
 'ec.channel.calculations':'channelCalculations: selected channels, seven arithmetic operators',
 'ec.channel.combiner':'channelCombine/channelDecode: non-colour RGB/YUV/YIQ/HSL typed pack',
 'ec.color.cccolorneutralizer':'colorNeutralize: explicit neutral probe, guarded gains',
 'ec.color.cccoloroffset':'colorOffsetCycle: explicit RGB modulo-period mapping',
 'ec.color.cctoner':'existing tritone/tint/palette; no duplicate kernel/name',
 'ec.color.colorlink':'colorMatch: alpha-weighted mean/std reference transfer',
 'ec.color.colorstabilizer':'colorStabilize: explicit 3-point affine calibration; no implicit temporal tracking',
 'ec.color.colorama':'colorama: cyclic working-luma palette',
 'ec.color.levelsic':'existing per-channel levels/gamma and explicit input clamping',
 'ec.color.lumetri':'existing grading21, per-channel controls, curves and LUT composition; no AE panel clone',
 'ec.color.ociocolorspace':'ocioColorSpaceTransform: official OCIO GPU processor + Naga WGSL',
 'ec.color.ociodisplay':'ocioDisplayTransform: verified official ACES2 display-linear GPU DATA; terminal image adapter blocked by scene-only image contract',
 'ec.color.ociofile':'ocioFileTransform: official non-linear 3D file processor, GPU table sampling',
 'ec.color.ociolook':'ocioLookTransform: official config LookTransform, GPU',
 'ec.color.psarbitrarymap':'existing grading LUT/curve map; Photoshop .amp import not implemented',
 'ec.noise.matchgrain':'matchGrain: explicit highpass variance match, not full spectral/grain-profile estimation',
 'ec.noise.medianlegacy':'existing restoration median: qualified numeric GPU primitive',
 'ec.noise.noisealpha':'noiseAlpha: PM-aware deterministic coverage noise',
 'ec.noise.noisehls':'noiseHls: HDR range-normalized HSL noise',
 'ec.noise.noisehlsauto':'noiseHls animated=true with explicit FrameContext; not another algorithm',
 'ec.noise.removegrain':'existing qualified restoration denoisers; no legacy-UI/full-temporal-parity claim',
 'ec.generate.cclightburst':'lightBurst: finite radial additive light',
 'ec.generate.cclightsweep':'lightSweep: explicit directional light band',
 'ec.generate.eyedropperfill':'eyedropperFill: Alpha-weighted probe fill',
};
for(const [id,description]of Object.entries(mapping)){inventory=inventory.split('\n').map(line=>line.includes('`'+id+'`')?line.replace(/\| listed \| [^|]+ \|/, '| listed | Native closure round2: '+description+'; strict supported contract, not complete proprietary AE parity |'):line).join('\n');}
if(!inventory.includes('## Native filter/channel/color/noise closure'))inventory+='\n## Native filter/channel/color/noise closure\n\n22 concrete methods in [closure-filters](../native-effects/closure-filters/README.md). Compensated sample/PSF/reduction operators and official OpenColorIO2.5.2 GPUProcessor math translated with pinned Naga30.0.1 reuse the existing Native Pixel/Data/Compute owner. Two methods return typed data (channelCombine and display transform); display-linear data is explicitly NOT relabelled as a scene image. Existing scene-only image admission needs a Main/owner terminal adapter for final OCIO display output. Exact supported contracts, upstream parity limits, original failed attempts, real numeric/media/performance evidence are retained in [native-closure-filters-evidence](../../docs/native-closure-filters-evidence/campaign.json). Third closure round is still required; automatic upstream temporal resampling is excluded by the user.\n';
await writeFile(path,inventory);
const scopePath='modules/gpu-image-effects/CLOSURE_SCOPE.json',scope=JSON.parse(await readFile(scopePath,'utf8'));scope.currentRound=2;scope.round2='Native closure22; 20 image-returning and 2 typed-data methods, official OCIO preparation/GPU execution';
for(const item of scope.items.filter(v=>v.round===2)){item.coverage=mapping[item.id];item.status='qualified_supported_contract';item.evidence='docs/native-closure-filters-evidence/campaign.json';item.fullUpstreamParity=false;item.complete=false;item.completionNote='GPU supported contract verified; catalog product/option parity not asserted';}
scope.ocioAudit.status='Official color-space/file/look GPU image paths and display-linear GPU data verified; not generic LUT substitution';scope.ocioAudit.terminalGap={source:'modules/gpu-effects/pixel-shader.ts:pixelMetadata',failure:'E_GPU_PIXEL_CONTRACT: Resident images require explicit scene-linear color',minimalRequest:'Accept a typed display-linear GPU field at an explicit terminal media/view boundary, or a separately admitted display-referred image kind; preserve color/Alpha and no readback. No Core change made here.',currentOutput:'NativeDisplayData plus buffer metadata, actual official ACES2 GPU/CPU comparison',remaining:['dynamic OCIO Uniforms','arbitrary 2D config qualification','terminal display image adapter']};scope.remainingAcceptance='Final closure round3 must audit concrete remaining functions plus Generate/Optics/ownership. Qualified contracts are not complete proprietary AE algorithm/UI parity; explicit unsupported automatic analyses/input formats remain visible.';
await writeFile(scopePath,JSON.stringify(scope,null,2)+'\n');
const files=[];async function walk(dir){for(const e of await readdir(dir,{withFileTypes:true})){const p=join(dir,e.name);if(e.isDirectory())await walk(p);else files.push(p);}}
await walk(resolve('modules/native-effects/closure-filters'));files.push(resolve(path),resolve('modules/gpu-image-effects/CLOSURE_SCOPE.json'),...['chain','numeric','boundary'].map(n=>resolve('modules/native-effects/examples/closure-'+n+'.tsx')),resolve('tests/native-closure-filters.test.ts'));
const dependencies=JSON.parse((await import('node:child_process')).execFileSync(process.env.FRAMEWEAVE_MEDIA_PYTHON??'python',['modules/native-effects/closure-filters/ocio/dependencies.py'],{encoding:'utf8',windowsHide:true}));await writeFile(join(base,'dependencies.json'),JSON.stringify(dependencies,null,2)+'\n');
const sources=[];for(const file of files){const b=await readFile(file);sources.push({file:relative(root,file).replaceAll('\\','/'),bytes:b.length,sha256:createHash('sha256').update(b).digest('hex')});}
const numeric=gpu.rows.filter(r=>r.maxScaled!==undefined),summary={version:1,parent:ledger.base,closureRound:2,maxClosureRounds:3,newFunctions:22,newImageFunctions:20,newDataFunctions:2,unitTests:13,numericComparisons:numeric.length,formatMaxScaled:Object.fromEntries(['rgba32float','rgba16float'].map(format=>[format,Math.max(...numeric.filter(v=>v.format===format).map(v=>v.maxScaled))])),media:media.rows,performance:performance.rows.map(v=>({width:v.width,height:v.height,functions:v.functions,initMs:v.initMs,coldFrameMs:v.coldFrameMs,warm:v.warm,frames:v.frames,rawMs:v.rawMs,adapter:v.stats.adapter,devicesCreated:v.stats.devicesCreated,imageReadbacks:v.stats.imageReadbacks,pixelTransferBytes:v.stats.pixelTransferBytes,bufferExports:v.stats.bufferExports,allocatedImageBytes:v.stats.allocatedImageBytes,allocatedDataBytes:v.stats.allocatedDataBytes,workingImageBytes:v.stats.workingImageBytes})),implementationMsBeforeFirstTest:ledger.implementationMsBeforeFirstTest,verificationMsBeforeAssembly:ledger.spentMs,originalFailuresRetained:true,sources,remaining:['Closure round3 remaining image warps/stylize/matte and complete scoped acceptance','OCIO terminal display image adapter requires Main/owner; exact failure and typed GPU data contract recorded in CLOSURE_SCOPE','Main public immutable SDK/R1/catalog/portable integration'],unverified:['Other GPU vendors/OS/software adapters','Every working-primary/parameter combination and extreme IEEE domains','Blind shake estimation, automated calibration tracking, spectral grain profiling, Photoshop AMP input, arbitrary OCIO configs and legacy UI parity','Automatic tiling/global origins','4K terminal encoding','Full-repository/six delivery modes/Main package integration']};
await writeFile(join(base,'summary.json'),JSON.stringify(summary,null,2)+'\n');await mkdir(target,{recursive:true});await cp(base,target,{recursive:true});console.log(JSON.stringify({assembled:true,numericComparisons:numeric.length,sources:sources.length,target}));
