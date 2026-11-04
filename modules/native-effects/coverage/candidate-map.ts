/** Source navigation hints, never claims of functional or parameter equivalence.
 * Different algorithms and partial controls remain unproven in the crosswalk. */
export const candidates:Readonly<Record<string,readonly string[]>>={
 'Arithmetic':['channelArithmetic'],'Blend':['mix'],'Compound Arithmetic':['channelCalculations'],'Minimax':['erodeImage','dilateImage'],
 'Black & White':['blackAndWhite'],'CC Color Neutralizer':['colorNeutralize'],'CC Color Offset':['colorOffsetCycle'],'CC Kernel':['convolve3x3'],'CC Toner':['gradientMap','tritone'],
 'Channel Mixer':['channelMix'],'Color Balance (HLS)':['hueSaturation'],'Color Link':['colorMatch'],'Color Stabilizer':['colorStabilize'],'Levels (Individual Controls)':['levels'],'PS Arbitrary Map':['lut1D'],
 'CC Bend It':['bend'],'CC Bender':['bend'],'CC Lens':['lensWarp'],'CC Slant':['slantWarp'],'CC Smear':['smearWarp'],'CC Split':['splitWarp'],'CC Split 2':['splitCorners'],
 'Detail-preserving Upscale':['adaptiveDetailUpscale'],'Mirror':['mirrorWarp'],'Smear':['smearWarp'],'Warp':['envelopeWarp'],'Warp Stabilizer':['analyzeCameraSequence','optimizeCameraPath','stabilizationMap','fitStabilizationFraming','synthesizeStabilizedEdges','stabilizeSequencePath'],
 '4-Color Gradient':['fourColorGradient'],'Advanced Lightning':['lightning'],'Audio Spectrum':['spectrumBars'],'Audio Waveform':['waveformTrace'],'CC Glue Gun':[],'CC Threads':['threadsTexture'],'Cell Pattern':['cellularTexture'],'Circle':['ellipseMask'],'Ellipse':['ellipseMask'],'Fractal':['mandelbrotTexture','juliaTexture'],'Gradient Ramp':['linearGradient','radialGradient'],'Grid':['gridTexture'],'Stroke':['pathStroke'],'Vegas':['pathStroke'],'Write-on':['pathStroke'],
 'CC Simple Wire Removal':['wireRemove'],'Color Range':['colorRangeKey'],'Extract':['extractKey'],'Linear Color Key':['colorKey'],'Refine Hard Matte':['refineMatte'],'Refine Soft Matte':['refineMatte'],'Simple Choker':['matteChoker'],'Dust & Scratches':['dustAndScratches'],
 'Basic Text':[],'Gaussian Blur (Legacy)':['blur'],'Path Text':[],'Reduce Interlace Flicker':['deinterlace'],'Spill Suppressor':['advancedSpillSuppressor'],
 '3D Glasses':['stereo'],'Bevel Alpha':['matteBevel'],'Bevel Edges':['matteBevel'],'CC Burn Flim':['burnFilm'],'CC Glass':['glassRelief'],'CC Kaleida':['kaleidoscope'],'CC Mr. Smoothie':['smoothPosterize'],'CC Plastic':['plasticRelief'],'Mosaic':['mosaicMean'],'Motion Tile':['tiler'],'Strobe Light':['strobe'],'Texturize':['glassRelief'],
 'CC Force Motion Blur':['shutterBlur'],'CC Wide Time':['wideTime'],'Echo':['echo'],'Pixel Motion Blur':['vectorBlur','timeWarp'],'Posterize Time':['posterizeTime','posterize'],'Time Difference':['timeDifference'],'Time Displacement':['timeDisplace'],'Timewarp':['timeWarp'],
 'Block Dissolve':['randomBlocksWipe'],'Card Wipe':['cardFlipWipe'],'CC Glass Wipe':['glassWipe'],'CC Grid Wipe':['gridWipe'],'CC Image Wipe':['imageWipe'],'CC Jaws':['jawsWipe'],'CC Light Wipe':['lightWipe'],'CC Line Sweep':['lineSweepWipe'],'CC Radial ScaleWipe':['radialScaleWipe'],'CC Scale Wipe':['scaleWipe'],'CC Twister':['twisterTransition'],'CC WarpoMatic':['warpTransition'],'Gradient Wipe':['lumaWipe'],'Iris Wipe':['irisWipe'],'Linear Wipe':['directionalWipe'],'Radial Wipe':['clockWipe'],'Venetian Blinds':['venetianWipe'],
 'CC Overbrights':['highlightRolloff'],'Cineon Converter':['ocioColorSpaceTransform'],'Color Profile Converter':['ocioColorSpaceTransform'],'Grow Bounds':['resample'],'HDR Compander':['hdrCompand'],'HDR Highlight Compression':['highlightRolloff']
};
export const ownershipBasis={
 image:'Agent-3: image filters, optics, color, channels, textures, masks, mattes, keying and pixel compositing.',
 time:'Standing user allocation: Agent-2 owns text, paths, time and animation semantics. Existing Native time/motion/transitions are indexed read-only; not reimplemented or counted as Agent-3 delivery.',
 spatial:'Standing user allocation: Agent-4 owns particles, physics, Puppet, spatial simulation/geometry and scene rendering.',
 publication:'Main owns public entry, immutable package identity, SDK pin and distribution.'
} as const;
