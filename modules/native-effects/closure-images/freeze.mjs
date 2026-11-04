import {readdir,readFile,writeFile,mkdir,cp} from 'node:fs/promises';
import {join,resolve,relative,dirname} from 'node:path';
import {createHash} from 'node:crypto';
const root=resolve('.'),base=resolve('artifacts/native-effects/closure-images'),target=resolve('docs/native-closure-images-evidence'),ledger=JSON.parse(await readFile(join(base,'campaign.json'),'utf8'));
const latest=phase=>{const a=ledger.attempts.filter(a=>a.phase===phase).at(-1);if(!a||a.code!==0)throw Error('Latest '+phase+' is not qualified');return a;};
const result=async phase=>JSON.parse(await readFile(join(dirname(latest(phase).stdout),'result.json'),'utf8'));
for(const p of ['syntax','types','unit','gpu','media','performance','ocioBuild','ocioPrepare','ocioSyntax','ocioUnit','ocioGpu','displayPrepare','displayDelivery'])latest(p);
const gpu=await result('gpu'),media=await result('media'),performance=await result('performance'),display=await result('displayDelivery'),ocio=await result('ocioGpu');
if([gpu,media,performance,display,ocio].some(v=>!v.ok))throw Error('Incomplete supported-contract qualification');
const failed=ledger.attempts.filter(a=>a.phase==='display').at(-1);if(!failed||failed.code===0)throw Error('Audit must retain the unresolved strict ACES2 case');
const ocioFailure=JSON.parse(await readFile(join(dirname(failed.stdout),'numeric-worst.json'),'utf8'));
const mapping={
'ec.color.ociodisplay':['partial','Official GPU display data and Node colorimetric-view terminal verified; wider ACES2 strict 3e-6 case FAILS'],
'ec.distort.ccbender':['existing_geometry','bend: circular inverse bend with rigid ends'],
'ec.distort.ccblobbylize':['qualified','blobbylize: Gaussian Alpha-gradient refraction'],
'ec.distort.ccflomotion':['qualified','floMotion: two radial pull knots'],
'ec.distort.ccpageturn':['qualified','pageTurn: pinned Rust four-candidate cylindrical fold'],
'ec.distort.ccpowerpin':['existing_geometry','cornerPin/homographyWarp: explicit inverse projective controls'],
'ec.distort.ccripplepulse':['qualified','ripplePulse: context-time expanding sinusoidal pulse'],
'ec.distort.ccslant':['qualified','slantWarp: inverse floor shear and scale'],
'ec.distort.ccsmear':['qualified','smearWarp: local line displacement'],
'ec.distort.ccsplit':['qualified','splitWarp: opposed local displacements'],
'ec.distort.ccsplit2':['qualified','splitCorners: four quadrant gaps'],
'ec.distort.upscale':['partial','Existing Lanczos3/Mitchell antialiased resample; no proprietary detail-reconstruction claim'],
'ec.distort.reshape':['qualified','reshapeWarp: explicit TPS correspondences; GPU dense sampling'],
'ec.distort.rollingshutterrepair':['partial','rollingShutterWarp: calibrated row offsets; automatic camera-motion estimation NOT implemented'],
'ec.distort.smear':['qualified','smearWarp: shared supported primitive, not another counted function'],
'ec.distort.twirllegacy':['existing_geometry','twirl: explicit inverse twist; no legacy bit-parity claim'],
'ec.distort.warp':['qualified','envelopeWarp plus existing bend/bulge/bezierWarp; explicit controls'],
'ec.distort.warpstabilizer':['partial','Existing homographyWarp can consume supplied motion transforms; automatic stabilizer/tracker NOT implemented'],
'ec.keying.keylight':['partial','Existing screenKey/despill/cleaner/refine GPU chain; proprietary Keylight algorithm/options NOT claimed'],
'ec.obsolete.mochashape':['partial','pathMatte consumes validated shared PathData; proprietary Mocha file importer/tracker NOT implemented'],
'ec.matte.objectmatte':['qualified','objectMatte: exact selected u32 labels, including high-bit IDs'],
'ec.matte.rotobrush':['partial','seededMatte: exact spatial color-connected regions; temporal/neural RotoBrush NOT implemented'],
'ec.stylize.ccblockload':['qualified','blockLoad: deterministic cell reveal'],
'ec.stylize.ccburnfilm':['qualified','burnFilm: thresholded burn and HDR edge light'],
'ec.stylize.cchextile':['qualified','hexTile: explicit hex inverse sampling'],
'ec.stylize.cckaleida':['existing_geometry','kaleidoscope: existing inverse wedge fold'],
'ec.stylize.ccmrsmoothie':['qualified','smoothPosterize: softened artistic quantization; not full product parity'],
'ec.stylize.roughenedges':['qualified','roughenEdges: seeded coverage edge noise and feather'],
'ec.stylize.scatter':['qualified','scatter: pinned seeded source-offset equation'],
'ec.stylize.strobe':['qualified','strobe: explicit context time and gate'],
'ec.generate.advancedlightning':['qualified','lightning: seeded antialiased polyline light; no branching physical solver claim'],
'ec.generate.audiospectrum':['qualified','spectrumBars: supplied typed GPU spectrum; decoder/FFT NOT included'],
'ec.generate.audiowaveform':['qualified','waveformTrace: supplied typed GPU samples; decoder NOT included'],
'ec.generate.beam':['qualified','beam: analytic segment light'],
'ec.generate.ccgluegun':['partial','pathStroke provides constant-width stroke; pressure-aware glue/brush deposition NOT implemented'],
'ec.generate.cclightrays':['existing_optics','lightRays/occludedLightRays: existing qualified optical integration'],
'ec.generate.ccthreads':['qualified','threadsTexture: analytic sine threads'],
'ec.generate.circle':['qualified','ellipseMask: equal explicit radii, one supported primitive'],
'ec.generate.ellipse':['qualified','ellipseMask: analytic coverage'],
'ec.generate.grid':['qualified','gridTexture: analytic grid'],
'ec.generate.paintbucket':['qualified','paintBucket: exact GPU union-find connectivity'],
'ec.generate.radiowaves':['qualified','radioWaves: concentric analytic rings'],
'ec.generate.scribble':['partial','Explicit authored PathData + pathStroke; automatic scribble/path synthesis NOT implemented'],
'ec.generate.stroke':['qualified','pathStroke: validated shared Bezier paths and distance feather'],
'ec.generate.vegas':['partial','pathStroke dash/phase; automatic contour tracing NOT implemented'],
'ec.generate.writeon':['qualified','pathStroke start/end with existing Signals; ordinary explicit paths'],
'ec.perspective.bevelalpha':['existing_keying','matteBevel: existing exact distance/normal controls'],
'ec.perspective.beveledges':['existing_keying','matteBevel with explicit source coverage; no separate UI parity'],
'ec.perspective.cccylinder':['existing_geometry','cylinderWarp: qualified 2D inverse cylinder, not 3D scene'],
'ec.perspective.radialshadow':['qualified','radialShadow: finite Alpha ray integration'],
'ec.perspective.cameratracker':['excluded_by_user','Spatial/3D camera tracker: separate domain; not implemented by this batch'],
'ec.perspective.3dglasses':['not_implemented','Stereo image packing/anaglyph is not implemented by this batch'],
'ec.perspective.ccenvironment':['excluded_by_user','3D environment mapping: separate spatial domain'],
'ec.perspective.ccsphere':['excluded_by_user','3D sphere: separate spatial domain; 2D spherize is not a sphere renderer'],
'ec.perspective.ccspotlight':['partial','Existing optical lightRays/explicit lighting, not a 3D spotlight/shadow solver'],
};
const inventoryPath='modules/gpu-image-effects/INVENTORY.md',scopePath='modules/gpu-image-effects/CLOSURE_SCOPE.json';let inventory=await readFile(inventoryPath,'utf8');
for(const [id,[status,coverage]]of Object.entries(mapping))inventory=inventory.split('\n').map(line=>{if(!line.includes('`'+id+'`'))return line;const v=line.split('|');v[5]=' Native round3 '+status+': '+coverage+'; supported contract, no full AE parity ';return v.join('|');}).join('\n');
for(const [id,description]of Object.entries({'ec.blur.camerashakedeblur':'motionDeblur: qualified supplied-PSF deconvolution; blind shake estimation absent','ec.noise.matchgrain':'matchGrain: qualified highpass variance match; full grain profile estimation absent','ec.distort.displacementmap':'Native pa::displaceWithMap GPU implemented and qualified on its frozen earlier owner; successor-owner requalification not part of this batch'}))inventory=inventory.split('\n').map(line=>{if(!line.includes('`'+id+'`'))return line;const v=line.split('|');v[5]=' '+description+' ';return v.join('|');}).join('\n');
if(!inventory.includes('## Final Native image closure'))inventory+='\n## Final Native image closure\n\n32 concrete APIs in [closure-images](../native-effects/closure-images/README.md), reusing the admitted owner and pinned upstream equations. Strict numeric/media/performance evidence and all failures are frozen in [round3 evidence](../../docs/native-closure-images-evidence/summary.json). Catalog product names are neither function counts nor full proprietary parity. The wider ACES2 display case remains above its unchanged error gate; automatic upstream sampling is excluded. Explicit missing analysis/import/brush/stereo features remain visible in the rows and CLOSURE_SCOPE.\n';
inventory=inventory.replace('Existing scene-only image admission needs a Main/owner terminal adapter for final OCIO display output.','The round3 Node terminal adapter now delivers explicitly selected display data via PME; normal-Layer/CLI integration remains Main work, and wider ACES2 numeric qualification fails its unchanged gate.');
await writeFile(inventoryPath,inventory);
const scope=JSON.parse(await readFile(scopePath,'utf8'));scope.currentRound=3;scope.round3='32 concrete image APIs plus explicit named-display-data terminal delivery; no fourth round';
for(const i of scope.items.filter(v=>v.round===3)){if(!mapping[i.id])throw Error('Unaudited round3 candidate '+i.id);const [status,coverage]=mapping[i.id];i.status=status;i.coverage=coverage;i.supportedContractQualified=status==='qualified'||status.startsWith('existing_');i.complete=false;i.fullUpstreamParity=false;i.completionNote='complete refers to full catalog product parity and is not inferred from a primitive';i.evidence=status==='existing_geometry'?'docs/native-geometry-evidence':status==='existing_keying'?'docs/native-keying-evidence':'docs/native-closure-images-evidence';}
scope.additionalGenerateOpticsCandidates=Object.entries(mapping).filter(([id])=>id.startsWith('ec.generate.')||id.startsWith('ec.perspective.')).map(([id,[status,coverage]])=>({id,status,coverage}));
const displayItem=scope.items.find(v=>v.id==='ec.color.ociodisplay');displayItem.status='partial';displayItem.coverage=mapping['ec.color.ociodisplay'][1];displayItem.evidence='docs/native-closure-images-evidence';
scope.ocioAudit.terminalGap={status:'Explicit Node terminal adapter implemented and media-qualified for official Video (colorimetric) view',source:'modules/native-effects/closure-images/display-output.ts',normalLayer:'Scene-only image contract preserved; public Layer/CLI terminal-selection integration belongs to Main',readback:'Only explicit final media boundary; named allowlisted buffer export, no in-chain image readback',knownFailure:{profile:'ACES 2.0 - SDR 100 nits (Rec.709)',...ocioFailure,tolerance:3e-6,qualified:false},remaining:['Wider ACES2 strict numerical agreement','dynamic OCIO Uniforms','arbitrary configs/2D texture qualification','Main public terminal selection']};
scope.remainingAcceptance='Three requested implementation rounds used. Supported contracts are individually qualified; all-original-gap completion is NOT claimed because wider ACES2 strict numerical case still fails and explicit catalog analysis/import/brush/stereo capabilities remain absent. No fourth round is silently started.';
await writeFile(scopePath,JSON.stringify(scope,null,2)+'\n');
const files=[];async function walk(dir){for(const e of await readdir(dir,{withFileTypes:true})){const p=join(dir,e.name);if(e.isDirectory())await walk(p);else files.push(p);}}
await walk(resolve('modules/native-effects/closure-images'));await walk(resolve('modules/native-effects/closure-filters'));files.push(resolve(inventoryPath),resolve(scopePath),...['chain','numeric','boundary','ocio'].map(n=>resolve('modules/native-effects/examples/closure-image-'+n+'.tsx')),resolve('tests/native-closure-images.test.ts'));
const sources=[];for(const p of files){const b=await readFile(p);sources.push({file:relative(root,p).replaceAll('\\','/'),bytes:b.length,sha256:createHash('sha256').update(b).digest('hex')});}
const numeric=gpu.rows.filter(r=>r.maxScaled!==undefined);if(numeric.length!==510)throw Error('Numeric coverage mismatch');
const summary={version:1,parent:ledger.base,closureRound:3,maxClosureRounds:3,newFunctions:32,unitTests:12,affectedPreviousUnitTests:13,numericComparisons:510,affectedPreviousNumericComparisons:ocio.rows.filter(r=>r.maxScaled!==undefined).length,allRequestedGapsComplete:false,formatMaxScaled:Object.fromEntries(['rgba32float','rgba16float'].map(f=>[f,Math.max(...numeric.filter(r=>r.format===f).map(r=>r.maxScaled))])),media:media.rows,terminalDisplay:display,strictAces2Failure:{...ocioFailure,tolerance:3e-6,qualified:false},performance:performance.rows,implementationMsBeforeFirstTest:ledger.implementationMsBeforeFirstTest,verificationMsBeforeAssembly:ledger.spentMs,originalFailuresRetained:true,sources,remaining:['Wider official ACES2 display numerical agreement at unchanged 3e-6 gate','Automatic tracking/estimation, neural/temporal segmentation, proprietary import/brush and stereo details are explicitly not implemented; see CLOSURE_SCOPE, not silently treated as equivalent functions','Main public immutable SDK/R1/catalog/portable/CLI terminal integration'],unverified:['Other GPU vendors/OS/software adapters','Every color-primary/parameter combination and extreme IEEE domains','Automatic tiling/global origins','4K terminal media encoding','Current OCIO precision-kernel performance; earlier round2 performance is not reused as current-source proof','Full repository/six delivery modes/Main packaging']};
await writeFile(join(base,'summary.json'),JSON.stringify(summary,null,2)+'\n');await mkdir(target,{recursive:true});await cp(base,target,{recursive:true});console.log(JSON.stringify({assembled:true,numericComparisons:510,knownFailedQualification:true,sources:sources.length,target}));
