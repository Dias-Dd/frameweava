# Optional native media dependencies

Verbatim notices copied from the actually installed, separately provisioned Python
distributions. No native binary or wheel is added to the npm package by this change.

| Distribution | Tested version | Upstream | Notice |
|---|---|---|---|
| OpenColorIO | 2.5.2 | https://github.com/AcademySoftwareFoundation/OpenColorIO | OpenColorIO-2.5.2-LICENSE (BSD-3-Clause) |
| OpenEXR | 3.4.4 | https://github.com/AcademySoftwareFoundation/OpenEXR | OpenEXR-3.4.4-LICENSE.md (BSD-3-Clause) |
| NumPy | 2.3.4 | https://github.com/numpy/numpy | NumPy-2.3.4-LICENSE.txt (BSD and bundled notices) |
| PyVips | 3.2.0 | https://github.com/libvips/pyvips | pyvips-3.2.0.dist-info-LICENSE.txt (MIT) |
| CFFI / pycparser | 2.0.0 / 2.23 | PyPI official distributions | cffi / pycparser notices retained |
| setuptools / pkgconfig | 80.9.0 / 1.5.5 | PyPI official distributions | build-only MIT notices retained |

OCIO's built-in ACES2 implementation/config is used through the library, without
copying CTL source or downloading config/LUT files. The official config project's
BSD notice is the same OpenColorIO Contributors notice:
https://github.com/AcademySoftwareFoundation/OpenColorIO-Config-ACES/blob/main/LICENSE.
No ACES branding/certification rights are asserted.

The existing `licenses/inventory.json` is the npm dependency inventory; this directory
documents optional external Python dependencies, not new npm dependencies. Existing
sharp/libvips, FFmpeg and codec notices remain in their original license directories.
The tested FFmpeg binary identifies itself as GPLv3. Redistributing that binary and
codec components requires the applicable upstream source and license obligations;
encoder availability is not a grant of codec patent or vendor certification rights.

Wheel byte hashes are deployment/platform-specific. This release pins API versions,
records actual OCIO config/processor identity and retains upstream notices; it does
not claim a universal native-toolchain reproducibility lock.
