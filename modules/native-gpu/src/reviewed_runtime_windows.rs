//! Existing reviewed-local runtime admission, shared by optional owner adapters.
use std::{collections::BTreeMap,fs::{File,OpenOptions},io::Read,path::PathBuf,os::windows::fs::OpenOptionsExt};use serde::Deserialize;use sha2::{Digest,Sha256};
#[derive(Deserialize)]#[serde(rename_all="camelCase",deny_unknown_fields)]struct Receipt{version:u32,abi:u32,#[serde(rename="trusted_local")]trusted:bool,profile:String,providers:Vec<String>,files:BTreeMap<String,String>,source_hashes:serde_json::Value,upstream:serde_json::Value,wall_ms:f64}
pub struct ReviewedRuntime{pub library:libloading::Library,_files:Vec<File>,pub root:PathBuf,pub profile:String}
impl ReviewedRuntime{
 pub unsafe fn open(variable:&str,manifest:&str,profile:&str,provider:&str,files:&[&str],prefix:&str)->Result<Self,String>{
  let root=std::fs::canonicalize(std::env::var_os(variable).ok_or_else(||format!("{prefix}_RUNTIME_MISSING: explicitly configure {variable}"))?).map_err(|e|format!("{prefix}_RUNTIME_MISSING: {e}"))?;
  let r:Receipt=serde_json::from_slice(&std::fs::read(root.join(manifest)).map_err(|e|format!("{prefix}_RUNTIME_INTEGRITY: {e}"))?).map_err(|e|format!("{prefix}_RUNTIME_INTEGRITY: {e}"))?;let _=(&r.source_hashes,&r.upstream,r.wall_ms);
  if r.version!=1||r.abi!=1||!r.trusted||r.profile!=profile||r.providers!=[provider]||r.files.len()!=files.len()||files.iter().any(|f|!r.files.contains_key(*f)){return Err(format!("{prefix}_RUNTIME_INTEGRITY: exact reviewed local runtime profile/provider/files required"));}
  let mut locked=vec![];for name in files{let p=root.join(name);let meta=std::fs::symlink_metadata(&p).map_err(|e|format!("{prefix}_RUNTIME_INTEGRITY: {e}"))?;if !meta.is_file()||meta.file_type().is_symlink(){return Err(format!("{prefix}_RUNTIME_INTEGRITY: regular non-symlink runtime required"));}let mut file=OpenOptions::new().read(true).share_mode(1).open(p).map_err(|e|format!("{prefix}_RUNTIME_INTEGRITY: {e}"))?;let mut hash=Sha256::new();let mut chunk=[0;65536];loop{let n=file.read(&mut chunk).map_err(|e|format!("{prefix}_RUNTIME_INTEGRITY: {e}"))?;if n==0{break;}hash.update(&chunk[..n]);}if format!("{:x}",hash.finalize())!=r.files[*name]{return Err(format!("{prefix}_RUNTIME_INTEGRITY: changed {name}"));}locked.push(file);}
  let library=libloading::os::windows::Library::load_with_flags(root.join("frameweave_inference.dll"),0x100|0x800).map_err(|e|format!("{prefix}_RUNTIME_LOAD: {e}"))?.into();Ok(Self{library,_files:locked,root,profile:r.profile})
 }
}
