import {readdir,readFile,writeFile,mkdir,cp} from 'node:fs/promises';
import {join,resolve,relative} from 'node:path';
import {createHash} from 'node:crypto';
const root=resolve('.'),base=resolve('artifacts/native-effects/geometry'),target=resolve('docs/native-geometry-evidence'),ledger=JSON.parse(await readFile(join(base,'campaign.json'),'utf8'));
const latest=phase=>{const entry=ledger.attempts.filter(v=>v.phase===phase).at(-1);if(!entry||entry.code!==0)throw Error('Latest '+phase+' is not qualified');return entry;};
const result=async phase=>JSON.parse(await readFile(join(resolve(latest(phase).stdout,'..'),'result.json'),'utf8'));
for(const phase of ['types','domain-types','unit','gpu','media','performance'])latest(phase);
const gpu=await result('gpu'),media=await result('media'),performance=await result('performance');if(!gpu.ok||!media.ok||!performance.ok)throw Error('Incomplete qualification');
const path='modules/gpu-image-effects/INVENTORY.md',descriptions={
 'ec.distort.bezierwarp':'bezierWarp：连接三次边界/Coons 网格；分片仿射近似、确定性覆盖',
 'ec.distort.bulge':'bulge：椭圆/高度/taper/边缘锁定',
 'ec.distort.ccbendit':'bend：圆弧逆映射、末端刚性延续、明确 prestart',
 'ec.distort.ccgriddler':'griddler：逐格缩放/旋转/gap',
 'ec.distort.cclens':'lensWarp：有界球面镜头/convergence',
 'ec.distort.cctiler':'tiler：连续缩放/旋转/repeat/mirror；非整数 tile 别名',
 'ec.distort.cornerpin':'cornerPin：四角透视；共享 homographyWarp 内核、不同创作输入合同',
 'ec.distort.liquify':'liquify：确定性静态 push/pinch/twirl brushes；非完整交互工具 UI',
 'ec.distort.magnify':'magnify：圆/方区域、feather、opacity；区域外原图',
 'ec.distort.meshwarp':'meshWarp：显式顶点/采样网格与行分桶 GPU 光栅',
 'ec.distort.mirror':'mirrorWarp：任意轴单侧镜像；原整数 reframe 保留',
 'ec.distort.offset':'offset：亚像素平移与重复边界',
 'ec.distort.opticscompensation':'opticsCompensation：正/反 FOV 投影；无隐式扩边',
 'ec.distort.polar':'polarCoordinates：双向极坐标/amount，中心角定义为零',
 'ec.distort.ripple':'ripple：半径/波长/幅度/相位及非对称侧向分量',
 'ec.distort.spherize':'spherize：球面 asin 逆映射',
 'ec.distort.turbulentdisplace':'turbulentDisplace：原始 f32 lattice/fBm、六种模式、pin；非所有 AE UI 参数',
 'ec.distort.twirl':'twirl：半径平方衰减旋转；双补偿坐标',
 'ec.distort.wavewarp':'waveWarp：九种波形/九种 pin；亚 f32 相位边界；GPU 数值验收',
};
let inventory=await readFile(path,'utf8');inventory=inventory.split(/\r?\n/).map(line=>{if(!line.startsWith('|'))return line;const parts=line.split('|'),id=parts[3]?.trim().replaceAll('`','');if(descriptions[id])parts[5]=' Native geometry 已验证：'+descriptions[id]+'；F16/F32/HDR，非 AE 全参数一致声明 ';return parts.join('|');}).join('\n');
inventory=inventory.replace('The long-term library goal remains paused; advanced Warp/LUT/DOF work is not started.','This sentence described the earlier paused foundation checkpoint. The resumed Native geometry delivery is below; LUT/DOF and the other remaining domains are not implied complete.');
if(!inventory.includes('## Native geometry domain'))inventory+='\n## Native geometry domain\n\n24 new source function names in [geometry](../native-effects/geometry/README.md), including the 19 catalogue contracts above and local resample, homographyWarp, lensDistortion, kaleidoscope and cylinderWarp. They do not add invented upstream IDs. GPU-only, original F32 3e-6/F16 6e-4 gates, actual Native Stage/PNG/float EXR/MP4. Raw qualification is in [native-geometry-evidence](../../docs/native-geometry-evidence/campaign.json). This is a source checkpoint for a new immutable package; Main owns public SDK/R1/catalog/lock integration. Remaining LUT, advanced denoise/DOF, complex optics, advanced Key Cleaner and temporal integration stay open.\n';
await writeFile(path,inventory);
const files=[];async function walk(dir){for(const e of await readdir(dir,{withFileTypes:true})){const p=join(dir,e.name);if(e.isDirectory())await walk(p);else files.push(p);}}
await walk(resolve('modules/native-effects/geometry'));files.push(resolve(path),resolve('modules/native-effects/examples/geometry-chain.tsx'),resolve('modules/native-effects/examples/geometry-numeric.tsx'),resolve('tests/native-geometry-effects.test.ts'));
const sources=[];for(const file of files){const bytes=await readFile(file);sources.push({file:relative(root,file).replaceAll('\\','/'),bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});}
const numeric=gpu.rows.filter(v=>v.maxScaled!==undefined),summary={version:1,parent:ledger.base,newFunctionNames:24,numericComparisons:numeric.length,unitTests:12,formatMaxScaled:Object.fromEntries(['rgba32float','rgba16float'].map(format=>[format,Math.max(...numeric.filter(v=>v.format===format||(format==='rgba32float'&&v.wide)).map(v=>v.maxScaled))])),media:media.rows,performance:performance.rows.map(v=>({width:v.width,height:v.height,chain:v.chain,functions:v.functions,initMs:v.initMs,coldFrameMs:v.coldFrameMs,warm:v.warm,frames:v.frames,rawMs:v.rawMs,adapter:v.stats.adapter,devicesCreated:v.stats.devicesCreated,imageReadbacks:v.stats.imageReadbacks,pixelTransferBytes:v.stats.pixelTransferBytes,bufferExports:v.stats.bufferExports,allocatedImageBytes:v.stats.allocatedImageBytes,allocatedDataBytes:v.stats.allocatedDataBytes,workingImageBytes:v.stats.workingImageBytes})),implementationMsBeforeFirstTest:ledger.implementationMsBeforeFirstTest,verificationMsBeforeAssembly:ledger.spentMs,originalFailuresRetained:true,qualification:'Latest GPU includes normalized homography, all reconstruction kernels/boundaries, all wave shapes/pins and sub-f32 phase. Latest media/performance use the final shader equations. Later work only adds documentation/evidence assembly.',sources,remaining:['LUT','Advanced denoise/DOF','Complex optics','Advanced key cleanup','Frozen Agent-2 temporal integration in this worktree','Main immutable public SDK/R1/catalog/portable integration'],unverified:['Other GPUs/OS/software adapters','Every extreme parameter combination or arbitrary precision algebra','All upstream AE options/byte parity','Transparent arbitrary-warp tiling','4K terminal encoding','Whole repository/six delivery modes']};
await writeFile(join(base,'summary.json'),JSON.stringify(summary,null,2)+'\n');await mkdir(target,{recursive:true});await cp(base,target,{recursive:true});console.log(JSON.stringify({assembled:true,comparisons:numeric.length,sources:sources.length,target}));
