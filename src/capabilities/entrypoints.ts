const entrypoints=[
  {
    terms:['servo','webstage','web stage','html','css','网页','网页渲染','dom'],
    name:'servoStage',availability:'sdk',
    description:'用 HTML、CSS 和 JavaScript 制作 Native Stage。旧 Web Stage 工程可从这里迁移。执行需要已安装的 Servo 组件，画面为 SDR。',
    import:'import { servoStage } from "@frameweave/engine/servo";',
    contract:{input:'ServoStageOptions，可传 HTML/CSS/JavaScript 或准备好的 ServoDocument',output:'NativeStageFactory，执行时输出 SDR 图像'},
    example:'export const title = servoStage({html: "<h1>Hello</h1>", css: "h1 { color: white; }"});',
    documentation:'modules/servo/README.md',
  },
  {
    terms:['imagestage','image stage','滤镜','filter','图像处理','图像特效','image effects'],
    name:'imageStage',availability:'sdk',
    description:'用普通函数串联图像效果。输入可以是声明的本地素材，也可以从上游 Stage 的 image 端口接入。',
    import:'import { imageStage, compose, exposure, glow, vignette, floatImageResource } from "@frameweave/engine/image-effects";',
    example:'export const grade = imageStage(compose(exposure(0.3), glow({radius:3, intensity:0.2}), vignette()), {source:floatImageResource("photo")});',
    contract:{input:'图像配方与来源选项',output:'NativeStageFactory，执行时输出图像'},
    documentation:'modules/native-effects/authoring/README.md',
  },
  {
    terms:['editingstage','剪辑','时间线','时间轴','video edit','timeline'],
    name:'editingStage',availability:'sdk',
    description:'用剪辑时间线创建 Stage，连接素材、片段和转场。',
    import:'import { editingStage } from "@frameweave/engine/editing";',
    contract:{input:'剪辑配方与其声明的素材',output:'可放入 Stage 的工厂'},
    documentation:'modules/editing/README.md',
  },
  {
    terms:['spatialvfxstage','体积火焰','体积烟雾','星空','行星大气','黑洞','flamevolume','smokeplume','planetatmosphere','gravitationallensing','spatial vfx'],
    name:'spatialVfxStage',availability:'sdk',
    description:'用一个 Stage 工厂创建空间特效。火焰、星空等可直接生成，雾化和引力透镜使用上游 image 端口。',
    import:'import { spatialVfxStage } from "@frameweave/engine/spatial-vfx";',
    example:'export const fire = spatialVfxStage("flameVolume", {heat:1.5});',
    contract:{input:'效果名称与该效果的类型化选项',output:'可放入 Stage 的工厂'},
    documentation:'docs/ACL_1.md',
  },
] as const;

export function authoringEntrypoints(query:string){
  const normalized=query.trim().toLowerCase();
  return entrypoints.filter(entry=>entry.terms.some(term=>normalized.includes(term))).map(({terms,...entry})=>entry);
}
