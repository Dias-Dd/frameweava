param([string]$NativeGpu,[string]$SpiderMonkey,[string]$NativeDiagnostics)
$ErrorActionPreference='Stop'
$workspace=Resolve-Path (Join-Path $PSScriptRoot '../../..')
Push-Location $workspace
try {
 if (!$NativeGpu -or !$SpiderMonkey -or !$NativeDiagnostics) { throw 'Supply explicit existing Native GPU, SpiderMonkey and diagnostic Native GPU executable paths.' }
 foreach ($file in @($NativeGpu,$SpiderMonkey,$NativeDiagnostics)) { if (!(Test-Path -LiteralPath $file -PathType Leaf)) { throw "Missing executable: $file" } }
 $env:FRAMEWEAVE_NATIVE_GPU=(Resolve-Path -LiteralPath $NativeGpu).Path
 $env:FRAMEWEAVE_SPIDERMONKEY=(Resolve-Path -LiteralPath $SpiderMonkey).Path
 $env:CREATION_NATIVE_DIAGNOSTICS=(Resolve-Path -LiteralPath $NativeDiagnostics).Path
 $tag=[Guid]::NewGuid().ToString('N')
 $env:CREATION_RUN=".frameweave/spatial-creation/run-$tag"
 $env:CREATION_PACKAGE=".frameweave/spatial-creation/package-$tag"
 $env:CREATION_RUN_ID=$tag
 $env:FRAMEWEAVE_HOME=Join-Path $workspace '.frameweave/spatial-creation-home'
 Remove-Item Env:CREATION_FILTER -ErrorAction SilentlyContinue
 node modules/spatial-creation/validation/command.mjs "types-$tag" node node_modules/typescript/bin/tsc -p modules/spatial-creation/validation/tsconfig.json
 if ($LASTEXITCODE) { throw 'Type validation failed' }
 node modules/spatial-creation/validation/command.mjs "unit-$tag" node --import tsx --test modules/spatial-creation/validation/creation.test.ts modules/spatial-creation/validation/finish.test.ts tests/native-effects.test.ts tests/native-library-final.test.ts
 if ($LASTEXITCODE) { throw 'Targeted tests failed' }
 node modules/spatial-creation/validation/command.mjs "build-$tag" node --import tsx modules/spatial-creation/scripts/build.ts $env:CREATION_PACKAGE
 if ($LASTEXITCODE) { throw 'Candidate build failed' }
 node modules/spatial-creation/validation/command.mjs "real-$tag" node --import tsx modules/spatial-creation/validation/verify.ts
 if ($LASTEXITCODE) { throw 'Real integration validation failed' }
} finally { Pop-Location }
