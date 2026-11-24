// 아티팩트에 원본 소스를 부속 파일(source/…)로 함께 게시하기 위한 목록을 만든다.
// 출력: dist/source-manifest.json (게시 경로 source/MANIFEST.json), 표준출력으로 Artifact 도구의 files 맵(JSON)
// 사용: node scripts/pack-source.mjs > /tmp/files.json
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib.mjs';

const INCLUDE_DIRS = ['content', 'scripts', 'src', 'tests', '.github'];
const INCLUDE_FILES = ['package.json', 'package-lock.json', 'README.md', 'HANDOFF.md', 'AUTOMATION.md', '.gitignore'];
const SKIP = /(^|\/)(_probe[^/]*|node_modules)(\/|$)/;
const TYPE = { '.md': 'text/markdown', '.mjs': 'text/javascript', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css' };

const files = [];
const walk = (rel) => {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) return;
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    const r = path.posix.join(rel, e.name);
    if (SKIP.test(r)) continue;
    if (e.isDirectory()) walk(r); else files.push(r);
  }
};
INCLUDE_DIRS.forEach(walk);
for (const f of INCLUDE_FILES) if (fs.existsSync(path.join(ROOT, f))) files.push(f);
files.sort();

const manifest = { generated_at: new Date().toISOString(), note: '게시 경로는 source/<path>. 복원 시 source/ 접두사를 떼고 같은 상대 경로에 둔다.', files };
fs.mkdirSync(path.join(ROOT, 'dist'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'dist/source-manifest.json'), JSON.stringify(manifest, null, 2));

const map = { 'source/MANIFEST.json': { from: path.join(ROOT, 'dist/source-manifest.json'), contentType: 'application/json' } };
// 이름에 점으로 시작하는 경로 조각이 있으면 게시 경로에서 '_dot_'로 바꿔 둔다(복원 시 되돌림)
for (const f of files) map[`source/${f.replace(/(^|\/)\./g, '$1_dot_')}`] = { from: path.join(ROOT, f), contentType: TYPE[path.extname(f)] || 'text/plain' };
process.stdout.write(JSON.stringify(map, null, 2));
