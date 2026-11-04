param([string]$WindowId,[switch]$SelfTest)
$ErrorActionPreference = 'Stop'
$taskRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$outputRoot = Join-Path $taskRoot 'artifacts/performance-advanced-effects/v1'
[IO.Directory]::CreateDirectory($outputRoot) | Out-Null
if (!$SelfTest -and [string]::IsNullOrWhiteSpace($WindowId)) { throw 'Coordinated GPU window ID required' }

# No native compiler/download: Windows API process supervision only.
# Child is assigned suspended, before it can create descendants.
Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
public static class FrameweaveBenchmarkJob {
 [StructLayout(LayoutKind.Sequential)] struct SA {public int n;public IntPtr descriptor;public int inherit;}
 [StructLayout(LayoutKind.Sequential)] struct START {
  public int cb;public IntPtr reserved,desktop,title;public int x,y,w,h,xc,yc,fill,flags;public short show,reserved2;
  public IntPtr bytes,input,output,error;
 }
 [StructLayout(LayoutKind.Sequential)] struct PROCESS {public IntPtr process,thread;public uint pid,tid;}
 [StructLayout(LayoutKind.Sequential)] struct LIMIT {
  public long processTime,jobTime;public uint flags;public UIntPtr minWorking,maxWorking;
  public uint activeLimit;public UIntPtr affinity;public uint priority,scheduling;
 }
 [StructLayout(LayoutKind.Sequential)] struct IO {public ulong a,b,c,d,e,f;}
 [StructLayout(LayoutKind.Sequential)] struct EXT {public LIMIT basic;public IO io;public UIntPtr processMemory,jobMemory,peakProcess,peakJob;}
 [StructLayout(LayoutKind.Sequential)] struct ACCOUNT {
  public long user,kernel,periodUser,periodKernel;public uint faults,total,active,terminated;
 }
 public class Result {public int version=1;public uint exitCode,totalProcesses,activeBeforeCleanup,activeAfterCleanup;public bool timedOut;public double wallMs;}
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern IntPtr CreateJobObject(IntPtr sa,string name);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool SetInformationJobObject(IntPtr job,int info,IntPtr data,uint size);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool AssignProcessToJobObject(IntPtr job,IntPtr process);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool QueryInformationJobObject(IntPtr job,int info,out ACCOUNT data,uint size,IntPtr written);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool TerminateJobObject(IntPtr job,uint code);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool TerminateProcess(IntPtr process,uint code);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern IntPtr CreateFile(string name,uint access,uint share,ref SA sa,uint create,uint attributes,IntPtr template);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool CreateProcess(string file,StringBuilder command,IntPtr pa,IntPtr ta,bool inherit,uint flags,IntPtr env,string cwd,ref START start,out PROCESS process);
 [DllImport("kernel32.dll",SetLastError=true)] static extern uint ResumeThread(IntPtr thread);
 [DllImport("kernel32.dll",SetLastError=true)] static extern uint WaitForSingleObject(IntPtr handle,uint milliseconds);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool GetExitCodeProcess(IntPtr process,out uint code);
 [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
 static void Check(bool value){if(!value)throw new Win32Exception(Marshal.GetLastWin32Error());}
 static string Quote(string value){
  var b=new StringBuilder("\"");int slash=0;
  foreach(char c in value){if(c=='\\'){slash++;continue;}if(c=='"'){b.Append('\\',slash*2+1);b.Append('"');slash=0;continue;}b.Append('\\',slash);slash=0;b.Append(c);}
  b.Append('\\',slash*2);b.Append('"');return b.ToString();
 }
 static ACCOUNT Accounting(IntPtr job){ACCOUNT data;Check(QueryInformationJobObject(job,1,out data,(uint)Marshal.SizeOf(typeof(ACCOUNT)),IntPtr.Zero));return data;}
 public static Result Run(string executable,string[] args,string cwd,string rawLog,uint timeout){
  IntPtr job=IntPtr.Zero,output=IntPtr.Zero,input=IntPtr.Zero;PROCESS process=new PROCESS();bool assigned=false;var clock=Stopwatch.StartNew();
  try{
   job=CreateJobObject(IntPtr.Zero,null);Check(job!=IntPtr.Zero);
   EXT limits=new EXT();limits.basic.flags=0x2000; // KILL_ON_JOB_CLOSE, no breakaway.
   int size=Marshal.SizeOf(typeof(EXT));IntPtr memory=Marshal.AllocHGlobal(size);
   try{Marshal.StructureToPtr(limits,memory,false);Check(SetInformationJobObject(job,9,memory,(uint)size));}finally{Marshal.FreeHGlobal(memory);}
   SA security=new SA();security.n=Marshal.SizeOf(typeof(SA));security.inherit=1;
   output=CreateFile(rawLog,0x40000000,3,ref security,2,0x80,IntPtr.Zero);Check(output!=new IntPtr(-1));
   input=CreateFile("NUL",0x80000000,3,ref security,3,0x80,IntPtr.Zero);Check(input!=new IntPtr(-1));
   START start=new START();start.cb=Marshal.SizeOf(typeof(START));start.flags=0x100;start.input=input;start.output=output;start.error=output;
   var command=new StringBuilder(Quote(executable));foreach(string arg in args)command.Append(" ").Append(Quote(arg));
   Check(CreateProcess(executable,command,IntPtr.Zero,IntPtr.Zero,true,0x08000004,IntPtr.Zero,cwd,ref start,out process));
   Check(AssignProcessToJobObject(job,process.process));assigned=true;Check(ResumeThread(process.thread)!=0xffffffff);
   uint state=WaitForSingleObject(process.process,timeout);Check(state==0||state==258);
   uint exit;Check(GetExitCodeProcess(process.process,out exit));var before=Accounting(job);
   bool timedOut=state==258;Check(TerminateJobObject(job,timedOut?124u:0u));
   ACCOUNT after=Accounting(job);var drain=Stopwatch.StartNew();
   while(after.active>0&&drain.ElapsedMilliseconds<2000){Thread.Sleep(10);after=Accounting(job);}
   if(after.active!=0)throw new Exception("Owned job failed to drain");
   return new Result{exitCode=timedOut?124u:exit,timedOut=timedOut,totalProcesses=after.total,
    activeBeforeCleanup=before.active,activeAfterCleanup=after.active,wallMs=clock.Elapsed.TotalMilliseconds};
  }finally{
   if(!assigned&&process.process!=IntPtr.Zero)TerminateProcess(process.process,125);
   if(job!=IntPtr.Zero)CloseHandle(job);
   if(process.thread!=IntPtr.Zero)CloseHandle(process.thread);if(process.process!=IntPtr.Zero)CloseHandle(process.process);
   if(input!=IntPtr.Zero&&input!=new IntPtr(-1))CloseHandle(input);if(output!=IntPtr.Zero&&output!=new IntPtr(-1))CloseHandle(output);
  }
 }
}
'@
$node = (Get-Command node.exe).Source
if ($SelfTest) {
 $childArgs = @('-e',"require('node:child_process').spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});setInterval(()=>{},1000)")
 $raw = Join-Path $outputRoot 'supervisor-selftest.log'
 $result = [FrameweaveBenchmarkJob]::Run($node,$childArgs,$taskRoot,$raw,700)
 $result | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $outputRoot 'supervisor-selftest.json') -Encoding utf8
 $result | ConvertTo-Json -Compress
 if (!$result.timedOut -or $result.totalProcesses -lt 2 -or $result.activeAfterCleanup -ne 0) { exit 1 }
 exit 0
}
$env:FRAMEWEAVE_GPU_WINDOW=$WindowId
$raw = Join-Path $outputRoot 'supervised.log'
$result = [FrameweaveBenchmarkJob]::Run($node,@('--import','tsx','prototypes/performance-advanced-effects/bench.ts'),$taskRoot,$raw,165000)
$receipt = @{version=1;window=$WindowId;supervisor='Windows kill-on-close Job Object; suspended assignment';result=$result}
$receipt | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $outputRoot 'supervisor.json') -Encoding utf8
$receipt | ConvertTo-Json -Compress -Depth 6
exit ([int]$result.exitCode)
