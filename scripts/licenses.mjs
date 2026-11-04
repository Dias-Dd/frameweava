import { readFile, writeFile, mkdir, copyFile, readdir } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {createHash} from 'node:crypto';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const lock = JSON.parse(await readFile(join(root, 'package-lock.json'), 'utf8'));
const out = join(root, 'licenses'); await mkdir(out, { recursive: true });
const records = [];
for (const [path, entry] of Object.entries(lock.packages)) {
  if (!path) continue;
  const location = join(root, path);
  try {
    const pkg = JSON.parse(await readFile(join(location, 'package.json'), 'utf8'));
    const names = await readdir(location);
    const files = names.filter(n => /^(licen[cs]e|notice|copying)([.\-_]|$)/i.test(n) || /^ffmpeg\.exe\.(LICENSE|README)$/.test(n));
    const folder = `${pkg.name.replaceAll('/', '__').replace('@', '')}-${pkg.version}`;
    if (files.length) await mkdir(join(out, folder), { recursive: true });
    const saved = [];
    for (const file of files) {
      try { await copyFile(join(location, file), join(out, folder, file)); saved.push(`${folder}/${file}`); } catch {}
    }
    let license=pkg.license??entry.license??'UNSPECIFIED',licenseEvidence;
    if(license==='UNSPECIFIED'&&pkg.name==='parse-cache-control'&&pkg.version==='1.0.1'){
      const text=await readFile(join(location,'LICENSE'),'utf8');
      if(createHash('sha256').update(text).digest('hex')==='111f42b37daecc6c387d037ef25955bd269e7f9a46a736d5257a23560534763f'){
        license='BSD-3-Clause';licenseEvidence={source:'LICENSE',sha256:createHash('sha256').update(text).digest('hex'),note:'Package metadata is absent; identified from the preserved three-clause license text.'};
      }
    }
    records.push({ name: pkg.name, version: pkg.version, license,...licenseEvidence?{licenseEvidence}:{},
      repository: pkg.repository, dev: Boolean(entry.dev), licenseFiles: saved });
  } catch { /* Optional dependencies for a different platform are absent. */ }
}
records.sort((a, b) => a.name.localeCompare(b.name));
await writeFile(join(out, 'inventory.json'), JSON.stringify(records, null, 2));
console.log(`Recorded ${records.length} installed dependency versions and preserved their available license/NOTICE files.`);
