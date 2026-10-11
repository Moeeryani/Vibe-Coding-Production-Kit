import fs from 'node:fs';
const paths = ['D:\\', 'C:\\', 'D:\\vcp-r4-tmp'];
for (const p of paths) {
  try {
    const s = fs.statfsSync(p);
    const t = s.type >>> 0;
    console.log(p, 'f_type=0x' + t.toString(16), t === 0x9d13eb93 ? 'NTFS_SUPER_MAGIC (NTFS)' : 'other');
  } catch (e) {
    console.log(p, 'ERR', e.code || e.message);
  }
}
