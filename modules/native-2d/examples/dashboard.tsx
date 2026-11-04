import {Composition,Stage,Layer,Resource,ref,expr} from '@frameweave/engine';
import {defineNativeStage} from '@frameweave/engine/native';
import {scene2D,group,rect,image,solid,linearGradient,canvas2D} from 'native-2d-candidate';

/** Object flow and Canvas-style marks share one ordinary Native Stage. Text labels
 * are deliberately omitted until the reviewed font services are admitted. */
export const dashboard=defineNativeStage(init=>{
 const d=canvas2D({id:'marks',width:640,height:360});
 d.fillStyle='#47cbe9';d.globalAlpha=.9;
 for(let i=0;i<24;i++)d.fillRect(42+i*23,300-Math.sin(i*.48)*15,12,3+Math.cos(i*.34)*15);
 d.save();d.translate(534,67);const g=d.createRadialGradient(0,0,0,0,0,17);g.addColorStop(0,'#aef8ff');g.addColorStop(1,'#168bb4');d.fillStyle=g;d.globalAlpha=1;d.beginPath();d.arc(0,0,17,0,Math.PI*2);d.fill();d.restore();
 return scene2D(init,group({id:'frame',children:[
  rect({id:'back',width:640,height:360,fill:linearGradient([0,0],[640,360],[{at:0,color:[.004,.009,.026]},{at:1,color:[.018,.075,.09]}])}),
  rect({id:'rule',x:40,y:36,width:560,height:1,fill:solid([.08,.24,.29])}),
  group({id:'cards',x:40,y:92,layout:{display:'flex',direction:'row',width:560,height:180,gap:16,align:'center'},children:[
   image({id:'photo',source:{resource:{resource:'photo',size:[640,360],decode:'icc-sdr',missingProfile:'assume-srgb'}},width:300,height:180,fit:'cover'}),
   group({id:'bars',layout:{display:'flex',direction:'column',grow:1,basis:0,height:140,gap:16,justify:'center'},children:[
    rect({id:'one',width:180,height:18,fill:solid([.04,.6,.8]),x:expr.mul(expr.sin(expr.mul(expr.time,5)),4)}),
    rect({id:'two',width:128,height:18,fill:solid([.03,.28,.44])}),rect({id:'three',width:154,height:18,fill:solid([.08,.15,.23])})]})]}),
  d.snapshot()]}),{finish:{glow:{radius:3,threshold:.8,intensity:.12}}});
});
export default Composition({id:'native2d-dashboard',width:640,height:360,fps:24,durationInFrames:24,background:'#040a12',children:[Resource({id:'photo',src:'./studio.png',kind:'image'}),Stage({id:'dashboard',factory:dashboard,outputs:{surface:'surface'}}),Layer({source:ref('dashboard')})]});
