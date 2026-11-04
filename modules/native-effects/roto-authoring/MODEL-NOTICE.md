# Model and input notices

SlimSAM 77 uniform is published by Xenova under Apache-2.0. Repository revision,
original lengths/hashes and the derived model hashes are in sources.json. The
standard Apache-2.0 text is retained as MODEL-LICENSE; this is not a claim of an
additional upstream NOTICE or copyright statement. The upstream model card and
configuration must accompany any reviewed model redistribution.

prepare-model.py is a local offline adapter. It freezes the named IO dimensions
and introduces a F32-to-Int64 point-label Cast. It does not retrain or replace
learned operations/weights. A changed point capacity creates a different model
identity. Weights and runtime DLLs are external inputs and are not installed by
rendering this library.

The demonstration corgi photograph has a fixed URL, length and SHA in
sources.json. Its individual redistribution license is unconfirmed. It is used
only for local QA; neither the photograph nor its photographic output pixels
are included in the committed evidence or library assets. Machine comparisons,
output hashes and local file paths remain recorded. Synthetic paint media are
included as independently reproducible output evidence.

EffectCraft paint.rs and roto.rs plus the chosen MIT license are retained as
unaltered source bytes in vendor/effectcraft. sources.json distinguishes the
adapted equations from original work.
