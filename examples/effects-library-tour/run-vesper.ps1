param([switch]$Render)
$vesperRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
if (-not $env:FRAMEWEAVE_SERVO_RUNTIME) {
    $env:FRAMEWEAVE_SERVO_RUNTIME = Join-Path $vesperRoot 'outputs/main-deliveries/servo-fcf4de5c6c4d72a90a13b5abc94082258eb064ad41386bd71cf4f3f32aa67017'
}
if (-not (Test-Path -LiteralPath (Join-Path $env:FRAMEWEAVE_SERVO_RUNTIME 'servo-runtime.json'))) {
    throw 'Please set FRAMEWEAVE_SERVO_RUNTIME to the reviewed local Servo bundle directory.'
}
Push-Location -LiteralPath $vesperRoot
try {
    if ($Render) {
        & npm.cmd run frameweave -- render examples/effects-library-tour/vesper-servo-1080p.tsx --memory-mib 4096 --max-concurrency 1 --output artifacts/vesper/Vesper-1080p-2997.mp4
    } else {
        & npm.cmd run frameweave -- examples/effects-library-tour/vesper-servo-1080p.tsx --memory-mib 4096
    }
    if ($LASTEXITCODE -ne 0) { throw "Frameweave exited with code $LASTEXITCODE" }
} finally {
    Pop-Location
}
