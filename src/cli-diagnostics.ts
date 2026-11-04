import type {Diagnostic} from './core/types.ts';

export interface CLIDiagnosticExplanation {
 title:string;
 advice:string;
 coverage:'specific'|'category'|'subsystem'|'fallback';
}
type Explanation=readonly [title:string,advice:string];

// Presentation only: never change a diagnostic, grant a permission, refresh a
// lock or suggest a lower-precision fallback to make a failed render succeed.
const exact:Readonly<Record<string,Explanation>>={
 E_ARGUMENT:['命令参数不正确。','运行 frameweave --help 查看命令格式，并按下方说明检查参数。'],
 E_COMPILE:['工程编译失败。','按下方文件位置和编译说明修正源码，再重新运行。'],
 E_TYPECHECK:['TypeScript 类型检查失败。','按下方文件和行号修正类型或导入；不要跳过类型检查来掩盖问题。'],
 E_INTERNAL:['程序遇到了未预期的错误。','使用 --verbose 保存详细信息，并连同完整命令和复现步骤报告问题。'],
 E_WEB_REMOVED:['此版本已移除旧 Web Stage 和 Chromium 渲染入口。','将工程迁移到 Native Stage；HTML/CSS 内容请通过可选 Servo 模块运行。'],
 E_PLUGIN_TEMPLATE_REMOVED:['此版本已移除旧插件模板。','使用当前 effects create 命令创建兼容的插件，并按现有 SDK 迁移代码。'],
 E_PREVIEW_MIGRATION:['此工程使用了已变更的预览接口。','按下方迁移说明更新工程，使用 frameweave <工程.tsx> 打开当前预览。'],
 E_PREVIEW_WATCH:['无法监听工程文件的修改。','检查下方路径和访问权限；暂时不需要自动更新时，可使用 --no-watch 预览并在修改后重新运行。'],
 E_NATIVE_MIGRATION:['此工程需要迁移到当前原生渲染接口。','按下方说明更新 Stage 和模块入口，保留原有精度与权限要求。'],
 E_NATIVE_EFFECT_MIGRATION:['此效果使用了旧渲染接口。','将效果迁移到当前 Native 模块接口，并检查对应的输入输出合同。'],
 E_NATIVE_GPU_MISSING:['未找到原生渲染程序。','安装与当前 SDK 匹配的运行时；源码工程可执行 node modules/native-gpu/build.mjs --release。'],
 E_NATIVE_MODULE_MISSING:['未找到 Servo 运行时。','将已审核的 Servo 组件安装到 Frameweave 的 native-bin/win32-x64/servo；如果设置了 FRAMEWEAVE_SERVO_RUNTIME，请检查指定目录是否存在。'],
 E_SPIDERMONKEY_MISSING:['未找到 JavaScript 执行运行时。','安装与当前 SDK、系统和架构匹配的 SpiderMonkey 运行时，然后重试。'],
 E_FFMPEG_MISSING:['未找到媒体编码程序 FFmpeg。','检查 FFmpeg 安装和当前发行包的运行依赖，恢复后重新导出。'],
 E_REPL_PROJECT:['尚未打开可用工程。','先使用 .open --trusted-local-code <工程路径> 打开已审阅的本地工程。'],
 E_REPL_TRUST:['尚未确认执行此本地工程代码。','审阅工程后，使用 .open --trusted-local-code <工程路径> 明确授权本次打开。'],
 E_NATIVE_BUDGET:['当前运行预算不足。','可用 --memory-mib 调整运行预算；同时确认设备有足够可用内存。'],
 E_NATIVE_SEED_BUDGET:['初始数据超过当前运行预算。','检查数据大小，并在设备容量允许时使用 --memory-mib 调整预算。'],
 E_NATIVE_TRANSPORT_BUDGET:['数据传输超过当前运行预算。','检查传输数据与并发量，在设备容量允许时使用 --memory-mib 调整预算。'],
 E_DAG_CYCLE:['Stage 依赖形成了循环。','检查下方依赖链，移除静态环；需要循环计算时使用受支持的显式 Stage 编排。'],
 E_LAYER_CYCLE:['图层父子关系形成了循环。','检查图层引用，确保图层不能直接或间接包含自己。'],
 E_ENGINE_CONFLICT:['同一 Stage 内的模块没有共同兼容的执行后端。','检查各模块的 Engine 要求；选择兼容模块，或显式使用独立 Stage 和端口传递数据。'],
 E_ENGINE_INCOMPATIBLE:['指定的执行后端与模块要求不兼容。','检查 Stage 的 engine 和模块兼容声明，选择共同支持的后端。'],
 E_ENGINE_AMBIGUOUS:['无法唯一确定此 Stage 的执行后端。','按下方候选信息显式指定兼容的 engine。'],
 E_GRAPHICS_WRITING_MODE:['当前段落工具尚不支持竖排数据。','使用已支持竖排的字形绘制接口；保持原始书写方向，勿删除字段绕过检查。'],
 E_PORT_TYPE:['Stage 端口的数据类型不兼容。','核对上游输出与下游输入类型；图像、PCM 和普通数据不能直接互相替代。'],
 E_INPUT_TYPE:['输入数据类型不符合 Stage 要求。','核对输入端口声明和上游输出类型，传入匹配的数据。'],
 E_OUTPUT_EMPTY:['所选范围内没有已放置的视觉或音频内容。','检查 Layer、素材时间范围和导出范围；仅声明 Stage 不代表素材已经放入作品。'],
 E_CONTENT_DURATION:['素材时长无法满足当前输出规划。','按下方原因核对素材时长；未知或无限时长的内容需要明确指定有限输出范围。'],
 E_WASM_PERMISSION:['工程需要的 WASM 执行尚未获准。','审阅工程后，可按该命令的运行要求使用 --allow-wasm；这不会授予文件或网络访问权限。'],
 E_INSPECTION_WASM_AUTH:['此次帧检查尚未获准执行 WASM。','审阅工程后，为此次检查显式使用 --allow-wasm；授权不会自动沿用到后续调用。'],
 E_NATIVE_SHARED_ADAPTER:['当前原生执行路径尚不支持此共享状态适配方式。','使用已支持的状态与显式输入输出接口；不要将普通变量误当作跨 Stage 共享状态。'],
 E_NATIVE_SEGMENT_FAILED:['分段执行失败，此渲染会话已不可继续使用。','保存下方原因，修复后关闭并重新打开渲染会话；不要继续使用失败会话的状态。'],
 E_PACKAGE_IMPORT_FORM:['受管理模块的导入方式不受支持。','按模块公开 API 使用标准命名导入，并检查包的导出声明。'],
 E_PACKAGE_IMMUTABLE:['已有模块版本的内容不能被覆盖。','保留已发布版本；修改后的模块请使用新版本号并重新审核安装。'],
 E_PLUGIN_IMMUTABLE:['已有插件版本的内容不能被覆盖。','为修改后的插件使用新版本号，并在审核后更新工程引用。'],
 E_PACKAGE_MISSING:['缺少工程依赖的模块。','使用工程的模块配置和锁文件恢复匹配的依赖后再运行。'],
 E_PLUGIN_MISSING:['缺少工程使用的插件。','按工程锁文件安装对应 ID 和版本的插件，再重新运行。'],
 E_NATIVE_REACT_DOM:['原生 React Stage 不提供浏览器 DOM。','使用 Native React 支持的节点；需要 HTML/CSS 时通过 Servo 模块运行。'],
 E_SPIDERMONKEY_NODE_MODULE:['Stage 执行环境不能加载此 Node.js 模块。','将 Node 专用操作放到允许的宿主接口中，通过显式输入输出向 Stage 传递数据。'],
 E_SPIDERMONKEY_NODE_GLOBAL:['Stage 执行环境不提供此 Node.js 全局对象。','使用当前 Stage SDK 提供的能力；Node 操作应在允许的宿主接口中执行。'],
 E_SPIDERMONKEY_DYNAMIC_IMPORT:['此 Stage 不支持当前动态导入方式。','改用可静态解析的导入，或使用已支持的受管理模块加载机制。'],
 E_GPU_UNAVAILABLE:['没有找到满足要求的 GPU 执行环境。','检查硬件、驱动和运行时能力；GPU-required 效果需要兼容硬件，不能用软件或 SDR 回退代替。'],
 E_NATIVE_BACKEND_REQUIRED:['此效果需要指定能力的原生 GPU 后端。','检查硬件、驱动和模块要求；保持原有精度，不通过切换 Preview 或软件回退绕过要求。'],
 E_NATIVE_SHADER:['图形着色程序编译失败。','按下方文件、行号和编译原因检查着色代码。'],
 E_SEARCH_MODEL:['语义检索模型不可用。','检查本地语义模型配置；只需关键词查找时可显式使用 --mode keyword。'],
 E_AUDIO_CLIPPING:['音频混音发生了削波。','检查各轨音量和混音峰值，调整增益或使用工程明确选择的限幅处理。'],
 E_AUDIO_NO_VISUAL:['工程没有可导出的视觉内容。','纯音频请导出 WAV；需要视频时明确添加视觉内容。'],
 E_AUDIO_VIDEO_REQUIRED:['此导出方式需要视觉内容。','为视频添加视觉内容，或选择适合纯音频的 WAV 输出。'],
 E_PA_FONT_MISSING_GLYPH:['当前字体不包含所需的字形。','按下方字符或字形编号检查字体覆盖范围，提供包含该字形的字体或显式配置受支持的字体回退。'],
};

// Longest prefix wins, so a font or video failure remains distinguishable from
// a general Native failure. Shared categories below refine the actual cause.
const subjects:Readonly<Record<string,string>>={
 NATIVE_FONT_IMAGE:'字体内嵌图像',NATIVE_VIDEO:'原生视频解码',NATIVE_MEDIA:'原生专业媒体',
 NATIVE_OCIO:'专业色彩转换',NATIVE_COLOR:'专业色彩处理',NATIVE_OPTIX:'OptiX 光线计算',
 NATIVE_RAY:'光线计算',NATIVE_MODULE:'原生模块',NATIVE_SEGMENT:'分段执行',
 NATIVE_STATE:'GPU 状态',NATIVE_TEMPORAL:'时间采样',NATIVE_RESOURCE:'渲染资源',
 NATIVE_REACT:'原生 React',NATIVE_BINARY:'二进制数据',NATIVE_DATA:'数据访问',
 PA_FONT:'字体处理',PA_TEXT:'文字排版与动画',PA_GLYPH:'字形处理',PA_OPENTYPE:'OpenType 字体',
 PA_PATHOPS:'路径运算',PA_PATH:'路径动画',PA_SMART_MORPH:'形状变形',PA_GEOMETRY:'几何处理',
 PA_TIME:'时间效果',PA_TRANSITION:'转场效果',PA:'专业动画效果',NATIVE:'原生渲染',
 AUDIO:'音频处理',MEDIA:'专业媒体处理',GPU:'GPU 图像处理',SERVO:'Servo 内容渲染',
 SPIDERMONKEY:'JavaScript Stage 执行',PACKAGE:'模块管理',PLUGIN:'插件管理',
 RUNTIME:'运行时',SHARED:'共享状态',STAGE:'Stage 执行',RENDER_SESSION:'渲染会话',
 RENDERER:'渲染器',RENDER:'渲染',REPL:'交互控制台',RESOURCE:'工程资源',
 ENGINE:'执行后端选择',BACKEND:'执行后端',ANALYSIS:'媒体分析',INSPECTION:'渲染检查',
 CAPABILITY:'能力查询',EFFECT:'效果调用',EXPORT:'工程导出',FLAT:'单文件工程导出',
 PORTABLE:'便携工程',PORT:'Stage 端口',INPUT:'Stage 输入',OUTPUT:'输出规划',
 FRAME:'帧求值',TIME:'时间范围',CLOCK:'时间计算',CONTENT:'素材时长',LAYER:'图层合成',PREVIEW:'实时预览',
 COMPOSITION:'合成配置',TVG:'场景图',JSX:'TSX 场景',PROJECT:'工程加载',
 GRAPHICS:'图形数据',VISUAL:'视觉内容',DIMENSIONS:'画幅设置',BACKGROUND:'背景设置',BLEND:'图层混合',
 KEYFRAMES:'关键帧',EASING:'缓动函数',EXPRESSION:'动态表达式',SPRING:'弹性动画',
 SEED:'随机种子',SEEK:'时间定位',SERIALIZE:'数据序列化',SCHEMA:'数据结构验证',
 SVG:'SVG 图像',TEXT:'文字内容',MANAGED:'受管理模块',UNKNOWN:'属性验证',INACTIVE:'输入时间范围',
 WASM:'WASM 执行',INFERENCE:'模型推理',DEEP:'Deep EXR',NANOVDB:'稀疏体积数据',
 OPTIX:'OptiX 运行时',NVIDIA:'NVIDIA 设备互操作',SPATIAL:'空间效果',PARTICLE:'粒子效果',
 MESH:'网格变形',PUPPET:'木偶变形',RIG:'骨骼动画',RIGID:'刚体模拟',DEFORM:'形变模拟',
 CHARACTER:'角色处理',CONTACT:'碰撞接触求解',COUPLED:'耦合模拟',SIMULATION:'模拟计算',
 CREATION:'场景创作',DECODE:'媒体解码',ENCODE:'媒体编码',PROBE:'媒体信息读取',COMPARE:'图像比较',
 BUILD:'工程构建',COMPILE:'工程编译',TYPECHECK:'类型检查',SEARCH:'效果检索',
 DAG:'依赖调度',EXISTS:'输出保存',WEB:'旧 Web 接口',CHROMIUM:'旧浏览器接口',
 FINISHING:'画面后期',FIXTURE:'验证示例',HOOK:'扩展回调',KEY:'抠像处理',TEMPORAL:'时间效果',
};
const orderedSubjects=Object.entries(subjects).sort((a,b)=>b[0].length-a[0].length);
const categories:readonly (readonly [RegExp,Explanation])[]=[
 [/(?:^|_)(?:INTEGRITY|HASH|LOCK|RECEIPT)(?:_|$)/,['完整性校验未通过。','核对 SDK、运行时、模块内容和锁文件是否匹配；恢复已验证版本，不要删除校验或盲目刷新锁文件。']],
 [/(?:^|_)(?:UNDECLARED|READ_ONLY|PERMISSION|TRUST|ACCESS|SANDBOX|POLICY|DENIED|AUTH)(?:_|$)/,['访问被权限或执行策略拒绝。','检查工程声明、资源用途和当前授权；只授予已审阅代码真正需要的权限，不要关闭校验。']],
 [/(?:^|_)(?:CANCELLED|SUPERSEDED|TERMINATED)(?:_|$)/,['操作已取消或被新的请求替代。','需要继续时重新提交请求；若由源码更新触发，查看最新一次请求的结果。']],
 [/(?:^|_)TIMEOUT(?:_|$)/,['处理超时。','查看下方停滞位置；确认任务正常但需要更多时间时，可按该命令支持的 --timeout 或超时选项调整。']],
 [/(?:^|_)(?:CLOSED|DISPOSED|FINALIZED|NOT_LIVE|DISCONNECTED|SESSION_REOPEN)(?:_|$)/,['所用会话或资源已关闭或失效。','重新打开会话或创建资源后再调用，不要复用已经释放的对象。']],
 [/(?:^|_)(?:BUSY|CONCURRENCY|CONCURRENT|REENTRANT|BACKPRESSURE)(?:_|$)/,['当前操作与尚未完成的任务冲突。','等待当前调用完成，或取消后再调用；不要并发修改同一会话或资源。']],
 [/(?:^|_)(?:BUDGET|MEMORY|ALLOCATION)(?:_|$)/,['当前资源预算或可用容量不足。','检查下方所需资源和预算；在设备容量允许时调整对应预算，或减少并发和临时资源占用。']],
 [/(?:^|_)(?:MISSING|NOT_FOUND|REQUIRED)(?:_|$)/,['缺少当前操作所需的依赖、资源或能力。','按下方名称补齐匹配版本的依赖、资源或能力，并检查工程中的声明与引用。']],
 [/(?:^|_)(?:OUTPUT_EXISTS|CHECKPOINT_EXISTS|DUPLICATE|EXISTS|CONFLICT)(?:_|$)/,['目标已存在或声明发生冲突。','核对下方标识、路径和冲突项；使用唯一名称或新的输出路径，已有版本不可直接覆盖。']],
 [/(?:^|_)(?:ABI|VERSION|PROTOCOL|HANDSHAKE)(?:_|$)/,['接口或数据版本不匹配。','使用相互兼容的 SDK、模块、运行时和数据版本；不要仅修改版本字段绕过验证。']],
 [/(?:^|_)(?:CHANGED|STALE|EPOCH|RECONFIGURE|IDENTITY)(?:_|$)/,['资源或执行身份已发生变化。','重新构建工程并打开新会话，确认引用和状态来自同一版本后再运行。']],
 [/(?:^|_)(?:OWNER|OWNERSHIP|SCOPE|CONTEXT|LEASE|TICKET)(?:_|$)/,['资源不属于当前调用或已超出有效作用域。','在所属 Stage、会话和有效调用期间使用资源；跨边界通过受支持的端口或资源接口传递。']],
 [/(?:^|_)(?:CAPABILITY|UNSUPPORTED|UNAVAILABLE|PLATFORM|BACKEND|DEVICE|HARDWARE|INTEROP|ADAPTER|CPU_FALLBACK|CPU_POLICY)(?:_|$)/,['当前设备、后端或运行时不支持此操作。','核对模块要求、设备能力、驱动和运行时安装；GPU-required 或专业精度要求不能通过软件或 SDR 回退绕过。']],
 [/(?:^|_)(?:COLOR|ALPHA|OCIO|ICC|LUT|WORKING_SPACE|HDR|BITSTREAM|PRECISION|ACCURACY|TRANSFER)(?:_|$)/,['色彩、透明度或精度合同未满足。','核对 Surface 格式、色彩空间、Alpha 和输出配置，并保留要求的精度；不要用降低阈值或 SDR 回退掩盖问题。']],
 [/(?:^|_)(?:CYCLE|ASYNC_CYCLE)(?:_|$)/,['依赖关系形成了不受支持的循环。','按下方依赖链检查引用，拆除循环或采用当前接口明确支持的编排方式。']],
 [/(?:^|_)(?:SCHEMA|ARGUMENT|PARAM|PARAMETER|PARAMETERS|OPTIONS|SETTINGS|CONFIG|DESCRIPTOR|METADATA)(?:_|$)/,['参数或数据结构不符合接口要求。','按下方字段说明核对参数类型、必填项、默认值和取值约束。']],
 [/(?:^|_)(?:TIME|CLOCK|INTERVAL|PTS|SEQUENCE|FRAME|COVERAGE|GAP|RATE|DURATION)(?:_|$)/,['时间、帧或采样范围不符合要求。','检查项目帧率、素材时长、起止范围和时间映射；音频区间还需匹配采样率。']],
 [/(?:^|_)(?:DIMENSIONS|SIZE|RANGE|LIMIT|LENGTH|OFFSET|ADDRESS|BYTES|OUTPUT_SIZE)(?:_|$)/,['数据大小、范围或运行限制不符合要求。','对照下方实际值与允许范围检查输入；可配置预算与设备或协议上限应分别处理。']],
 [/(?:^|_)(?:DEPENDENCY|DEPENDENT|REF|REFERENCE|BINDING|IMPORT|IMPORTS|EXPORT|EXPORTS|MODULE)(?:_|$)/,['依赖、导入或端口绑定未能完成。','检查公开导出名称、端口引用和依赖版本，确保它们存在且满足当前运行环境的要求。']],
 [/(?:^|_)(?:FORMAT|ENCODING|TYPE|DTYPE|LAYOUT|SHAPE|STRIDE|PROFILE|CONTAINER|CODEC|QUANTIZATION)(?:_|$)/,['数据格式或布局不符合要求。','核对输入输出格式、通道布局和编码配置，并使用接口明确支持的格式。']],
 [/(?:^|_)(?:PATH|IO|WRITE|STORAGE|RESOURCE|ASSET|FILE)(?:_|$)/,['资源访问或文件读写失败。','检查下方路径、文件是否存在、访问权限和磁盘空间，并确认资源已在工程中声明。']],
 [/(?:^|_)(?:NUMERIC|FINITE|CONVERGENCE|INFEASIBLE|STABILITY|SOLVE|FOLDOVER)(?:_|$)/,['数值计算未得到有效或稳定的结果。','检查输入中的非有限值、几何退化和求解参数；保留原有精度与收敛标准。']],
 [/(?:^|_)(?:GEOMETRY|TOPOLOGY|CONTOUR|TESSELLATION|DEGENERATE|MESH)(?:_|$)/,['几何或拓扑数据不满足处理要求。','检查退化边面、顶点索引、路径闭合和拓扑约束，并核对下方具体位置。']],
 [/(?:^|_)(?:DECODE|ENCODE|PROBE|WAV)(?:_|$)/,['媒体读取、解码或编码失败。','检查源文件、媒体格式和匹配的编解码程序，按下方原始原因处理。']],
 [/(?:^|_)(?:SHADER|KERNEL)(?:_|$)/,['着色或计算程序执行失败。','检查下方编译原因、绑定布局和设备能力，修正对应着色或计算代码。']],
 [/(?:^|_)(?:CLEANUP|DISPOSE)(?:_|$)/,['资源清理未能正常完成。','保存下方原因并关闭会话后重试；若持续发生，附完整命令和详细日志报告问题。']],
];

export function describeCLIDiagnostic(d:Pick<Diagnostic,'code'|'message'>):CLIDiagnosticExplanation {
 // Native errno values may have been wrapped as E_INTERNAL at the service boundary.
 if(d.code==='E_INTERNAL'||/^(?:ENOENT|ENOTDIR|EACCES|EPERM|ENOSPC|EDQUOT)$/.test(d.code)){
  if(/\b(?:ENOENT|ENOTDIR)\b|no such file/i.test(d.code+' '+d.message))return {title:'找不到需要的文件或目录。',advice:'检查下方路径、文件名和依赖文件是否存在。',coverage:'category'};
  if(/\b(?:EACCES|EPERM)\b/.test(d.code+' '+d.message))return {title:'文件或目录访问被系统拒绝。',advice:'检查路径访问权限、文件是否被占用和目标目录是否可写。',coverage:'category'};
  if(/\b(?:ENOSPC|EDQUOT)\b/.test(d.code+' '+d.message))return {title:'存储空间或磁盘配额不足。',advice:'检查输出盘和临时目录的可用空间，释放空间或选择其他目录。',coverage:'category'};
 }
 const specific=exact[d.code];
 if(specific)return {title:specific[0],advice:specific[1],coverage:'specific'};
 const key=d.code.startsWith('E_')?d.code.slice(2):'',subject=orderedSubjects.find(([prefix])=>key===prefix||key.startsWith(prefix+'_'))?.[1];
 const category=categories.find(([pattern])=>pattern.test(key))?.[1];
 if(category)return {title:(subject?subject+'：':'')+category[0],advice:category[1],coverage:'category'};
 if(subject)return {title:subject+'未能完成。',advice:'根据下方原始原因检查'+subject+'的输入和配置；使用 --verbose 查看详细信息，仍无法解决时附完整命令与错误码报告问题。',coverage:'subsystem'};
 return {title:'当前操作遇到了未识别的错误。',advice:'保留下方错误码和原始原因，使用 --verbose 查看详细信息，并连同完整命令和复现步骤报告问题。',coverage:'fallback'};
}
