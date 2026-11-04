Texture2D<float> luma:register(t0);
Texture2D<float2> chroma:register(t1);
SamplerState linearClamp:register(s0);
RWTexture2D<float4> destination:register(u0);
cbuffer Parameters:register(b0){
 uint4 dimensions; // output width/height, coded texture width/height
 uint4 source; // visible width/height, ten-bit, transfer
 float4 row0;float4 row1;float4 row2;
 float4 light; // reference white, peak nits, HLG gamma, Kr
}
float pq(float v){float p=pow(max(v,0.),32./2523.);return 10000.*pow(max(p-3424./4096.,0.)/(2413./128.-2392./128.*p),16384./2610.);}
float rec709(float v){float a=abs(v);return sign(v)*(a<.081?a/4.5:pow((a+.099)/1.099,1./.45));}
float hlg(float v){return v<=.5?v*v/3.:(exp((v-.55991073)/.17883277)+.28466892)/12.;}
[numthreads(8,8,1)]void main(uint3 p:SV_DispatchThreadID){
 if(p.x>=dimensions.x||p.y>=dimensions.y)return;
 float2 pixel=(float2(p.xy)+.5)*float2(source.xy)/float2(dimensions.xy)-.5;
 float2 visible=clamp(pixel,0.,float2(source.xy)-1.);
 float y=luma.SampleLevel(linearClamp,(visible+.5)/float2(dimensions.zw),0.);
 // MPEG left chroma: samples at (2*x, 2*y+.5), not at luma pixel centres.
 float2 cp=clamp((pixel-float2(0.,.5))*.5,0.,float2((source.xy+1u)/2u)-1.);
 float2 uv=chroma.SampleLevel(linearClamp,(cp+.5)/(float2(dimensions.zw)*.5),0.);
 float Y,Cb,Cr;
 if(source.z!=0){Y=(y*65535./64.-64.)/876.;Cb=(uv.x*65535./64.-512.)/896.;Cr=(uv.y*65535./64.-512.)/896.;}
 else{Y=(y*255.-16.)/219.;Cb=(uv.x*255.-128.)/224.;Cr=(uv.y*255.-128.)/224.;}
 float kr=light.w,kb=kr>.25?.0593:.0722,kg=1.-kr-kb;
 float3 rgb=float3(Y+2.*(1.-kr)*Cr,Y-2.*kb*(1.-kb)/kg*Cb-2.*kr*(1.-kr)/kg*Cr,Y+2.*(1.-kb)*Cb);
 if(source.w==1)rgb=float3(rec709(rgb.r),rec709(rgb.g),rec709(rgb.b))*light.x;
 else if(source.w==2)rgb=float3(pq(rgb.r),pq(rgb.g),pq(rgb.b));
 else{rgb=float3(hlg(max(rgb.r,0.)),hlg(max(rgb.g,0.)),hlg(max(rgb.b,0.)));rgb*=pow(max(dot(rgb,float3(.2627,.6780,.0593)),0.),light.z-1.)*light.y;}
 destination[p.xy]=float4(dot(row0.xyz,rgb),dot(row1.xyz,rgb),dot(row2.xyz,rgb),1.);
}
