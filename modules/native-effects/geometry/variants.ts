import type {GpuPixelImage} from '../../gpu-effects/pixel-types.ts';
import type {Boundary,NativeGeometryFilters,WaveShape,WavePin} from './types.ts';
export type GeometryVariant={kind:'resize';id:string;method:'nearest'|'triangle'|'mitchell'|'lanczos3';boundary:Boundary;width:number;height:number}|{kind:'wave';id:string;shape:WaveShape;pin:WavePin;phase:number;wavelength:number}|{kind:'polar'|'optics'|'tiler'|'nearest'|'empty-brushes'|'degenerate-mesh';id:string};
export const geometryVariants:readonly GeometryVariant[]=[
 ...(['nearest','triangle','mitchell','lanczos3'] as const).flatMap(method=>(['transparent','clamp','repeat','mirror'] as const).map(boundary=>({kind:'resize' as const,id:'resize-'+method+'-'+boundary,method,boundary,width:5,height:7}))),
 ...(['sine','square','triangle','sawtooth','circle','semicircle','uncircle','noise','smooth-noise'] as const).map((shape,j)=>({kind:'wave' as const,id:'wave-'+shape,shape,pin:(['none','all','center','left','top','right','bottom','horizontal','vertical'] as const)[j],phase:-37.25,wavelength:3.7})),
 {kind:'wave',id:'wave-square-sub-f32-phase',shape:'square',pin:'none',phase:180-1e-8,wavelength:1e20},
 {kind:'resize',id:'resize-one-pixel',method:'lanczos3',boundary:'clamp',width:1,height:1},
 ...(['polar','optics','tiler','nearest','empty-brushes','degenerate-mesh'] as const).map(kind=>({kind,id:kind})),
];
export function callGeometryVariant(v:GeometryVariant,f:NativeGeometryFilters,i:GpuPixelImage){switch(v.kind){case 'resize':return f.resample(i,{width:v.width,height:v.height,method:v.method,boundary:v.boundary});case 'wave':return f.waveWarp(i,{shape:v.shape,pin:v.pin,height:.375,wavelength:v.wavelength,direction:90,phase:v.phase,seed:19});case 'polar':return f.polarCoordinates(i,{direction:'polar-to-rect'});case 'optics':return f.opticsCompensation(i,{reverse:true,fieldOfView:40,boundary:'clamp'});case 'tiler':return f.tiler(i,{mirror:true,scale:[.7,1.4]});case 'nearest':return f.offset(i,{offset:[-1.5,.5],sampling:'nearest',boundary:'mirror'});case 'empty-brushes':return f.liquify(i,{brushes:[]});case 'degenerate-mesh':return f.meshWarp(i,{columns:1,rows:1,destination:[[0,0],[0,0],[0,0],[0,0]]});}}
