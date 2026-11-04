# SAM2.1 adaptation sources

Meta SAM2.1 Hiera Base Plus model weights and configuration:
https://huggingface.co/facebook/sam2.1-hiera-base-plus
revision `b7320756a13354e7530a63935656d35b2f91a290`, Apache-2.0.
Exact source bytes/SHA256 are in `sources.json`.

Hugging Face Transformers SAM2/SAM2Video implementation:
https://github.com/huggingface/transformers , installed version recorded by the
offline export receipt, Apache-2.0. Export records the installed implementation
hash, Torch/Transformers versions and exact derived graph bytes. It loads only
safetensors data, never a Python pickle checkpoint. Preserve the upstream
license/notices with any approved weight distribution; no vendor runtime binary
redistribution permission is inferred here.

The reviewed PRVSM ONNX files in `sources.json` are source-intake comparisons;
this adapter exports its own graphs from the official learned weights. They are
not installed or executed implicitly. The s-tornqvist conversion is reference
only because its export repository has no explicit license. No code/weights from
that conversion are redistributed by this module.

The QA corgi photograph is inherited from the earlier isolated SlimSAM fixture.
It is not a reusable module asset or licensed model weight; do not distribute it
as part of the public package without a separate photo license review.
