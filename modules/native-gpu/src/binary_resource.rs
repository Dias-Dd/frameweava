//! Read-only, admission-only raw bytes through the existing private Resource lease.
use crate::protocol::{Data,Program};use std::{fs::File,io::{Read,Seek,SeekFrom}};
#[derive(Debug,serde::Deserialize,Clone,PartialEq)]#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct Import{pub version:u32,pub profile:String,pub file:String,pub bytes:u64,pub byte_offset:u64,pub byte_length:u64}
impl Import{pub fn validate(&self,d:&Data,p:&Program)->Result<(),String>{
 if self.version!=1||self.profile!="raw-bytes-v1"||self.bytes==0||self.byte_length==0||self.byte_length>self.bytes||self.byte_offset>self.bytes-self.byte_length||d.r#type!="u32"||!d.immutable||!d.initial.is_empty()||d.persistent.is_some()||d.source_image.is_some()||self.byte_length.div_ceil(4)!=d.length||p.resource_lease.is_none()||self.file.len()>96||!self.file.ends_with(".bytes")||self.file.contains("..")||!self.file.bytes().all(|c|c.is_ascii_alphanumeric()||c==b'-'||c==b'.'){
  return Err("E_NATIVE_BINARY_SCHEMA: invalid read-only raw byte range/lease".into());
 }Ok(())
}}
pub fn upload(program:&Program,d:&Data,device:&wgpu::Device,queue:&wgpu::Queue,buffer:&wgpu::Buffer)->Result<u64,String>{
 let source=d.source_resource.as_ref().ok_or("E_NATIVE_BINARY_SCHEMA: missing private source")?;source.validate(d,program)?;let root=std::fs::canonicalize(&program.resource_lease.as_ref().unwrap().directory).map_err(|e|format!("E_NATIVE_BINARY_LEASE: {e}"))?;let path=root.join(&source.file);let meta=std::fs::symlink_metadata(&path).map_err(|e|format!("E_NATIVE_BINARY_LEASE: {e}"))?;
 if !root.is_dir()||!meta.is_file()||meta.file_type().is_symlink(){return Err("E_NATIVE_BINARY_LEASE: regular private snapshot required".into());}
 let mut options=std::fs::OpenOptions::new();options.read(true);#[cfg(windows)]{use std::os::windows::fs::OpenOptionsExt;options.share_mode(1);}let mut file:File=options.open(path).map_err(|e|format!("E_NATIVE_BINARY_LEASE: {e}"))?;
 if file.metadata().map_err(|e|e.to_string())?.len()!=source.bytes{return Err("E_NATIVE_BINARY_LENGTH: snapshot length differs from admitted source".into());}
 file.seek(SeekFrom::Start(source.byte_offset)).map_err(|e|format!("E_NATIVE_BINARY_IO: {e}"))?;let bytes=d.length.checked_mul(4).and_then(|n|usize::try_from(n).ok()).ok_or("E_NATIVE_BINARY_BUDGET: range cannot fit host staging")?;let mut staging=Vec::new();staging.try_reserve_exact(bytes).map_err(|e|format!("E_NATIVE_BINARY_BUDGET: {e}"))?;staging.resize(bytes,0);file.read_exact(&mut staging[..source.byte_length as usize]).map_err(|e|format!("E_NATIVE_BINARY_IO: {e}"))?;queue.write_buffer(buffer,0,&staging);let _=device;Ok(staging.len()as u64)
}
/** Shader access is checked on the native owner; authored flags are not authority. */
pub fn readonly(kernel:&crate::protocol::Kernel,binding:u32)->Result<(),String>{
 let module=naga::front::wgsl::parse_str(&kernel.code).map_err(|e|format!("E_NATIVE_SHADER: {e}"))?;
 if !module.global_variables.iter().any(|(_,v)|v.binding.as_ref().is_some_and(|b|b.group==0&&b.binding==binding)&&matches!(v.space,naga::AddressSpace::Storage{access} if !access.contains(naga::StorageAccess::STORE))){return Err("E_NATIVE_BINARY_READ_ONLY: protected bytes require an actual read-only storage binding".into());}Ok(())
}
