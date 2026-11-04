import ts from 'typescript';import {readFile,mkdir,writeFile} from 'node:fs/promises';import {resolve,relative} from 'node:path';
const defs=[
 ['动画/文字/路径','pro-animation','modules/pro-animation/src/public.d.ts','R1 · Web/CPU float'],
 ['动画/文字/路径','pro-animation source','modules/pro-animation/src/index.ts','源码 · CPU/工具'],
 ['动画/文字/路径','Native transitions','modules/pro-animation/src/native-transitions/index.ts','源码 · Native GPU；未收入 pro-animation@0.7.3'],
 ['图像处理','gpu-image-effects','modules/gpu-image-effects/api.d.ts','R1 · Web GPU'],
 ['图像处理','gpu-resident-effects','modules/gpu-image-effects/resident/api.d.ts','R1 · Web GPU'],
 ['图像处理','native-image-effects','modules/native-effects/api.d.ts','R1 · Native GPU'],
 ['图像处理','Native source factories','modules/native-effects/index.ts','源码 · Native；spatialFrame 另有未通过对照项'],
 ['空间/粒子/模拟','spatial-effects','modules/spatial-effects/src/index.ts','R1 · Web'],
 ['空间/粒子/模拟','spatial-effects Native','modules/spatial-effects/native.ts','源码 · Native GPU / CPU 控制'],
 ['空间/粒子/模拟','spatial-compute','modules/spatial-compute/index.ts','R1 · Web GPU / Native 源码'],
 ['空间/粒子/模拟','spatial-compute Native','modules/spatial-compute/native.ts','源码 · Native GPU'],
 ['空间/粒子/模拟','mesh-deformation','modules/mesh-deformation/index.ts','R1 · Web GPU / Native 源码'],
 ['空间/粒子/模拟','spatial-fields','modules/spatial-fields/index.ts','R1 · Web GPU / Native 源码'],
 ['空间/粒子/模拟','spatial-vfx','modules/spatial-vfx/index.ts','R1 · Web GPU / Native 源码'],
 ['空间/粒子/模拟','skeletal-effects','modules/skeletal-effects/src/public.d.ts','R1 · Web/Three'],
 ['空间/粒子/模拟','skeletal-effects Native','modules/skeletal-effects/native.ts','源码 · Native GPU / CPU 骨骼'],
 ['空间/粒子/模拟','puppet-effects','modules/puppet-effects/src/public.d.ts','R1 · Web；求解器需 WASM 授权'],
 ['空间/粒子/模拟','puppet-effects Native','modules/puppet-effects/native.ts','源码 · Native；求解器需 WASM 授权'],
 ['空间/粒子/模拟','rigid-body-effects','modules/rigid-body-effects/src/public.d.ts','R1 · Web/WASM'],
 ['空间/粒子/模拟','rigid-body-effects Native','modules/rigid-body-effects/native.ts','源码 · Native/WASM；显式授权和已声明字节'],
 ['空间/粒子/模拟','deformable-effects','modules/deformable-effects/src/public.d.ts','R1 · Web/WASM'],
 ['空间/粒子/模拟','deformable-effects Native','modules/deformable-effects/native.ts','源码 · Native/WASM；显式授权和已声明字节'],
 ['空间/粒子/模拟','spatial-data-effects','modules/spatial-data-effects/src/index.ts','源码 · Web 几何 AOV'],
 ['空间/粒子/模拟','spatial-data-effects Native','modules/spatial-data-effects/native.ts','源码 · Native 几何 AOV'],
];
const extras=[['Native ProfessionalFilters','modules/native-effects/extended.ts','NativeProfessionalFilters'],['Native RasterFilters','modules/native-effects/raster/filters.ts','NativeRasterFilters'],['Native PA','modules/native-effects/pa/filters.ts','NativePaImageFilters'],['Native Builtin','modules/native-effects/builtin/filters.ts','NativeBuiltinFilters'],['Web ProfessionalFilters','modules/gpu-image-effects/resident/filters.ts','ProfessionalFilters']];
const cfg=ts.readConfigFile('tsconfig.json',ts.sys.readFile),parsed=ts.parseJsonConfigFileContent(cfg.config,ts.sys,process.cwd()),roots=[...defs.map(d=>d[2]),...extras.map(d=>d[1])].map(p=>resolve(p));
const program=ts.createProgram(roots,{...parsed.options,noEmit:true}),c=program.getTypeChecker(),rows=[],factories=[];
const sourceOf=s=>{const d=s.valueDeclaration??s.declarations?.[0];return d?{file:relative(process.cwd(),d.getSourceFile().fileName).replaceAll('\\','/'),line:d.getSourceFile().getLineAndCharacterOfPosition(d.getStart()).line+1}:{};};
const sigs=(type,node)=>type.getCallSignatures().map(sig=>c.signatureToString(sig,node,ts.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope|ts.TypeFormatFlags.WriteArrowStyleSignature).replaceAll(process.cwd().replaceAll('\\','/'),'@source'));
const signatureReturn=type=>{const s=type.getCallSignatures()[0];return s&&c.getAwaitedType(s.getReturnType());};
function methods(type,prefix,meta,depth=0,seen=new Set()){
 if(!type||depth>2||seen.has(type))return;seen=new Set([...seen,type]);
 for(const s of type.getProperties()){
  if(s.name.startsWith('__')||s.name==='then')continue;const node=s.valueDeclaration??s.declarations?.[0];if(!node)continue;const t=c.getTypeOfSymbolAtLocation(s,node);if(t.getCallSignatures().length){factories.push({...meta,name:prefix+'.'+s.name,leaf:s.name,signatures:sigs(t,node),documentation:ts.displayPartsToString(s.getDocumentationComment(c)),...sourceOf(s)});
   if(/^create|^rig$/.test(s.name))methods(signatureReturn(t),prefix+'.'+s.name+'()',meta,depth+1,seen);
  } else if(prefix.startsWith('nativeSpatialFrame()')&&depth<1)methods(t,prefix+'.'+s.name,meta,depth+1,seen);
 }
}
function valueNames(src,seen=new Set()) {if(seen.has(src.fileName))return new Set();seen.add(src.fileName);const names=new Set();for(const n of src.statements){if(ts.isExportDeclaration(n)){if(n.isTypeOnly)continue;if(n.exportClause&&ts.isNamedExports(n.exportClause)){for(const e of n.exportClause.elements)if(!e.isTypeOnly)names.add(e.name.text);}else if(!n.exportClause&&n.moduleSpecifier){const sym=c.getSymbolAtLocation(n.moduleSpecifier),other=sym?.declarations?.find(ts.isSourceFile);if(other)for(const name of valueNames(other,seen))names.add(name);}}else if(n.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword)){if(ts.isFunctionDeclaration(n)&&n.name)names.add(n.name.text);if(ts.isVariableStatement(n))for(const d of n.declarationList.declarations)if(ts.isIdentifier(d.name))names.add(d.name.text);}}return names;}
for(const [group,library,file,status]of defs){const src=program.getSourceFile(resolve(file));if(!src)throw Error('Missing '+file);const sym=c.getSymbolAtLocation(src);if(!sym)throw Error('No module '+file);const runtimeNames=valueNames(src);for(const exp of c.getExportsOfModule(sym)){if(!runtimeNames.has(exp.name))continue;if(!(exp.flags&ts.SymbolFlags.Value)&&!(exp.flags&ts.SymbolFlags.Alias))continue;const target=exp.flags&ts.SymbolFlags.Alias?c.getAliasedSymbol(exp):exp,node=target.valueDeclaration??target.declarations?.[0];if(!node)continue;const t=c.getTypeOfSymbolAtLocation(target,node);if(!t.getCallSignatures().length)continue;const meta={group,library,status,entry:file};rows.push({...meta,name:exp.name,leaf:exp.name,signatures:sigs(t,node),documentation:ts.displayPartsToString(target.getDocumentationComment(c)),...sourceOf(target)});if(/^create|^prepareNativeParticles|^nativeSpatialFrame/.test(exp.name))methods(signatureReturn(t),exp.name+'()',meta);}}
for(const [library,file,name]of extras){const src=program.getSourceFile(resolve(file)),sym=c.getSymbolAtLocation(src),exp=c.getExportsOfModule(sym).find(s=>s.name===name);if(!exp)throw Error('Missing interface '+name);const type=c.getDeclaredTypeOfSymbol(exp),meta={group:'图像处理',library,status:library.startsWith('Web')?'R1 · Web GPU':'R1 · Native GPU',entry:file};for(const s of type.getProperties()){const n=s.valueDeclaration??s.declarations?.[0],t=c.getTypeOfSymbolAtLocation(s,n);rows.push({...meta,name:s.name,leaf:s.name,signatures:sigs(t,n),documentation:ts.displayPartsToString(s.getDocumentationComment(c)),...sourceOf(s)});}}
await writeFile('artifacts/effects-library-catalog/raw-api.json',JSON.stringify({rows,factories},null,2));console.log(JSON.stringify({entries:rows.length,methods:factories.length,groups:Object.fromEntries(defs.map(d=>[d[1],rows.filter(r=>r.library===d[1]).length]))},null,2));



// Human descriptions supplement, rather than replace, the actual TypeScript signatures.
const translations=`
trimPaths|路径裁剪 / Trim Paths
revealText|按字素或单词揭示文字
wiggle|确定性的随机摆动
blur|高斯模糊
glow|阈值提亮与辉光 / Bloom
displacement|程序化位移扭曲
surfaceFromCoverage|覆盖率着色为专业浮点图像
applyFloatKernel|自定义 CPU 浮点像素核
rangeSelector|范围选择器
combineSelectors|组合选择器
selectorOrder|选择器排列顺序
randomSelector|种子随机选择器
stagger|错峰时间
segmentText|文字分段
noiseField|二维程序化位移向量场
createDisplacementMap|生成位移图
displaceWithMap|按显式位移图扭曲
emitParticles|解析式粒子发射
rasterizeParticles|CPU 粒子覆盖率栅格化
measurePath|测量路径弧长
matchPaths|路径轮廓重采样与匹配
morphPath|路径形变插值
rasterizeText|字体文字覆盖率栅格化
rasterizePath|路径覆盖率栅格化
rasterizeAnimatedText|动态文字栅格化
deformPath|向量场驱动路径变形
repeatPath|图形重复器
roundCorners|路径圆角
puckerBloat|收缩 / 膨胀形变
shapeBidiLine|单行双向文字排布
glyphsOnPath|沿路径排列字形
shutterSamples|真实快门时间采样计划
remapTime|时间重映射
posterizeTime|抽帧 / 时间量化
sampleSignalAtTime|在指定时间求值动画信号
crossDissolve|交叉溶解
fadeThroughColor|经过指定颜色的淡变
directionalWipe|方向擦除
clockWipe|时钟擦除
irisWipe|圆形光圈擦除
diamondWipe|菱形擦除
boxWipe|矩形擦除
venetianWipe|百叶窗擦除
checkerWipe|棋盘擦除
randomBlocksWipe|随机块擦除
orderedDissolve|有序抖动溶解
lumaWipe|亮度蒙版擦除
alphaWipe|Alpha 蒙版擦除
pushTransition|推入转场
slideTransition|滑入转场
splitTransition|分裂转场
zoomTransition|缩放转场
rotateTransition|旋转转场
rippleTransition|波纹转场
displacementTransition|位移图转场
starWipe|星形擦除
cardFlipWipe|卡片翻转 / 网格卡片
glassWipe|玻璃折射擦除
gridWipe|可旋转网格擦除
imageWipe|外部图像蒙版擦除
jawsWipe|锯齿 / 齿状擦除
lightWipe|高光扫光擦除
lineSweepWipe|斜线条带扫入
radialScaleWipe|径向缩放擦除
scaleWipe|方向缩放擦除
twisterTransition|扭转转场
warpTransition|变形场转场
feather|羽化覆盖率
fill|填充颜色
applyMatte|应用遮罩
innerShadow|内阴影（PA 接口输出 shadow-only）
dropShadow|外部投影
reframe|裁剪 / 重定位 / 镜像
mergeMatte|覆盖率并集
alphaToRGB|Alpha 转灰度 RGB
flattenBlack|在黑底上展平
tile|图像重复平铺
exposure|曝光调整
invert|颜色反相
add|加法混合
invertMatte|反转覆盖率
replaceMatte|替换覆盖率
modulate|RGB 增益图调制
over|前景覆盖背景 / Source-over
screen|滤色混合
multiply|正片叠底
offsetRGB|RGB 偏移
subtractMatte|覆盖率差集
crossfade|浮点交叉淡化
channelMix|RGB 通道矩阵混合
levels|色阶
curves|RGB 曲线
unsharpMask|反差保留锐化
lumaKey|亮度键
chromaKey|色度键 / 绿幕键
despill|去溢色
extractMatte|提取遮罩
morphology|遮罩腐蚀 / 膨胀 / 开闭运算
featherMatte|遮罩羽化
matteLevels|遮罩色阶
brightnessContrast|亮度 / 对比度
tint|双色着色
tritone|三色调
colorBalance|阴影 / 中间调 / 高光色彩平衡
blackAndWhite|多色权重黑白转换
filmGrain|确定性胶片颗粒
vignette|暗角
sobelEdges|Sobel 边缘
reliefLighting|高度图浮雕照明
pixelate|像素化
darken|变暗混合
lighten|变亮混合
difference|差值混合
exclusion|排除混合
overlay|叠加混合
hardLight|强光混合
linearBurn|线性加深
subtractBlend|RGB 减法混合
linearLight|线性光
pinLight|点光混合
boxBlur|方框模糊
directionalBlur|方向模糊
convolve3x3|自定义 3×3 卷积
sharpen|锐化
emboss|浮雕
colorEmboss|彩色浮雕
posterize|色调分离
threshold|亮度阈值
thresholdRGB|逐 RGB 通道阈值
erodeImage|图像腐蚀
dilateImage|图像膨胀
hueSaturation|色相 / 饱和度
colorize|单色染色
vibrance|自然饱和度
photoFilter|摄影滤镜
gammaPedestalGain|Gamma / 基底 / 增益
leaveColor|保留指定颜色
changeColor|选择性颜色变化
changeToColor|颜色替换
channelArithmetic|通道算术
setChannels|设置通道
shiftChannels|通道重排
removeColorMatting|去除底色污染
solidComposite|纯色合成
noise|种子噪声
orderedDither|有序抖动量化
checkerboard|棋盘生成
linearGradient|线性渐变
radialGradient|径向渐变
fourColorGradient|四色渐变
gradientMap|渐变映射
shadowHighlight|阴影 / 高光调整
selectiveColor|可选颜色
broadcastColors|广播色域限制
videoLimiter|视频电平限制
radialBlur|径向旋转模糊
zoomBlur|缩放模糊
channelBlur|通道独立模糊
compoundBlur|以控制图驱动复合模糊
findEdges|边缘提取
median|中值滤波
dustAndScratches|灰尘与划痕去除
bilateralBlur|双边滤波
smartBlur|阈值感知智能模糊
autoLevels|自动色阶（GPU 统计）
autoContrast|自动对比度（GPU 统计）
autoColor|自动颜色（GPU 统计）
equalize|直方图均衡
brightness|亮度倍增
transform|图像旋转 / 缩放 / 透明度
mix|显式双输入混合
cinematicGlow|位移与辉光组合预设
particleAcceleration|计算粒子受力加速度
evaluateParticleLife|按粒子年龄求值颜色 / 尺寸 / 透明度
cellularVolume|三维细胞 / Worley 体积
vortexField|涡旋速度场
curlNoiseField|旋度噪声速度场
advectField|场平流
diffuseField|场扩散
projectVelocity|速度投影 / 压力约束
vorticityConfinement|涡量约束
reactionDiffusion|反应扩散
waveStep|波动方程单步
thermalErosion|热侵蚀单步
approximateDistance|近似距离场
advectParticles|粒子平流
flockParticles|群集 / Boids 单步
splatParticles|粒子栅格化至密度场
renderVolume|体积渲染
transformPositions|几何位移 / 旋转 / 缩放
twistPositions|几何扭转
bendPositions|几何弯曲
taperPositions|几何锥化
shearPositions|几何错切
stretchPositions|几何拉伸 / 保体积
bulgePositions|几何鼓起
spherifyPositions|球化
cylindrifyPositions|柱化
wavePositions|几何波浪
ripplePositions|几何涟漪
noiseDisplacePositions|噪声位移几何
morphPositions|顶点目标形变
cageDeformPositions|笼子形变
attractPositions|点吸引形变
deviceDepthToViewDepth|设备深度转视空间轴向深度
viewDepthToRayDistance|轴向深度转射线距离
reconstructWorldPositions|由深度重建世界坐标
projectWorldPositions|世界坐标投影
reconstructNormals|由位置重建法线
cameraMotionFromDepth|由深度与显式相机求运动
reprojectionVisibility|重投影可见性
surfaceCurvatureField|表面曲率场
surfaceGradientField|表面梯度场
reflectionDirectionField|反射方向场
refractionDirectionField|折射方向场
reduceDepthBounds|深度范围约简
surfaceTangentFrame|表面切线 / 副切线
distanceToPointField|点距离场
distanceToPlaneField|平面距离场
depthRangeMatte|深度区间遮罩
mandelbulb|Mandelbulb 分形
mengerSponge|Menger 海绵分形
gyroidSurface|Gyroid 曲面
voronoiCrystal|Voronoi 晶体
terrainRaymarch|地形光线步进
metaballVolume|融球体积
planetAtmosphere|行星大气
heightFog|高度雾
volumetricSpotlight|体积聚光
smokePlume|程序化烟柱
flameVolume|程序化火焰
waterCaustics|水焦散
starfield|星场
orbitalTrails|轨道拖尾
gravitationalLensing|引力透镜
characterBones|角色骨骼构造
bindCharacterMesh|角色网格绑定与权重
characterPuppetConstraints|角色到 Puppet 约束映射
ropeOptions|绳索配置
clothOptions|布料配置
softBodyOptions|软体配置
rodOptions|杆体配置
rodMeshDraws|杆体网格绘制数据
createAim2D|二维朝向 / 自动朝向控制器
createBidiAnimator|双向文字动画器
createCurveSampler|曲线采样器
createFontShaper|字体字形塑形器
createGlyphAnimator|逐字形动画器
createInertia|惯性 / 弹性跟随控制器
createPathDasher|路径虚线生成器
createPathMotion|沿路径运动控制器
createPathOperations|路径布尔 / 偏移 / 描边工具
createPathTwist|路径扭转工具
createPathZigzag|路径锯齿 / 波形工具
createTextItemizer|文字脚本 / 方向分段器
createSpeedRamp|速度渐变 / 速度积分控制器
createVectorTools|路径裁剪与 Morph 工具
createImageEffects|Legacy Canvas8 辉光与位移工具
createCoverageRasterizer|路径 / 文字覆盖率栅格器
createPathTools|弧长测量 / 路径匹配工具
createPathSampler|弧长路径采样器
createAnimatedTextTools|动态文字栅格工具
createDeformationTools|向量场路径变形工具
createShapeModifiers|重复器 / 圆角 / 膨胀工具
createNativeTransitions|32 种 Native 转场绑定器
createFeedbackParticles|固定步、检查点与重放的反馈粒子模拟
createParticleRenderer|粒子 / 拖尾渲染器
createNativeParticleRenderer|Native 粒子 / 图集 / 拖尾渲染器
createNoise|完整固定版本 FastNoiseLite 噪声查询
createNoiseTextureRenderer|噪声纹理渲染器
createNativeNoiseTextureRenderer|Native FastNoiseLite 纹理渲染器
createImageEmitter|按图像颜色 / Alpha 采样的粒子发射器
createSkeletonRig|骨骼绑定、正逆运动学与姿态采样
createSkinnedRenderer|蒙皮渲染器
createNativeSkinnedRenderer|Native GPU 蒙皮渲染器
createMeshRenderer|网格材质渲染器
createNativeMeshRenderer|Native 浮点网格渲染器
createSurfaceSampler|网格表面散布 / 投影采样器
createInstancedMeshRenderer|实例化网格渲染器
createNativeInstancedMeshRenderer|Native 实例化网格渲染器
createTrailGeometry|管状拖尾几何
createLightningGeometry|分叉闪电几何
createIsosurfaceGeometry|等值面 / 融球网格生成器
createPuppet|Puppet / ARAP 网格约束求解器
createPuppetProcessor|图像建网与 Puppet 求解
createPuppetRenderer|Puppet 纹理渲染器
createNativePuppetRenderer|Native Puppet 纹理渲染器
createNativePuppetTools|Native 已授权 WASM Puppet 工具
createNativePuppetProcessorTools|Native 已授权 WASM 建网工具
createCharacterRig|完整角色姿态 / CCD / FK 控制器
createNativeCharacterRenderer|Native 角色 / 纹理渲染器
createRigidBodies|Rapier 刚体世界
createCollisionEnvironment|静态碰撞环境 / 查询服务
createNativeRigidBodyTools|Native 已授权 Rapier WASM 工具
createDeformables|XPBD 绳 / 布 / 软体 / 杆体求解器
createNativeDeformableTools|Native 已授权 XPBD WASM 工具
createSpatialDataRenderer|真实几何深度 / 法线 / 运动 AOV
createNativeSpatialDataRenderer|Native 几何深度 / 法线 / 运动 AOV
createNativeReplay|显式重置与固定步 GPU 重放
createNativeImageEffects|旧 Creative / Blend Native 配方容器
createNativeProfessionalEffects|完整专业图像 Native 配方容器
createNativeRasterEffects|23 种 Raster Native 配方容器
createNativePaImageEffects|6 种 PA Native 配方容器
createNativeBuiltinEffects|7 种 Builtin Native 配方容器
nativeSpatialFrame|实验性逐帧空间快捷绑定（未完成对照验收）
processImage|执行显式图像效果配方
processRaster|执行 Raster 效果配方
processPa|执行 PA 效果配方
processBuiltin|执行 Builtin 效果配方
generatePa|通过 PA 覆盖率生成图像
generateImage|通过显式输入等生成 Native 图像
importImage|显式上传小型 CPU Surface（资源边界工具）
prepareNativeParticles|生成分块粒子 / 图集 GPU 记录
readDeformedPositions|显式读回变形后的顶点
uploadSpatialField|上传有类型的空间数据 / 有效性
releaseSpatialField|释放空间数据 / 有效性
importSpatialCapture|导入真实几何 AOV
validateSpatialFields|验证空间数据与有效性
readSpatialField|显式读回空间数据
decodeNativePositionProbe|解码宿主导出的顶点探针
validateCharacterAsset|校验角色资产
serializeCharacterAsset|序列化角色资产
parseCharacterAsset|解析角色资产
sample|按显式时间 / 条件采样
sampleStream|流式采样
sampleBatch|批量采样
rotationAt|求指定时间的朝向
units|取得字形 / 文字单元
animate|逐字 / 逐词 / 逐字形动画
shapeRun|单个文字 Run 塑形
valueAt|求指定时间的值
velocityAt|求指定时间的速度
booleanPaths|路径布尔运算
offsetPaths|路径偏移
strokePaths|路径描边转轮廓
twistPaths|路径扭转
zigzagPaths|路径锯齿化
dashPaths|路径虚线化
analyze|分析文字 Run 与方向
trimCurves|基于曲线弧长裁剪
timeAt|对速度积分求源时间
speedAt|求指定时间的速度
sample2|二维噪声查询
sample3|三维噪声查询
warp2|二维域扭曲
warp3|三维域扭曲
curl2|二维旋度查询
curl3|三维旋度查询
render|用当前姿态 / 数据绘制
capture|捕获真实几何深度 / 法线 / 运动
skin|CPU 骨骼蒙皮
project|投影至网格表面
sampleMetaballs|融球等值面采样
solve|约束求解
generateMesh|从图像 / 轮廓生成网格
asset|取得角色资产
castRay|刚体世界射线查询
castShape|刚体世界形状扫掠
intersections|刚体世界相交查询
sweepSphere|碰撞环境球体扫掠
colliderMeshes|取得碰撞体网格
deform|求角色变形
record|记录显式重放 GPU 工作
publishPositions|发布顶点供宿主完成后导出
probePositions|显式顶点探针读回
dispose|释放实例资源
reset|显式重置受管理状态
stats|资源 / 执行统计
diagnostics|诊断信息
describe|取得实例描述
resize|显式调整后续输出尺寸
validate|校验数据
check|检查实例 / 资源有效性
imageStats|图像配方统计
rasterStats|Raster 配方统计
paStats|PA 配方统计
builtinStats|Builtin 配方统计
gpuImageStats|Web GPU 图像调用统计
`;
const chinese=Object.fromEntries(translations.trim().split('\n').map(line=>line.split('|')));
function describe(name){if(chinese[name])return chinese[name];if(name.endsWith('Stream'))return describe(name.slice(0,-6))+'（流式）';return name.replace(/([a-z])([A-Z])/g,'$1 $2');}
const tools=new Set(['dispose','reset','stats','diagnostics','describe','resize','validate','check','imageStats','rasterStats','paStats','builtinStats','gpuImageStats','readDeformedPositions','uploadSpatialField','releaseSpatialField','importSpatialCapture','validateSpatialFields','readSpatialField','decodeNativePositionProbe','validateCharacterAsset','serializeCharacterAsset','parseCharacterAsset','importImage','prepareNativeParticles','publishPositions','probePositions','asset']);
function decorate(row,method=false){const pending=row.name.startsWith('nativeSpatialFrame');return {...row,description:describe(row.leaf),category:pending?'待验收':tools.has(row.leaf)?'资源/诊断':/^create|^nativeSpatialFrame/.test(row.leaf)?'创建器':/^process|^generate(?:Image|Pa)$/.test(row.leaf)?'配方封装':method?'实例方法':'效果/计算',status:pending?'源码附录 · 旧 Web 对照有17/30失败，不计入已验收效果':row.status,...['readSpatialField','validateSpatialFields','readDeformedPositions','importSpatialCapture'].includes(row.leaf)?{status:'Web GPU 数据工具；Native 作者侧读回不可直接照搬'}:{}};}
const catalogRows=rows.map(r=>decorate(r)),methodRows=factories.map(r=>decorate(r,true));
const pluginRows=[];for(const base of ['plugins/builtin','plugins/shared'])for(const dir of await (await import('node:fs/promises')).readdir(base)){try{const file=base+'/'+dir+'/effect.json',m=JSON.parse(await readFile(file,'utf8'));pluginRows.push({group:'P4 经典插件',library:m.id,version:m.version,name:m.id+'@'+m.version,leaf:m.id,description:m.description,category:m.kind,status:'本地 P4 · Web；按 Manifest 类型调用',entry:file,file,line:1,signatures:[JSON.stringify(m.parameters??{},null,2)]});}catch{}}
for(const [name,text]of [['blur','Canvas 高斯模糊'],['brightness','Canvas 亮度倍增']])pluginRows.push({group:'P4 经典插件',library:'Core Canvas filter',version:'1.0.0',name,leaf:name,description:text,category:'Legacy Canvas8',status:'Web Canvas8；不是 HDR 浮点路径',entry:'src/core/effects.ts',file:'src/core/effects.ts',line:5,signatures:[]});
const versionRoots=['pro-animation','gpu-image-effects','gpu-image-effects/resident','native-effects','spatial-effects','spatial-compute','mesh-deformation','spatial-fields','spatial-vfx','skeletal-effects','puppet-effects','rigid-body-effects','deformable-effects','graphics-contracts'];
const packages=[];for(const name of versionRoots){const p=JSON.parse(await readFile('modules/'+name+'/frameweave.package.json','utf8'));packages.push({id:p.id,version:p.version,directory:'modules/'+name,manifest:'modules/'+name+'/frameweave.package.json',gpu:p.bindings?.gpu,engine:p.bindings?.engine??'web'});}
const git=(await import('node:child_process')).execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const all=[...catalogRows,...methodRows,...pluginRows],data={sourceCommit:git,scope:'Main 当前效果库公开入口、Native 源入口、显式实例方法与 P4 插件；不包含未合并工作树、未来 Inventory 候选和引擎调度 API',counting:'入口可重复引用同一算法；创建器、生命周期、封装、Web/Native 重导出及待验收接口不作为新效果计数',packages,counts:{namedEntries:catalogRows.length,instanceMethodEntries:methodRows.length,p4Entries:pluginRows.length,distinctLeafNames:new Set(all.map(r=>r.leaf)).size,nativeImageEffectContracts:117,nativeImageDistinctEffectNames:110,nativeImageUploadTools:1,nativeTransitions:32},entries:all};
const dest=resolve('docs/effects-catalog');await mkdir(dest,{recursive:true});await writeFile(dest+'/functions.json',JSON.stringify(data,null,2)+'\n');
const notes=[
 '此清单按实际 TypeScript value exports / callable interfaces 生成；export type * 中仅类型可见的函数已排除。',
 'R1 表示已有正式包的命名导入合同；Native 源码表示当前仓库可显式引用，不等于这些函数已进入原包的 Native R1 入口。',
 'GPU 图像效果要求合格硬件，保留 F16/F32、HDR 与声明的颜色空间；无静默 CPU/Canvas8 替代。pro-animation 原有专业 Surface 函数则是 CPU 浮点路径。',
 'Native 图像有117个效果合同、110个去重名称；另有1个显式输入工具。32个 Native 转场不是32个新包。相同 blur/glow 在不同配方中参数合同不同，以类型签名为准。',
 '模拟/物理使用固定步、检查点或显式重放，不保证所有算法仅凭 time 即瞬时随机求值。普通 JS 状态不自动获得回滚。',
 'WASM 求解器需要显式 allow-wasm、已声明并校验的模块字节；不放开 Node、文件系统或网络权限。',
 'Native Source 的单散射材质、程序化烟火、水焦散等采用文档中的具体算法 profile；不声称完整流体解算、完整 PBR 或与旧 Three 逐像素一致。',
 'nativeSpatialFrame 快捷门面保留在待验收附录，历史 Web 对照17/30失败；不以导出存在冒充已通过。其重导出的原始算法另有自己的 Native 合同。',
 '这是完整 API 盘点；本轮只实际重跑新示例，不宣称重新认证全部效果、所有参数组合、其他GPU/系统或六模式导出。',
 '不含尚未合入 Main 的 Agent-2 bidi WIP、Agent-3 InnerShadow WIP，以及 EffectCraft Inventory 中尚未实现的候选。',
 '本示例直接引用仓库内 Native 源入口；移动文件时应保持 import 指向正确，并在目标工程显式安装 native-image-effects@0.4.0。'
];
const esc=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
let txt='FRAMEWEAVE 全效果 / 函数清单\n源码基线：'+git+'\n\n'+notes.map(s=>'· '+s).join('\n')+'\n\n正式包版本\n'+packages.map(p=>p.id+'@'+p.version+' | '+p.manifest).join('\n')+'\n';
for(const group of [...new Set(all.map(r=>r.group))]){txt+='\n\n========== '+group+' ==========\n';for(const library of [...new Set(all.filter(r=>r.group===group).map(r=>r.library))]){txt+='\n--- '+library+' ---\n';for(const r of all.filter(x=>x.group===group&&x.library===library)){txt+='\n'+r.name+' — '+r.description+'\n  ['+r.category+'] '+r.status+'\n  来源：'+r.file+':'+r.line+'\n';for(const s of r.signatures)txt+='  '+s+'\n';if(r.documentation)txt+='  说明：'+r.documentation+'\n';}}}
await writeFile(dest+'/functions.txt',txt);
const summary=`<p>源码基线 <code>${git}</code>。${catalogRows.length} 条命名入口、${methodRows.length} 条显式实例方法、${pluginRows.length} 条经典插件/滤镜记录。<b>这些不是独立算法总数</b>；同一算法的多个后端入口与生命周期已分别标注。</p>`;
const tableRows=all.map((r,i)=>`<tr data-group="${esc(r.group)}" data-library="${esc(r.library)}" data-kind="${esc(r.category)}"><td><code>${esc(r.name)}</code><small>${esc(r.description)}</small></td><td>${esc(r.library)}<small>${esc(r.group)}</small></td><td>${esc(r.status)}<small>${esc(r.category)}</small></td><td><details><summary>签名 / 参数 / 来源</summary>${r.signatures.map(s=>'<pre>'+esc(s)+'</pre>').join('')}<p>${esc(r.documentation)}</p><a href="../../${esc(r.file)}">${esc(r.file)}:${r.line}</a><p>入口：${esc(r.entry)}</p></details></td></tr>`).join('\n');
const html=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Frameweave 全效果与函数</title><style>body{margin:0;background:#0b1320;color:#dce8fa;font:15px/1.6 system-ui,sans-serif}main{max-width:1480px;padding:32px;margin:auto}h1{color:#7ee8fa}a{color:#7edbf2}code,pre{font-family:Consolas,monospace}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px}table{width:100%;border-collapse:collapse}td,th{text-align:left;padding:12px;vertical-align:top;border-bottom:1px solid #26354b}th{background:#142239}td:first-child{width:27%}small{display:block;color:#9bb2d0}input,select{background:#142239;border:1px solid #476080;border-radius:5px;color:#fff;padding:10px;margin:4px}input[type=search]{width:min(540px,85%)}.filters{background:#0b1320;position:sticky;top:0;padding:12px 0;z-index:1}details{max-width:600px}summary{cursor:pointer;color:#94dfee}.note{background:#132137;padding:16px;border-radius:8px}#count{color:#84e5c2}</style><main><h1>Frameweave · 全部效果与函数</h1>${summary}<p><a href="functions.txt">完整纯文本</a> · <a href="functions.json">机器可读 JSON</a> · <a href="../../examples/effects-library-tour/project.tsx">可编辑 TSX 示例</a></p><details class="note"><summary>执行边界与统计口径（请先读）</summary><ul>${notes.map(n=>'<li>'+esc(n)+'</li>').join('')}</ul></details><details><summary>正式包版本（${packages.length}个，含图形数据基础包）</summary><ul>${packages.map(p=>'<li><code>'+p.id+'@'+p.version+'</code> · '+p.directory+'</li>').join('')}</ul></details><div class="filters"><input id="search" type="search" placeholder="按中文效果、函数名、模块、后端或参数搜索"><select id="group"><option value="">全部方向</option>${[...new Set(all.map(r=>r.group))].map(g=>'<option>'+esc(g)+'</option>').join('')}</select><select id="library"><option value="">全部模块</option>${[...new Set(all.map(r=>r.library))].map(g=>'<option>'+esc(g)+'</option>').join('')}</select><label><input id="tools" type="checkbox" checked>显示创建器与资源/统计接口</label><span id="count"></span></div><table><thead><tr><th>函数 / 效果</th><th>所属库</th><th>可用路径</th><th>详细接口</th></tr></thead><tbody>${tableRows}</tbody></table></main><script>const rows=[...document.querySelectorAll('tbody tr')],q=document.querySelector('#search'),g=document.querySelector('#group'),l=document.querySelector('#library'),tools=document.querySelector('#tools');for(const r of rows)r.search=r.textContent.toLowerCase();function update(){let n=0;for(const r of rows){const show=(!q.value||r.search.includes(q.value.toLowerCase()))&&(!g.value||r.dataset.group===g.value)&&(!l.value||r.dataset.library===l.value)&&(tools.checked||!['创建器','资源/诊断','配方封装'].includes(r.dataset.kind));r.hidden=!show;if(show)n++;}document.querySelector('#count').textContent='显示 '+n+' / '+rows.length;}for(const x of[q,g,l,tools])x.addEventListener('input',update);update();</script></html>`;
await writeFile(dest+'/index.html',html);console.log(JSON.stringify({catalog:dest,counts:data.counts,untranslated:[...new Set(all.filter(r=>!chinese[r.leaf]&&!r.leaf.endsWith('Stream')&&!r.library.startsWith('fw.')&&!r.library.startsWith('example.')).map(r=>r.leaf))]}));
