/* tools/place.mjs — 把 place.src.mjs 打成一个能跑的 Node 包再执行。
   与 audit.mjs 同一套路：元件只通过 kit 用 three，而 'three' 是裸模块名，
   用 esbuild 的 alias 把它指到 vendor/three.module.js，Node 里就能直接跑。

   用法：node tools/place.mjs
*/
import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { rm } from 'node:fs/promises';
import path from 'node:path';

const out = 'tools/.place.bundle.mjs';

await build({
  entryPoints: ['tools/place.src.mjs'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile: out,
  alias: { three: path.resolve('vendor/three.module.js') },
  logLevel: 'error',
});

const r = spawnSync(process.execPath, [out], { stdio: 'inherit' });
await rm(out, { force: true });
process.exit(r.status ?? 1);