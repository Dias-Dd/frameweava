param(
    [string]$InstallDir = '',
    [string]$BundleDirectory = '',
    [string]$ManifestUrl = 'https://raw.githubusercontent.com/Dias-Dd/frameweava/dev/install/windows-x64.json',
    [switch]$NoPath
)
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
if([Environment]::OSVersion.Platform -ne 'Win32NT' -or -not [Environment]::Is64BitOperatingSystem){throw 'This installer currently supports Windows x64.'}
if($env:PROCESSOR_ARCHITEW6432 -or $env:PROCESSOR_ARCHITECTURE -eq 'ARM64'){throw 'Run this Windows x64 installer from an x64 PowerShell session.'}
if(-not $InstallDir){$InstallDir=Join-Path $env:LOCALAPPDATA 'Frameweava'}
$taskRoot=[IO.Path]::GetFullPath($InstallDir).TrimEnd('\','/')
$taskReleases=Join-Path $taskRoot 'releases';$taskData=Join-Path $taskRoot 'data';$taskBin=Join-Path $taskRoot 'bin'
function Get-InstallerHash([string]$File){
    $fileStream=[IO.File]::OpenRead($File);$hashAlgorithm=[Security.Cryptography.SHA256]::Create()
    try{return ([BitConverter]::ToString($hashAlgorithm.ComputeHash($fileStream))).Replace('-','').ToLowerInvariant()}
    finally{$hashAlgorithm.Dispose();$fileStream.Dispose()}
}
function Assert-Child([string]$Base,[string]$Target){
    $basePath=[IO.Path]::GetFullPath($Base).TrimEnd('\','/')+[IO.Path]::DirectorySeparatorChar
    $targetPath=[IO.Path]::GetFullPath($Target)
    if(-not $targetPath.StartsWith($basePath,[StringComparison]::OrdinalIgnoreCase)){throw "Unsafe installation path: $Target"}
}
function Get-VerifiedDownload($Asset,[string]$Destination){
    if($BundleDirectory){
        $localAsset=Join-Path $BundleDirectory $Asset.name;Assert-Child $BundleDirectory $localAsset
        Copy-Item -LiteralPath $localAsset -Destination $Destination
        if((Get-Item -LiteralPath $Destination).Length -ne [long]$Asset.bytes -or (Get-InstallerHash $Destination) -ne $Asset.sha256){throw 'Local installation component integrity mismatch.'}
        return
    }
    $uri=[Uri]$Asset.url
    $allowed=@('github.com','objects.githubusercontent.com','release-assets.githubusercontent.com','nodejs.org','www.python.org')
    if($uri.Scheme -ne 'https' -or $uri.Host -notin $allowed -or $uri.UserInfo){throw 'Unapproved download URL in the installation manifest.'}
    if($Asset.sha256 -notmatch '^[a-f0-9]{64}$' -or [long]$Asset.bytes -le 0){throw 'Invalid download fingerprint.'}
    $lastError=$null
    for($attempt=0;$attempt -lt 3;$attempt++){
        try{
            Invoke-WebRequest -UseBasicParsing -Uri $uri.AbsoluteUri -OutFile $Destination
            if((Get-Item -LiteralPath $Destination).Length -ne [long]$Asset.bytes){throw 'Downloaded length differs from the release manifest.'}
            if((Get-InstallerHash $Destination) -ne $Asset.sha256){throw 'Downloaded SHA-256 differs from the release manifest.'}
            return
        }catch{$lastError=$_;if($attempt -lt 2){Start-Sleep -Milliseconds (300*($attempt+1))}}
    }
    throw $lastError
}
function Expand-SafeArchive([string]$Archive,[string]$Destination,[string]$StripPrefix=''){
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [IO.Directory]::CreateDirectory($Destination)|Out-Null
    $zip=[IO.Compression.ZipFile]::OpenRead($Archive)
    try{foreach($entry in $zip.Entries){
        $name=$entry.FullName.Replace('\','/')
        if($StripPrefix){if(-not $name.StartsWith($StripPrefix+'/',[StringComparison]::Ordinal)){continue};$name=$name.Substring($StripPrefix.Length+1)}
        if(-not $name){continue}
        if($name.StartsWith('/') -or $name.Contains(':') -or $name.Split('/') -contains '..' -or (($entry.ExternalAttributes -shr 16) -band 61440) -eq 40960){throw 'Unsafe archive entry.'}
        $target=Join-Path $Destination $name;Assert-Child $Destination $target
        if($name.EndsWith('/')){[IO.Directory]::CreateDirectory($target)|Out-Null;continue}
        [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($target))|Out-Null
        if(Test-Path -LiteralPath $target){
            $entryStream=$entry.Open();try{$sha=[Security.Cryptography.SHA256]::Create();try{$expected=([BitConverter]::ToString($sha.ComputeHash($entryStream))).Replace('-','').ToLowerInvariant()}finally{$sha.Dispose()}}finally{$entryStream.Dispose()}
            if((Get-InstallerHash $target) -ne $expected){throw "Refusing to overwrite changed installed data: $target"};continue
        }
        [IO.Compression.ZipFileExtensions]::ExtractToFile($entry,$target,$false)
    }}finally{$zip.Dispose()}
}
function Set-PrivateEnvironment([string]$Release){
    $env:FRAMEWEAVE_HOME=$taskData;$env:FRAMEWEAVE_PROGRAM_LIBRARY=Join-Path $taskData 'library'
    $env:FRAMEWEAVE_FFMPEG=Join-Path $Release 'app/node_modules/ffmpeg-static/ffmpeg.exe'
    $env:FRAMEWEAVE_FFPROBE=Join-Path $Release 'app/native-bin/win32-x64/ffmpeg/ffprobe.exe'
}
[Net.ServicePointManager]::SecurityProtocol=[Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
Write-Host 'Downloading the full Frameweave Windows x64 installation manifest...'
if($BundleDirectory){
    $BundleDirectory=[IO.Path]::GetFullPath($BundleDirectory)
    $manifest=Get-Content -LiteralPath (Join-Path $BundleDirectory 'windows-x64.json') -Raw|ConvertFrom-Json
}else{
    $manifestUri=[Uri]$ManifestUrl
    if($manifestUri.Scheme -ne 'https' -or $manifestUri.Host -ne 'raw.githubusercontent.com' -or $manifestUri.UserInfo){throw 'Use an official HTTPS installation manifest or an explicit local bundle.'}
    $manifest=Invoke-RestMethod -Uri $ManifestUrl
}
if($manifest.status -eq 'blocked'){throw $manifest.message}
if($manifest.schemaVersion -ne 1 -or $manifest.platform -ne 'win32-x64' -or $manifest.version -notmatch '^[a-zA-Z0-9][a-zA-Z0-9._-]+$' -or -not $manifest.artifacts){throw 'Unsupported installation manifest.'}
foreach($folder in @($taskRoot,$taskReleases,$taskData,$taskBin)){[IO.Directory]::CreateDirectory($folder)|Out-Null}
$existingVersion=Join-Path $taskReleases $manifest.version
$currentPointer=Join-Path $taskRoot 'current.json'
if((Test-Path -LiteralPath $existingVersion) -and (Test-Path -LiteralPath $currentPointer)){
    $current=Get-Content -LiteralPath $currentPointer -Raw|ConvertFrom-Json
    if($current.version -eq $manifest.version -and $current.release -eq ('releases/'+$manifest.version)){
        Set-PrivateEnvironment $existingVersion
        & (Join-Path $existingVersion 'runtime/node/node.exe') (Join-Path $existingVersion 'app/bin/setup-full.mjs')
        if($LASTEXITCODE -ne 0){throw 'Existing full installation failed verification. Its files have not been replaced.'}
        if(-not $NoPath){$env:Path=$taskBin+';'+$env:Path}
        Write-Host "This full version is already installed and verified: $taskRoot"
        return
    }
}
$taskStage=Join-Path $taskReleases ('.staging-'+[Guid]::NewGuid().ToString('N'));Assert-Child $taskReleases $taskStage
$taskDownloads=Join-Path $taskStage 'downloads';[IO.Directory]::CreateDirectory($taskDownloads)|Out-Null
$taskLock=Join-Path $taskRoot 'install.operation';$lockHandle=$null;$taskSuccess=$false
try{
    $lockHandle=[IO.File]::Open($taskLock,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
    foreach($asset in $manifest.artifacts){
        if($asset.name -notmatch '^[a-zA-Z0-9._-]+$'){throw 'Invalid installation component name.'}
        Write-Host ("Installing {0} ({1:N1} MiB)..." -f $asset.name,([long]$asset.bytes/1MB))
        $archive=Join-Path $taskDownloads $asset.name;Get-VerifiedDownload $asset $archive
        if($asset.scope -notin @('data','release')){throw 'Invalid installation scope.'}
        $base=if($asset.scope -eq 'data'){$taskData}else{$taskStage}
        $destination=Join-Path $base $asset.target;Assert-Child $base $destination
        if($asset.format -eq 'zip'){Expand-SafeArchive $archive $destination $asset.stripPrefix}
        elseif($asset.format -eq 'gzip'){
            [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($destination))|Out-Null
            $compressedStream=[IO.File]::OpenRead($archive);$gzip=New-Object IO.Compression.GZipStream($compressedStream,[IO.Compression.CompressionMode]::Decompress)
            try{$destinationStream=[IO.File]::Create($destination);try{$gzip.CopyTo($destinationStream)}finally{$destinationStream.Dispose()}}finally{$gzip.Dispose();$compressedStream.Dispose()}
        }else{throw 'Unknown installation archive format.'}
    }
    Set-PrivateEnvironment $taskStage
    $node=Join-Path $taskStage 'runtime/node/node.exe'
    Write-Host 'Checking included runtimes, models and all official libraries...'
    & $node (Join-Path $taskStage 'app/bin/setup-full.mjs')
    if($LASTEXITCODE -ne 0){throw 'The full installation checks failed. The previous active version has not been changed.'}
    Assert-Child $taskStage $taskDownloads;Remove-Item -LiteralPath $taskDownloads -Recurse -Force
    $taskFinal=Join-Path $taskReleases $manifest.version;Assert-Child $taskReleases $taskFinal
    if(Test-Path -LiteralPath $taskFinal){throw 'This version directory already exists. Keep it for rollback or select a fresh installation directory.'}
    Move-Item -LiteralPath $taskStage -Destination $taskFinal
    $launcher=@'
param([string]$Root)
$ErrorActionPreference='Stop'
$release=Join-Path $Root ((Get-Content -LiteralPath (Join-Path $Root 'current.json') -Raw|ConvertFrom-Json).release)
if(-not $env:FRAMEWEAVE_HOME){$env:FRAMEWEAVE_HOME=Join-Path $Root 'data'}
if(-not $env:FRAMEWEAVE_PROGRAM_LIBRARY){$env:FRAMEWEAVE_PROGRAM_LIBRARY=Join-Path $Root 'data/library'}
if(-not $env:FRAMEWEAVE_FFMPEG){$env:FRAMEWEAVE_FFMPEG=Join-Path $release 'app/node_modules/ffmpeg-static/ffmpeg.exe'}
if(-not $env:FRAMEWEAVE_FFPROBE){$env:FRAMEWEAVE_FFPROBE=Join-Path $release 'app/native-bin/win32-x64/ffmpeg/ffprobe.exe'}
& (Join-Path $release 'runtime/node/node.exe') (Join-Path $release 'app/bin/frameweave.mjs') @args
exit $LASTEXITCODE
'@
    [IO.File]::WriteAllText((Join-Path $taskBin 'launch.ps1'),$launcher,(New-Object Text.UTF8Encoding($false)))
    [IO.File]::WriteAllText((Join-Path $taskBin 'frameweave.cmd'),"@echo off`r`npowershell.exe -NoProfile -ExecutionPolicy Bypass -File `"%~dp0launch.ps1`" `"%~dp0..`" %*`r`n",[Text.Encoding]::ASCII)
    $pointer=Join-Path $taskRoot 'current.json';$temporary=$pointer+'.tmp'
    [IO.File]::WriteAllText($temporary,(@{schemaVersion=1;version=$manifest.version;release=('releases/'+$manifest.version)}|ConvertTo-Json))
    if(Test-Path -LiteralPath $pointer){[IO.File]::Replace($temporary,$pointer,$null)}else{[IO.File]::Move($temporary,$pointer)}
    Set-PrivateEnvironment $taskFinal
    if(-not $NoPath){
        $userPath=[Environment]::GetEnvironmentVariable('Path','User');$entries=@($userPath -split ';'|Where-Object {$_})
        if(-not ($entries|Where-Object {$_.TrimEnd('\') -ieq $taskBin.TrimEnd('\')})){[Environment]::SetEnvironmentVariable('Path',(($entries+$taskBin)-join ';'),'User')}
        if(-not (($env:Path -split ';')|Where-Object {$_.TrimEnd('\') -ieq $taskBin.TrimEnd('\')})){$env:Path=$taskBin+';'+$env:Path}
    }
    $taskSuccess=$true
    Write-Host "Frameweave full installation completed: $taskRoot"
    Write-Host 'Run: frameweave --version'
}finally{
    if($lockHandle){$lockHandle.Dispose();Remove-Item -LiteralPath $taskLock -Force}
    if(-not $taskSuccess -and (Test-Path -LiteralPath $taskStage)){Assert-Child $taskReleases $taskStage;Remove-Item -LiteralPath $taskStage -Recurse -Force}
}
