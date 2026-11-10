// Apache-2.0. Windows AppContainer broker. No authored code runs in the broker.
#[cfg(not(any(windows, target_os = "linux")))]pub fn cleanup(_:u32){}
#[cfg(not(any(windows, target_os = "linux")))]pub fn probe(_: &str,_:u16)->Result<String,String>{Err("Sandbox unsupported".into())}
#[cfg(not(any(windows, target_os = "linux")))]
pub fn launch()->Result<i32,String>{Err("No qualified OS sandbox for this platform; Chromium is explicit, never a silent fallback".into())}
#[cfg(not(any(windows, target_os = "linux")))]
pub fn require_container()->Result<(),String>{Err("OS sandbox unavailable".into())}

#[cfg(target_os = "linux")]
#[path = "sandbox_linux.rs"]
mod linux;
#[cfg(target_os = "linux")]
pub use linux::{cleanup, launch, probe, require_container};

#[cfg(windows)]
mod windows{
use std::{ffi::c_void,mem::{size_of,zeroed},os::windows::ffi::OsStrExt,ptr::{null,null_mut}};
use windows_sys::Win32::{Foundation::*,Security::*,Security::Authorization::*,Security::Isolation::*,System::Threading::*,System::Console::*,System::JobObjects::*};
fn wide(s:impl AsRef<std::ffi::OsStr>)->Vec<u16>{s.as_ref().encode_wide().chain(Some(0)).collect()}
fn error(s:&str)->String{format!("{s}: {}",std::io::Error::last_os_error())}
struct Handle(HANDLE);impl Drop for Handle{fn drop(&mut self){unsafe{CloseHandle(self.0);}}}
struct Acl{path:Vec<u16>,descriptor:PSECURITY_DESCRIPTOR,old:*mut ACL}
impl Drop for Acl{fn drop(&mut self){unsafe{SetNamedSecurityInfoW(self.path.as_ptr(),SE_FILE_OBJECT,DACL_SECURITY_INFORMATION,null_mut(),null_mut(),self.old,null());LocalFree(self.descriptor);}}}
unsafe fn read_execute(path:&std::path::Path,sid:PSID)->Result<Acl,String>{unsafe{
    let path=wide(path);let mut old=null_mut();let mut descriptor=null_mut();
    if GetNamedSecurityInfoW(path.as_ptr(),SE_FILE_OBJECT,DACL_SECURITY_INFORMATION,null_mut(),null_mut(),&mut old,null_mut(),&mut descriptor)!=0{return Err(error("Read binary ACL"));}
    let restore=Acl{path,descriptor,old};
    let mut access:EXPLICIT_ACCESS_W=zeroed();access.grfAccessPermissions=0x001200A9; // FILE_GENERIC_READ | FILE_GENERIC_EXECUTE
    access.grfAccessMode=GRANT_ACCESS;access.grfInheritance=NO_INHERITANCE;
    access.Trustee.TrusteeForm=TRUSTEE_IS_SID;access.Trustee.TrusteeType=TRUSTEE_IS_UNKNOWN;access.Trustee.ptstrName=sid as *mut u16;
    let mut acl=null_mut();let code=SetEntriesInAclW(1,&access,old,&mut acl);if code!=0{return Err(format!("Grant binary read/execute: {code}"));}
    let code=SetNamedSecurityInfoW(restore.path.as_ptr(),SE_FILE_OBJECT,DACL_SECURITY_INFORMATION,null_mut(),null_mut(),acl,null());LocalFree(acl as *mut c_void);
    if code!=0{return Err(format!("Apply binary read/execute: {code}"));}Ok(restore)
}}
pub fn cleanup(pid:u32){unsafe{DeleteAppContainerProfile(wide(format!("Frameweave.Host.{pid}")).as_ptr());}}
pub fn require_container()->Result<(),String>{unsafe{
    let mut token=null_mut();if OpenProcessToken(GetCurrentProcess(),TOKEN_QUERY,&mut token)==0{return Err(error("Open token"));}let token=Handle(token);
    let mut is_container=0u32;let mut length=0;
    if GetTokenInformation(token.0,TokenIsAppContainer,&mut is_container as *mut _ as *mut c_void,4,&mut length)==0||is_container!=1{return Err("Refusing authored JS outside an OS AppContainer".into());}Ok(())
}}
// Harness-only native probe, never exposed to authored JS. It tests real OS
// denial against a controller-created file and a listening loopback socket.
pub fn probe(file:&str,port:u16)->Result<String,String>{
 require_container()?;
 let file_error=std::fs::read(file).err().and_then(|e|e.raw_os_error());
 let network=std::net::TcpStream::connect_timeout(&std::net::SocketAddr::from(([127,0,0,1],port)),std::time::Duration::from_secs(2));
 let network_error=network.as_ref().err().and_then(|e|e.raw_os_error());
 Ok(serde_json::json!({"osIsolation":"appcontainer","fileDenied":file_error==Some(5),"fileError":file_error,"networkConnected":network.is_ok(),"networkDenied":network_error==Some(10013),"networkError":network_error,"networkErrorKind":network.as_ref().err().map(|e|format!("{:?}",e.kind())),"networkErrorMessage":network.as_ref().err().map(|e|e.to_string())}).to_string())
}
fn quoted(arg:&str)->String{let mut out=String::from("\"");let mut slashes=0;for c in arg.chars(){if c=='\\'{slashes+=1;}else{if c=='\"'{out.push_str(&"\\".repeat(slashes*2+1));}else{out.push_str(&"\\".repeat(slashes));}slashes=0;out.push(c);}}out.push_str(&"\\".repeat(slashes*2));out.push('"');out}
pub fn launch()->Result<i32,String>{unsafe{
    let exe=std::env::current_exe().map_err(|e|e.to_string())?;
    // The controller gives each broker its OWN copied binary directory. ACL
    // restoration therefore cannot race a second Stage's sandbox grant.
    let parent=exe.parent().ok_or("Missing private executable directory")?;
    if !parent.file_name().unwrap_or_default().to_string_lossy().starts_with("worker-"){return Err("Broker requires a private worker-* executable directory".into());}
    let name=wide(format!("Frameweave.Host.{}",GetCurrentProcessId()));let mut sid=null_mut();
    let created=CreateAppContainerProfile(name.as_ptr(),name.as_ptr(),name.as_ptr(),null(),0,&mut sid);
    if created<0{return Err(format!("Create AppContainer profile: HRESULT {created:#x}"));}
    struct Profile(Vec<u16>);impl Drop for Profile{fn drop(&mut self){unsafe{DeleteAppContainerProfile(self.0.as_ptr());}}}let _profile=Profile(name);
    struct Sid(PSID);impl Drop for Sid{fn drop(&mut self){unsafe{FreeSid(self.0);}}}let sid=Sid(sid);
    let _dir_acl=read_execute(parent,sid.0)?;let _exe_acl=read_execute(&exe,sid.0)?;
    let mut inherited=Vec::new();for kind in [STD_INPUT_HANDLE,STD_OUTPUT_HANDLE,STD_ERROR_HANDLE]{let mut copy=null_mut();if DuplicateHandle(GetCurrentProcess(),GetStdHandle(kind),GetCurrentProcess(),&mut copy,0,1,DUPLICATE_SAME_ACCESS)==0{return Err(error("Duplicate stdio"));}inherited.push(Handle(copy));}
    let handles:Vec<HANDLE>=inherited.iter().map(|h|h.0).collect();
    let mut length=0;InitializeProcThreadAttributeList(null_mut(),2,0,&mut length);let mut storage=vec![0usize;(length+size_of::<usize>()-1)/size_of::<usize>()];let attrs=storage.as_mut_ptr() as LPPROC_THREAD_ATTRIBUTE_LIST;
    if InitializeProcThreadAttributeList(attrs,2,0,&mut length)==0{return Err(error("Initialize attributes"));}
    struct Attr(LPPROC_THREAD_ATTRIBUTE_LIST);impl Drop for Attr{fn drop(&mut self){unsafe{DeleteProcThreadAttributeList(self.0);}}}let _attrs=Attr(attrs);
    let caps=SECURITY_CAPABILITIES{AppContainerSid:sid.0,Capabilities:null_mut(),CapabilityCount:0,Reserved:0};
    if UpdateProcThreadAttribute(attrs,0,PROC_THREAD_ATTRIBUTE_SECURITY_CAPABILITIES as usize,&caps as *const _ as *const c_void,size_of::<SECURITY_CAPABILITIES>(),null_mut(),null())==0{return Err(error("Security capabilities"));}
    if UpdateProcThreadAttribute(attrs,0,PROC_THREAD_ATTRIBUTE_HANDLE_LIST as usize,handles.as_ptr() as *const c_void,handles.len()*size_of::<HANDLE>(),null_mut(),null())==0{return Err(error("Stdio allowlist"));}
    let job=Handle(CreateJobObjectW(null(),null()));if job.0.is_null(){return Err(error("Create job"));}
    let mut limits:JOBOBJECT_EXTENDED_LIMIT_INFORMATION=zeroed();limits.BasicLimitInformation.LimitFlags=JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE|JOB_OBJECT_LIMIT_ACTIVE_PROCESS|JOB_OBJECT_LIMIT_PROCESS_MEMORY;limits.BasicLimitInformation.ActiveProcessLimit=1;limits.ProcessMemoryLimit=crate::budget_arg("--memory-bytes",1024*1024*1024)?;
    if SetInformationJobObject(job.0,JobObjectExtendedLimitInformation,&limits as *const _ as *const c_void,size_of_val(&limits) as u32)==0{return Err(error("Job limits"));}
    let mut info:STARTUPINFOEXW=zeroed();info.StartupInfo.cb=size_of::<STARTUPINFOEXW>() as u32;info.StartupInfo.dwFlags=STARTF_USESTDHANDLES;info.StartupInfo.hStdInput=handles[0];info.StartupInfo.hStdOutput=handles[1];info.StartupInfo.hStdError=handles[2];info.lpAttributeList=attrs;
    let args=std::env::args().skip(1).map(|a|quoted(&a)).collect::<Vec<_>>().join(" ");
    let mut command=wide(format!("{} --worker {}",quoted(&exe.to_string_lossy()),args));let app=wide(&exe);let cwd=wide(parent);
    let root=std::env::var("SystemRoot").map_err(|_|"Missing SystemRoot")?;
    let mut env_lines=vec![format!("PATH={root}\\System32"),format!("SystemRoot={root}"),format!("WINDIR={root}")];
    for key in ["SystemDrive","USERPROFILE","LOCALAPPDATA","APPDATA","TEMP","TMP","ProgramData","ProgramFiles","ProgramFiles(x86)"]{if let Ok(value)=std::env::var(key){env_lines.push(format!("{key}={value}"));}}
    env_lines.sort_by_key(|s|s.to_ascii_uppercase());let env=wide(env_lines.join("\0")+"\0");
    let mut process:PROCESS_INFORMATION=zeroed();
    if CreateProcessW(app.as_ptr(),command.as_mut_ptr(),null(),null(),1,CREATE_NO_WINDOW|CREATE_SUSPENDED|CREATE_UNICODE_ENVIRONMENT|EXTENDED_STARTUPINFO_PRESENT,env.as_ptr() as *const c_void,cwd.as_ptr(),&info.StartupInfo,&mut process)==0{return Err(error("Create AppContainer process"));}
    let process_handle=Handle(process.hProcess);let thread=Handle(process.hThread);
    if AssignProcessToJobObject(job.0,process_handle.0)==0{TerminateProcess(process_handle.0,1);return Err(error("Assign sandbox job"));}
    if ResumeThread(thread.0)==u32::MAX{TerminateProcess(process_handle.0,1);return Err(error("Resume worker"));}
    eprintln!("frameweave-spidermonkey sandbox=appcontainer network_capabilities=0 child_pid={}",process.dwProcessId);
    WaitForSingleObject(process_handle.0,INFINITE);let mut code=1;GetExitCodeProcess(process_handle.0,&mut code);Ok(code as i32)
}}
}
#[cfg(windows)]pub use windows::{launch,require_container,cleanup,probe};
