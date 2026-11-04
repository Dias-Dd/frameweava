import {writeFile,mkdir} from 'node:fs/promises';import {resolve,join} from 'node:path';import ts from 'typescript';
const run=resolve(process.env.CREATION_RUN!),pack=resolve(process.env.CREATION_PACKAGE!);await mkdir(run,{recursive:true});const file=join(run,'typed-consumer.ts');await writeFile(file,`
import {canvas2D,svg2D,scene2D,group,rect,solid,type LayoutStyle2D,type CanvasRecorder2D} from 'native-2d-candidate';
import type {NativeStageInit} from '@frameweave/engine/native';
const drawing:CanvasRecorder2D=canvas2D({id:'d',width:640,height:360});
drawing.fillStyle='rgba(255,0,0,.5)';drawing.fillRect(0,0,10,10);
const layout:LayoutStyle2D={display:'flex',direction:'row',width:'50%',padding:[10,20],gap:12};
export function shot(init:NativeStageInit){return scene2D(init,group({id:'root',layout,children:[drawing.snapshot(),rect({id:'r',width:20,height:10,fill:solid([2,-.2,.5])})]}));}
export const parsed=svg2D('<svg viewBox="0 0 10 10"><rect width="10" height="10"/></svg>',{id:'s',width:10,height:10});
// @ts-expect-error Invalid layout spelling must be rejected by carried declarations.
const invalid:LayoutStyle2D={direction:'diagonal'};
// @ts-expect-error A Canvas drawing method needs numeric coordinates.
drawing.fillRect('wrong',0,10,10);
// @ts-expect-error Existing Shape dimensions cannot be an image handle.
rect({id:'r',width:{gpuTexture:1},height:10});
`);
const options:ts.CompilerOptions={strict:true,noEmit:true,skipLibCheck:false,module:ts.ModuleKind.ESNext,moduleResolution:ts.ModuleResolutionKind.Bundler,target:ts.ScriptTarget.ES2022,esModuleInterop:true,resolveJsonModule:true,allowImportingTsExtensions:true,types:['node'],paths:{'native-2d-candidate':[join(pack,'api.d.ts')],'@frameweave/engine':[resolve('src/index.ts')],'@frameweave/engine/native':[resolve('modules/native-gpu/authoring.ts')],'@frameweave/engine/plugins':[resolve('src/plugins/sdk.ts')],'@frameweave/engine/graphics-contracts':[resolve('modules/graphics-contracts/index.ts')]}};
const program=ts.createProgram([file],options),errors=ts.getPreEmitDiagnostics(program).filter(d=>d.category===ts.DiagnosticCategory.Error);if(errors.length)throw Error(ts.formatDiagnostics(errors,{getCurrentDirectory:()=>resolve('.'),getCanonicalFileName:f=>f,getNewLine:()=> '\n'}));console.log('PASS consumer uses carried candidate declarations, with actual typed-call and intentional-error checks; no Native2D internal source import');
