import {randomBytes} from 'node:crypto';
import type {NativeProgram} from './client.ts';
import {nativePixelShader} from '../gpu-effects/pixel-shader.ts';
import {linear709} from '../../src/media/surface.ts';
import {configureNativeDisplay} from './display.ts';
/** Admit the ONE device before executing a package initializer. No frame is
 * submitted. The same owner is reconfigured after JS records the actual plan. */
export function nativeBootstrapProgram(width:number,height:number,window:boolean,maxBytes:number,rayQuery=false):NativeProgram{
 if(!window){width=1;height=1;}
 const header=Array<number>(32).fill(0);header.splice(0,4,width,height,0,2);
 const program:NativeProgram={version:2,session:randomBytes(32).toString('hex'),slots:1,maxBytes,images:[{width,height,format:'rgba32float',alpha:'opaque',color:linear709}],kernels:[{code:nativePixelShader({abiVersion:1,id:'frameweave/native/device-bootstrap',version:'1.0.0',inputCount:0,parameterWords:0,code:'fn pixel(p:vec2u)->vec4f{return vec4f(0.,0.,0.,1.);}'}),inputCount:0,parameterWords:0,headerWords:32}],passes:[{kernel:0,inputs:[],output:0,header}],display:null};
 if(rayQuery)program.rayQuery=true;
 if(window)configureNativeDisplay(program,0);return program;
}
