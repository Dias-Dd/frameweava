import test from 'node:test';
import assert from 'node:assert/strict';
import {cardProjection,cardHomography,cardRotation} from '../modules/pro-animation/src/native-transitions/card-camera.ts';
const project=(m:number[][],p:number[])=>{const q=m.map(row=>row.reduce((s,v,k)=>s+v*(p[k]??1),0));return q.slice(0,2).map(v=>v/q[2]);};
const near=(a:number[],b:number[],e=1e-10)=>a.forEach((v,i)=>assert.ok(Math.abs(v-b[i])<e,JSON.stringify({a,b,e})));
test('card camera preserves physical image plane and independent focal/depth controls',()=>{
 const p=cardProjection(undefined,80,45);for(const v of [[0,0,0],[80,45,0],[27,12,0]])near(project(p.projection,v),v.slice(0,2));near(p.eye,[40,22.5,-160]);
 const far=project(p.projection,[60,22.5,160]);near(far,[50,22.5]);
 near(project(cardProjection({focalLength:80,depth:160},80,45).projection,[60,22.5,0]),[50,22.5]);
});
test('rotation orders are orthonormal and position-before/after rotation differs',()=>{
 for(const order of ['XYZ','XZY','YXZ','YZX','ZXY','ZYX']){const r=cardRotation(.3,.7,.2,order);for(let i=0;i<3;i++)for(let j=0;j<3;j++)assert.ok(Math.abs(r[i].reduce((s,v,k)=>s+v*r[j][k],0)-Number(i===j))<1e-14);}
 const a=cardProjection({position:[.7,.3],rotationDegrees:[20,30,17],transformOrder:'XYZ-position'},80,45),b=cardProjection({position:[.7,.3],rotationDegrees:[20,30,17],transformOrder:'position-XYZ'},80,45);assert.notDeepEqual(a.matrix,b.matrix);
});
test('manual corner-pin projection lands on all four pins, including mirrored winding',()=>{
 for(const q of [[[.1,.1],[.9,.2],[.8,.9],[.2,.85]],[[.9,.1],[.1,.2],[.2,.9],[.8,.85]]] as const){const p=cardProjection({system:'corner-pins',corners:q,autoFocalLength:false,focalLength:160},80,45);for(const [i,v]of [[0,[0,0,0]],[1,[80,0,0]],[2,[80,45,0]],[3,[0,45,0]]] as const)near(project(p.projection,[...v]),[q[i][0]*80,q[i][1]*45]);}
});
test('auto focal is deterministic without prior frames; composition matrix stays explicit',()=>{
 const q=[[0,0],[1,0],[1,1],[0,1]] as const,a=cardProjection({system:'corner-pins',corners:q},80,45);assert.deepEqual(a,cardProjection({system:'corner-pins',corners:q},80,45));
 const b=cardProjection({system:'composition',projection:a.projection.flat(),near:a.near},80,45);assert.deepEqual(a.matrix,b.matrix);near(a.eye,b.eye);
});
test('card camera rejects invalid/degenerate/unknown controls with structured errors',()=>{
 for(const fn of [()=>cardHomography([[0,0],[1,1],[1,0],[0,1]]),()=>cardProjection({depth:0},80,45),()=>cardProjection({system:'composition',projection:[1,2]},80,45),()=>cardProjection({transformOrder:'wrong' as never},80,45),()=>cardProjection({position:[NaN,0]},80,45),()=>cardProjection({secret:true} as never,80,45)])assert.throws(fn,{code:'E_PA_CARD'});
});
