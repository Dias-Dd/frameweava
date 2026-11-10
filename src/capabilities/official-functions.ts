import type {FunctionMetadata} from '../packages/function-metadata.ts';

function entry(name:string,description:string,example:string,tags:string,level:FunctionMetadata['level']='authoring',imports?:string[]):FunctionMetadata{
  return {name,description,example,tags:tags.split(' '),level,imports};
}

/** Reviewed documentation keyed by immutable R1 release. Examples are call-site snippets. */
const historicalFunctions:Readonly<Record<string,readonly FunctionMetadata[]>>={
  'spatial-creation@1.1.1':[
    entry('glowCreation','为发亮区域加柔和光晕，可用于霓虹、灯光和高光。','glowCreation(neonRing({ink:[0.2, 2, 3], finish:false}))','辉光 泛光 发光 glow bloom neon','authoring',['neonRing']),
    entry('neonRing','创建自发光的霓虹圆环，可调整色彩与成片风格。','neonRing({ink:[0.2, 2, 3]})','辉光 发光 霓虹 光圈 glow neon ring'),
    entry('blurCreation','模糊一个创作对象，适合虚化背景或柔化边缘。','blurCreation(characterWave(), {radius:2})','模糊 虚化 blur gaussian'),
    entry('shadowCreation','给对象添加可调方向和柔度的投影。',"shadowCreation(characterWave(), {color:'#080d20', radius:3, offset:[6,8]})",'投影 阴影 drop shadow'),
    entry('outlineCreation','为对象轮廓加一圈可调颜色和宽度的描边。',"outlineCreation(characterWave(), {width:3, color:'#ffedbf'})",'描边 轮廓 stroke outline'),
    entry('pixelateCreation','把对象变成像素块，用于马赛克或复古画面。','pixelateCreation(characterWave(), {blockSize:[5,5]})','马赛克 像素化 mosaic pixelate'),
    entry('chromaKeyCreation','按颜色抠出背景，例如绿幕。',"chromaKeyCreation(source, {color:'#00ff00'})",'抠像 绿幕 色键 chroma key'),
    entry('wobbleCreation','添加随时间变化的扭动与位移。','wobbleCreation(characterWave(), {amount:4, frequency:3})','扭曲 位移 波浪 distortion displacement'),
    entry('fadeInCreation','让对象逐渐淡入。','fadeInCreation(characterWave())','淡入 透明度 入场 fade opacity'),
    entry('slideInCreation','让对象从指定方向滑入画面。',"slideInCreation(characterWave(), {direction:'left'})",'滑入 入场 slide enter'),
    entry('springInCreation','让对象带弹性地入场。','springInCreation(characterWave())','弹性 弹跳 入场 spring bounce'),
    entry('staggerCreations','让一组对象按间隔依次入场。',"staggerCreations(objects, {interval:2, enter:{kind:'pop', duration:8}})",'依次 错峰 交错 stagger sequential'),
    entry('box3D','用材质、旋转和灯光创建一个三维盒子。',"box3D({material:'ceramic', rotation:[20,30,12], spin:[0,20,0]})",'三维 立方体 3d cube material'),
    entry('radialClones','沿圆环排列重复的三维对象，可统一控制材质和朝向。',"radialClones({count:20, radius:1.2, material:'copper', orientation:'outward'})",'圆形 阵列 克隆 radial clone'),
    entry('cameraView','用预设配置三维取景和环绕镜头。',"cameraView('orbit', {speed:12, viewHeight:3.2})",'相机 镜头 环绕 camera orbit'),
    entry('waveWorld','创建受水深、地形和障碍物影响的浅水波浪，可用海岸或岛屿地形表现近岸波浪。',
      "waveWorld({\n  terrain: waveTerrain({kind:'shore', level:1, elevation:0.45, slope:[0.55,0]}),\n  sources: [waveLineSource({position:[-0.9,0], amplitude:0.075, frequency:2})],\n})",
      '海岸 海边 沙滩 近岸 水面 水波 海浪 海岛 海洋 shore shoreline coast beach ocean waves water','authoring',['waveTerrain','waveLineSource']),
    entry('waveTerrain','给浅水波浪指定平面、斜坡海岸或岛屿地形，作为 waveWorld 的 terrain 参数。',"waveTerrain({kind:'shore', level:1, elevation:0.45, slope:[0.55,0]})",'海岸 海边 近岸 海岛 地形 shore coast island terrain','low-level'),
    entry('heightCaustics','从水面高度和水底图像计算水下焦散光纹。',"heightCaustics({surface:'waves', bottom:'floor', depth:0.8, ior:1.333})",'水下 水面 焦散 光纹 water caustics'),
    entry('particleField','创建可按时间驱动的程序化粒子场。','particleField()','粒子 粒子场 特效 particle particles emitter'),
    entry('snowField','创建随时间飘动的雪粒子。','snowField()','雪花 下雪 粒子 snow particles'),
    entry('sparkField','创建随时间运动的火花粒子。','sparkField()','火花 火星 粒子 sparks particles'),
    entry('foamField','创建带运动和寿命变化的泡沫与气泡场。','foamField()','泡沫 气泡 泡泡 foam bubbles'),
    entry('gridCreations','把一组创作对象按网格排版。','gridCreations(objects)','网格 布局 排版 grid layout'),
    entry('stackCreations','按顺序叠放多个创作对象。','stackCreations([background, subject])','图层 叠放 合成 stack layers composite'),
    entry('placeCreation','调整创作对象的位置、缩放和旋转。','placeCreation(subject, {x:40, scale:0.8, rotation:-10})','位置 缩放 旋转 transform placement'),
    entry('solidBackground','生成纯色背景，可使用线性颜色值。','solidBackground({color:[0.08,0.12,0.2]})','背景 底色 solid background'),
    entry('gradientBackground','创建可用于镜头背景的渐变底色。',"gradientBackground({kind:'linear', center:[0.14,0.28,0.3], edge:[0.38,0.22,0.12]})",'渐变 背景 gradient background'),
  ],
  'native-2d@0.2.0':[
    entry('scene2D','渲染由文字、图片和形状组成的二维场景，可对整张画面加辉光。',"scene2D(init, group({id:'root', children:[rect({id:'bar', width:120, height:24, fill:solid([0.04,1.4,2])})]}), {finish:{glow:{radius:3, threshold:0.8, intensity:0.12}}})",'二维 对象树 排版 辉光 泛光 glow scene layout 2d','authoring',['group','rect','solid']),
    entry('canvas2D','用熟悉的 Canvas 风格接口画图，再把快照放进二维场景。',"const pen = canvas2D({id:'marks', width:640, height:360});\npen.fillRect(42, 30, 120, 24);\nconst drawing = pen.snapshot();",'绘图 画布 笔触 canvas drawing'),
    entry('svg2D','将 SVG 图形转换为可放入 Native 2D 场景的对象。',"const artwork = await svg2D('<svg viewBox=\"0 0 100 100\"><circle cx=\"50\" cy=\"50\" r=\"40\"/></svg>');",'矢量 图标 路径 svg vector'),
    entry('rect','创建可填充颜色或渐变的矩形图形。',"rect({id:'bar', width:120, height:24, fill:solid([0.04,0.6,0.8])})",'矩形 形状 rectangle shape'),
  ],
  'frameweave.transitions@1.0.0':[
    entry('crossDissolve','按可动画的进度交叉淡化两幅图像。',"await crossDissolve(init, from, to, {progress, format:'rgba32float'}, context)",'转场 交叉淡化 cross dissolve fade'),
    entry('directionalWipe','按方向擦除第一幅图像并露出第二幅。','await directionalWipe(init, from, to, {progress}, context)','转场 擦除 方向 directional wipe'),
    entry('clockWipe','以钟表扫过的方式切换两幅图像。','await clockWipe(init, from, to, {progress}, context)','转场 扫过 时钟 clock wipe'),
  ],
  'frameweave.motion@1.0.0':[
    entry('springMotion2D','创建从起点到终点的二维弹簧运动。','springMotion2D({from:[0,0], to:[120,40]})','弹簧 弹性 位置 spring motion'),
    entry('orbitMotion2D','围绕中心创建可调半径和频率的二维环绕运动。','orbitMotion2D({center:[100,100], radius:[40,24], frequency:0.5})','环绕 轨道 二维 orbit motion'),
    entry('reverseKeyframes','翻转数值关键帧的播放顺序。','reverseKeyframes(progress)','反转 倒放 关键帧 reverse keyframes'),
  ],
  'frameweave.vector@1.0.0':[
    entry('createPathAuthoring','用尺寸和路径参数制作二维矢量图形。','createPathAuthoring(init).rectanglePath({size:[28,14]})','矢量 路径 图形 vector path'),
  ],
  'frameweave.typography@1.0.0':[
    entry('pathTextStagger','给路径文字设置逐字错峰，可配合动画进度和偏移。','pathTextStagger({progress, delaySeconds:0.05, normalFrom:12})','文字 逐字 路径 错峰 text typography stagger'),
    entry('textGraphemes','按用户看到的字符边界拆分文字，适合逐字动画。',"textGraphemes('卫星 🛰️')",'文字 分字 字符 text grapheme'),
  ],
  'native-image-effects@0.7.0':[
    entry('cubeLut','读取 .cube 文本并建立色彩查找表，可在 GPU 调色配方中应用 1D 或 3D LUT。',
      "const look = cubeLut(cubeText, {inputEncoding:'acescct', outputEncoding:'acescct'});\n// Bind once in the Stage factory. Dispose grade when the Stage closes.\nconst grade = createNativeGradingEffects(init);\n// In renderAt, with a 3D .cube table:\nreturn grade.processImage(input, (image, fx) => fx.lut3D(image, look, {interpolation:'tetrahedral'}), {context});",
      'lut lut1d lut3d cube 颜色查找表 查找表 调色 色彩分级 color grading look','authoring',['createNativeGradingEffects']),
    entry('defineLut','从已有数值数据建立不可变的 1D 或 3D 色彩查找表。',
      "defineLut(table, {inputEncoding:'linear', outputEncoding:'linear'})",'lut 查找表 调色 color grading','low-level'),
    entry('createNativeGradingEffects','在 Native Stage 内创建专业 GPU 调色配方，包含 LUT、白平衡、曲线和色轮。',
      'const grade = createNativeGradingEffects(init);\nreturn grade.processImage(input, (image, fx) => fx.lut3D(image, look), {context});',
      'lut lut3d 调色 色轮 白平衡 曲线 color grading','low-level'),
    entry('processImage','在一个 Stage 的图像配方里串联专业 GPU 图像处理算子。','await processImage(input, (image, fx) => fx.brightnessContrast(image, {contrast:1.2}), {context})','图像 GPU 管线 recipe pipeline','low-level'),
    entry('processRaster','运行底层栅格处理配方，例如在原始图像上做 HDR 辉光。','await processRaster(input, (image, fx) => fx.glow(image, {radius:1.5, threshold:1, intensity:0.15}), {context})','辉光 泛光 发光 glow bloom raster','low-level'),
    entry('processPa','调用专业浮点模糊、辉光、位移等 Stage 内算子。','await processPa(input, (image, fx) => fx.glow(image, {radius:1.5, threshold:1, intensity:0.15}), {context})','辉光 模糊 位移 glow gaussian displacement','low-level'),
    entry('imageStats','读取 Stage 图像处理器的资源与录制计数。','const stats = imageStats();','调试 GPU 资源 统计 debug stats','low-level'),
  ],
};

/** Keep immutable historical release descriptions, and carry them into the new additive releases.
 * New scene/EXR descriptions are shipped with their packages. */
export const officialFunctions:Readonly<Record<string,readonly FunctionMetadata[]>>={
  ...historicalFunctions,
  'spatial-creation@1.2.0':historicalFunctions['spatial-creation@1.1.1'],
  'native-image-effects@0.8.0':historicalFunctions['native-image-effects@0.7.0'],
};
