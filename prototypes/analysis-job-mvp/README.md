# Analysis Job MVP

已迁移至公共C3的真实人脸分析示例。通用任务、子进程和持久Artifact在`src/analysis`；本目录保留解码、MediaPipe、TrackData查询和Stage演示。不改P4、TVG或Stage调度语义。

job.ts现在仅为领域输入到公共API的薄适配，不再有本地生命周期或持久化实现。正式API见[ANALYSIS_TASK.md](../../docs/ANALYSIS_TASK.md)，迁移对照见[C3-INTEGRATION.md](C3-INTEGRATION.md)。冻结MVP提交和validation不改写。

## 运行

从本目录执行；父仓库需已有自己的 npm 依赖和 Chromium。

```powershell
npm ci --ignore-scripts --no-audit --no-fund
# 复用已准备的素材与模型，本轮不执行下载。
node --import tsx run.ts --start 0 --end 8 --fps 8 --width 640
npm test
npm run verify
npm run demo
```

历史`prepare-assets`手动工具保留，但本轮没有调用，C3也不下载模型。素材复用已有SHA固定的OpenCV David视频和官方float16/1模型，只用作内部验证，不宣称商业素材授权。MediaPipe依赖仍为`@mediapipe/tasks-vision@1.2.0`。

旧`evidence/face-follow.mp4`和`generated/project.tsx`保留。C3使用新的evidence/c3-*目录（或FRAMEWEAVE_C3_OUTPUT）与generated/c3/KEY/project.tsx，输出8秒640×480/8fps演示。设置同一输出目录后依次运行verify、demo、verify:export；导出验证需要该次demo的PNG：

```powershell
$env:FRAMEWEAVE_C3_OUTPUT = Join-Path (Get-Location) 'evidence/c3-NEW'
npm run verify
npm run demo
npm run verify:export
```

## 程序接口

```ts
const job = createAnalysisJob({
  mediaPath, modelPath, modelVersion: 'float16/1',
  startSeconds: 0, endSeconds: 8, sampleRate: 8, analysisWidth: 640
});
job.subscribe(status => console.log(status));
job.start();
const result = await job.wait();
// job.status() 查询；job.cancel() 请求取消；wait() 传播失败或 E_CANCELLED。
const track = JSON.parse(await readFile(join(result.artifact.directory, result.output.trackFile), 'utf8'));
const at = queryTrack(track, 3.125); // 素材自身从0开始的秒数，纯函数二分查询
```

一个Job拥有一个子进程和一个分析浏览器。输入指纹、解码和推理在自有子进程；宿主以异步流复核结果完整性。同步WASM只阻塞私有分析页面，不进入逐帧渲染。网页与模型请求由Playwright本地白名单直接提供，不启动分析HTTP服务，不访问CDN。

结果在本工作区`.frameweave/analysis-c3/face/<key>/`持久化，旧MVP缓存不修改。公共C3处理Manifest、SHA校验、临时写入、清理和宿主原子发布。TrackData仍为analysis.track/1；状态成功改名为succeeded；wait仅在进程退出、清理及发布结束后兑现。

轨迹坐标是解码后显示帧的归一化坐标，左上原点、x向右、y向下；时间为素材绝对微秒。`confidence:null`表示SDK没有提供可用的逐脸检测分数，`valid`才是观测有效性标记。ID只代表单个可见脸的连续片段；缺失或大跳变会新建片段，不宣称识别人或跨遮挡重识别。

查询默认只在同片段、均有效且间隔有限的邻点间线性插值。缺失、越界、无包围点返回明确失败原因；不外推，不为了画面连续而伪造位置。插值只用于已分析结果的采样，不创建新关键帧系统。

## 验证边界

`npm test`含明确标记的人工边界单元测试；`npm run verify`运行真实MediaPipe浏览器任务、取消／错误／失效、调用者与独立UI响应性、原引擎乱序渲染与实际标签像素检查。它们使用不同证据文件，不把单元测试数据当作分析结果。

限制：单脸、最多20秒/600个样本；不支持后台队列恢复或分布式调度；不包装成新P4 kind；没有验证多脸身份、VFR精确原始PTS、非方形像素、跨浏览器／GPU确定性。10秒未能正常取消时只对本Job拥有的进程树做强制清理；强制路径的资源状态会明确标记未知，不能等同正常dispose。

## 冻结验证记录

MVP历史审计见[REPORT.md](REPORT.md)，迁移对照见[C3-INTEGRATION.md](C3-INTEGRATION.md)。`validation/`仍保存冻结时37项自动化测试、13项真实集成检查，不能将它们作为本次C3运行记录。本次结果保存在新的outputs/analysis-c3目录。依赖、模型、缓存、生成工程和影片保留本地，不入库。
