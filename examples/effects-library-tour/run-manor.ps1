param(
    [ValidateSet('Preview','Frame','Render','Motion','Storyboard')][string]$Mode='Preview',
    [int]$Frame=130,
    [int]$MemoryMiB=4096,
    [int]$Concurrency=1
)
$manorRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
if (-not $env:FRAMEWEAVE_SERVO_RUNTIME) {
    $env:FRAMEWEAVE_SERVO_RUNTIME = Join-Path $manorRoot 'outputs/main-deliveries/servo-fcf4de5c6c4d72a90a13b5abc94082258eb064ad41386bd71cf4f3f32aa67017'
}
if (-not (Test-Path -LiteralPath (Join-Path $env:FRAMEWEAVE_SERVO_RUNTIME 'servo-runtime.json'))) {
    throw 'Set FRAMEWEAVE_SERVO_RUNTIME to the reviewed Servo runtime directory.'
}
Push-Location -LiteralPath $manorRoot
try {
    $entry='examples/effects-library-tour/manor-drawing-room.tsx'
    switch ($Mode) {
        'Frame' { & npm.cmd run frameweave -- frame $entry --frame $Frame --memory-mib $MemoryMiB --output "artifacts/manor/room-$Frame.png" }
        'Render' { & npm.cmd run frameweave -- render $entry --memory-mib $MemoryMiB --max-concurrency $Concurrency --output artifacts/manor/The-Still-Hours-1080p.mp4 }
        'Motion' { & npm.cmd run frameweave -- render examples/effects-library-tour/manor-motion-preview.tsx --memory-mib $MemoryMiB --max-concurrency $Concurrency --output artifacts/manor/The-Still-Hours-preview.mp4 }
        'Storyboard' { & npm.cmd run frameweave -- render examples/effects-library-tour/manor-action-storyboard.tsx --memory-mib $MemoryMiB --max-concurrency $Concurrency --output artifacts/manor/The-Still-Hours-storyboard.mp4 }
        default { & npm.cmd run frameweave -- $entry --memory-mib $MemoryMiB }
    }
    if ($LASTEXITCODE -ne 0) { throw "Frameweave exited with code $LASTEXITCODE" }
} finally { Pop-Location }
