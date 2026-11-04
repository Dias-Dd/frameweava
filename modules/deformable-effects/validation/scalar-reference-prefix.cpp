// SPDX-License-Identifier: Apache-2.0
// Authored scalar shim for selected MIT C++ method text. No Eigen source used.
#include <cmath>
#include <iostream>
#include <iomanip>
#include <array>
namespace PBD {
using Real=double;
struct Vector3r {
  Real v[3];Vector3r(){setZero();}void setZero(){v[0]=v[1]=v[2]=0;}
  Vector3r operator-(const Vector3r& b)const{Vector3r o;for(int i=0;i<3;i++)o.v[i]=v[i]-b.v[i];return o;}
  Vector3r operator-()const{Vector3r o;for(int i=0;i<3;i++)o.v[i]=-v[i];return o;}
  Vector3r operator*(Real s)const{Vector3r o;for(int i=0;i<3;i++)o.v[i]=v[i]*s;return o;}
  Vector3r& operator+=(const Vector3r& b){for(int i=0;i<3;i++)v[i]+=b.v[i];return *this;}
  Vector3r& operator/=(Real s){for(int i=0;i<3;i++)v[i]/=s;return *this;}
  Real dot(const Vector3r& b)const{return v[0]*b.v[0]+v[1]*b.v[1]+v[2]*b.v[2];}
  Real squaredNorm()const{return dot(*this);}Real norm()const{return std::sqrt(squaredNorm());}
  Vector3r cross(const Vector3r& b)const{Vector3r o;o.v[0]=v[1]*b.v[2]-v[2]*b.v[1];o.v[1]=v[2]*b.v[0]-v[0]*b.v[2];o.v[2]=v[0]*b.v[1]-v[1]*b.v[0];return o;}
};
Vector3r operator*(Real s,const Vector3r& b){return b*s;}
struct Matrix4r{Real v[16];Real&operator()(int r,int c){return v[r*4+c];}Real operator()(int r,int c)const{return v[r*4+c];}};
struct MathFunctions{static Real cotTheta(const Vector3r&,const Vector3r&);};
}
