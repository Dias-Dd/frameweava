param([switch]$Render, [switch]$Frame)
$palimpsestRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
if (-not $env:FRAMEWEAVE_SERVO_RUNTIME) {
    $env:FRAMEWEAVE_SERVO_RUNTIME = Join-Path $palimpsestRoot 'outputs/main-deliveries/servo-fcf4de5c6c4d72a90a13b5abc94082258eb064ad41386bd71cf4f3f32aa67017'
}
if (-not (Test-Path -LiteralPath (Join-Path $env:FRAMEWEAVE_SERVO_RUNTIME 'servo-runtime.json'))) {
    throw 'Set FRAMEWEAVE_SERVO_RUNTIME to the reviewed Servo runtime directory.'
}
Push-Location -LiteralPath $palimpsestRoot
try {
    if ($Frame) {
        & npm.cmd run frameweave -- frame examples/effects-library-tour/palimpsest-orrery.tsx --frame 75 --memory-mib 4096 --output artifacts/palimpsest/Palimpsest-075.png
    } elseif ($Render) {
        & npm.cmd run frameweave -- render examples/effects-library-tour/palimpsest-orrery.tsx --memory-mib 4096 --max-concurrency 1 --output artifacts/palimpsest/Palimpsest-1080p.mp4
    } else {
        & npm.cmd run frameweave -- examples/effects-library-tour/palimpsest-orrery.tsx --memory-mib 4096
    }
    if ($LASTEXITCODE -ne 0) { throw "Frameweave exited with code $LASTEXITCODE" }
} finally { Pop-Location }
