// Fixture/oracle only: OpenVDB 12.1.1 NanoVDB, Apache-2.0. No runtime engine or hand-patched grids.
#include <nanovdb/tools/CreatePrimitives.h>
#include <nanovdb/tools/CreateNanoGrid.h>
#include <nanovdb/tools/GridValidator.h>
#include <fstream>
#include <iostream>
#include <cmath>
#include <stdexcept>
template<class H> void save(H& h,const std::string& dir,const std::string& name,bool sdf){
 auto*g=h.template grid<float>();if(!g||!nanovdb::tools::isValid(g,nanovdb::CheckMode::Full))throw std::runtime_error("Invalid upstream grid");std::ofstream raw(dir+"/"+name+".raw",std::ios::binary);raw.write((const char*)h.data(),h.size());raw.close();
 auto accessor=g->getAccessor();std::ofstream values(dir+"/"+name+"-reference.f32",std::ios::binary);const int dim=12;
 // Two sampling modes: actual upstream world inverse map + nearest / trilinear.
 for(int mode=0;mode<2;mode++)for(int z=0;z<dim;z++)for(int y=0;y<dim;y++)for(int x=0;x<dim;x++){
  const float offset=sdf?0.f:.5f,step=4.f/float(sdf?dim-1:dim);nanovdb::Vec3f p(-2+(x+offset)*step,-2+(y+offset)*step,-2+(z+offset)*step),q=g->map().applyInverseMapF(p);float value=0,active=0;
  if(!mode){nanovdb::Coord c(int(std::floor(q[0]+.5f)),int(std::floor(q[1]+.5f)),int(std::floor(q[2]+.5f)));value=accessor.getValue(c);active=accessor.isActive(c)?1.f:0.f;}
  else{nanovdb::Coord base(int(std::floor(q[0])),int(std::floor(q[1])),int(std::floor(q[2])));float f[3]={q[0]-base[0],q[1]-base[1],q[2]-base[2]};for(int k=0;k<8;k++){float w=1;nanovdb::Coord c=base;for(int a=0;a<3;a++){const int bit=(k>>a)&1;w*=bit?f[a]:1-f[a];c[a]+=bit;}value+=accessor.getValue(c)*w;active+=(accessor.isActive(c)?1.f:0.f)*w;}}
  values.write((const char*)&value,4);values.write((const char*)&active,4);
 }std::cout<<"{\"name\":\""<<name<<"\",\"bytes\":"<<h.size()<<",\"fullValidation\":true}"<<std::endl;
}
int main(int argc,char**argv){try{if(argc!=2)throw std::runtime_error("Output required");for(int frame=0;frame<2;frame++){
 auto fog=nanovdb::tools::createFogVolumeSphere<float>(.95,nanovdb::Vec3d(frame? .45:-.45,0,0),frame?.16:.2,3.,nanovdb::Vec3d(frame?.05:0,0,0),"cache-fog",nanovdb::tools::StatsMode::All,nanovdb::CheckMode::Full);save(fog,argv[1],"fog"+std::to_string(frame),false);
 auto sdf=nanovdb::tools::createLevelSetSphere<float>(.8,nanovdb::Vec3d(frame?.35:-.35,0,0),frame?.16:.2,3.,nanovdb::Vec3d(0),"cache-sdf",nanovdb::tools::StatsMode::All,nanovdb::CheckMode::Full);save(sdf,argv[1],"sdf"+std::to_string(frame),true);
 }return 0;}catch(const std::exception&e){std::cerr<<e.what()<<std::endl;return 1;}}
