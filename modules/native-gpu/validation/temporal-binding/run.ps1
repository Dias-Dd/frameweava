param([string]$NativeGpu,[string]$SpiderMonkey,[string]$MediaPython)
$ErrorActionPreference='Stop'
$root=(Resolve-Path (Join-Path $PSScriptRoot '../../../..')).Path
Push-Location $root
try {
  if (!$NativeGpu -or !$SpiderMonkey -or !$MediaPython) { throw 'Supply existing NativeGpu, SpiderMonkey and MediaPython paths. This script downloads/builds no tools.' }
  $env:FRAMEWEAVE_NATIVE_GPU=(Resolve-Path -LiteralPath $NativeGpu).Path
  $env:FRAMEWEAVE_SPIDERMONKEY=(Resolve-Path -LiteralPath $SpiderMonkey).Path
  $env:FRAMEWEAVE_MEDIA_PYTHON=(Resolve-Path -LiteralPath $MediaPython).Path
  $env:FRAMEWEAVE_HOME=Join-Path $root '.frameweave/user-home'
  node --import tsx --test --test-concurrency=1 tests/native-temporal.test.ts tests/native-temporal-renderer.test.ts
  if ($LASTEXITCODE) { throw "Temporal tests failed: $LASTEXITCODE" }
  node node_modules/typescript/bin/tsc --noEmit
  if ($LASTEXITCODE) { throw "Typecheck failed: $LASTEXITCODE" }
} finally { Pop-Location }
