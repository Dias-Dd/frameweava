export const vertex=`precision highp float;
in vec3 position;in vec3 previousPosition;
uniform mat4 modelViewMatrix,modelMatrix,currentMvp,previousMvp,mvpDelta;
out vec3 worldPosition;out float viewDepth;out vec4 currentClip,clipDelta;
void main(){vec4 p=vec4(position,1.0);vec4 v=modelViewMatrix*p;
// Derivatives ignore translation mathematically. Omit the large world offset before f32
// interpolation so a small face does not lose its tangent directions or disappear.
worldPosition=mat3(modelMatrix)*position;viewDepth=-v.z;currentClip=currentMvp*p;
// Algebraic difference avoids subtracting almost-identical independently rounded projections.
clipDelta=mvpDelta*p+previousMvp*vec4(position-previousPosition,0.0);gl_Position=currentClip;}`;
export const fragment=`precision highp float;
in vec3 worldPosition;in float viewDepth;in vec4 currentClip,clipDelta;uniform vec2 imageSize;
layout(location=0)out vec4 depthResult;layout(location=1)out vec4 normalResult;layout(location=2)out vec4 motionResult;
void main(){
vec3 n=cross(dFdx(worldPosition),dFdy(worldPosition));float l=length(n);if(l<=0.0)discard;n/=l;
// Both sides are visible; cross of screen derivatives yields a camera-facing geometric normal.
depthResult=vec4(viewDepth,0.0,0.0,1.0);normalResult=vec4(n,1.0);
float valid=0.0;vec2 delta=vec2(0.0);
vec4 previousClip=currentClip-clipDelta;
if(previousClip.w>0.0&&previousClip.z>=-previousClip.w&&previousClip.z<=previousClip.w){vec2 movement=(clipDelta.xy*currentClip.w-currentClip.xy*clipDelta.w)/(currentClip.w*previousClip.w)*.5;delta=movement*imageSize*vec2(1.0,-1.0);valid=1.0;}
motionResult=vec4(delta,valid,1.0);}`;
export const previewVertex=`precision highp float;in vec3 position;out vec2 uv;void main(){uv=position.xy*.5+.5;gl_Position=vec4(position,1.0);}`;
export const previewFragment=`precision highp float;precision highp int;
uniform sampler2D depthSource,normalSource,motionSource;uniform int mode;uniform vec2 depthRange;uniform float motionScale;
in vec2 uv;out vec4 result;
void main(){vec2 p=uv;int m=mode;if(m==3){m=int(min(2.0,floor(p.x*3.0)));p.x=fract(p.x*3.0);}vec4 d=texture(depthSource,p);vec3 color;
if(m==0){float v=1.0-clamp((d.x-depthRange.x)/(depthRange.y-depthRange.x),0.0,1.0);color=vec3(v);}
else if(m==1)color=texture(normalSource,p).xyz*.5+.5;
else{vec4 motion=texture(motionSource,p);color=motion.z>0.5?vec3(.5+motion.x/motionScale,.5-motion.y/motionScale,.5):vec3(1.0,0.0,1.0);}
result=vec4(color*d.w,d.w);}`;
