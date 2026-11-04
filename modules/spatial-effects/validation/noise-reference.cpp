// Frameweave test oracle; upstream header is included byte-for-byte. Not a production backend.
#include "../vendor/fastnoise-lite/FastNoiseLite.h"
#include <cstdio>
int main(){
  int index=0;
  for(int algorithm=0;algorithm<6;algorithm++)for(int fractal=0;fractal<4;fractal++)for(int warpMode=0;warpMode<4;warpMode++){
    FastNoiseLite n(-51);n.SetFrequency(.73f);n.SetNoiseType((FastNoiseLite::NoiseType)algorithm);n.SetFractalType((FastNoiseLite::FractalType)fractal);n.SetFractalOctaves(4);
    FastNoiseLite w(-51);w.SetFrequency(.73f);w.SetDomainWarpAmp(2.f);w.SetFractalOctaves(4);w.SetDomainWarpType(FastNoiseLite::DomainWarpType_OpenSimplex2);
    w.SetFractalType(warpMode==0||warpMode==1?FastNoiseLite::FractalType_None:warpMode==2?FastNoiseLite::FractalType_DomainWarpProgressive:FastNoiseLite::FractalType_DomainWarpIndependent);
    for(int point=0;point<4;point++){
      float x=.13f+point*.73f,y=-2.17f+point*.51f,z=3.81f-point*.81f,x2=x,y2=y,x3=x,y3=y,z3=z;
      if(warpMode){w.DomainWarp(x2,y2);w.DomainWarp(x3,y3,z3);}
      std::printf("%d %d %d %d %d %.9g %.9g %.9g %.9g %.9g %.9g %.9g\n",index++,algorithm,fractal,warpMode,point,n.GetNoise(x2,y2),n.GetNoise(x3,y3,z3),x2,y2,x3,y3,z3);
    }
  }
}
