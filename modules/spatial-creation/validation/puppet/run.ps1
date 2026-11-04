param([Parameter(Mandatory=$true)][string]$NativeGpu,[Parameter(Mandatory=$true)][string]$SpiderMonkey,[Parameter(Mandatory=$true)][string]$NativeDiagnostics,[Parameter(Mandatory=$true)][string]$MediaPython,[string]$PythonModulePath,[string]$Tag=([Guid]::NewGuid().ToString('N')))
$ErrorActionPreference='Stop'
$workspace=Resolve-Path (Join-Path $PSScriptRoot '../../../..')
$keys=@('FRAMEWEAVE_NATIVE_GPU','FRAMEWEAVE_SPIDERMONKEY','FRAMEWEAVE_MEDIA_PYTHON','PYTHONPATH','CREATION_NATIVE_DIAGNOSTICS','CREATION_PACKAGE','CREATION_RUN','CREATION_RUN_ID','CREATION_CONSUMER','CREATION_CHAIN','CREATION_EVIDENCE','CREATION_FILTER','FRAMEWEAVE_HOME')
$previous=@{}
foreach ($key in $keys) { $previous[$key]=[Environment]::GetEnvironmentVariable($key,'Process') }
Push-Location $workspace
try {
 if ($Tag -notmatch '^[a-zA-Z0-9-]+$') { throw 'Use an alphanumeric unique log tag.' }
 foreach ($file in @($NativeGpu,$SpiderMonkey,$NativeDiagnostics,$MediaPython)) { if (!(Test-Path -LiteralPath $file -PathType Leaf)) { throw "Missing executable: $file" } }
 $env:FRAMEWEAVE_NATIVE_GPU=(Resolve-Path -LiteralPath $NativeGpu).Path
 $env:FRAMEWEAVE_SPIDERMONKEY=(Resolve-Path -LiteralPath $SpiderMonkey).Path
 $env:CREATION_NATIVE_DIAGNOSTICS=(Resolve-Path -LiteralPath $NativeDiagnostics).Path
 $env:FRAMEWEAVE_MEDIA_PYTHON=(Resolve-Path -LiteralPath $MediaPython).Path
 if ($PythonModulePath) { $env:PYTHONPATH=(Resolve-Path -LiteralPath $PythonModulePath).Path }
 $env:CREATION_PACKAGE=".frameweave/spatial-creation/puppet-package-$Tag"
 $env:CREATION_RUN=".frameweave/spatial-creation/puppet-run-$Tag"
 $env:CREATION_RUN_ID=$Tag
 $env:CREATION_CONSUMER=".frameweave/spatial-creation/puppet-consumer-$Tag"
 $env:CREATION_CHAIN=".frameweave/spatial-creation/puppet-chain-$Tag"
 $env:CREATION_EVIDENCE="modules/spatial-creation/validation/puppet/evidence/repro-$Tag"
 $env:FRAMEWEAVE_HOME=Join-Path $workspace ".frameweave/spatial-creation-puppet-home-$Tag"
 Remove-Item Env:CREATION_FILTER -ErrorAction SilentlyContinue
 node modules/spatial-creation/validation/command.mjs "types-$Tag" node node_modules/typescript/bin/tsc -p modules/spatial-creation/validation/tsconfig.json
 if ($LASTEXITCODE) { throw 'Type validation failed' }
 node modules/spatial-creation/validation/command.mjs "unit-$Tag" node --import tsx --test modules/spatial-creation/validation/creation.test.ts modules/spatial-creation/validation/finish.test.ts modules/spatial-creation/validation/physics.test.ts modules/spatial-creation/validation/puppet.test.ts
 if ($LASTEXITCODE) { throw 'Targeted tests failed' }
 node modules/spatial-creation/validation/command.mjs "build-$Tag" node --import tsx modules/spatial-creation/scripts/build.ts $env:CREATION_PACKAGE
 if ($LASTEXITCODE) { throw 'Candidate build failed' }
 node modules/spatial-creation/validation/command.mjs "solver-$Tag" node --import tsx modules/spatial-creation/validation/puppet/solver.ts
 if ($LASTEXITCODE) { throw 'Original-WASM default-pose cycle validation failed' }
 node modules/spatial-creation/validation/command.mjs "real-$Tag" node --import tsx modules/spatial-creation/validation/puppet/verify.ts
 if ($LASTEXITCODE) { throw 'Real GPU/solver/media validation failed' }
 node modules/spatial-creation/validation/command.mjs "consumer-$Tag" node --import tsx modules/spatial-creation/validation/puppet/consumer.ts
 if ($LASTEXITCODE) { throw 'CLI-only consumer validation failed' }
 node modules/spatial-creation/validation/command.mjs "chain-$Tag" node --import tsx modules/spatial-creation/validation/puppet/chain.ts
 if ($LASTEXITCODE) { throw 'Public surface-port chain validation failed' }
} finally {
 foreach ($key in $keys) { [Environment]::SetEnvironmentVariable($key,$previous[$key],'Process') }
 Pop-Location
}
