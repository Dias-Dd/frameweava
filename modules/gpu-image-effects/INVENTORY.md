# Concrete image Effect Inventory

Pinned upstream: [EffectCraft @ ec7ced1f0515f0b6f376dbcc297f1c441f452d6e](https://github.com/storytold/effectcraft/tree/ec7ced1f0515f0b6f376dbcc297f1c441f452d6e). 247 concrete catalog entries, read from its source; source SHA256/bytes and local kernel provenance are in [sources.json](../../docs/gpu-image-effects/sources.json).

The original catalogue intake installed/executed/copied no upstream Shader. The resident colour chain now adapts two audited MIT fragments; see resident/sources.json and LICENSE.effectcraft. “Upstream GPU” is the upstream catalog claim, not Frameweave runtime verification. B1 exposes Gaussian/Glow; B2 adds GPU Fill, Alpha Matte and Shadow-only subsets through existing kernels. Native feather() is a separately verified local Gaussian Alpha-mask function, not an invented upstream catalog entry. B3 adds one native reframe() operation for integer crop/pad/reflections, not every Transform/Mirror option. B4 adds native binary Alpha coverage union mergeMatte(), not generic colour Blend. B5 adds Alpha-to-RGB mapping/opaque output via existing GPU mask/over, not arbitrary channel routing. B6 adds black-matte flatten retaining PM radiance, not arbitrary backdrop compositing. B7 adds one integer repeat/mirror tile() contract, using a closed Stage-local bit representation and the existing compositor; not full Motion Tile/Repetile. B8 adds scene-linear exposure() RGB gain through existing opaque GPU Multiply, not full upstream gamma/offset. B9 adds scene-linear RGB invert() retaining Alpha through existing Multiply/Lighter, not Alpha/selective channel inversion. B10 adds standard Plus/Lighter add() and an acceptance-only closed Main owner overlay; wide Multiply rejection remains explicit. B11 adds canonical mask coverage complement invertMatte(), not colour-retaining Alpha inversion. B12 adds replaceMatte() coverage replacement retaining recoverable straight colour; Alpha product remains the separate applyMatte contract. B13 adds one native raw spatial RGB coefficient-map modulate() via existing GPU Multiply, preserving image Alpha; not full Compound Arithmetic or a constant Exposure alias. B14 adds over() via the existing compensated owner/precision identity: standard native PM/opaque output, explicit straight refusal with real unassociation counterexamples; no shared GPU changes. B15 adds coverage-aware scene-linear screen() via that same qualified owner, with native PM/opaque output; no all-blend or arbitrary Shader claim. B19 adds native crossfade() linear prepared PM RGBA interpolation with Signal mix, not Source-over opacity or a generic multi-input/time accumulator; see [BATCH_19.md](../../docs/gpu-image-effects/BATCH_19.md). B18 adds native subtractMatte() directed coverage difference A*(1-B), canonical black RGB, through compensated source-over; not numeric A-B or a colour blend. See [BATCH_18.md](../../docs/gpu-image-effects/BATCH_18.md). B17 adds one native offsetRGB() scene-linear per-channel addition, preserving input Alpha and representation, with Signal leaves; not grading Lift/gamma or full upstream Exposure. See [BATCH_17.md](../../docs/gpu-image-effects/BATCH_17.md). B16 adds coverage-aware image multiply(), not raw gain-map modulation; native PM/opaque and the existing nonlinear precision gate remain. See [BATCH_16.md](../../docs/gpu-image-effects/BATCH_16.md) and [BATCH_15.md](../../docs/gpu-image-effects/BATCH_15.md) and [BATCH_14.md](../../docs/gpu-image-effects/BATCH_14.md) and [BATCH_13.md](../../docs/gpu-image-effects/BATCH_13.md) and [BATCH_12.md](../../docs/gpu-image-effects/BATCH_12.md). Main/Agent-1 owns additions to the shared Pixel Pass; Half/straight publication and HDR contracts must be preserved. This inventory is not an eligibility registry.

| Category | Concrete effect | Upstream ID | Upstream GPU | Frameweave status | Priority |
| --- | --- | --- | --- | --- | --- |
| 3D Channel | 3D Channel Extract | `ec.3d.channelextract` | listed | 未接入 | P0 |
| 3D Channel | 3D Layer Instance | `ec.3d.instance3d` | not listed | 未接入 | P2 |
| 3D Channel | Cryptomatte | `ec.3d.cryptomatte` | listed | 未接入 | P0 |
| 3D Channel | Depth Matte | `ec.3d.depthmatte` | listed | 未接入 | P0 |
| 3D Channel | Depth of Field | `ec.3d.depthoffield` | listed | 未接入 | P2 |
| 3D Channel | EXtractoR | `ec.3d.extractor` | listed | 未接入 | P0 |
| 3D Channel | Fog 3D | `ec.3d.fog3d` | listed | 未接入 | P2 |
| 3D Channel | ID Matte | `ec.3d.idmatte` | listed | 未接入 | P0 |
| 3D Channel | IDentifier | `ec.3d.identifier` | listed | 未接入 | P2 |
| Blur & Sharpen | Bilateral Blur | `ec.blur.bilateral` | listed | foundations：真实GPU Bilateral，圆形邻域/空间与RGBA范围权重，F16/F32/F64对照通过；非全部AE参数 | P1 |
| Blur & Sharpen | CC Cross Blur | `ec.blur.cccross` | listed | 未接入 | P1 |
| Blur & Sharpen | CC Radial Blur | `ec.blur.ccradial` | listed | 未接入 | P1 |
| Blur & Sharpen | CC Radial Fast Blur | `ec.blur.ccradialfast` | listed | 未接入 | P1 |
| Blur & Sharpen | CC Vector Blur | `ec.blur.ccvector` | listed | 未接入 | P1 |
| Blur & Sharpen | Camera Lens Blur | `ec.blur.cameralens` | listed | 未接入 | P1 |
| Blur & Sharpen | Camera-Shake Deblur | `ec.blur.camerashakedeblur` | not listed | 未接入 | P1 |
| Blur & Sharpen | Channel Blur | `ec.blur.channel` | listed | foundations：四通道Gaussian，RGB直色模糊后关联模糊Alpha，零覆盖发光单独过滤；真实GPU通过，旧B18限制不再代表新驻留API | P1 |
| Blur & Sharpen | Compound Blur | `ec.blur.compound` | listed | foundations：同尺寸控制图工作空间PM亮度→可变Gaussian sigma，显式控制图clamp；非全部通道/反转/重采样选项 | P1 |
| Blur & Sharpen | Directional Blur | `ec.blur.directional` | listed | foundations：双补偿坐标/双线性Directional Blur，samples/angle/length/boundary，真实GPU通过 | P1 |
| Blur & Sharpen | Fast Box Blur | `ec.blur.fastbox` | listed | foundations：整数Box Blur/iterations/axis，有限帧扫描和解析边界重复，真实GPU通过 | P1 |
| Blur & Sharpen | Gaussian Blur | `ec.blur.gaussian` | listed | GPU-only facade：L1 已验；L2 见检查点报告；旧 PA CPU API 不变 | P0 |
| Blur & Sharpen | Radial Blur | `ec.blur.radial` | listed | foundations：Radial spin与Zoom两种采样路径，中心/量/samples，真实GPU通过；非AE全部quality选项 | P1 |
| Blur & Sharpen | Sharpen | `ec.blur.sharpen` | listed | foundations：规范四邻域Laplacian Sharpen预设，共享3x3 GPU卷积；非AE精确内核兼容声明 | P0 |
| Blur & Sharpen | Smart Blur | `ec.blur.smart` | listed | foundations：真实GPU工作亮度硬范围Smart Blur；不含Edge Only/Overlay UI模式 | P1 |
| Blur & Sharpen | Unsharp Mask | `ec.blur.unsharp` | listed | resident 已验证：coverage-normalized Gaussian Unsharp，原 Alpha/零覆盖发光保留；非 AE 全功能 | P0 |
| Channel | Arithmetic | `ec.channel.arithmetic` | listed | foundations：七种PM RGB arithmetic与amount，原Alpha；除零明确失败，非任意位深/overflow模式 | P2 |
| Channel | Blend | `ec.channel.blend` | listed | B10 add() Plus；B14 over()标准SourceOver+Signal opacity，需compensated身份，原生PM/opaque；straight出版明确拒绝。B15 Screen/B16 image Multiply；B19 crossfade()两输入线性RGBA+Signal mix，原生PM/opaque，非任意Blend/straight/多输入时域累积；resident blends 候选另验10个separable模式：darken/lighten/difference/exclusion/overlay/hardLight/linearBurn/subtractBlend/linearLight/pinLight，双输入PM补偿/Signal opacity，F16/F32真实硬件及TSX/EXR/HDR10通过；旧Surface API不变，非所有Blend/显示剪裁语义 | P0 |
| Channel | CC Composite | `ec.channel.cccomposite` | listed | 未接入 | P2 |
| Channel | Calculations | `ec.channel.calculations` | listed | 未接入 | P2 |
| Channel | Channel Combiner | `ec.channel.combiner` | listed | 未接入 | P2 |
| Channel | Compound Arithmetic | `ec.channel.compoundarithmetic` | listed | B13: GPU modulate()空间逐通道RGB系数乘法、保留图像Alpha；非完整Compound Arithmetic/通道选择器 | P2 |
| Channel | Invert | `ec.channel.invert` | listed | B9 RGB invert()；B11 invertMatte()规范黑RGB/覆盖率补集；非任意通道/保色Alpha反相 | P1 |
| Channel | Minimax | `ec.channel.minimax` | listed | resident Matte Alpha morphology保留；foundations新增整图PM RGBA componentwise Erode/Dilate，非所有上游操作/UI | P2 |
| Channel | Remove Color Matting | `ec.channel.removecolormatting` | listed | foundations：显式RGB matte污染减除，原生PM/HDR，不含未知背景估计 | P2 |
| Channel | Set Channels | `ec.channel.setchannels` | listed | foundations：原生PM RGBA/0/1通道路由，Alpha越界出版失败；非任意跨Stage通道选择器 | P2 |
| Channel | Set Matte | `ec.channel.setmatte` | listed | B2 applyMatte()相乘；B12 replaceMatte()恢复颜色后替换Alpha；非Luma/任意通道/跨尺寸重采样 | P0 |
| Channel | Shift Channels | `ec.channel.shiftchannels` | listed | foundations：直色通道路由及重新关联覆盖，0/1/Alpha常量已专项验证；旧alphaToRGB保留 | P1 |
| Channel | Solid Composite | `ec.channel.solidcomposite` | listed | foundations：任意工作空间RGB及opacity的PM背景合成；原flattenBlack保留 | P1 |
| Color Correction | Auto Color | `ec.color.autocolor` | listed | foundations：GPU grey-world Auto Color/amount；零均值通道保留unity gain，非AE全部自动颜色算法 | P2 |
| Color Correction | Auto Contrast | `ec.color.autocontrast` | listed | foundations：GPU工作亮度极值Auto Contrast，输出范围/amount；非AE全参数 | P2 |
| Color Correction | Auto Levels | `ec.color.autolevels` | listed | foundations：同scope GPU分块统计/各通道极值Auto Levels，显式输出范围/amount；无时间统计/percent剪裁 | P0 |
| Color Correction | Black & White | `ec.color.blackwhite` | listed | creative候选已验证：6-hue权重/混合量，native PM及signed灰度；非显示剪裁版本 | P2 |
| Color Correction | Brightness & Contrast | `ec.color.brightnesscontrast` | listed | creative候选已验证：线性brightness/contrast/pivot分支；非AE-fitted现代曲线 | P2 |
| Color Correction | Broadcast Colors | `ec.color.broadcast` | listed | foundations：显式工作RGB黑白范围内保亮度降chroma；不宣称NTSC/PAL/IRE广播制式合规 | P2 |
| Color Correction | CC Color Neutralizer | `ec.color.cccolorneutralizer` | listed | 未接入 | P2 |
| Color Correction | CC Color Offset | `ec.color.cccoloroffset` | listed | 未接入 | P2 |
| Color Correction | CC Kernel | `ec.color.cckernel` | listed | foundations：row-major 3x3 GPU convolution、divisor及coverage-scaled RGB bias，非上游所有尺寸/操作 | P2 |
| Color Correction | CC Toner | `ec.color.cctoner` | listed | 未接入 | P2 |
| Color Correction | Change Color | `ec.color.changecolor` | listed | foundations：RGB距离选择+Hue/chroma/lightness Change Color，F16/F32真实GPU | P2 |
| Color Correction | Change to Color | `ec.color.changetocolor` | listed | foundations：RGB距离选择+任意signed HDR替换色/amount，F16/F32真实GPU | P2 |
| Color Correction | Channel Mixer | `ec.color.channelmixer` | listed | resident 已验证：3x3 RGB + Alpha-scaled offset，补偿点积；非所有上游模式 | P0 |
| Color Correction | Color Balance | `ec.color.colorbalance` | listed | creative候选已验证：阴影/中间调/高光偏移及保留工作空间亮度；RGB不裁剪 | P2 |
| Color Correction | Color Balance (HLS) | `ec.color.colorbalancehls` | listed | foundations hueSaturation提供明确HDR hue/lightness控制，不将其冒充旧HLS兼容层 | P2 |
| Color Correction | Color Link | `ec.color.colorlink` | listed | 未接入 | P2 |
| Color Correction | Color Stabilizer | `ec.color.colorstabilizer` | listed | 未接入 | P2 |
| Color Correction | Colorama | `ec.color.colorama` | listed | 未接入 | P2 |
| Color Correction | Curves | `ec.color.curves` | listed | resident 已验证：静态 RGB PCHIP、精确 Hermite、HDR 端点外推；无 8-bit LUT 近似 | P0 |
| Color Correction | Equalize | `ec.color.equalize` | listed | foundations：GPU uint32直方图/CDF Equalize，bins/显式输出范围；统计API桥额外读回/原样上传已记录 | P2 |
| Color Correction | Exposure | `ec.color.exposure` | listed | 原Surface exposure/offsetRGB保留；foundations驻留Exposure新增stops/offset/signed gamma，零Alpha线性辐射保留 | P0 |
| Color Correction | Gamma/Pedestal/Gain | `ec.color.gammapedestalgain` | listed | foundations：signed Gamma/Pedestal/Gain，三通道Signal，真实GPU；专业线性合同明确 | P2 |
| Color Correction | Hue/Saturation | `ec.color.huesaturation` | listed | foundations：Hue sectors/线性chroma saturation/HSL lightness的signed HDR扩展；非AE显示色S曲线 | P2 |
| Color Correction | Leave Color | `ec.color.leavecolor` | listed | foundations：smooth RGB距离选择+工作亮度去色Leave Color，非完整感知色差/色相范围限定器 | P2 |
| Color Correction | Levels | `ec.color.levels` | listed | resident 已验证：各通道输入/输出端点和 signed gamma；无自动统计 | P0 |
| Color Correction | Levels (Individual Controls) | `ec.color.levelsic` | listed | 未接入 | P0 |
| Color Correction | Lumetri Color | `ec.color.lumetri` | listed | 未接入 | P2 |
| Color Correction | OCIO CDL Transform | `ec.color.ociocdl` | listed | 未接入 | P2 |
| Color Correction | OCIO Color Space Transform | `ec.color.ociocolorspace` | listed | 未接入 | P2 |
| Color Correction | OCIO Display Transform | `ec.color.ociodisplay` | listed | 未接入 | P2 |
| Color Correction | OCIO File Transform | `ec.color.ociofile` | listed | 未接入 | P2 |
| Color Correction | OCIO Look Transform | `ec.color.ociolook` | listed | 未接入 | P2 |
| Color Correction | PS Arbitrary Map | `ec.color.psarbitrarymap` | listed | 未接入 | P2 |
| Color Correction | Photo Filter | `ec.color.photofilter` | listed | foundations：RGB Photo Filter/density/工作亮度恢复，真实GPU；无色温→光谱标定声明 | P2 |
| Color Correction | Selective Color | `ec.color.selectivecolor` | listed | foundations：九组CMYK masks、relative/absolute，输出RGB不剪裁；非显示色数值一致声明 | P2 |
| Color Correction | Shadow/Highlight | `ec.color.shadowhighlight` | listed | foundations：显式tonal widths的Shadow/Highlight调整；无AE局部自适应半径/全部高级参数 | P1 |
| Color Correction | Tint | `ec.color.tint` | listed | creative候选已验证：工作空间Y双端点Tint，默认HDR外推，可显式clamp tonal coordinate | P2 |
| Color Correction | Tritone | `ec.color.tritone` | listed | creative候选已验证：三色双线性段/混合量，默认signed HDR外推 | P2 |
| Color Correction | Vibrance | `ec.color.vibrance` | listed | foundations：工作空间亮度自适应chroma Vibrance/saturation，真实GPU；非AE显示剪裁版本 | P2 |
| Color Correction | Video Limiter | `ec.color.videolimiter` | listed | foundations：显式工作RGB black/white limiter；不宣称编码信号制式/IRE合规 | P2 |
| Distort | Bezier Warp | `ec.distort.bezierwarp` | listed | 未接入 | P2 |
| Distort | Bulge | `ec.distort.bulge` | listed | 未接入 | P2 |
| Distort | CC Bend It | `ec.distort.ccbendit` | listed | 未接入 | P2 |
| Distort | CC Bender | `ec.distort.ccbender` | listed | 未接入 | P2 |
| Distort | CC Blobbylize | `ec.distort.ccblobbylize` | listed | 未接入 | P2 |
| Distort | CC Flo Motion | `ec.distort.ccflomotion` | listed | 未接入 | P2 |
| Distort | CC Griddler | `ec.distort.ccgriddler` | listed | 未接入 | P2 |
| Distort | CC Lens | `ec.distort.cclens` | listed | 未接入 | P2 |
| Distort | CC Page Turn | `ec.distort.ccpageturn` | listed | 未接入 | P2 |
| Distort | CC Power Pin | `ec.distort.ccpowerpin` | listed | 未接入 | P2 |
| Distort | CC Ripple Pulse | `ec.distort.ccripplepulse` | listed | 未接入 | P2 |
| Distort | CC Slant | `ec.distort.ccslant` | listed | 未接入 | P2 |
| Distort | CC Smear | `ec.distort.ccsmear` | listed | 未接入 | P2 |
| Distort | CC Split | `ec.distort.ccsplit` | listed | 未接入 | P2 |
| Distort | CC Split 2 | `ec.distort.ccsplit2` | listed | 未接入 | P2 |
| Distort | CC Tiler | `ec.distort.cctiler` | listed | 未接入 | P2 |
| Distort | Corner Pin | `ec.distort.cornerpin` | listed | 未接入 | P1 |
| Distort | Detail-preserving Upscale | `ec.distort.upscale` | not listed | 未接入 | P2 |
| Distort | Displacement Map | `ec.distort.displacementmap` | listed | PA-2 有不同参数契约的 CPU RG-map 参考；无正式 GPU map 算子 | P0 |
| Distort | Liquify | `ec.distort.liquify` | listed | 未接入 | P2 |
| Distort | Magnify | `ec.distort.magnify` | listed | 未接入 | P2 |
| Distort | Mesh Warp | `ec.distort.meshwarp` | listed | 未接入 | P2 |
| Distort | Mirror | `ec.distort.mirror` | listed | B3: GPU reframe() 整数裁切/扩边/整幅轴翻转子集；不含任意变换或上游全部参数 | P1 |
| Distort | Offset | `ec.distort.offset` | listed | 未接入 | P2 |
| Distort | Optics Compensation | `ec.distort.opticscompensation` | listed | 未接入 | P2 |
| Distort | Polar Coordinates | `ec.distort.polar` | listed | 未接入 | P2 |
| Distort | Puppet | `ec.distort.puppet` | not listed | 未接入 | P2 |
| Distort | Reshape | `ec.distort.reshape` | listed | 未接入 | P2 |
| Distort | Ripple | `ec.distort.ripple` | listed | 未接入 | P2 |
| Distort | Rolling Shutter Repair | `ec.distort.rollingshutterrepair` | not listed | 未接入 | P2 |
| Distort | Smear | `ec.distort.smear` | listed | 未接入 | P2 |
| Distort | Spherize | `ec.distort.spherize` | listed | 未接入 | P2 |
| Distort | Transform | `ec.distort.transform` | listed | B3: GPU reframe() 整数裁切/扩边/整幅轴翻转子集；不含任意变换或上游全部参数 | P1 |
| Distort | Turbulent Displace | `ec.distort.turbulentdisplace` | listed | 未接入 | P2 |
| Distort | Twirl | `ec.distort.twirl` | listed | 未接入 | P2 |
| Distort | Twirl (Legacy) | `ec.distort.twirllegacy` | listed | 未接入 | P2 |
| Distort | Warp | `ec.distort.warp` | listed | 未接入 | P2 |
| Distort | Warp Stabilizer | `ec.distort.warpstabilizer` | not listed | 未接入 | P2 |
| Distort | Wave Warp | `ec.distort.wavewarp` | listed | 未接入 | P2 |
| Generate | 4-Color Gradient | `ec.generate.fourcolor` | listed | foundations：像素中心bilinear Four Color Gradient/四HDR色，覆盖替换色生成 | P1 |
| Generate | Advanced Lightning | `ec.generate.advancedlightning` | listed | 未接入 | P2 |
| Generate | Audio Spectrum | `ec.generate.audiospectrum` | listed | 未接入 | P2 |
| Generate | Audio Waveform | `ec.generate.audiowaveform` | listed | 未接入 | P2 |
| Generate | Beam | `ec.generate.beam` | listed | 未接入 | P2 |
| Generate | CC Glue Gun | `ec.generate.ccgluegun` | listed | 未接入 | P2 |
| Generate | CC Light Burst 2.5 | `ec.generate.cclightburst` | listed | 未接入 | P2 |
| Generate | CC Light Rays | `ec.generate.cclightrays` | listed | 未接入 | P1 |
| Generate | CC Light Sweep | `ec.generate.cclightsweep` | listed | 未接入 | P2 |
| Generate | CC Threads | `ec.generate.ccthreads` | listed | 未接入 | P2 |
| Generate | Cell Pattern | `ec.generate.cellpattern` | listed | 未接入 | P2 |
| Generate | Checkerboard | `ec.generate.checkerboard` | listed | foundations：像素中心Checkerboard，尺寸/偏移/两HDR颜色，覆盖替换色生成 | P2 |
| Generate | Circle | `ec.generate.circle` | listed | 未接入 | P2 |
| Generate | Ellipse | `ec.generate.ellipse` | listed | 未接入 | P2 |
| Generate | Eyedropper Fill | `ec.generate.eyedropperfill` | listed | 未接入 | P2 |
| Generate | Fill | `ec.generate.fill` | listed | B2: GPU fill()，保留输入Alpha；不是上游所有Fill选项 | P0 |
| Generate | Fractal | `ec.generate.fractal` | not listed | 未接入 | P2 |
| Generate | Gradient Ramp | `ec.generate.gradientramp` | listed | foundations：Linear/Radial Ramp及Gradient Map/64有序stops；保留显式HDR扩展 | P1 |
| Generate | Grid | `ec.generate.grid` | listed | 未接入 | P2 |
| Generate | Lens Flare | `ec.generate.lensflare` | listed | 未接入 | P2 |
| Generate | Paint Bucket | `ec.generate.paintbucket` | listed | 未接入 | P2 |
| Generate | Radio Waves | `ec.generate.radiowaves` | listed | 未接入 | P2 |
| Generate | Scribble | `ec.generate.scribble` | listed | 未接入 | P2 |
| Generate | Stroke | `ec.generate.stroke` | listed | 未接入 | P2 |
| Generate | Vegas | `ec.generate.vegas` | listed | 未接入 | P2 |
| Generate | Write-on | `ec.generate.writeon` | listed | 未接入 | P2 |
| Immersive Video | VR Blur | `ec.vr.blur` | listed | 未接入 | P1 |
| Immersive Video | VR Chromatic Aberrations | `ec.vr.chromaticaberrations` | listed | 未接入 | P2 |
| Immersive Video | VR Color Gradients | `ec.vr.colorgradients` | listed | 未接入 | P1 |
| Immersive Video | VR Converter | `ec.vr.converter` | listed | 未接入 | P2 |
| Immersive Video | VR De-Noise | `ec.vr.denoise` | listed | 未接入 | P1 |
| Immersive Video | VR Digital Glitch | `ec.vr.digitalglitch` | listed | 未接入 | P2 |
| Immersive Video | VR Fractal Noise | `ec.vr.fractalnoise` | listed | 未接入 | P1 |
| Immersive Video | VR Glow | `ec.vr.glow` | listed | 未接入 | P2 |
| Immersive Video | VR Plane to Sphere | `ec.vr.planetosphere` | listed | 未接入 | P2 |
| Immersive Video | VR Rotate Sphere | `ec.vr.rotatesphere` | listed | 未接入 | P2 |
| Immersive Video | VR Sharpen | `ec.vr.sharpen` | listed | 未接入 | P0 |
| Immersive Video | VR Sphere to Plane | `ec.vr.spheretoplane` | listed | 未接入 | P2 |
| Keying | Advanced Spill Suppressor | `ec.key.advancedspill` | listed | resident 仅基础 excess-channel Despill 已验证；Advanced 算法未接入 | P0 |
| Keying | CC Simple Wire Removal | `ec.key.ccsimplewireremoval` | listed | 未接入 | P2 |
| Keying | Color Difference Key | `ec.key.colordifference` | listed | 未接入 | P2 |
| Keying | Color Range | `ec.key.colorrange` | listed | 未接入 | P0 |
| Keying | Difference Matte | `ec.key.differencematte` | listed | 未接入 | P0 |
| Keying | Extract | `ec.key.extract` | listed | 未接入 | P0 |
| Keying | Inner/Outer Key | `ec.key.innerouter` | listed | 未接入 | P2 |
| Keying | Key Cleaner | `ec.key.keycleaner` | listed | 未接入 | P2 |
| Keying | Key Light | `ec.keying.keylight` | listed | 未接入 | P2 |
| Keying | Linear Color Key | `ec.key.linearcolor` | listed | 未接入 | P0 |
| Keying | Screen Key | `ec.key.screen` | listed | 未接入 | P2 |
| Keying | Unmult | `ec.key.unmult` | listed | 未接入 | P2 |
| Matte | Matte Choker | `ec.matte.mattechoker` | listed | resident featherMatte + matteLevels可组合链已验证；非上游双阶段/迭代全参数 | P0 |
| Matte | Mocha shape | `ec.obsolete.mochashape` | not listed | 未接入 | P2 |
| Matte | Object Matte | `ec.matte.objectmatte` | not listed | 未接入 | P0 |
| Matte | Refine Hard Matte | `ec.matte.refinehard` | listed | 未接入 | P0 |
| Matte | Refine Soft Matte | `ec.matte.refinesoft` | listed | 未接入 | P0 |
| Matte | Roto Brush & Refine Edge | `ec.matte.rotobrush` | not listed | 未接入 | P2 |
| Matte | Simple Choker | `ec.matte.simplechoker` | listed | resident morphology覆盖率腐蚀/膨胀原语已验证；固定画布，无自动扩边/颜色重建 | P0 |
| Noise & Grain | Add Grain | `ec.noise.addgrain` | listed | native filmGrain候选已验证：复用固定hash的三角噪声/彩色/确定性帧；非完整上游Add Grain | P1 |
| Noise & Grain | Curl Noise | `ec.noise.curlnoise` | listed | 未接入 | P1 |
| Noise & Grain | Dust & Scratches | `ec.noise.dustscratches` | listed | foundations：精确Median与RGB阈值Dust & Scratches，真实GPU；非AE全参数 | P2 |
| Noise & Grain | Fractal Noise | `ec.noise.fractal` | listed | 未接入 | P1 |
| Noise & Grain | Match Grain | `ec.noise.matchgrain` | not listed | 未接入 | P1 |
| Noise & Grain | Median | `ec.noise.median` | listed | foundations：连续F32精确radix Median，不做512级/8-bit量化；大半径成本高 | P2 |
| Noise & Grain | Median (Legacy) | `ec.noise.medianlegacy` | listed | 未接入 | P2 |
| Noise & Grain | Noise | `ec.noise.noise` | listed | foundations：固定hash uniform Noise/uint32 seed/colored/frame，非Film Grain别名 | P1 |
| Noise & Grain | Noise Alpha | `ec.noise.noisealpha` | listed | 未接入 | P1 |
| Noise & Grain | Noise HLS | `ec.noise.noisehls` | listed | 未接入 | P1 |
| Noise & Grain | Noise HLS Auto | `ec.noise.noisehlsauto` | listed | 未接入 | P1 |
| Noise & Grain | Remove Grain | `ec.noise.removegrain` | listed | 未接入 | P1 |
| Noise & Grain | Turbulent Noise | `ec.noise.turbulent` | listed | 未接入 | P1 |
| Perspective | 3D Camera Tracker | `ec.perspective.cameratracker` | not listed | 未接入 | P2 |
| Perspective | 3D Glasses | `ec.perspective.3dglasses` | listed | 未接入 | P2 |
| Perspective | Bevel Alpha | `ec.perspective.bevelalpha` | listed | 未接入 | P2 |
| Perspective | Bevel Edges | `ec.perspective.beveledges` | listed | 未接入 | P2 |
| Perspective | CC Cylinder | `ec.perspective.cccylinder` | listed | 未接入 | P2 |
| Perspective | CC Environment | `ec.perspective.ccenvironment` | listed | 未接入 | P2 |
| Perspective | CC Sphere | `ec.perspective.ccsphere` | listed | 未接入 | P2 |
| Perspective | CC Spotlight | `ec.perspective.ccspotlight` | listed | 未接入 | P2 |
| Perspective | Drop Shadow | `ec.perspective.dropshadow` | listed | B2: GPU dropShadow() 独立阴影层；Gaussian sigma语义，非上游完整复刻 | P1 |
| Perspective | Radial Shadow | `ec.perspective.radialshadow` | listed | 未接入 | P1 |
| Stylize | Brush Strokes | `ec.stylize.brushstrokes` | listed | 未接入 | P2 |
| Stylize | CC Block Load | `ec.stylize.ccblockload` | listed | 未接入 | P2 |
| Stylize | CC Burn Film | `ec.stylize.ccburnfilm` | listed | 未接入 | P2 |
| Stylize | CC Glass | `ec.stylize.ccglass` | listed | 未接入 | P2 |
| Stylize | CC HexTile | `ec.stylize.cchextile` | listed | 未接入 | P2 |
| Stylize | CC Kaleida | `ec.stylize.cckaleida` | listed | 未接入 | P2 |
| Stylize | CC Mr. Smoothie | `ec.stylize.ccmrsmoothie` | listed | 未接入 | P2 |
| Stylize | CC Plastic | `ec.stylize.ccplastic` | listed | 未接入 | P2 |
| Stylize | CC RepeTile | `ec.stylize.ccrepetile` | listed | B7: GPU tile() 原生整数repeat/mirror子集；非上游完整连续phase/scale/bilinear | P1 |
| Stylize | CC Threshold | `ec.stylize.ccthreshold` | listed | foundations：亮度与独立RGB threshold子集；无HSV saturation/Alpha阈值全部UI模式 | P2 |
| Stylize | CC Threshold RGB | `ec.stylize.ccthresholdrgb` | listed | foundations：独立RGB阈值/任意low-high颜色/amount/invert，真实GPU | P2 |
| Stylize | CC Vignette | `ec.stylize.ccvignette` | listed | creative候选已验证：逆平方衰减/高光pin，使用PM/HDR精度桥 | P2 |
| Stylize | Cartoon | `ec.stylize.cartoon` | listed | 未接入 | P2 |
| Stylize | Color Emboss | `ec.stylize.coloremboss` | listed | foundations：原生PM RGB小卷积Color Emboss与bias，真实GPU；非AE全参数 | P1 |
| Stylize | Emboss | `ec.stylize.emboss` | listed | foundations：工作亮度零和小卷积Emboss与bias，真实GPU；非AE全方向/浮雕参数 | P1 |
| Stylize | Find Edges | `ec.stylize.findedges` | listed | foundations：逐RGB通道Sobel magnitude与signed invert，原Alpha；真实GPU | P2 |
| Stylize | Glow | `ec.stylize.glow` | listed | GPU-only facade：L1 已验；L2 见检查点报告；旧 PA CPU API 不变 | P0 |
| Stylize | Mosaic | `ec.stylize.mosaic` | listed | native pixelate候选已验证：整数块中心采样；area-mean Mosaic仍未接入 | P1 |
| Stylize | Motion Tile | `ec.stylize.motiontile` | listed | B7: GPU tile() 原生整数repeat/mirror子集；非上游完整连续phase/scale/bilinear | P1 |
| Stylize | Posterize | `ec.stylize.posterize` | listed | foundations：连续signed HDR Posterize/levels/amount，F16/F32 GPU；非显示范围clip版本 | P2 |
| Stylize | Roughen Edges | `ec.stylize.roughenedges` | listed | 未接入 | P2 |
| Stylize | Scatter | `ec.stylize.scatter` | listed | 未接入 | P2 |
| Stylize | Strobe Light | `ec.stylize.strobe` | listed | 未接入 | P2 |
| Stylize | Texturize | `ec.stylize.texturize` | listed | creative reliefLighting候选已验证：同尺寸高度图中心差分/方向光/非负照明，不裁剪RGB | P2 |
| Stylize | Threshold | `ec.stylize.threshold` | listed | foundations：工作亮度Threshold、任意HDR low/high及amount/invert，真实GPU | P2 |
| Time | CC Force Motion Blur | `ec.time.ccforcemotionblur` | listed | 未接入 | P1 |
| Time | CC Wide Time | `ec.time.ccwidetime` | listed | 未接入 | P2 |
| Time | Echo | `ec.time.echo` | listed | 未接入 | P2 |
| Time | Pixel Motion Blur | `ec.time.pixelmotionblur` | listed | 未接入 | P1 |
| Time | Posterize Time | `ec.time.posterizetime` | listed | 未接入 | P2 |
| Time | Time Difference | `ec.time.timedifference` | listed | 未接入 | P2 |
| Time | Time Displacement | `ec.time.timedisplacement` | listed | 未接入 | P2 |
| Time | Timewarp | `ec.time.timewarp` | listed | 未接入 | P2 |
| Transition | Block Dissolve | `ec.transition.blockdissolve` | listed | 未接入 | P2 |
| Transition | CC Glass Wipe | `ec.transition.ccglasswipe` | listed | 未接入 | P2 |
| Transition | CC Grid Wipe | `ec.transition.ccgridwipe` | listed | 未接入 | P2 |
| Transition | CC Image Wipe | `ec.transition.ccimagewipe` | listed | 未接入 | P2 |
| Transition | CC Jaws | `ec.transition.ccjaws` | listed | 未接入 | P2 |
| Transition | CC Light Wipe | `ec.transition.cclightwipe` | listed | 未接入 | P2 |
| Transition | CC Line Sweep | `ec.transition.cclinesweep` | listed | 未接入 | P2 |
| Transition | CC Radial ScaleWipe | `ec.transition.ccradialscalewipe` | listed | 未接入 | P2 |
| Transition | CC Scale Wipe | `ec.transition.ccscalewipe` | listed | 未接入 | P2 |
| Transition | CC Twister | `ec.transition.cctwister` | listed | 未接入 | P2 |
| Transition | CC WarpoMatic | `ec.transition.ccwarpomatic` | listed | 未接入 | P2 |
| Transition | Card Wipe | `ec.transition.cardwipe` | listed | 未接入 | P2 |
| Transition | Gradient Wipe | `ec.transition.gradientwipe` | listed | 未接入 | P1 |
| Transition | Iris Wipe | `ec.transition.iriswipe` | listed | 未接入 | P2 |
| Transition | Linear Wipe | `ec.transition.linearwipe` | listed | 未接入 | P2 |
| Transition | Radial Wipe | `ec.transition.radialwipe` | listed | 未接入 | P2 |
| Transition | Venetian Blinds | `ec.transition.venetian` | listed | 未接入 | P2 |

## Current resident checkpoint and remaining gaps

- The synced public PixelScope now supports these independent sealed kernels. Unsharp, Levels, Curves, Channel Mix, basic Despill, linear Chroma Key and Luma Key are implemented in [resident](resident/README.md), with real GPU/F16/F32 and TSX-to-EXR/HDR10 acceptance. This does not claim full upstream Screen/Key Cleaner/Advanced Spill parity. R1 official package identity and exports await Main integration.
- The actual Gaussian-to-Unsharp high-HDR cancellation and Channel Mix residual are qualified on NVIDIA Blackwell hardware, with fixed F32 3e-6 / Half 6e-4 bounds. CPU/F64 equations are test references only. No old error bound is widened.
- One upload, ten logical GPU passes and one final readback execute the seven-effect chain. No new Host/Renderer/Core changes. L1 includes a 4,199,425-pixel chain; arbitrary recipe tiling and other hardware are not verified. Existing public device/byte/16MP constraints remain; a future halo-aware adapter must preserve every logical publication.
- RG-map, LUT and advanced key cleanup are not delivered by this checkpoint. Public generic infrastructure is not counted as an implemented effect.

The resident Matte cleanup chain adds canonical Alpha extraction, finite-canvas morphology, shipped Gaussian feather, coverage levels and HDR mask application with two explicit inputs in one owner. See [MATTE.md](resident/MATTE.md) for boundaries, precision, source/license and reproducible acceptance. `importImage` is input transfer, not another effect. The complete TSX scene fixes isolated spots/holes and preserves typed Surface ports; GPU infrastructure alone is not counted as an effect.

Creative candidate: ten real effect methods run as one retained GPU recipe. Sobel uses the pinned continuous radiance-gradient stencil, not a full Find Edges/Smart Blur claim. See [creative/README.md](resident/creative/README.md) and its exact archived sources. All four phases passed once in the single recorded flow after the ten-method gate; next formal package version/identity remains Main-owned.

Resident blend extension: ten concrete equations from `common.wgsl` modes
3/10/23/25/16/18/7/26/19/21, not ten invented upstream catalogue IDs.
[API, precision and emission policy](resident/blends/README.md),
[fixed source and license](resident/blends/sources.json),
[raw single-flow evidence](../../artifacts/gpu-image-effects/chain-blends/flow.json).
Formal package publication is a Main-owned next version; no immutable 0.1.0
identity/lock was regenerated. NVIDIA Blackwell physical WebGPU was measured;
other vendors/platforms are unverified. Large qualification explicitly uses
1GiB direct budget, seven F64 sample positions, all-pixel finite/Alpha checks.

Foundations closure: the **49 user-confirmed methods** and exact measured scope
are in [foundations/coverage.json](resident/foundations/coverage.json). This does
not convert 49 methods into 49 upstream catalogue IDs or claim AE parameter/
numerical parity. [API/limits](resident/foundations/README.md),
[editable full-chain TSX](resident/foundations/example.tsx),
[raw persistent verification flow](../../artifacts/gpu-image-effects/chain-foundations/flow.json).
The long-term library goal remains paused; advanced Warp/LUT/DOF work is not started.
