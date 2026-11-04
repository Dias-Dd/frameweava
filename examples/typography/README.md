# Prepared typography example

The committed paragraph uses the declared Noto Sans JP font instance identified in FONT-SOURCE.json; its OFL notice is included. No font file or machine font search is required to render the already prepared example.

Render the supplied editable TSX from the checkout:

```powershell
npm run frameweave -- frame examples/typography/project.tsx --frame 3 --output artifacts/caption.png
npm run frameweave -- render examples/typography/project.tsx --output artifacts/caption.mp4 --encoder libx264
```

Change the text using your explicit TTF/OTF input, then render again:

```powershell
node --conditions=frameweave-source --import tsx examples/typography/prepare.ts "path/to/font.ttf" "Your caption"
```

frameweave-source selects this SDK's TypeScript sources in a development checkout. In an installed engine, ordinary Node ESM imports use the compiled SDK automatically. It does not select third-party packages' types conditions. Preparation is an explicit Node script; Native Stage code imports only @frameweave/engine/typography and the resulting JSON.

Fonts, shaping and path services initialize once in createTypography and are disposed before video rendering. Reuse a prepared cue in as many frames as needed. The existing GPU renderer still owns its buffer/queue rules; this example does not claim a new cross-frame GPU residency optimization.
