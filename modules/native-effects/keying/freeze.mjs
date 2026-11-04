import {readdir,readFile,writeFile,mkdir,cp} from 'node:fs/promises';
import {join,resolve,relative,dirname} from 'node:path';
import {createHash} from 'node:crypto';
const root=resolve('.'),base=resolve('artifacts/native-effects/keying'),target=resolve('docs/native-keying-evidence'),ledger=JSON.parse(await readFile(join(base,'campaign.json'),'utf8'));
const latest=phase=>{const a=ledger.attempts.filter(a=>a.phase===phase).at(-1);if(!a||a.code!==0)throw Error('Latest '+phase+' is not qualified');return a;};
const result=async phase=>JSON.parse(await readFile(join(dirname(latest(phase).stdout),'result.json'),'utf8'));
for(const phase of ['types','unit','gpu','oracle','media','performance'])latest(phase);
const oracle=await result('oracle'),media=await result('media'),performance=await result('performance');if(!oracle.ok||!media.ok||!performance.ok)throw Error('Incomplete qualification');
const path='modules/gpu-image-effects/INVENTORY.md',descriptions={
 'ec.key.advancedspill':'advancedSpillSuppressor：GPU 自动 excess 主通道/平衡/保亮度/tint',
 'ec.key.ccsimplewireremoval':'wireRemove：静态线段/capsule，双侧双线性取样修复；非物体重建',
 'ec.key.colordifference':'colorDifferenceKey：green/blue，balance/tolerance/softness',
 'ec.key.colorrange':'colorRangeKey：线性 RGB/YUV/Lab D65 范围、负 RGB 延伸',
 'ec.key.differencematte':'differenceMatte：RGB/luma clean-plate 差异与预模糊',
 'ec.key.extract':'extractKey：亮度/通道带通、两侧 softness',
 'ec.key.innerouter':'innerOuterKey：显式内外 coverage、边缘平滑和颜色估计',
 'ec.key.keycleaner':'keyCleaner：空间平滑/对比/细节保留/颜色恢复；非时间修复',
 'ec.key.linearcolor':'colorKey：最大通道 RGB 距离和 softness',
 'ec.key.screen':'screenKey：屏幕主色/clip/gamma/despill/preblur；非专有 Keylight 全选项',
 'ec.key.unmult':'unmult：黑/白背景覆盖率恢复，HDR/负 RGB 保留',
 'ec.matte.mattechoker':'matteChoker：正负 choke + Gaussian + contrast + 扩边颜色估计',
 'ec.matte.refinehard':'refineMatte(mode:hard)：typed guided moments、强化默认对比、choke/去污染',
 'ec.matte.refinesoft':'refineMatte(mode:soft)：typed guided moments、双 box mean、颜色估计',
};
let inventory=await readFile(path,'utf8');inventory=inventory.split(/\r?\n/).map(line=>{if(!line.startsWith('|'))return line;const p=line.split('|'),id=p[3]?.trim().replaceAll('`','');if(descriptions[id])p[5]=' Native keying 已验证：'+descriptions[id]+'；F16/F32/HDR；非 AE 全参数一致声明 ';return p.join('|');}).join('\n');
if(!inventory.includes('## Native keying and matte domain'))inventory+='\n## Native keying and matte domain\n\n24 concrete source APIs (23 image operations + one recipe-local typed distance field) in [keying](../native-effects/keying/README.md). Additional local APIs: edgeDecontaminate, edgeExtend, lightWrap, matteDistance, distanceFeather, matteOutline, matteBevel, matteGradient, matteMedian, matteThreshold and matteQuantize. No invented upstream catalogue IDs. Qualified existing morphology, source-over and geometry arithmetic/sampling are reused. Real hardware GPU F16/F32, signed HDR/Alpha, 433 numeric comparisons, complete TSX task, PNG/float EXR/MP4. Raw commands, failures, captures and timing: [native-keying-evidence](../../docs/native-keying-evidence/campaign.json). Main owns a new immutable public SDK/R1/catalog identity; these source APIs are not automatically installed. Temporal key cleanup, roto/segmentation, proprietary Keylight parity and other remaining library domains are not implied complete.\n';
await writeFile(path,inventory);
const files=[];async function walk(dir){for(const e of await readdir(dir,{withFileTypes:true})){const p=join(dir,e.name);if(e.isDirectory())await walk(p);else files.push(p);}}
await walk(resolve('modules/native-effects/keying'));files.push(resolve(path),resolve('modules/native-effects/examples/keying-chain.tsx'),resolve('modules/native-effects/examples/keying-numeric.tsx'),resolve('tests/native-keying-effects.test.ts'));
const sources=[];for(const file of files){const bytes=await readFile(file);sources.push({file:relative(root,file).replaceAll('\\','/'),bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});}
const summary={version:1,parent:ledger.base,newFunctionNames:24,imageOperations:23,typedFieldOperations:1,unitTests:10,numericComparisons:oracle.comparisons,producerBuildHash:oracle.buildHash,formatMaxScaled:Object.fromEntries(['rgba32float','rgba16float'].map(format=>[format,Math.max(...oracle.results.filter(v=>v.format===format).map(v=>v.maxScaled))])),technical:oracle.technical,media:media.rows,performance:performance.rows.map(v=>({width:v.width,height:v.height,functions:v.functions,initMs:v.initMs,coldFrameMs:v.coldFrameMs,warm:v.warm,frames:v.frames,rawMs:v.rawMs,adapter:v.stats.adapter,devicesCreated:v.stats.devicesCreated,imageReadbacks:v.stats.imageReadbacks,pixelTransferBytes:v.stats.pixelTransferBytes,bufferExports:v.stats.bufferExports,allocatedImageBytes:v.stats.allocatedImageBytes,allocatedDataBytes:v.stats.allocatedDataBytes,workingImageBytes:v.stats.workingImageBytes})),implementationMsBeforeFirstTest:ledger.implementationMsBeforeFirstTest,verificationMsBeforeAssembly:ledger.spentMs,originalFailuresRetained:true,sources,remaining:['LUT','Advanced denoise/DOF','Complex optics','Frozen Agent-2 temporal integration in this worktree','Main public immutable SDK/R1/catalog/portable wiring'],unverified:['Other GPU vendors/OS/software adapters','All upstream AE UI options and byte parity','Temporal key cleanup and object-aware reconstruction','Arbitrary parameter extremes including Float32/F16 overflow','Transparent arbitrary-image tiling','4K terminal encoding','Whole repository/six delivery modes']};
await writeFile(join(base,'summary.json'),JSON.stringify(summary,null,2)+'\n');await mkdir(target,{recursive:true});await cp(base,target,{recursive:true});console.log(JSON.stringify({assembled:true,comparisons:oracle.comparisons,sources:sources.length,target}));
