/** @jsxImportSource react */
import {useMemo,useState} from 'react';
import {Composition,Stage,Layer,ref} from '@frameweave/engine';
import {nativeSimulation} from '@frameweave/engine/native';
import {NativePass,defineNativeReactStage,useNativeFrame} from '@frameweave/engine/native/react';
import {linear709} from '@frameweave/engine/native';

function Ball(){
 const {context,init}=useNativeFrame();const [enabled]=useState(true);
 const simulation=useMemo(()=>{
  const ball={x:.35,y:.08,vx:.1,vy:0,hp:100,attack:20};
  const runner=nativeSimulation(ball,dt=>{
   ball.vy+=9.8*dt;ball.y+=ball.vy*dt;ball.x+=ball.vx*dt;
   if(ball.y>.88){ball.y=.88;ball.vy*=-.8;ball.hp=Math.max(0,ball.hp-10);}
   if(ball.x>.9||ball.x<.1)ball.vx*=-1;
  },{fps:120,checkpointInterval:30});return {ball,runner};
 },[]);
 const ball=simulation.runner.seek(Math.round(context.time*120));
 let energy=0;for(let i=0;i<3;i++)energy+=ball.attack*.01; // ordinary authored JS
 if(!enabled)energy=0;
 return <NativePass render={async gpu=>{
  const kernel=await gpu.compile({abiVersion:1,id:'frameweave/example/native-ball',version:'1.0.0',inputCount:0,parameterWords:4,code:`
   fn pixel(p:vec2u)->vec4f{
    let uv=(vec2f(p)+vec2f(.5))/vec2f(outputSize());let delta=(uv-vec2f(paramF32(0u),paramF32(1u)))*vec2f(f32(outputSize().x)/f32(outputSize().y),1.);
    let coverage=1.-smoothstep(.055,.065,length(delta));
    let color=vec3f(paramF32(2u),paramF32(3u),.15)*coverage;return vec4f(color,1.);
   }`});
  return gpu.run(kernel,[],{parameters:new Float32Array([ball.x,ball.y,energy,ball.hp/100]),output:{width:init.width,height:init.height,format:'rgba32float',alpha:'opaque',color:linear709}});
 }}/>;
}
export const ballStage=defineNativeReactStage(Ball);
export default Composition({id:'native-react-ball',width:640,height:360,fps:60,durationInFrames:120,background:'transparent',children:[Stage({id:'ball',factory:ballStage,seek:'fixed-step',outputs:{surface:'surface'}}),Layer({source:ref('ball')})]});
