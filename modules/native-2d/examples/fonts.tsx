import {Composition,Stage,Layer,ref,expr} from '@frameweave/engine';import {defineNativeStage} from '@frameweave/engine/native';
import {scene2D,group,rect,text,solid,linearGradient,svg2D} from 'native-2d-candidate';
export const artwork=defineNativeStage(async init=>{
 const mark=await svg2D('<svg viewBox="0 0 180 120"><path d="M8 85 C30 5 70 5 90 60 S150 115 172 30" fill="none" stroke="#66ddff" stroke-width="7" stroke-linecap="round"/></svg>',{id:'mark',width:180,height:120});
 const scene=await scene2D(init,group({id:'root',children:[
  rect({id:'background',width:640,height:360,fill:linearGradient([0,0],[640,360],[{at:0,color:'#101b32'},{at:1,color:'#254663'}])}),
  rect({id:'card',x:24,y:24,width:592,height:312,radius:24,fill:solid('#122238',.86),stroke:{paint:solid('#44637c'),width:1.5}}),
  text({id:'eyebrow',text:'FRAMEWEAVE / NATIVE 2D',x:48,y:44,fontSize:16,letterSpacing:1.8,fill:solid('#72dcf7')}),
  text({id:'heading',text:'文字与路径，一起创作',x:48,y:91,fontSize:34,width:540,fill:solid('#f4f8ff')}),
  text({id:'body',text:'默认字体 · 原生路径 · 确定性动画\n同一 Stage，同一 GPU。',x:48,y:159,fontSize:21,lineHeight:34,width:360,fill:solid('#bacbde')}),
  group({id:'curve',x:420,y:181,children:[mark]}),
  rect({id:'progress-track',x:48,y:291,width:544,height:3,radius:1.5,fill:solid('#36516c')}),
  rect({id:'progress',x:48,y:291,width:expr.add(16,expr.mul(expr.frame,22)),height:3,radius:1.5,fill:solid('#70e1f5')})
 ]}));
 scene.update('curve',{y:expr.add(181,expr.mul(expr.sin(expr.mul(expr.time,6.283185307179586)),6))});return scene;
});
export default Composition({id:'native2d-font-shot',width:640,height:360,fps:24,durationInFrames:24,children:[Stage({id:'artwork',factory:artwork,outputs:{surface:'surface'}}),Layer({source:ref('artwork')})]});
