import type {AnalysisOptions,PathOptions} from './types.ts';
export function cameraControls(frame:number,width:number){const sign=frame%2===0?1:-1,scale=width/23;return [(.25*frame+.75*sign)*scale,(.12*frame-.4*sign)*scale,((frame%3)-1)*.8*scale,.45*sign*scale];}
export const analysisOptions:AnalysisOptions={model:'affine',maximumGapSeconds:.06,meshColumns:2,meshRows:2,meshRadius:3,meshSampleStep:1,meshIterations:4,meshSmoothness:.3,meshAnchor:.02,meshRobustRadius:4,fit:{fitIterations:2,sampleStep:1,robustRadius:2,minimumConfidence:.05},flow:{levels:2,iterations:3,radius:2}};
export const pathOptions:PathOptions={velocity:0,acceleration:.0003,jerk:.000001};
