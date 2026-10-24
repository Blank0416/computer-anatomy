/* ============================================================
   cpu.js — 处理器（范例实现，其他人照这个结构写）
   拆解：基板 → 晶片 → 核心阵列 → 顶盖掀开 / 触点落下
   动画：一道"取指—执行"波前斜着扫过 16 个核心
   ============================================================ */

export default {
  id: 'cpu',
  name: '处理器',
  en: 'CPU',
  hue: 0xc9a98a,

  // 机位相对本元件原点（main.js 会加上元件在世界里的位置）
  focus: { from: [1.55, 1.15, 1.95], look: [0, 0.30, 0], fov: 32 },

  build(kit) {
    const { THREE } = kit;
    const group = new THREE.Group();
    const hue = 0xc9a98a;

    /* ---------- 尺寸 ---------- */
    const SUB = 1.14;      // 基板边长
    const SUB_T = 0.062;   // 基板厚
    const DIE = 0.60;      // 晶片边长
    const DIE_T = 0.028;   // 晶片厚
    const IHS = 0.94;      // 顶盖边长
    const IHS_T = 0.085;   // 顶盖厚

    // 垂直站位（y）
    const ySub = 0;
    const yDie = SUB_T / 2 + DIE_T / 2 + 0.004;
    const yIhs = SUB_T / 2 + DIE_T + IHS_T / 2 + 0.012;
    const yPin = -SUB_T / 2 - 0.016;

    /* ---------- 1. 基板（绿色 PCB 换成低饱和青灰） ---------- */
    const sub = kit.box(SUB, SUB_T, SUB, kit.mats.pcb);
    sub.position.y = ySub;
    group.add(sub);

    // 基板四周的微小元件（电容/电阻），让它像个真东西
    const rng = kit.rng(20261024);
    for (let i = 0; i < 22; i++) {
      const side = i % 4;
      const along = (rng() - 0.5) * (SUB - 0.16);
      const off = (SUB / 2 - 0.045) * (side < 2 ? 1 : -1);
      const w = 0.026 + rng() * 0.02;
      const h = 0.018 + rng() * 0.012;
      const len = 0.05 + rng() * 0.03;
      const c = kit.box(
        side < 2 ? len : w, h, side < 2 ? w : len,
        rng() > 0.55 ? kit.mats.plasticMid : kit.mats.ceramic
      );
      c.position.set(side < 2 ? along : off, SUB_T / 2 + h / 2, side < 2 ? off : along);
      group.add(c);
    }

    // 基板顶面上的细走线（元件标识色，只用在少量强调上）
    const traceMat = kit.glow(hue, 0.35);
    for (let k = 0; k < 6; k++) {
      const ang = (k / 6) * Math.PI * 2 + 0.3;
      const r0 = DIE / 2 + 0.03;
      const r1 = SUB / 2 - 0.06;
      const t = kit.trace([
        [Math.cos(ang) * r0, SUB_T / 2 + 0.004, Math.sin(ang) * r0],
        [Math.cos(ang + 0.25) * (r0 + r1) / 2, SUB_T / 2 + 0.004, Math.sin(ang + 0.25) * (r0 + r1) / 2],
        [Math.cos(ang + 0.1) * r1, SUB_T / 2 + 0.004, Math.sin(ang + 0.1) * r1],
      ], 0.006, traceMat, 18);
      group.add(t);
    }

    /* ---------- 2. 晶片（die）：核心阵列 + 缓存条 ---------- */
    const die = new THREE.Group();
    die.position.y = yDie;
    group.add(die);

    const dieBase = kit.box(DIE, DIE_T, DIE, kit.mats.silicon);
    die.add(dieBase);

    // 16 个核心，4×4。每个核心一份独立材质，才能做波前扫过。
    const N = 4;
    const cell = DIE / N;          // 0.15
    const coreW = cell * 0.60;
    const cores = [];
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const coreMat = new THREE.MeshStandardMaterial({
          color: new THREE.Color(kit.accent(hue, -0.12)),
          emissive: new THREE.Color(hue),
          emissiveIntensity: 0.06,
          roughness: 0.42, metalness: 0.18,
        });
        const m = kit.box(coreW, 0.012, coreW, coreMat);
        const x = (i - (N - 1) / 2) * cell;
        const z = (j - (N - 1) / 2) * cell;
        m.position.set(x, DIE_T / 2 + 0.006, z);
        m.userData.base = new THREE.Vector3(x, DIE_T / 2 + 0.006, z);
        m.userData.wave = (i + j) / (2 * N - 2);      // 0..1 波前相位
        m.userData.coreMat = coreMat;
        die.add(m);
        cores.push(m);
      }
    }

    // 核心之间的 L3 缓存条：夹在核心行/列之间
    const cacheBar = (w, d, x, z) => {
      const b = kit.box(w, 0.010, d, kit.mats.plasticDark);
      b.position.set(x, DIE_T / 2 + 0.005, z);
      b.userData.base = b.position.clone();
      die.add(b);
      return b;
    };
    const bars = [];
    for (let j = 0; j < N - 1; j++) {
      const z = (j - (N - 1) / 2 + 0.5) * cell;
      bars.push(cacheBar(DIE * 0.92, cell * 0.12, 0, z));
    }
    for (let i = 0; i < N - 1; i++) {
      const x = (i - (N - 1) / 2 + 0.5) * cell;
      bars.push(cacheBar(cell * 0.12, DIE * 0.92, x, 0));
    }

    // 晶片边缘的内存控制器 / I/O 环
    const ioMat = kit.tint(hue, { rough: 0.5, metal: 0.3 });
    const ioBlocks = [];
    for (let k = 0; k < 4; k++) {
      const b = kit.box(k % 2 ? DIE * 0.20 : DIE * 0.74, 0.016, k % 2 ? DIE * 0.74 : DIE * 0.20, ioMat);
      const s = DIE / 2 - 0.055;
      if (k === 0) b.position.set(0, DIE_T / 2 + 0.008, s);
      if (k === 1) b.position.set(s, DIE_T / 2 + 0.008, 0);
      if (k === 2) b.position.set(0, DIE_T / 2 + 0.008, -s);
      if (k === 3) b.position.set(-s, DIE_T / 2 + 0.008, 0);
      b.userData.base = b.position.clone();
      die.add(b);
      ioBlocks.push(b);
    }

    /* ---------- 3. 顶盖 IHS + 底部触点 ---------- */
    const ihs = new THREE.Group();
    group.add(ihs);

    const ihsPlate = kit.box(IHS, IHS_T, IHS, kit.mats.metal);
    ihsPlate.position.y = yIhs;
    ihs.add(ihsPlate);

    // 顶盖四周的斜边（用四根细条示意倒角，比真做 bevel 便宜）
    const rimMat = kit.mat('metal', { roughness: 0.34, metalness: 0.9, color: 0xb4bac0 });
    for (let k = 0; k < 4; k++) {
      const e = kit.box(k % 2 ? 0.03 : IHS, 0.018, k % 2 ? IHS : 0.03, rimMat);
      e.position.set(
        k % 2 ? (k === 1 ? IHS / 2 - 0.012 : -IHS / 2 + 0.012) : 0,
        yIhs + IHS_T / 2 - 0.006,
        k % 2 ? 0 : (k === 0 ? IHS / 2 - 0.012 : -IHS / 2 + 0.012)
      );
      ihs.add(e);
    }

    // 顶盖上的激光刻字位（一块拉丝区，不写具体字，避免贴图）
    const etch = kit.box(IHS * 0.52, 0.004, IHS * 0.20, kit.mat('metal', { roughness: 0.28, metalness: 0.95, color: 0x8d939a }));
    etch.position.set(-IHS * 0.16, yIhs + IHS_T / 2 + 0.002, 0);
    ihs.add(etch);

    // 触点阵列（底面），用 InstancedMesh 控制面数
    const pinRows = 14;
    const pinGroup = kit.pins(pinRows * pinRows, 1, kit.mats.gold, { w: 0.022, h: 0.012, d: 0.022 });
    // pins 只做了一排，这里自己铺成面阵
    pinGroup.clear();
    {
      const spacing = (SUB - 0.16) / (pinRows - 1);
      const geo = new THREE.BoxGeometry(0.024, 0.012, 0.024);
      const inst = new THREE.InstancedMesh(geo, kit.mats.gold, pinRows * pinRows);
      const m4 = new THREE.Matrix4();
      let n = 0;
      for (let j = 0; j < pinRows; j++) {
        for (let i = 0; i < pinRows; i++) {
          m4.makeTranslation(
            (i - (pinRows - 1) / 2) * spacing,
            yPin,
            (j - (pinRows - 1) / 2) * spacing
          );
          inst.setMatrixAt(n++, m4);
        }
      }
      inst.instanceMatrix.needsUpdate = true;
      inst.castShadow = true;
      pinGroup.add(inst);
      pinGroup.userData.baseY = yPin;
    }
    group.add(pinGroup);

    /* ---------- 4. 数据流光点（沿核心阵列流动） ---------- */
    const flowMat = kit.glow(hue, 2.2);
    const flows = [];
    for (let k = 0; k < 7; k++) {
      const d = new THREE.Mesh(new THREE.SphereGeometry(0.017, 8, 6), flowMat);
      d.userData.t = k / 7;
      d.userData.lane = k % 4;
      d.userData.speed = 0.16 + (k % 3) * 0.05;
      die.add(d);
      flows.push(d);
    }

    /* ---------- 基准位（用于 explode 复原） ---------- */
    const base = {
      ihsY: yIhs,
      dieY: yDie,
      pinY: yPin,
    };

    /* ---------- 拆解 / 动画 ---------- */
    return {
      group,
      legend: [
        { text: '顶盖 IHS', desc: '把晶片的热量摊开传给散热器' },
        { text: '晶片 Die', desc: '真正的硅，电路刻在这上面' },
        { text: '核心阵列', desc: '16 个独立运算单元并排工作' },
        { text: '基板与触点', desc: '上千个触点把信号送到主板' },
      ],

      /** t: 0 = 合拢，1 = 完全拆解。纯函数，可来回擦洗 */
      setExplode(t) {
        const e = kit.easeInOut(t);

        // 顶盖：抬起并侧移、微转
        ihs.position.set(-0.22 * e, (base.ihsY + 0.82) * e, 0);
        ihs.rotation.z = -0.10 * e;
        ihs.rotation.y = 0.16 * e;

        // 晶片：抬起来一点，露出下面的基板走线
        die.position.y = base.dieY + 0.30 * e;

        // 核心：各自向上浮起并散开（越靠外的浮得越高，像爆炸图）
        for (const c of cores) {
          const b = c.userData.base;
          const rad = Math.hypot(b.x, b.z) / (DIE * 0.5);
          const lift = 0.10 + rad * 0.16;
          c.position.set(
            b.x * (1 + 0.26 * e),
            b.y + lift * e,
            b.z * (1 + 0.26 * e)
          );
          c.rotation.y = 0.35 * e * (b.x >= 0 ? 1 : -1);
        }

        // 缓存条：横向拉开一点
        for (const b of bars) {
          const bb = b.userData.base;
          b.position.set(bb.x * (1 + 0.18 * e), bb.y + 0.055 * e, bb.z * (1 + 0.18 * e));
        }

        // I/O 环：向外推出
        for (const b of ioBlocks) {
          const bb = b.userData.base;
          b.position.set(bb.x * (1 + 0.34 * e), bb.y + 0.032 * e, bb.z * (1 + 0.34 * e));
        }

        // 触点：向下降落
        pinGroup.position.y = -0.55 * e;
      },

      /** 持续动画：斜向"取指—执行"波前扫过核心 + 数据流光子
       *  注意：位置一律由 setExplode 负责，这里只改发射光和光点位置。 */
      update(elapsed, dt, emphasis = 0) {
        // 波前：沿 (i+j) 对角方向扫，约 2.4 秒一轮
        const phase = (elapsed * 0.42) % 1;
        for (const c of cores) {
          const d = Math.abs(c.userData.wave - phase);
          const w = Math.max(0, 1 - Math.min(d, 1 - d) * 7);   // 窄尖峰
          const idle = 0.06 + emphasis * 0.06;
          c.userData.coreMat.emissiveIntensity = idle + w * (0.85 + emphasis * 0.8);
        }

        // 数据流：光点沿核心阵列上方的总线单向跑
        for (const f of flows) {
          f.userData.t = (f.userData.t + dt * f.userData.speed * (0.55 + emphasis * 0.9)) % 1;
          const tt = f.userData.t;
          const span = DIE * 0.92;
          f.position.set(
            -span / 2 + tt * span,
            DIE_T / 2 + 0.055,
            (f.userData.lane - 1.5) * (DIE / 4)
          );
          // 两端淡出，避免光点"凭空出现/消失"
          const edge = Math.min(tt, 1 - tt);
          flowMat.opacity = 1;
          f.visible = edge > 0.06;
        }
      },
    };
  },
};