import {Composition,Stage,Layer,Resource,ref,expr} from '@frameweave/engine';
import {defineNativeStage} from '@frameweave/engine/native';
import {scene2D,svg2D,solid} from 'native-2d-candidate';

// Editable SVG is parsed into the same Native objects; no SVG raster service,
// browser surface or font substitute. External images require an explicit map.
const drawing=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360">
<defs><linearGradient id="sky" x2="1" y2="1"><stop offset="0" stop-color="#071327"/><stop offset="1" stop-color="#164951"/></linearGradient><radialGradient id="light"><stop offset="0" stop-color="#c3fbff"/><stop offset="1" stop-color="#178cb5"/></radialGradient><clipPath id="crop"><rect x="0" y="0" width="130" height="164"/></clipPath></defs>
<rect width="640" height="360" fill="url(#sky)"/>
<rect x="42" y="44" width="556" height="1" fill="#4e8997"/>
<image href="studio.png" x="42" y="82" width="320" height="220" preserveAspectRatio="xMidYMid slice"/>
<g id="accent" transform="translate(410 88)" opacity=".85" clip-path="url(#crop)"><circle cx="36" cy="44" r="32" fill="url(#light)"/><circle id="warm" cx="102" cy="112" r="48" fill="#ff7855"/></g>
<rect x="42" y="324" width="80" height="3" fill="#56d7eb"/>
</svg>`;
export const artwork=defineNativeStage(async init=>{
 const objects=await svg2D(drawing,{id:'art',width:640,height:360,images:{'studio.png':{resource:{resource:'photo',size:[640,360],decode:'icc-sdr',missingProfile:'assume-srgb'}}}});
 const scene=await scene2D(init,objects,{finish:{glow:{radius:3,threshold:1,intensity:.18}}});
 scene.update('art/accent',{y:expr.mul(expr.sin(expr.mul(expr.time,5)),8)});
 scene.update('art/warm',{fill:solid([1.7,.18,.035])});
 return scene;
});
export default Composition({id:'native2d-svg-shot',width:640,height:360,fps:24,durationInFrames:24,background:'#071327',children:[Resource({id:'photo',src:'./studio.png',kind:'image'}),Stage({id:'artwork',factory:artwork,outputs:{surface:'surface'}}),Layer({source:ref('artwork')})]});
