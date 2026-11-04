Servo 4K60 source: project-servo-4k60.tsx

Configure FRAMEWEAVE_SERVO_RUNTIME in this PowerShell session first.

Preview:
npm run frameweave -- examples/effects-library-tour/project-servo-4k60.tsx --memory-mib 4096

Render:
npm run frameweave -- render examples/effects-library-tour/project-servo-4k60.tsx --memory-mib 4096 --max-concurrency 1 --output artifacts/servo-4k60.mp4

The CLI preview now forwards --memory-mib to the existing PreviewOptions.maxBytes / Renderer memory budget.
The former default1GiB is below the reported per-frame1560916316-byte estimate.
Source and CLI change were not executed or tested, as requested.
