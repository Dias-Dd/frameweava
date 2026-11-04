import {definePlugin} from '@frameweave/engine/plugins';
// Ordinary functions, loaded only through declared, trusted, pinned R1 dependencies.
export default definePlugin({kind:'generator',async create(init){
 const pa=await init.loadModule({module:'main',format:'javascript',dependency:'pro-animation'});
 const graphics=await init.loadModule({module:'main',format:'javascript',dependency:'frameweave.graphics-contracts'});
 const vector=pa.createVectorTools(graphics),fx=await pa.createImageEffects(init),canvas=document.createElement('canvas');canvas.width=init.width;canvas.height=init.height;const c=canvas.getContext('2d',{willReadFrequently:true});
 const make=(right)=>({schema:'frameweave.path',version:1,id:'demo',coordinates:{spaceId:'demo',unit:'px',origin:'top-left',x:'right',y:'down',width:init.logicalWidth,height:init.logicalHeight},fillRule:'nonzero',commands:[{op:'M',point:{id:'a',x:28,y:82}},{op:'C',control1:{id:'b',x:70,y:right?126:62},control2:{id:'c',x:120,y:right?44:62},point:{id:'d',x:160,y:82}},{op:'L',point:{id:'e',x:145,y:144}},{op:'L',point:{id:'f',x:44,y:144}},{op:'Z'}]});const a=graphics.validatePathData(make(false)),b=graphics.validatePathData(make(true));
 return {async render(ctx,_inputs,p){
  c.reset();if(init.width!==init.logicalWidth||init.height!==init.logicalHeight)c.setTransform(init.width/init.logicalWidth,0,0,init.height/init.logicalHeight,0,0);c.fillStyle='#ebfbff';c.font='bold 22px Arial';c.fillText(pa.revealText('PRO ANIMATION',{progress:p.progress},ctx),22,35);
  const path=vector.morphPath(a,b,p.progress,ctx);c.fillStyle='#23c6a3';c.fill(new Path2D(graphics.pathCommands(path)));
  c.lineWidth=3;c.strokeStyle='#ffc96e';c.stroke(new Path2D(graphics.pathCommands(vector.trimPaths(a,{end:p.progress,step:.5},ctx))));
  const [x,y]=pa.wiggle({frequency:2,amplitude:9,seed:51},ctx);c.fillStyle='#ff7fa8';c.beginPath();c.arc(235+x,102+y,12,0,Math.PI*2);c.fill();
  const displaced=await fx.displacement(canvas,{amount:2,seed:51},ctx);return {image:await fx.glow(displaced,{radius:2,intensity:.25,threshold:.7},ctx)};
 },async dispose(){await fx.dispose();canvas.width=canvas.height=0;}};
}});
