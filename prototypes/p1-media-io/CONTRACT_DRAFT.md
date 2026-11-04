# P1 可选资源与媒体 I/O 接缝（待确认草案）

这是隔离格式/库实验和最小接口提案，不是公开 API、Graphics Schema 或已接入的 Stage 功能。`ProfessionalSurface` 继续只表示原有 RGBA；不添加 TVG 节点、GPU Host、调度器、包管理或默认权限。P1 光追冻结实现见 `modules/native-gpu/RAY_QUERY.md`。

## 现有证据与候选版本

- `modules/native-gpu/resources.ts::NativeResource` 只接图像/视频。`resource-images.ts` 的 verified lease/model 处理可作为资产装载基础，不能把任意二进制伪装成图像。
- `modules/graphics-contracts/resources.ts::verifyResource` 已验证字节长度/内容身份；`compute-types.ts::GpuDataBuffer/GpuFieldDescriptor` 已有非颜色字段与空间元数据。复用这些身份/字段，不新建竞争性资源或能力表。须检查现有公共验证器的体积上限是否适合大体积资产，不能以禁用校验解决。
- `src/media/ocio_bridge.py::run` 当前 EXR 分支明确堆叠 RGBA；它不是多通道/Deep reader。保留原行为，扩展放在可选媒体 I/O 模块。
- 独立试验使用已安装 OpenEXR **3.4.4**、NumPy **2.3.4**，并核对 [Python 构建配置](https://github.com/AcademySoftwareFoundation/openexr/blob/v3.4.4/src/wrappers/python/CMakeLists.txt)、`tests/test_deep.py`、`PyOpenEXR.cpp::PyFile::__exit__`。库是 BSD-3-Clause，NumPy 许可从当前已安装发行包保留；没有重新分发 wheel/原生库。
- NanoVDB 候选固定 OpenVDB **v12.1.1**，NanoVDB ABI **32.8.0**，Apache-2.0。核对 [NanoVDB.h](https://github.com/AcademySoftwareFoundation/openvdb/blob/v12.1.1/nanovdb/nanovdb/NanoVDB.h)、`tools/{CreatePrimitives,GridValidator,GridChecksum}.h`、`io/IO.h`、`nanovdb/nanovdb/CMakeLists.txt`。只读树、32 字节对齐、库访问器不跨线程共享是格式/实现约束。本实验用现有 MSVC 编译 header-only 路径，无 CUDA/TBB/OpenVDB Core、压缩库或新安装工具。**这不等于已实现 .vdb reader、GPU NanoVDB 或可写稀疏模拟。**

## 最小公共接缝候选（名字均未冻结）

1. 复用已声明 `ResourceReference`/P4-R1 内容身份，增加一个**可选**“已封印二进制 → 同 owner 只读数据缓冲”装载操作。输入仅 Resource ID、精确 bytes/hash、类型/布局、所需字节段及显式预算；不接作者路径、URL、DLL 或设备指针。宿主核实声明/信任并创建已有私有 source lease，Native owner 只打开该 lease 的固定文件。装载/恢复时验证一次快照；后续帧不重哈希文件。
2. 首个存储 profile 仅小端 `u32` words，可给最后一个字补零并保留真实 byteLength；数值型 f32/u32/i32 继续用既有 Field 描述。CPU→GPU 首次上传必须计入预算/统计，不能声称零复制。令牌绑定 owner/device generation，默认只读，缓存键包含内容身份、字节段、解析器/profile 版本、字段解释；同一 owner 复用，跨 owner 不传原生句柄。
3. 只读必须在 Native shader/binding admission 兑现，不能只依赖 TS 的 readOnly 或把 `Data.immutable` 缓存提示当成权限。需要写入时显式 clone 到现有可写缓冲。格式解析器负责所有内部偏移/长度、对齐、版本、索引和溢出验证；CPU 不能把任意字节直接 reinterpret 为 NanoVDB 结构。
4. 稀疏体积 token 在上述接缝上由**可选格式模块**建立：只先接经验证的 NanoVDB Float/raw-grid/未压缩资产，明确 grid class、背景值、active 状态、index↔world 变换、体素尺寸与空间/单位。GPU 访问算法必须按实际 storage-binding/device/session 限制分块并验证参考；不把 SDF 与 density 互换，不伪装 RGBA，不自动解压任意 codec。`.vdb` 转换与可写拓扑后续独立。
5. GPU 缓冲/解析器工作区/AS/纹理、宿主 staging/解压后大小一起预检 caller budget，算术先用宽整数，不先申请再报超限。操作取消后丢弃未发布租约；已提交 GPU 工作依现有完成票据回收。关闭 owner/资源替换/失败只释放自身资源，generation 旧令牌必拒绝。不增加每帧 CPU/GPU 数值扫描或同步等待。

## 多通道与 Deep 候选数据合同（可选 PME 模块）

- metadata 仅窗口（含非零/负原点）、part、显式 channel name、原始数值类型（half/float/uint）、色彩角色与关联、压缩/profile、资源内容身份。样本数据在现有 typed buffer/source lease 中；不把大样本数组放进 JSON，也不扩展 `ProfessionalSurface`。
- channel role 至少区分 color、alpha、depth、vector、id、opaque data。未知通道默认 data；仅显式选择的完整颜色组、明确工作色彩和 Alpha 关联能进入 OCIO。Z/法线/ID 绝不自动做色彩变换。half 原始存储可保留编码 words，或显式精确展开到 f32；不新建 GPU half ABI。
- Deep 每个分块：u32 sample-count、u32 offsets（N+1，首项零、单调、差值=count）、每通道连续样本平面。偏移累计先用宿主宽整数；超过 GPU u32 索引或实际设备字节限制则分块/明确拒绝，不能截断。空像素 count=0；offsets 可重复；所有通道必须共享同一 sample index。
- 默认 `preserve-file-order`，不会偷偷排序。若声明 front-to-back Z，需要显式验证非降序及 Z/ZBack 区间政策；重排必须同步作用于全部通道，不能破坏 ID 对应。NaN/Inf、无效深度、Alpha、体积区间与 holdout 必须由导入策略显式定义；存储 round-trip 与可渲染数值准入是两件事。本实验只验证有限数值，不推广为完整 Deep 合成算法。
- 明确 `read/write extended EXR` 与 `flattenDeep` 是不同操作；后者尚未实现，需要另行确定表面/体积采样和 Alpha 合成语义。普通 RGBA PNG/EXR/OCIO 行为不变。

## 实验结果与可复现入口

`exr_probe.py`：真实 multi-channel 与 deep scanline EXR 往返，half/float/uint 逐位相同；保留负 RGB、HDR、Alpha、空像素、非零 data window、文件样本顺序、超过 2^24 的 ID；拒绝错误 offsets、预算、排序声明及通道长度。当前 Python binding 的 `__exit__` 会清理传入字典，故 writer 接收字典副本；原始失败保留。

`nanovdb_probe.cpp`：真正调用上游球体 SDF 构造、未压缩文件读写、Accessor、Full checksum 校验。9261 个采样与独立解析球 SDF 比较，误差记录在结果；故意修改一个树字节后校验失败。这是离线格式/参考验证，**不是逐帧校验或 GPU 性能测试**。该小场景不能用于声称稀疏存储比 dense 更省内存。

```powershell
# 使用已有、已审核 Python / OpenEXR 环境；不自动安装任何工具。
& .frameweave/pme-python/Scripts/python.exe prototypes/p1-media-io/exr_probe.py
# --fetch 只下载固定 hash 的已审核库源码，运行时不会访问网络。
& .frameweave/pme-python/Scripts/python.exe prototypes/p1-media-io/prepare_sources.py --fetch
& prototypes/p1-media-io/build-probe.ps1
```

未验证：不受信任 EXR 的分配前防护、GPU 稀疏遍历、Stage/R1 安装/恢复、Deep flatten、压缩 NanoVDB、OpenVDB Core、Linux/macOS、复杂体积吞吐量、跨后端互操作。OptiX 仍缺已许可 SDK/CUDA 互操作，不代用户接受许可。下一步仅在 Main 单独确认上述最小公共合同后接入核心；本目录不导出公共 SDK API。
