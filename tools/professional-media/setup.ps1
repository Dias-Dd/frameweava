param([string]$Python='python',[string]$EnvironmentPath='')
$ErrorActionPreference='Stop'
$taskRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$taskEnvironment=if ($EnvironmentPath) {[IO.Path]::GetFullPath($EnvironmentPath)} else {Join-Path $taskRoot '.frameweave/pme-python'}
$taskCache=Join-Path $taskEnvironment 'pip-cache'
# Explicit developer provisioning only; no runtime installation or downloads.
& $Python -m venv $taskEnvironment
if ($LASTEXITCODE -ne 0) { throw 'Python venv creation failed' }
$taskPython=Join-Path $taskEnvironment 'Scripts/python.exe'
& $taskPython -m pip install --only-binary=:all: --cache-dir $taskCache -r (Join-Path $PSScriptRoot 'requirements.txt')
if ($LASTEXITCODE -ne 0) { throw 'Optional media dependencies could not be installed' }
& $taskPython -m pip install --require-hashes --no-deps --no-build-isolation --cache-dir $taskCache -r (Join-Path $PSScriptRoot 'requirements-pyvips.txt')
if ($LASTEXITCODE -ne 0) { throw 'Reviewed PyVips binding installation failed' }
& $taskPython -c 'import PyOpenColorIO,OpenEXR,numpy; print(PyOpenColorIO.__version__,OpenEXR.__version__,numpy.__version__)'
if ($LASTEXITCODE -ne 0) { throw 'Optional native imports failed' }
Write-Output "Set FRAMEWEAVE_MEDIA_PYTHON=$taskPython explicitly for the process that runs Frameweave."
