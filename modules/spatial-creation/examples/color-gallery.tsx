import {Composition,Stage,Layer,ref,keyframes} from '@frameweave/engine';
import {defineNativeStage} from '@frameweave/engine/native';
import {solidBackground,gradientBackground,torus3D,neonRing,characterWave,confettiField,cloneScene,particleBurst,silkRibbon} from 'spatial-creation-candidate';
export const solid=defineNativeStage(()=>solidBackground({color:'#c35e34'}));
export const gradient=defineNativeStage(()=>gradientBackground({center:'#66bfed',edge:'#0c1626'}));
export const copper=defineNativeStage(()=>torus3D({material:'copper',ink:'#e5a46e',rotation:[25,15,18]}));
export const neon=defineNativeStage(()=>neonRing({ink:'#64ddff',finish:{glow:{threshold:.15,intensity:1.5,radius:3}}}));
export const actor=defineNativeStage(()=>characterWave({palette:{shirt:'#18bad3',pants:'#16314c'}}));
export const confetti=defineNativeStage(()=>confettiField({palette:['#18bad3','#ff9155','#ffe08a']}));
export const clones=defineNativeStage(()=>cloneScene({palette:['#18bad3','#ff9155','#ffe08a']}));
export const burst=defineNativeStage(()=>particleBurst({style:{ink:'#ffe08a'}}));
export const silk=defineNativeStage(()=>silkRibbon({ink:keyframes([{frame:0,value:'#ff8b4a'},{frame:23,value:'#48cef0'}])}));
export const grade=defineNativeStage(()=>gradientBackground({center:'#66bfed',edge:'#0c1626',finish:{tritone:{shadows:'#061b2d',midtones:'#ff9155',highlights:'#ffeec4'}}}));
export default Composition({id:'color-gallery',width:1600,height:480,fps:24,durationInFrames:24,seed:37,background:'#091423',children:[
 ...Object.entries({solid,gradient,copper,neon,actor,confetti,clones,burst,silk,grade}).flatMap(([id,factory],i)=>[Stage({id,factory,width:320,height:240,outputs:{surface:'surface'}}),Layer({source:ref(id),x:i%5*320,y:Math.floor(i/5)*240})]),
]});
