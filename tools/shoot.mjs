/* ============================================================
   tools/shoot.mjs — 视觉迭代用的截图/取数探针（开发工具，不进交付物）

   直接驱动 Edge 的 CDP：真时间等待（rAF 正常跑），拿到
     1) 控制台报错 / 未捕获异常
     2) 页面内任意表达式的值（用来读 window.__anatomy 的真实状态）
     3) 视口截图 → 存成 PNG 文件（不进上下文，按需 read_image）

   用法：
     node tools/shoot.mjs --out shots/a.png
     node tools/shoot.mjs --url "index.html?part=cpu&t=1" --out shots/cpu.png
     node tools/shoot.mjs --out shots/x.png --eval "window.__anatomy.parts.length"
     node tools/shoot.mjs --out shots/x.png --w 1400 --h 900 --wait 4000
   ============================================================ */

import { spawn } from 'node:child_process';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

/* ---------- 参数 ---------- */
const argv = process.argv.slice(2);
const flag = (name, dflt) => {
  const i = argv.indexOf('--' + name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : dflt;
};
const BASE = flag('base', 'http://127.0.0.1:5180/index.html');
const URL_ = (() => {
  const raw = flag('url', '');
  if (!raw) return BASE;
  return raw.startsWith('http') ? raw : BASE.replace(/[^/]*$/, '') + raw;
})();
const OUT = flag('out', 'shots/shot.png');
const W = +flag('w', 1600);
const H = +flag('h', 1000);
const WAIT = +flag('wait', 4500);
const EVAL = flag('eval', '');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

/* ---------- 启动 Edge ---------- */
const PORT = 9330 + (process.pid % 200);
const PROFILE = path.join(os.tmpdir(), 'anatomy-shoot-' + PORT);

const child = spawn(EDGE, [
  '--headless=new',
  '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + PROFILE,
  '--no-first-run', '--no-default-browser-check',
  '--disable-gpu', '--enable-unsafe-swiftshader', '--use-angle=swiftshader',
  '--hide-scrollbars', '--mute-audio',
  '--force-device-scale-factor=1',
  `--window-size=${W},${H}`,
  'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function jsonFetch(url, method = 'GET') {
  const r = await fetch(url, { method });
  return r.json();
}

/* ---------- 等 Edge 起来 + 建 target ---------- */
let version = null;
for (let i = 0; i < 100; i++) {
  try { version = await jsonFetch(`http://127.0.0.1:${PORT}/json/version`); break; }
  catch { await sleep(150); }
}
if (!version) { child.kill(); throw new Error('Edge 没起来（CDP 端口无响应）'); }

const target = await jsonFetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, 'PUT')
  .catch(() => null) || (await jsonFetch(`http://127.0.0.1:${PORT}/json/list`))[0];

/* ---------- 迷你 CDP 客户端 ---------- */
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => {
  ws.onopen = res;
  ws.onerror = (e) => rej(new Error('WS 连不上: ' + (e.message || 'error')));
});

let seq = 0;
const pending = new Map();
const consoleMsgs = [];
const errors = [];

ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    const { res, rej } = pending.get(m.id);
    pending.delete(m.id);
    m.error ? rej(new Error(m.error.message)) : res(m.result);
    return;
  }
  if (m.method === 'Runtime.consoleAPICalled') {
    const t = m.params.type;
    const text = (m.params.args || [])
      .map((a) => a.value ?? a.description ?? a.unserializableValue ?? a.type)
      .join(' ');
    if (t === 'error' || t === 'warning') consoleMsgs.push(`[${t}] ${text}`);
  } else if (m.method === 'Runtime.exceptionThrown') {
    const d = m.params.exceptionDetails;
    errors.push(d.exception?.description || d.text);
  } else if (m.method === 'Log.entryAdded') {
    const e = m.params.entry;
    if (e.level === 'error') errors.push(`${e.source}: ${e.text}${e.url ? ' @ ' + e.url : ''}`);
  }
};

const send = (method, params = {}) => new Promise((res, rej) => {
  const id = ++seq;
  pending.set(id, { res, rej });
  ws.send(JSON.stringify({ id, method, params }));
  setTimeout(() => {
    if (pending.has(id)) { pending.delete(id); rej(new Error(method + ' 超时')); }
  }, 30000);
});

/* ---------- 导航 → 等 → 取数 → 截图 ---------- */
await send('Page.enable');
await send('Runtime.enable');
await send('Log.enable');
await send('Emulation.setDeviceMetricsOverride', {
  width: W, height: H, deviceScaleFactor: 1, mobile: false,
});

await send('Page.navigate', { url: URL_ });
await sleep(WAIT);

/* --until "<表达式>": 轮询页面真实状态。
   软件渲染帧率很低（且主循环对 dt 做了钳制），墙上时间 1s 只推进零点几秒动画，
   所以"等 X 秒"不可靠 —— 必须等页面自己的状态。 */
const UNTIL = flag('until', '');
const UNTIL_MS = +flag('until-ms', 45000);
if (UNTIL) {
  const deadline = Date.now() + UNTIL_MS;
  let ok = false;
  while (Date.now() < deadline) {
    const r = await send('Runtime.evaluate', {
      expression: `(() => { try { return !!(${UNTIL}); } catch (e) { return false; } })()`,
      returnByValue: true,
    }).catch(() => null);
    if (r?.result?.value) { ok = true; break; }
    await sleep(250);
  }
  if (!ok) console.error('  ⚠ --until 超时（' + UNTIL_MS + 'ms），仍继续截图');
}

let evalResult;
if (EVAL) {
  const r = await send('Runtime.evaluate', {
    expression: `(() => { try { return JSON.stringify(${EVAL}); } catch (e) { return 'EVAL错误: ' + e.message; } })()`,
    returnByValue: true,
  });
  evalResult = r.result?.value;
}

const shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
await mkdir(path.dirname(path.resolve(OUT)), { recursive: true });
await writeFile(OUT, Buffer.from(shot.data, 'base64'));

const summary = {
  url: URL_,
  size: `${W}x${H}`,
  png: path.resolve(OUT),
  pngBytes: Buffer.from(shot.data, 'base64').length,
  console: consoleMsgs.slice(0, 25),
  errors: errors.slice(0, 25),
  eval: evalResult ?? null,
};
console.log(JSON.stringify(summary, null, 2));

ws.close();
child.kill();
await sleep(300);
await rm(PROFILE, { recursive: true, force: true }).catch(() => {});
process.exit(0);