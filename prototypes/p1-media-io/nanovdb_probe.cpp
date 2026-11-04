// Isolated file/algorithm reference. No GPU Host or production parser.
#include <nanovdb/tools/CreatePrimitives.h>
#include <nanovdb/tools/GridValidator.h>
#include <nanovdb/io/IO.h>
#include <algorithm>
#include <cmath>
#include <cstdint>
#include <fstream>
#include <iostream>
#include <stdexcept>
#include <string>
int main(int argc,char**argv){try{
 if(argc!=2)throw std::runtime_error("Explicit owned output directory required");const std::string dir=argv[1];
 auto h=nanovdb::tools::createLevelSetSphere<float>(5.,nanovdb::Vec3d(0),1.,3.,nanovdb::Vec3d(0),"frameweave-p1-sphere",nanovdb::tools::StatsMode::All,nanovdb::CheckMode::Full);
 auto*g=h.grid<float>();if(!g||reinterpret_cast<std::uintptr_t>(h.data())%32||!nanovdb::tools::isValid(g,nanovdb::CheckMode::Full))throw std::runtime_error("Invalid aligned source grid");
 nanovdb::io::writeGrid(dir+"/sphere.nvdb",h,nanovdb::io::Codec::NONE);auto restored=nanovdb::io::readGrid<>(dir+"/sphere.nvdb");auto*r=restored.grid<float>();if(!r||!nanovdb::tools::isValid(r,nanovdb::CheckMode::Full))throw std::runtime_error("Invalid roundtrip grid");
 auto a=g->getAccessor(),b=r->getAccessor();double error=0;std::uint64_t samples=0;std::ofstream values(dir+"/sphere-reference.f32",std::ios::binary);
 for(int z=-10;z<=10;z++)for(int y=-10;y<=10;y++)for(int x=-10;x<=10;x++){const nanovdb::Coord c(x,y,z);const float actual=b.getValue(c),before=a.getValue(c),reference=static_cast<float>(std::clamp(std::sqrt(double(x*x+y*y+z*z))-5.,-3.,3.));if(actual!=before)throw std::runtime_error("File sample changed");error=std::max(error,std::abs(double(actual)-reference));values.write(reinterpret_cast<const char*>(&actual),4);values.write(reinterpret_cast<const char*>(&reference),4);samples++;}values.close();if(error>0.000003)throw std::runtime_error("Sphere SDF reference mismatch");
 std::ofstream raw(dir+"/sphere-grid.raw",std::ios::binary);raw.write(reinterpret_cast<const char*>(restored.data()),restored.size());raw.close();auto*bytes=static_cast<unsigned char*>(restored.data());const auto last=restored.size()-1;bytes[last]^=1;const bool tamper=!nanovdb::tools::isValid(r,nanovdb::CheckMode::Full);bytes[last]^=1;if(!tamper)throw std::runtime_error("Changed grid passed full checksum");
 std::cout<<"{\"version\":1,\"kind\":\"isolated-nanovdb-cpu-reference-not-gpu-backend\",\"openvdbTag\":\"v12.1.1\",\"nanoVdbAbi\":\"32.8.0\",\"gridBytes\":"<<g->gridSize()<<",\"activeVoxels\":"<<g->activeVoxelCount()<<",\"samples\":"<<samples<<",\"maxError\":"<<error<<",\"byteAlignment\":32,\"fullChecksumTamperRejected\":"<<(tamper?"true":"false")<<",\"codec\":\"NONE\",\"cuda\":false,\"tbb\":false,\"openvdbCore\":false,\"gpuUploadVerified\":false}"<<std::endl;return 0;
 }catch(const std::exception&e){std::cerr<<e.what()<<std::endl;return 1;}}
