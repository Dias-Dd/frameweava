param([string]$Vcvars)
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'))
$up=Join-Path $root '.frameweave/p1/io/upstream'
$manifest=Get-Content (Join-Path $up 'source-manifest.json') -Raw | ConvertFrom-Json
foreach($entry in $manifest.files.PSObject.Properties){if((Get-FileHash (Join-Path $up $entry.Name) -Algorithm SHA256).Hash.ToLowerInvariant() -ne $entry.Value){throw ('E_P1_SOURCE_INTEGRITY: '+$entry.Name)}}
if(!$Vcvars){$vs=Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio/Installer/vswhere.exe';$Vcvars=(& $vs -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -find 'VC/Auxiliary/Build/vcvars64.bat')}
if(!$Vcvars -or !(Test-Path -LiteralPath $Vcvars)){throw 'Existing MSVC vcvars64.bat required; no tool downloads'}
$drive=@('Q','R','S','T','U','V','W','X','Y','Z')|Where-Object{!(Test-Path ($_+':/'))}|Select-Object -First 1
if(!$drive){throw 'No free temporary drive alias; no existing mapping is changed'}
$alias=$drive+':'
subst $alias $root
if($LASTEXITCODE -ne 0){throw 'Cannot create worktree-local path alias'}
try{
 $work=Join-Path $root '.frameweave/sparse-volume/native';New-Item -ItemType Directory -Force -Path $work|Out-Null
 $lines=@('@echo off',('call "'+$Vcvars+'" >nul'),'if errorlevel 1 exit /b 1',('cl.exe /nologo /utf-8 /O2 /fp:strict /EHsc /std:c++17 /DNOMINMAX '+$alias+'/modules/sparse-volume/validation/reference.cpp /I'+$alias+'/.frameweave/p1/io/upstream/openvdb-12.1.1/nanovdb /Fo'+$alias+'/.frameweave/sparse-volume/native/probe.obj /Fe'+$alias+'/.frameweave/sparse-volume/native/nanovdb-probe.exe'))
 [IO.File]::WriteAllLines((Join-Path $work 'build.cmd'),$lines,[Text.Encoding]::ASCII)
 & $env:ComSpec /d /c ($alias+'/.frameweave/sparse-volume/native/build.cmd')
 if($LASTEXITCODE -ne 0){throw 'NanoVDB probe compile failed'}
 New-Item -ItemType Directory -Force -Path (Join-Path $root '.frameweave/sparse-volume/reference')|Out-Null
 & ($alias+'/.frameweave/sparse-volume/native/nanovdb-probe.exe') ($alias+'/.frameweave/sparse-volume/reference')
 if($LASTEXITCODE -ne 0){throw 'NanoVDB numerical/codec probe failed'}
}finally{subst $alias /d}
