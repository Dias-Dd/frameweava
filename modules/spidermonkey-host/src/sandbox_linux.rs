// Apache-2.0. The Linux worker inherits only its private root and stdio.
use std::ffi::{CString, c_int, c_uint, c_void};
use std::os::unix::process::CommandExt;
use std::path::Path;
use std::{fs, process::Command};

const NAMESPACES: [&str; 4] = ["user", "mnt", "pid", "net"];
const WORKER: &str = "/frameweave-worker";
const PROFILE: &str = "linux-bwrap-seccomp-v1";

fn namespace_ids() -> Result<String, String> {
    NAMESPACES.iter().map(|name| {
        fs::read_link(format!("/proc/self/ns/{name}"))
            .map(|path| path.to_string_lossy().into_owned())
            .map_err(|e| format!("Read {name} namespace: {e}"))
    }).collect::<Result<Vec<_>, _>>().map(|ids| ids.join(","))
}

pub fn launch() -> Result<i32, String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let bwrap = "/usr/bin/bwrap";
    let mut command = Command::new(bwrap);
    command.env_clear().args([
        "--unshare-all", "--unshare-user", "--disable-userns", "--new-session",
        "--die-with-parent", "--clearenv", "--cap-drop", "ALL", "--proc", "/proc",
        "--dev", "/dev", "--tmpfs", "/tmp", "--chdir", "/tmp",
        "--ro-bind", "/lib", "/lib", "--ro-bind-try", "/lib64", "/lib64",
        "--ro-bind", "/usr/lib", "/usr/lib", "--ro-bind",
    ]).arg(exe).args([WORKER, "--", WORKER, "--worker", "--broker-namespaces"])
        .arg(namespace_ids()?).args(std::env::args_os().skip(1));
    Err(format!("Launch Linux OS sandbox with {bwrap}: {}", command.exec()))
}

pub fn cleanup(_: u32) {}

pub fn require_container() -> Result<(), String> {
    let args: Vec<String> = std::env::args().collect();
    let outside = args.windows(2).find(|pair| pair[0] == "--broker-namespaces")
        .map(|pair| pair[1].split(',').collect::<Vec<_>>());
    let inside = namespace_ids()?;
    let inside: Vec<_> = inside.split(',').collect();
    let status = fs::read_to_string("/proc/self/status").map_err(|e| e.to_string())?;
    if std::env::current_exe().map_err(|e| e.to_string())? != Path::new(WORKER)
        || !outside.is_some_and(|outside| outside.len() == inside.len()
            && outside.iter().zip(inside).all(|(old, new)| *old != new))
        || !status.lines().any(|line| line.starts_with("NoNewPrivs:")
            && line.split_whitespace().last() == Some("1"))
        || !status.lines().any(|line| line.starts_with("CapEff:") && line.split_whitespace().last() == Some("0000000000000000")) {
        return Err("Refusing authored JS outside the qualified Linux OS sandbox".into());
    }
    let limit = crate::budget_arg("--memory-bytes", 1024 * 1024 * 1024)? as libc::rlim_t;
    let data = libc::rlimit { rlim_cur: limit, rlim_max: limit };
    let core = libc::rlimit { rlim_cur: 0, rlim_max: 0 };
    // SAFETY: Both structures are initialized and live for the syscall.
    if unsafe { libc::setrlimit(libc::RLIMIT_DATA, &data) } != 0 ||
        unsafe { libc::setrlimit(libc::RLIMIT_CORE, &core) } != 0 {
        return Err(format!("Apply Linux worker limits: {}", std::io::Error::last_os_error()));
    }
    install_seccomp()
}

#[repr(C)]
struct Comparison { arg: c_uint, op: c_uint, mask: u64, value: u64 }

#[link(name = "seccomp")]
unsafe extern "C" {
    fn seccomp_init(action: u32) -> *mut c_void;
    fn seccomp_release(ctx: *mut c_void);
    fn seccomp_load(ctx: *mut c_void) -> c_int;
    fn seccomp_syscall_resolve_name(name: *const libc::c_char) -> c_int;
    fn seccomp_rule_add_array(ctx: *mut c_void, action: u32, syscall: c_int,
        count: c_uint, comparisons: *const Comparison) -> c_int;
}

fn install_seccomp() -> Result<(), String> {
    const ALLOW: u32 = 0x7fff0000;
    const ERRNO: u32 = 0x00050000;
    const MASKED_EQ: u32 = 7;
    struct Filter(*mut c_void);
    impl Drop for Filter {
        fn drop(&mut self) { unsafe { seccomp_release(self.0) }; }
    }
    // Called before SpiderMonkey creates threads. All later threads inherit this filter.
    let context = unsafe { seccomp_init(ALLOW) };
    if context.is_null() { return Err("Create Linux syscall filter failed".into()); }
    let filter = Filter(context);
    let deny = |name: &str, errno: c_int, args: &[Comparison]| -> Result<(), String> {
        let name_c = CString::new(name).map_err(|e| e.to_string())?;
        let syscall = unsafe { seccomp_syscall_resolve_name(name_c.as_ptr()) };
        if syscall < 0 { return Err(format!("Resolve Linux syscall {name} failed")); }
        let result = unsafe { seccomp_rule_add_array(filter.0, ERRNO | errno as u32,
            syscall, args.len() as c_uint, args.as_ptr()) };
        if result != 0 { return Err(format!("Restrict Linux syscall {name}: {result}")); }
        Ok(())
    };
    for name in ["socket", "socketpair", "execve", "execveat", "fork", "vfork",
        "unshare", "setns", "ptrace", "process_vm_readv", "process_vm_writev",
        "io_uring_setup", "bpf", "userfaultfd", "keyctl", "add_key", "request_key"] {
        deny(name, libc::EPERM, &[])?;
    }
    // glibc retries thread creation with clone when clone3 is unavailable.
    deny("clone3", libc::ENOSYS, &[])?;
    deny("clone", libc::EPERM, &[Comparison { arg: 0, op: MASKED_EQ,
        mask: libc::CLONE_THREAD as u64, value: 0 }])?;
    let result = unsafe { seccomp_load(filter.0) };
    if result == 0 { Ok(()) } else { Err(format!("Load Linux syscall filter: {result}")) }
}

pub fn probe(file: &str, port: u16) -> Result<String, String> {
    let file_error = fs::read(file).err().and_then(|e| e.raw_os_error());
    let connection = std::net::TcpStream::connect_timeout(
        &std::net::SocketAddr::from(([127, 0, 0, 1], port)), std::time::Duration::from_secs(1));
    let network_error = connection.as_ref().err().and_then(|e| e.raw_os_error());
    Ok(serde_json::json!({
        "osIsolation": PROFILE,
        "fileDenied": matches!(file_error, Some(libc::ENOENT | libc::EACCES | libc::EPERM)),
        "fileError": file_error,
        "networkConnected": connection.is_ok(),
        "networkDenied": network_error == Some(libc::EPERM),
        "networkError": network_error,
    }).to_string())
}
