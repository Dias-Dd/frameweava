import {Composition,Stage,Layer,Resource,ref,keyframes} from '@frameweave/engine';import {defineNativeStage} from '@frameweave/engine/native';
import {characterActor,characterDocument,characterClip,characterBone,characterMorph,twoBoneIK,footContact} from 'spatial-creation-candidate';
import asset from './character-asset/model.character.json';
export const actor=defineNativeStage(()=>characterActor({asset:characterDocument(asset),textures:{image0:{image:{resource:'cloth-texture',size:[2,2],missingProfile:'assume-srgb'}}},controls:{
 clips:[characterClip('greeting')],morphs:[characterMorph('breathe',keyframes([{frame:0,value:0},{frame:12,value:1},{frame:23,value:0}]))],
 bones:[characterBone('hips',{rotate:[0,keyframes([{frame:0,value:-.15},{frame:12,value:.15},{frame:23,value:-.15}]),0]})],
 ik:[twoBoneIK({root:'rightShoulder',middle:'rightElbow',end:'rightHand',target:[.75,.65,.1],pole:[.3,.1,.8],weight:.65})],
 contacts:[footContact({root:'leftHip',middle:'leftKnee',end:'leftFoot',pole:[-.2,0,1],offset:-1.05,align:.2})],
 },camera:{projection:'orthographic',position:[2,1,6],target:[0,-.05,0],near:.01,far:30,viewHeight:2.7},maxRayTests:2e9}));
export default Composition({id:'imported-character',width:640,height:360,fps:24,durationInFrames:24,background:'#0b1428',children:[Resource({id:'cloth-texture',kind:'image',src:'./character-asset/image0.png'}),Stage({id:'actor',factory:actor,outputs:{surface:'surface'}}),Layer({source:ref('actor')})]});
