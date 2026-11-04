import {writeFile} from 'node:fs/promises';
import {spatialComputeCases} from '../../../../tests/helpers/spatial-compute-oracle.ts';
const skip=new Set(['cellularVolume','vortexField','curlNoiseField','splatParticles','renderVolume']);
const cases=(await spatialComputeCases()).filter(c=>!skip.has(c.name));
await writeFile('modules/spatial-effects/validation/native-final/compute-fixtures.ts','// Generated from the existing independent numerical oracle; explicit authored inputs only.\nexport const cases='+JSON.stringify(cases.map(({name,inputs,options})=>({name,inputs,options})))+';\n');
console.log(JSON.stringify({cases:cases.map(c=>c.name)}));
