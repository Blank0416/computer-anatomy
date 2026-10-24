# 接口契约（所有写代码的人必须先读这一份）

项目：**电脑八大件 · 拆解讲解**（可点击的 3D 元件探索器）
技术：three.js 0.180（已本地化在 `vendor/`）+ 原生 ES 模块，esbuild 打包成单文件 HTML。

---

## 0. 目录与写入范围（谁写哪个文件，不许越界）

| 文件 | 归谁 | 说明 |
|---|---|---|
| `index.html` / `src/main.js` / `src/ui.css` / `src/tokens.css` | **lead** | 外壳、UI、装配、集成 |
| `src/engine/*.js` | **lead** | 舞台、相机、材质工具包、缓动 |
| `src/data/copy.js` | **content-writer** | 八大件**文字**（讲解/参数），纯数据 |
| `src/parts/cpu.js` | **lead** | 范例实现（其他人照抄结构） |
| `src/parts/ram.js` `gpu.js` `storage.js` | **builder-a** | 芯片/颗粒类 |
| `src/parts/motherboard.js` `psu.js` `cooler.js` `case.js` | **builder-b** | 板卡/结构类 |

> **一个文件只有一个作者。** 需要别人文件里的东西，靠 `import`，不要改别人的文件。

---

## 1. 元件模块契约（`src/parts/<id>.js`）

每个元件模块**只导出两样东西**，且必须是**默认导出对象**：

```js
import { createPart } from '../engine/part.js';   // 可选：lead 提供的脚手架

export default {
  id: 'cpu',                 // 必须与文件名一致
  name: '处理器',             // 中文短名（2–4 字，用于左侧列表）
  en: 'CPU',                 // 英文缩写（用于副标题）
  hue: 0xc9a98a,             // 该元件的主色（低饱和，见 §3）
  // 相机机位（关键！决定"多镜头视角变换"）
  // ★ 坐标是【相对本元件原点】的，不是世界坐标。main.js 会自动加上元件在世界里的位置。
  //   所以你只关心"从哪个方向看我自己这个元件"，不用管它被摆在哪。
  focus: {
    from: [2.2, 1.5, 2.6],   // 相机相对元件中心的位置（y 向上）
    look: [0, 0.35, 0],      // 相机看向的点，也是相对元件中心
    fov: 34,                 // 可选，默认 34
  },
  build(kit) { /* 见 §2 */ },
};
```

### `build(kit)` 的返回值

```js
build(kit) {
  const group = new THREE.Group();   // 用它 add 所有网格，坐标原点 = 元件中心
  // ... 建模 ...

  return {
    group,                 // 必需：THREE.Group

    setExplode(t) {},      // 必需：t ∈ [0,1]，0=合拢，1=完全拆解。必须纯函数式地
                           //   由 t 直接算位置（不要累积 dt），这样才能来回擦洗。
    update(elapsed, dt) {},// 可选：每帧调用。elapsed 秒，dt 秒。做持续动画
                           //   （呼吸、闪烁、风扇转动、数据流动）。
    legend: [              // 可选：给 UI 用的"拆解图例"，2–5 条
      { text: '顶盖（IHS）', desc: '把晶片的热传给散热器' },
    ],
  };
}
```

### 硬性要求

1. **只改自己 group 内子物体的 `position/rotation/scale/material`**，不许动相机、灯光、渲染器。
2. **只用 `kit` 提供的材质**（§3），不要自己 `new THREE.MeshStandardMaterial`。
   这样八个元件的质感才是**同一套语言**。
3. **`setExplode(t)` 必须可逆**：反复调用 `setExplode(0) → setExplode(1) → setExplode(0)`
   必须回到原样。**不要在 `setExplode` 里读上次的值做累加。**
4. **`update` 里不要改位置的绝对值**，只做叠加（用 `userData.base` 存基准）。
5. **尺寸约定（分两个状态，2026-10-24 修订）**：
   - **未拆解 `t=0`**：元件整体 ≤ **1.6 × 1.6 × 1.6**（`case` ≤ 2.2）。原点在元件几何中心，
     这一档的形状是"紧凑、完整、像个实物"。
   - **拆解过程中任意 `t`**：最大轴 ≤ **1.8**（`case` ≤ 2.4）。

   > [!note] 为什么拆解态要放宽
   > 原先是"全程 ≤1.6"，但拆解的本质就是把层/颗粒**分开**，CPU 的顶盖一抬就必然更高。
   > 这条约束真正要保证的是**相邻元件不打架**：八个元件沿半径 4.6 的环排列（偶数位 +0.42、
   > 奇数位 −0.42），相邻间距 = 2×4.6×sin(π/8) ≈ **3.52**，而实测拆解态最大轴才 1.74。
   > 所以放宽到 1.8 是安全的，具体数字由 `tools/audit.mjs` 的纯 Node 审计给出
   > （2026-10-24 实测：cpu 1.74 / motherboard 1.64 / psu 1.63，`t=0` 最大 1.53）。
6. **三角面预算**：单个元件 ≤ 60k 三角面（`kit.stats()` 可自查）。参数化阵列要节流。
7. **不许用外部图片/字体/网络资源**（最终要能离线双击打开）。

---

## 2. `kit` 是什么（`src/engine/kit.js`）

```js
build(kit) {
  kit.THREE            // three 命名空间
  kit.mats             // 共享材质库（只读，见 §3）
  kit.mat(name, over)  // 取材质并可选覆盖参数 → 返回材质（内部做了缓存）
  kit.tint(hex, o)     // 以低饱和色生成亚光材质 { rough, metal, emissive, emissiveIntensity }
  kit.glow(hex, i)     // 自发光材质
  kit.box(w,h,d,mat)   // BoxGeometry 网格（已开 castShadow/receiveShadow）
  kit.cyl(rt,rb,h,seg,mat)
  kit.plane(w,h,mat)
  kit.sphere(r,seg,mat)
  kit.pins(n, spacing, mat)      // 一排引脚/触点，返回 Group
  kit.trace(points, radius, mat) // 沿 3D 折线生成走线/热管（CatmullRom + Tube）
  kit.grid(cols, rows, cell, fn) // 二维阵列，fn(x,y,i,j) 返回网格；返回 Group
  kit.dot(x,y,z, mat, size)      // 小球（数据流光子）
  kit.rng(seed)                  // 确定性随机（保证每次打开长得一样）
  kit.damp(cur, target, lambda, dt)  // 帧率无关的平滑插值
  kit.easeInOut(t) kit.easeOut(t) kit.easeIn(t)
  kit.clamp01(t)
  kit.accent(hex, amt)           // 把颜色往该元件 hue 靠 / 调亮度
}
```

用的都是 three 官方 API，签名与 `THREE.*` 一致，**没有魔法**。不确定就看 `src/engine/kit.js` 源码。

---

## 3. 配色（低饱和协调 —— 这是本项目的审美底线）

深石墨底 + 莫兰迪色扇。**所有材质必须是低饱和的**：饱和度大致 ≤ 25%，
亮度集中在 45%–75% 之间，这样八个元件摆在一起是一族的，不是彩虹。

**共享材质库 `kit.mats`（必须优先用这些）：**

| 名字 | 用途 |
|---|---|
| `pcb` | 主板/显卡的电路板（哑光深青灰） |
| `silicon` | 晶片/裸 die（哑光深灰，极弱蓝） |
| `metal` | 铝制外壳、散热鳍片（中性灰，略有金属感） |
| `metalDark` | 深灰结构件、螺丝、支架 |
| `plastic` | 亚光塑料（元件本体、插槽） |
| `plasticDark` | 深色塑料（外壳、风扇框） |
| `copper` | 热管、铜走线（低饱和暖铜） |
| `gold` | 金手指/触点（低饱和，别做成亮黄） |
| `ceramic` | 电容/陶瓷封装（灰米） |
| `glass` | 半透明外壳（透光，用于"剖开看内部"） |
| `rubber` | 风扇脚垫、密封（近黑） |

**八个元件的 `hue`（已定，不要改）：**

| id | hue | 观感 |
|---|---|---|
| `cpu` | `0xc9a98a` | 暖砂 |
| `motherboard` | `0x7fa3a8` | 灰青 |
| `ram` | `0x8fa2be` | 灰蓝 |
| `storage` | `0xa79bb8` | 灰紫 |
| `gpu` | `0x93ae94` | 灰绿 |
| `psu` | `0xbfa089` | 灰赭 |
| `cooler` | `0x9bb2c4` | 灰天 |
| `case` | `0xb5b0a6` | 灰米 |

**用法**：元件主体用中性材质，**hue 只用在"该元件的标识色"上** ——
例如几条强调走线、发光的数据流、被点亮的指示灯、图例色块。
**不要把整个元件染成 hue 色**，那会毁掉协调感。

---

## 4. 内容契约（`src/data/copy.js`，content-writer 负责）

```js
export const copy = {
  cpu: {
    tagline: '一句话说清它是干嘛的（≤ 28 字，会大字显示）',
    principle: [
      '第一段：最核心的原理，3–4 句，说清"它本质在做什么"。',
      '第二段：关键的机制/结构，结合拆解动画里能看到的东西。',
      '第三段：一个反直觉的点，或它为什么这么快/这么设计。',
    ],
    specs: [
      { k: '时钟频率', v: '3.5 GHz' },
      { k: '核心数', v: '8 性能核 + 8 能效核' },
    ],   // 3–5 条，v 要短（≤ 12 字符）
  },
  // ... 八个都要
};
```

**写作要求**：
- 讲**原理**，不是推销。面向"想知道电脑到底怎么工作"的人。
- 术语第一次出现要用一句白话解释（例如"寄存器——CPU 手边那几张小纸条"）。
- 数字要具体、真实、量级正确（不要编造）。不确定就用"约"。
- 不用感叹号，不用"超强/极致/震撼"这类营销词。
- 每段 3–4 句，**总长控制在让面板不出现滚动条**。

---

## 5. 交互模型（lead 实现，所有人需要知道）

- 首屏：8 个元件悬浮在"虚空"中，环绕排布，一次性全部可见。
- **点击某个元件**（或左侧列表项）：
  1. 相机沿平滑曲线飞到该元件的 `focus` 机位（掠过一个弧线，不是直线拉近）；
  2. 该元件 `setExplode` 从 0 → 1（约 1.1 秒，`easeInOut`）；
  3. 其他 7 个淡出到低不透明度并略微缩小；
  4. 右侧面板滑入，显示 name/en/tagline/principle/specs/legend；
  5. 界面强调色切换成该元件的 `hue`。
- **复位**：点击空白处或"返回"按钮 → 回到全景机位，所有元件 `setExplode(0)`。
- **上一个/下一个**：键盘 `←` `→`，以及面板底部按钮。
- 每个元件在"被选中"时 `update` 里的持续动画才加速；未选中时保持极慢的待机动画。
- `prefers-reduced-motion` 时：不做相机飞行，直接切机位。

---

## 6. 本地怎么跑

```powershell
cd "D:\桌面\AI项目\computer-anatomy"
npm run dev          # esbuild 监听打包 → 起本地服务 → 浏览器打开
npm run build        # 产出 dist\电脑八大件.html（单文件，双击即开）
```

临时调试单个元件：`http://127.0.0.1:5180/?part=cpu&t=1` —— 直接跳到该元件且完全拆解。
（`t` 参数用于检查 `setExplode` 的两个端点。）

---

## 7. 自查清单（提交前必须自己过一遍）

- [ ] `node --check src/parts/xxx.js` 语法通过（ESM 用 `node --input-type=module --check`）
- [ ] `setExplode(0)` 与 `setExplode(1)` 都不穿模（部件不要互相插进去）
- [ ] 用 `?part=xxx&t=1` 看过拆解态，用 `?part=xxx&t=0` 看过合拢态
- [ ] 没有用到契约 §3 以外的材质；没有自己 new MeshStandardMaterial
- [ ] 元件尺寸在约定范围内，原点在中心
- [ ] 没有网络请求、没有外部图片