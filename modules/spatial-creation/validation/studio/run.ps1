param([Parameter(Mandatory=$true)][string]$NativeGpu,[Parameter(Mandatory=$true)][string]$SpiderMonkey,[Parameter(Mandatory=$true)][string]$NativeDiagnostics,[string]$Tag=([Guid]::NewGuid().ToString('N')))
$ErrorActionPreference='Stop'
$workspace=Resolve-Path (Join-Path $PSScriptRoot '../../../..')
$keys=@('FRAMEWEAVE_NATIVE_GPU','FRAMEWEAVE_SPIDERMONKEY','FRAMEWEAVE_MEDIA_PYTHON','PYTHONPATH','CREATION_NATIVE_DIAGNOSTICS','CREATION_PACKAGE','CREATION_RUN','CREATION_RUN_ID','CREATION_CONSUMER','CREATION_EVIDENCE','CREATION_FILTER','CREATION_FRAMES','FRAMEWEAVE_HOME')
$previous=@{}
foreach ($key in $keys) { $previous[$key]=[Environment]::GetEnvironmentVariable($key,'Process') }
Push-Location $workspace
try {
 if ($Tag -notmatch '^[a-zA-Z0-9-]+$') { throw 'Use an alphanumeric unique log tag.' }
 foreach ($file in @($NativeGpu,$SpiderMonkey,$NativeDiagnostics)) { if (!(Test-Path -LiteralPath $file -PathType Leaf)) { throw "Missing executable: $file" } }
 $env:FRAMEWEAVE_NATIVE_GPU=(Resolve-Path -LiteralPath $NativeGpu).Path
 $env:FRAMEWEAVE_SPIDERMONKEY=(Resolve-Path -LiteralPath $SpiderMonkey).Path
 $env:CREATION_NATIVE_DIAGNOSTICS=(Resolve-Path -LiteralPath $NativeDiagnostics).Path
 $env:CREATION_PACKAGE=".frameweave/spatial-creation/studio-package-$Tag"
 $env:CREATION_RUN=".frameweave/spatial-creation/studio-run-$Tag"
 $env:CREATION_RUN_ID=$Tag
 $env:CREATION_CONSUMER=".frameweave/spatial-creation/studio-consumer-$Tag"
 $env:CREATION_EVIDENCE="modules/spatial-creation/validation/studio/evidence/repro-$Tag"
 $env:FRAMEWEAVE_HOME=Join-Path $workspace ".frameweave/spatial-creation-studio-home-$Tag"
 Remove-Item Env:CREATION_FILTER -ErrorAction SilentlyContinue
 Remove-Item Env:CREATION_FRAMES -ErrorAction SilentlyContinue
 node modules/spatial-creation/validation/command.mjs "types-$Tag" node node_modules/typescript/bin/tsc -p modules/spatial-creation/validation/tsconfig.json
 if ($LASTEXITCODE) { throw 'Type validation failed' }
 node modules/spatial-creation/validation/command.mjs "unit-$Tag" node --import tsx --test modules/spatial-creation/validation/studio.test.ts modules/spatial-creation/validation/sculpture.test.ts modules/spatial-creation/validation/clones.test.ts
 if ($LASTEXITCODE) { throw 'Targeted tests failed' }
 node modules/spatial-creation/validation/command.mjs "build-$Tag" node --import tsx modules/spatial-creation/scripts/build.ts $env:CREATION_PACKAGE
 if ($LASTEXITCODE) { throw 'Candidate build failed' }
 node modules/spatial-creation/validation/command.mjs "real-$Tag" node --import tsx modules/spatial-creation/validation/studio/verify.ts
 if ($LASTEXITCODE) { throw 'Real GPU/studio/media validation failed' }
 node modules/spatial-creation/validation/command.mjs "consumer-$Tag" node --import tsx modules/spatial-creation/validation/studio/consumer.ts
 if ($LASTEXITCODE) { throw 'Carried package consumer validation failed' }
} finally {
 foreach ($key in $keys) { [Environment]::SetEnvironmentVariable($key,$previous[$key],'Process') }
 Pop-Location
}
