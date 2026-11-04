# P4-EXT-C2：递归参数协议 v2

本协议扩展已有 P4 Parameter/PluginManifest/PluginStage，不增加另一套动画、TVG 或执行 ABI。对象/数组默认值、结构和叶子动画由同一参数校验路径处理。实现与示例基于本分支；正式发布版本尚待集成阶段决定。

## 版本与发布边界

| 字段 | 规则 |
| --- | --- |
| Manifest schemaVersion | 仍为 1 |
| P4 apiVersion | 仍为 1，create/render/dispose 不变 |
| parameterSchemaVersion | 缺省或 1 为原标量协议；2 为递归协议；其他值明确拒绝 |
| TVG schemaVersion | 仍为 `0.1` |
| compatible | 继续使用既有引擎范围解析与检查，参数版本不代替引擎版本 |

**尚未指定支持 C2 的最低发布版本，当前根 package.json 仍为 0.1.0。** 不为参数系统伪造一个引擎版本，不把 `^0.1.0` 宣称为 v2 的发布兼容范围。示例是未发布的内联集成 fixture，仅用精确 `0.1.0` 在本 C2 开发分支运行；它不是旧 0.1.0 标量引擎的兼容声明，不可原样发布成效果包。旧解析器仍会明确拒绝 v2 字段。

集成发布时必须一起选择 package.json 的正式版本、v2 模块的 compatible、Node 的 `src/compiler/runtime-lock.ts::engineVersion/runtimePin` 和 Web 的 `StageInit.engineVersion`。整合版本已接入这些统一接口，保留 v1 required 与 partial 校验；计划和原生效果共用 plugins/plan.ts。已有示例锁经审核仅更新 SDK 指纹，插件本体锁保持。测试中的新临时 fixture 生成自己的新锁。

## SDK 与清单

```ts
type ScalarParameterV2 =
  | {type:'number'; default?:number; required?:boolean;
     minimum?:number; maximum?:number; integer?:boolean; enum?:readonly number[]}
  | {type:'string'; default?:string; required?:boolean;
     minLength?:number; maxLength?:number; enum?:readonly string[]}
  | {type:'boolean'; default?:boolean; required?:boolean; enum?:readonly boolean[]};

type ParameterV2 = ScalarParameterV2
  | {type:'object'; properties:Record<string,ParameterV2>;
     required?:readonly string[]; additionalProperties?:false;
     default?:Record<string,ParameterValue>}
  | {type:'array'; items:ParameterV2; minItems?:number; maxItems?:number;
     required?:boolean; default?:ParameterValue[]};
```

ParameterValue 是支持的有限数值/string/boolean/object/array 的递归值类型，不接收 null、函数、Promise、Map、Date 或 native 对象。它不能替代清单的字段 Schema；每个值仍逐节点按声明检查。没有引入 JSON Schema 执行引擎或远程 `$ref`。`docs/plugin.schema.json` 是对应的机器可读结构格式，CLI 还检查深度、预算、required 成员、默认值和范围等语义。

原 Parameter、PluginManifestV1 及旧标量校验路径保持；PluginManifest 是 v1/v2 的判别联合，结构化参数必须显式选择 2。原 `Animated` 导出保留，内部递归到数组和对象叶子；新增 AnimatedValue、ParameterInput、ParameterType、ParameterInputs、ManifestParameters 等类型。v2 defineEffect 从清单推导调用输入与渲染输入，不能通过落入 v1 泛型重载绕过 v2 类型约束。

## required、未知字段与默认值

- 对象封闭，未知字段始终拒绝；`additionalProperties` 只能省略或为 false。Schema 自身的未知字段也拒绝。名称遵循现有字母开头的属性规则。
- `object.required` 是本对象中必须存在的属性名列表，成员必须唯一且已声明。number/string/boolean/array 的 `required:true` 表示缺省时必须提供，不能同时声明 default；false 可显式允许省略。
- 顶层参数没有 default 时默认为必填，明确 required:false 的标量/数组除外。对象通过 required 属性名列表描述内部约束；无默认值的顶层对象仍须提供。
- 子属性缺省时先应用该节点 default，再检查 required。列表中的属性若有有效默认值，可以由默认值满足；没有默认值的 required 字段必须由调用方提供。
- 缺省节点与显式 undefined/null 有区别；后两者非法，不触发默认值。数组不能稀疏。
- 默认值必须是已解析的静态数据，不允许 Signal AST。递归校验后每次返回新的对象/数组，插件不能通过修改一次参数污染下一帧或其他调用。
- 默认值只用于**缺省节点**。传入一个对象后，按其子 Schema 填子节点默认值，不把整个父对象 default 与传入对象做隐式深度合并。
- 未提供的可选对象不会仅因其子字段有默认值就自动创建；需要这一行为时，显式提供 `{}` 或为该对象声明 `default:{}`。

例如 `position:{x:20}` 可以从 position.properties.y.default 得到 y；如果 position 缺省且为 required，则需要 position 自己有 default 才能成立。

## 动画与验证顺序

1. 原 TS 类型检查和 TVG JSON/Signal 检查先执行。Stage.props 的递归求值能力已经存在，未重写。
2. v2 编译检查外层结构、required、未知字段、长度、普通标量，以及叶子 Signal 的类型；用原 checkSignals/validateKeyframes/spring 检查语法和关键帧端点。默认值递归填充后保留原 Signal AST。
3. Preset 在自己的参数 Schema 下完成相同步骤，再执行既有 `$param` 替换。被转发的对象、数组和叶子 Signal 进入子效果的校验，不跳过子效果 Schema。v2 Preset 可以继续调用合法的 v1 标量效果。
4. 每次实际 render 或 temporal sample，仍先调用原 evaluate，再递归检查求值后的结果，最后才调用插件。表达式的动态范围、弹簧/Bezier 中间过冲、enum 等不能仅靠端点推断，因此逐帧再次检查。

number 叶子支持原关键帧、表达式和弹簧；string 叶子支持原字符串/颜色关键帧；boolean 保持静态。未新增对象插值、数组 Morph、索引配对、ID 匹配或动态拓扑规则。Pin/Stop/Control Point 的稳定 ID 属于专业模块；示例模块自己拒绝重复或变动的 ID。

参数错误带完整路径，例如 `example.structured-pins.pins[0].position.x`；现有 Runtime/Adapter 继续补充 Stage 和帧。未知协议报 E_PLUGIN_PARAMETER_SCHEMA，非法数据为 E_PLUGIN_PARAM，预算或循环为 E_PLUGIN_PARAM_BUDGET；原 Signal 语法错误继续保留 E_KEYFRAMES/E_EXPRESSION/E_SPRING。

## 预算

v2 专用预算不改变 v1 行为：Schema/结构深度 16（顶层参数为 0）、每个数组最多 1024 项、每个对象/参数表最多 256 个字段、每次输入和默认值展开最多 8192 节点、字符串最多 65536 个 UTF-16 code units。min/maxItems 不能突破硬上限；min/maxLength 也不能突破字符串上限。

Signal AST 的原始数据遍历额外保留 8 层包装预算，表达式/关键帧数据仍计入节点数和数组上限；实际对象/数组结构仍受 16 层限制。验证先做有界遍历，再使用原 Signal 校验器，避免把无限递归输入交给它。

## TSX 用法与真实示例

完整可编辑工程：`examples/structured-parameters/project.tsx`，使用 v2 defineEffect 推导 `.use()` 输入，渲染端得到已填默认值的结构。

```tsx
Pins.use({pins:[
  {
    id:'hand',
    position:{
      x:keyframes([{frame:0,value:20},{frame:12,value:140}]),
      y:expr.add(20,expr.frame)
    },
    color:keyframes([{frame:0,value:'#67ead5'},{frame:12,value:'#ff886b'}])
  },
  {id:'anchor',position:{x:80,y:70}}
]})
```

也可以继续使用普通 `plugin('id@version', params)`，由实际清单执行编译和逐帧校验。任意字符串 ID 不能自动生成 TypeScript 参数类型；需要强类型 companion 时使用 `typedPlugin<P,R>`，R 显式列出顶层必填字段。companion 不掌握清单默认值时，应在其输入 P 中把可省略的子字段标为可选。

```powershell
$env:FRAMEWEAVE_HOME = Join-Path (Get-Location) '.frameweave/user-home'
npm run typecheck
node --import tsx --test tests/parameter-schema-v2.test.ts
npm run frameweave -- frame examples/structured-parameters/project.tsx --frame 6 --output artifacts/parameter-v2/frame-6.png
```

示例是内联效果，不需要生成、更新或绕过已有锁。专项测试生成实际首/中/末/乱序 PNG 和 13 帧 MP4；文件在 artifacts/parameter-v2/tests/。渲染证明与最终测试统计见交付报告。

## 与主分支和 P4-R1 的集成

整合版本在 plugins/plan.ts 共用 v2 静态规范化、递归默认值和 Preset 展开；执行时仍先 evaluate，再由 parameters 校验，最后调用插件。原生 createEffectRuntime 使用同一路径。

v1 保留 Parameter 的 default / required:true 联合、partial 检查、自动必填推导及显式泛型重载。v2 输入与已解析类型继续分开；v1 泛型重载不会接收 v2 清单来绕过实现参数类型。

R1 的包兼容性检查已使用统一实际引擎版本。开发用 v2 包已测试安装、嵌套动画、递归默认值及原源码不可用时的容器导出。当前没有发布正式 v2 包，最低发布版本仍待明确；选择发布版本后须同步 compatible 和审核后的锁迁移。

包内模块加载仍使用 R1 的显式声明与完整性锁；WASM 另需宿主 allowWasm / --allow-wasm，能力声明不等于授权。普通 v2 效果可平铺导出，含 R1 模块加载器的包仍需目录或 --layout capsule。