# SPDX-License-Identifier: Apache-2.0
import argparse,hashlib,tarfile,urllib.request
from pathlib import Path
root=Path(__file__).resolve().parents[2];base=root/'.frameweave/deep-exr'
sources=[('openexr-v3.4.4.tar.gz','https://codeload.github.com/AcademySoftwareFoundation/openexr/tar.gz/refs/tags/v3.4.4','7c663c3c41da9354b5af277bc2fd1d2360788050b4e0751a32bcd50e8abaef8f'),('Imath.tar.gz','https://codeload.github.com/AcademySoftwareFoundation/Imath/tar.gz/refs/tags/v3.2.2','b4275d83fb95521510e389b8d13af10298ed5bed1c8e13efd961d91b1105e462'),('OpenJPH.tar.gz','https://codeload.github.com/aous72/OpenJPH/tar.gz/refs/tags/0.24.5','46e33b5c61798bc0fb5aef19bcdd2aa8d207cecc0d389293ee3cf0524165c648')]
p=argparse.ArgumentParser();p.add_argument('--verify',action='store_true');a=p.parse_args();base.mkdir(exist_ok=True,parents=True)
for name,url,expected in sources:
 archive=base/name
 if not archive.exists():
  if a.verify:raise RuntimeError('Missing reviewed source archive '+name)
  urllib.request.urlretrieve(url,archive)
 if hashlib.sha256(archive.read_bytes()).hexdigest()!=expected:raise RuntimeError('Source archive integrity mismatch '+name)
 with tarfile.open(archive)as tf:
  if not a.verify:tf.extractall(base/'upstream',filter='data')
  for member in tf.getmembers():
   if member.isfile():
    path=(base/'upstream'/member.name).resolve()
    if not path.is_relative_to((base/'upstream').resolve())or path.is_symlink():raise RuntimeError('Source path escape')
    if not path.is_file()or hashlib.sha256(path.read_bytes()).digest()!=hashlib.sha256(tf.extractfile(member).read()).digest():raise RuntimeError('Extracted source mismatch '+member.name)
print('Reviewed OpenEXR/Imath/OpenJPH archive and extracted source verification passed')
