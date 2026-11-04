// SPDX-License-Identifier: Apache-2.0
// Authored scalar test shim; no Eigen source. Fixed MIT solver methods are inserted unchanged.
#include <cmath>
#include <iostream>
#include <iomanip>
namespace PBD {
using Real=double;
struct Vector3r {
 Real a[3]{};Vector3r()=default;Vector3r(Real x,Real y,Real z):a{x,y,z}{}
 Real& operator[](int i){return a[i];}Real operator[](int i)const{return a[i];}
 Real x()const{return a[0];}Real y()const{return a[1];}Real z()const{return a[2];}
 Vector3r operator-(const Vector3r& b)const{return {a[0]-b.a[0],a[1]-b.a[1],a[2]-b.a[2]};}
 Vector3r operator*(Real k)const{return {a[0]*k,a[1]*k,a[2]*k};}
 Vector3r operator/(Real k)const{return {a[0]/k,a[1]/k,a[2]/k};}
 Vector3r& operator/=(Real k){for(auto&v:a)v/=k;return *this;}Vector3r eval()const{return *this;}
};
Vector3r operator*(Real k,const Vector3r& v){return v*k;}
struct Matrix3r{Real a[3][3]{};Matrix3r transpose()const{Matrix3r o;for(int i=0;i<3;i++)for(int j=0;j<3;j++)o.a[i][j]=a[j][i];return o;}Vector3r operator*(const Vector3r& v)const{Vector3r o;for(int i=0;i<3;i++)for(int j=0;j<3;j++)o[i]+=a[i][j]*v[j];return o;}};
struct Coeff4 {Real a[4]{};Real&operator[](int i){return a[i];}Real operator[](int i)const{return a[i];}Coeff4 operator+(const Coeff4&b)const{Coeff4 o;for(int i=0;i<4;i++)o[i]=a[i]+b[i];return o;}Coeff4 operator-(const Coeff4&b)const{Coeff4 o;for(int i=0;i<4;i++)o[i]=a[i]-b[i];return o;}Coeff4&operator*=(Real k){for(auto&v:a)v*=k;return *this;}};
struct Quaternionr {
 Coeff4 c;Quaternionr()=default;Quaternionr(Real w,Real x,Real y,Real z){c.a[0]=x;c.a[1]=y;c.a[2]=z;c.a[3]=w;}
 Coeff4&coeffs(){return c;}const Coeff4&coeffs()const{return c;}
 Real x()const{return c[0];}Real y()const{return c[1];}Real z()const{return c[2];}Real w()const{return c[3];}Real&w(){return c[3];}
 Quaternionr conjugate()const{return {w(),-x(),-y(),-z()};}Real squaredNorm()const{Real s=0;for(int i=0;i<4;i++)s+=c[i]*c[i];return s;}
 Quaternionr operator*(const Quaternionr&b)const{return {w()*b.w()-x()*b.x()-y()*b.y()-z()*b.z(),w()*b.x()+x()*b.w()+y()*b.z()-z()*b.y(),w()*b.y()-x()*b.z()+y()*b.w()+z()*b.x(),w()*b.z()+x()*b.y()-y()*b.x()+z()*b.w()};}
 Matrix3r toRotationMatrix()const{Matrix3r r;const Real tx=2*x(),ty=2*y(),tz=2*z(),twx=tx*w(),twy=ty*w(),twz=tz*w(),txx=tx*x(),txy=ty*x(),txz=tz*x(),tyy=ty*y(),tyz=tz*y(),tzz=tz*z();r.a[0][0]=1-(tyy+tzz);r.a[0][1]=txy-twz;r.a[0][2]=txz+twy;r.a[1][0]=txy+twz;r.a[1][1]=1-(txx+tzz);r.a[1][2]=tyz-twx;r.a[2][0]=txz-twy;r.a[2][1]=tyz+twx;r.a[2][2]=1-(txx+tyy);return r;}
};
}
