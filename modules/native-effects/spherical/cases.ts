import type * as T from './types.ts';
export function sampleOptions(frame:number,layout:T.FrameLayout='mono',partial=false){const common={layout,fieldOfView:partial?[180,180] as const:[360,180] as const};return {
 blur:{...common,radiusDegrees:[18,12] as const,kernelSize:3},
 random:{...common,radiusDegrees:[15,10] as const,kernelSize:3,noiseType:'random' as const,noiseLevel:.2},
 salt:{...common,radiusDegrees:[15,10] as const,kernelSize:3,noiseType:'salt-pepper' as const,noiseLevel:.1},
 sharpen:{...common,radiusDegrees:[10,10] as const,kernelSize:3,strength:.7,threshold:.01},
 glow:{...common,radiusDegrees:[14,10] as const,kernelSize:3,threshold:.6,knee:.1,intensity:.8,saturation:.4},
 chromatic:{...common,point:[170,70] as const,aberration:[2,0,-1.5] as const,falloffDegrees:95,invertFalloff:frame>=2},
 gradient:{...common,points:[{id:'north',point:[-170,70] as const,color:[2,-.1,.2] as const,weight:1},{id:'south',point:[110,-65] as const,color:[-.3,.6,1.4] as const,weight:.8}],power:2.5,blend:.2,opacity:.7,blendMode:'normal' as const},
 fractal:{...common,type:(['basic','turbulent-sharp','max','strings'] as const)[frame%4],complexity:2.5,scale:1.6,rotation:[3,15,-1] as const,subRotation:[4,-12,7] as const,subInfluence:.4,subScaling:1.7,evolution:frame*20,contrast:1.4,brightness:-.1,low:[-.4,.2,2] as const,high:[1.5,-.1,.6] as const,opacity:.8,seed:7},
 glitch:{...common,point:[10,5] as const,radiusDegrees:[180,90] as const,master:.6,colorDistortion:[.5,0,-.2] as const,distortion:[4,3,2] as const,complexity:1.5,scale:[2,1.5,1] as const,translation:[.1,-.2,.3] as const,subInfluence:.3,subScaling:1.5,noiseStrength:.08,noiseQuantity:1,noiseScale:1.4,noiseEvolution:frame*.2,coloredNoise:true,evolution:frame*.1,colorEvolution:frame*20,rate:frame===3?0:1,seed:7},
 rotate:{...common,rotation:[10,25,-7] as const},
 cube:{inputLayout:layout,outputLayout:layout,outputProjection:'cube-3x2' as const,inputFieldOfView:common.fieldOfView,width:layout==='side-by-side'?18:9,height:layout==='top-bottom'?12:6},
 view:{...common,width:8,height:6,viewFieldOfView:[90,60] as const,rotation:[-4,15,7] as const,...layout==='mono'?{}:{eye:'right' as const}},
 plane:{...common,scaleDegrees:[80,55] as const,stereoDisparityDegrees:8,featherDegrees:4,sourceRotation:[3,-2,5] as const,projectionRotation:[2,8,3] as const},
};}
