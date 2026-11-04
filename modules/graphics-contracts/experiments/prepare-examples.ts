import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {makePath} from './vector-producer.ts';
import {sha256} from '../resources.ts';
import {validateTrackData} from '../track.ts';

const folder=new URL('../examples/',import.meta.url);await mkdir(folder,{recursive:true});
const source=new URL('../../../prototypes/analysis-job-mvp/validation/track-example.json',import.meta.url);
const track=await readFile(source);validateTrackData(JSON.parse(track.toString('utf8')));
const path=Buffer.from(JSON.stringify(makePath(),null,2)+'\n');
await writeFile(new URL('path.json',folder),path);await writeFile(new URL('track-mvp.json',folder),track);
const identities={path:{resourceId:'pathFile',kind:'file',sha256:await sha256(path),bytes:path.length},track:{resourceId:'trackFile',kind:'file',sha256:await sha256(track),bytes:track.length}};
await writeFile(new URL('identities.json',folder),JSON.stringify(identities,null,2)+'\n');
console.log(JSON.stringify({source:fileURLToPath(source),...identities}));
