# Optional native media adapters

The TypeScript float compositor and analytic colour transforms do not need Python.
The fixed OCIO/OpenEXR/ICC bridge needs explicitly provisioned native dependencies.
Neither the CLI nor the renderer installs anything at runtime.

Windows (tested Python 3.13.7, x64):

```powershell
powershell -File tools/professional-media/setup.ps1 -Python C:/path/to/python.exe
$env:FRAMEWEAVE_MEDIA_PYTHON = Join-Path (Get-Location) '.frameweave/pme-python/Scripts/python.exe'
$env:FRAMEWEAVE_FFPROBE = (Get-Command ffprobe).Source
$env:FRAMEWEAVE_HOME = Join-Path (Get-Location) '.frameweave/user-home'
```

For a read-only installed SDK, pass `-EnvironmentPath C:/chosen/writable/media-python`
and set `FRAMEWEAVE_MEDIA_PYTHON` to that environment. Its pip cache stays inside the
chosen environment, not in another checkout or a shared global package cache.

POSIX equivalent (not tested this release): create an owned venv, install
`pip install --only-binary=:all: -r tools/professional-media/requirements.txt`, then
`pip install --require-hashes --no-deps --no-build-isolation -r tools/professional-media/requirements-pyvips.txt`.
Set `FRAMEWEAVE_MEDIA_PYTHON` to its absolute `bin/python` path and explicitly provide
a reviewed system libvips. Windows automatically reuses the already installed sharp
DLL directory; `FRAMEWEAVE_MEDIA_VIPS` can explicitly select another reviewed directory.
No native libvips is downloaded by the recipe. PyVips' official sdist setup was read:
its pure-Python ABI fallback builds without a C compiler, using pinned setuptools,
pkgconfig and CFFI. The source SHA is enforced. Core wheels unavailable for a platform
fail explicitly rather than starting an unreviewed native compiler installation.

These version pins identify the tested APIs; they are **not** a platform-independent
wheel hash lock. For reproducible deployment, provision a reviewed wheelhouse with
SHA-256 checks and `--no-index --find-links`, retaining upstream notices. Python,
wheel availability, native LCMS/zimg/codec versions and CPU instructions can affect
results. `ocioInfo()` and every OCIO video report record the serialized config hash
and processor ID. No arbitrary OCIO file config or remote LUT loading is enabled.

The supported real ACES 2.0 config is
`cg-config-v4.0.0_aces-v2.0_ocio-v2.5` (studio counterpart is selectable). Python
bindings ship its built-in config; no config download is needed. Run
`frameweave media capabilities --json` to diagnose missing adapters/encoders.

FFmpeg comes from the existing `ffmpeg-static` dependency. External ffprobe is only
needed for inspection/verification; set its path explicitly. FFmpeg builds differ
in GPL/LGPL components and patent/licensing obligations. This change does not
bundle the Python wheels or a new FFmpeg binary. Original notices from the tested
Python distributions are in `licenses/professional-media/`; existing npm notices
remain in `licenses/`.
