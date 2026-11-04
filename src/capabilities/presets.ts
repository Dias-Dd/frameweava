import type {SpatialVfxImageEffectName,SpatialVfxSceneName} from '../../modules/spatial-vfx/stage.ts';
import type {PresetMetadata} from '../packages/function-metadata.ts';
import type {CapabilitySearch} from './types.ts';

const spatialScenes={
  mandelbulb:'曼德球分形，生成带立体细节的三维分形。',
  mengerSponge:'门格海绵分形，生成有多层孔洞的立方体。',
  gyroidSurface:'Gyroid 回旋曲面，生成连续镂空的周期结构。',
  voronoiCrystal:'多切面水晶、晶体与宝石造型，可独立渲染。',
  terrainRaymarch:'程序化三维地形与起伏山脉。',
  metaballVolume:'体积元球，生成会融合的液滴状形体。',
  planetAtmosphere:'行星与发光大气层，可用于太空镜头。',
  volumetricSpotlight:'体积聚光灯，生成可见光柱和光束。',
  smokePlume:'体积烟雾，生成上升的程序化烟柱。',
  flameVolume:'体积火焰，生成动态火焰。',
  waterCaustics:'水下焦散，在画面上生成流动的水纹光斑。',
  starfield:'程序化星空，可作为独立背景。',
  orbitalTrails:'轨道拖尾，生成绕中心运行的光迹。',
  orbitalWorld:'行星场景，组合大气、星空、轨道光迹和可选引力透镜。',
  crystalSanctum:'水晶场景，组合多切面晶体、星空和 HDR 辉光。',
  emberPlume:'余烬场景，组合火焰、烟柱和可选体积光。',
  causticLagoon:'水下场景，组合水纹焦散、雾和可选光束。',
} satisfies Record<SpatialVfxSceneName,string>;

const spatialImageEffects={
  heightFog:'按显式距离与高度为输入图像添加雾化效果。',
  gravitationalLensing:'用引力透镜扭曲输入图像，可表现黑洞周围的光线弯曲。',
} satisfies Record<SpatialVfxImageEffectName,string>;

export function presetSearchText(preset:PresetMetadata,callable:string,category=''){
  const words=preset.name.replace(/([a-z0-9])([A-Z])/g,'$1 $2');
  return [preset.name,words,preset.description,...preset.tags??[],callable,category,'preset 预设'].join(' ');
}

export function sdkPresetCandidates(options:CapabilitySearch){
  const filter=options.filters;
  if(filter?.kind&&filter.kind!=='preset'||filter?.engine&&filter.engine!=='native-gpu'||
    filter?.output&&filter.output!=='image'||filter?.input&&filter.input!=='image')return [];
  const callable='spatialVfxStage',module='@frameweave/engine/spatial-vfx';
  return [...Object.entries(spatialScenes),...Object.entries(spatialImageEffects)].flatMap(([name,description])=>{
    const imageInput=Object.hasOwn(spatialImageEffects,name);
    if(filter?.input&&!imageInput)return [];
    const item={
      resultType:'preset' as const,name,description,callable,module,engine:'native-gpu' as const,
      import:`import { ${callable} } from "${module}";`,
      example:`export const effect = ${callable}(${JSON.stringify(name)});`,
      ...(imageInput?{requires:'在 Stage 的 inputs.image 连接上游画面，并声明 inputTypes.image 为 surface。'}:{}),
    };
    return [{item,key:`${module}#${callable}:${name}`,text:presetSearchText(item,callable,'空间特效 spatial vfx')}];
  });
}
