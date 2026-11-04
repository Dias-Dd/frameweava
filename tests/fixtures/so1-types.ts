import {stageRef,StageCaller} from '../../modules/stage-orchestration/index.ts';
export async function typedContract(c:StageCaller){
  const a=stageRef<{value:number},{score:number}>('A');
  const good=await c.run(a,{inputs:{value:1}});const n:number=good.outputs.score;
  // @ts-expect-error wrong input type
  void c.run(a,{inputs:{value:'wrong'}});
  // @ts-expect-error required typed input omitted
  void c.run(a,{});
  // @ts-expect-error output is statically typed
  const wrong:string=good.outputs.score;
  return n;
}
