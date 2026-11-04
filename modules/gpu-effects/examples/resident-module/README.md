# Resident pixel example

Install this directory with the existing R1 CLI, trusting local:frameweave.examples explicitly. It is an editable example, not a new production effect library or migration of gpu-image-effects. The GPU requirement is declared by its normal managed binding, so Final automatically selects eligible hardware. Kernel code and native Stage code remain reviewed executable code.

The stage body is derived from the frozen resident fixture2345f9e. Version1.0.1 defers defineMediaStage wrapping to the exported initialization function so Flat can retain declaration-only module evaluation. Version1.0.0 failed this export check and is not overwritten. Only public SDK imports are used. Changes to this example require a new package version; do not overwrite an installed identity.
