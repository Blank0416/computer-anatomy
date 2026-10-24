/* ============================================================
   gpu.js — 独立显卡（双槽散热）
   拆解：PCB → 比 CPU 大得多的一整块 GPU 晶片（细分成 SM 簇网格）→
         环绕一圈的显存颗粒 → 供电电感排 → 双槽散热器（热管 + 风扇）整体抬起
   动画：SM 阵列上一道波前斜向扫过 + 晶片↔显存的数据流光点 +
         风扇转速随时间转（角度 = 转速 × elapsed，不做累加）
   ============================================================ */

export default {
  id: 'gpu',
  name: '显卡',
  en: 'GPU',
  hue: 0x93ae94,

  // 机位相对本元件原点：距离约 2.44、y = 1.45、约 35° 俯角。
  // 从右前上方看，能同时看到散热器顶面（风扇）、板面显存和左侧的挡板。
  focus: { from: [1.20, 1.45, 1.55], look: [0, 0.06, 0], fov: 34 },

  build(kit) {
    const { THREE } = kit;
    const group = new THREE.Group();
    const hue = 0x93ae94;

    /* ---------- 尺寸 ----------
       显卡本体按一整块 ATX 卡来搭：1 世界单位 ≈ 180mm。
       板平铺在 XZ 平面、+Y 向上，和 CPU 保持一致，方便主程序统一俯视机位。 */
    const PCB_W = 1.50;        // 板长（沿 X，挡板在 -X 端）
    const PCB_T = 0.050;       // 板厚
    const PCB_D = 1.10;        // 板宽（沿 Z，金手指在 -Z 端）
    const yTop = PCB_T / 2;    // 板面 +0.025
    const yBot = -PCB_T / 2;

    /* ---------- 1. PCB 与背板 ---------- */
    group.add(kit.box(PCB_W, PCB_T, PCB_D, kit.mats.pcb));
    // 背板（加强 + 均热），不跟着散热器抬起，只微微下沉让位
    const backplate = kit.box(1.42, 0.016, 0.98, kit.mat('metalDark', { roughness: 0.52, metalness: 0.5 }));
    backplate.position.set(0, -0.033, 0);
    group.add(backplate);
    // 背板四角固定螺丝
    for (const sx of [-0.63, 0.63]) {
      for (const sz of [-0.42, 0.42]) {
        const s = kit.cyl(0.018, 0.018, 0.008, 8, kit.mats.metal);
        s.position.set(sx, -0.043, sz);
        group.add(s);
      }
    }

    /* ---------- 2. PCIe 金手指（板的 -Z 短边，插进主板插槽） ---------- */
    // 连接器条：上表面压在板面以下（0.017 < 0.025），避免和显存颗粒打架
    group.add(kit.box(1.00, 0.045, 0.05, kit.mats.plasticDark).translateX(-0.21).translateY(-0.0055).translateZ(-0.575));
    const padY = -0.032;
    // 金手指触点分两段，中间留出 PCIe 的防呆缺口
    const segL = kit.pins(13, 0.012, kit.mats.gold, { w: 0.010, h: 0.008, d: 0.045 });
    segL.position.set(-0.605, padY, -0.575);
    group.add(segL);
    const segR = kit.pins(65, 0.012, kit.mats.gold, { w: 0.010, h: 0.008, d: 0.045 });
    segR.position.set(-0.116, padY, -0.575);
    group.add(segR);

    /* ---------- 3. 挡板与显示接口（-X 端，拧在机箱上的那一块） ---------- */
    const bracket = kit.box(0.024, 0.22, 1.12, kit.mat('metal', { roughness: 0.42, metalness: 0.55 }));
    bracket.position.set(-0.762, 0.055, 0);
    group.add(bracket);
    // 3 个显示接口开口（HDMI / DP / DP 那三个口）
    for (const z of [-0.30, 0, 0.30]) {
      const port = kit.box(0.030, 0.075, 0.15, kit.mats.plasticDark);
      port.position.set(-0.760, 0.075, z);
      group.add(port);
      const inner = kit.box(0.012, 0.052, 0.12, kit.mat('metalDark', { roughness: 0.7, color: 0x3a3f45 }));
      inner.position.set(-0.752, 0.075, z);
      group.add(inner);
    }
    // 上部散热栅槽
    for (let i = 0; i < 4; i++) {
      const slot = kit.box(0.026, 0.008, 0.10, kit.mats.metalDark);
      slot.position.set(-0.762, 0.118 + i * 0.013, 0.30);
      group.add(slot);
    }

    /* ---------- 4. GPU 晶片本体 ----------
       现实中 GPU 晶片和 CPU 晶片面积差不多；这里刻意做得比 CPU 的
       0.60 × 0.60 大一圈（0.84 × 0.76），是为了让人一眼看出"显卡最贵的
       就是中间这块" —— 教学用的夸张。 */
    const DIE = { x: -0.08, y: 0.0425, z: 0, w: 0.84, h: 0.035, d: 0.76 };
    const dieGroup = new THREE.Group();
    const die = kit.box(DIE.w, DIE.h, DIE.d, kit.mats.silicon);
    die.position.set(DIE.x, DIE.y, DIE.z);
    dieGroup.add(die);
    group.add(dieGroup);

    /* ---------- 5. SM 流处理器阵列（6 × 6 网格） ----------
       真正的 GPU 有几十上百个 SM，这里用 36 个示意；每个 SM 单独一份材质，
       才能让一道波前从阵列上斜着扫过去。 */
    const N = 6;
    const CELL = 0.110;
    const smProto = kit.mat('plasticDark', {
      emissive: new THREE.Color(hue),
      emissiveIntensity: 0.05,
    });
    const sms = [];
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        const mat = smProto.clone();
        const sm = kit.box(0.088, 0.010, 0.088, mat);
        sm.position.set(DIE.x + (i - (N - 1) / 2) * CELL, yTop + 0.040, (j - (N - 1) / 2) * CELL);
        sm.userData.mat = mat;
        sm.userData.wave = (i + j) / (2 * N - 2);   // 斜向波前：左上先亮
        dieGroup.add(sm);
        sms.push(sm);
      }
    }

    /* ---------- 6. L2 缓存环 + 显存控制器接口 ---------- */
    const l2Mat = kit.mat('plasticMid', { roughness: 0.66, metalness: 0.12 });
    for (const sz of [1, -1]) {
      const bar = kit.box(0.78, 0.010, 0.045, l2Mat);
      bar.position.set(DIE.x, yTop + 0.040, sz * 0.355);
      dieGroup.add(bar);
    }
    for (const sx of [1, -1]) {
      const bar = kit.box(0.045, 0.010, 0.72, l2Mat);
      bar.position.set(DIE.x + sx * 0.375, yTop + 0.040, 0);
      dieGroup.add(bar);
    }
    // 晶片边缘的显存控制器接口：坐在晶片和显存之间那条窄缝里
    for (const sz of [1, -1]) {
      for (let k = 0; k < 4; k++) {
        const phy = kit.box(0.05, 0.014, 0.020, kit.mat('metal', { roughness: 0.5, metalness: 0.4 }));
        phy.position.set(DIE.x + (k - 1.5) * 0.12, 0.038, sz * 0.410);
        group.add(phy);
      }
    }

    /* ---------- 7. 显存颗粒 × 12：绕着晶片围一整圈 ----------
       正反两排各 4 颗走在 ±Z，左右两列各 2 颗走在 ±X。
       每颗一份独立材质，数据到达时就亮一下。 */
    const VRAM = { w: 0.115, h: 0.030, d: 0.100, y: 0.040 };
    const vramProto = kit.mat('plasticDark', {
      emissive: new THREE.Color(hue),
      emissiveIntensity: 0.05,
    });
    const dieWinMat = kit.mat('silicon', { roughness: 0.55 });
    const vrams = [];
    // 把一圈的位置和"拆开时往哪个方向让"一次列清楚
    const vramPlan = [];
    for (const x of [-0.32, -0.16, 0.00, 0.16]) {
      vramPlan.push({ x, z: 0.475, ox: 0, oz: 0.16 });
      vramPlan.push({ x, z: -0.475, ox: 0, oz: -0.16 });
    }
    for (const z of [-0.07, 0.07]) {
      vramPlan.push({ x: 0.45, z, ox: 0.10, oz: 0 });
      vramPlan.push({ x: -0.60, z, ox: -0.10, oz: 0 });
    }
    for (let k = 0; k < vramPlan.length; k++) {
      const p = vramPlan[k];
      const mat = vramProto.clone();
      const chip = kit.box(VRAM.w, VRAM.h, VRAM.d, mat);
      chip.position.set(p.x, VRAM.y, p.z);
      chip.userData.base = chip.position.clone();
      chip.userData.off = new THREE.Vector3(p.ox, 0.22, p.oz);
      chip.userData.mat = mat;
      chip.userData.k = k;
      group.add(chip);
      // 封装上开窗的裸 die，和主控那种封装一个味道
      const win = kit.box(0.070, 0.004, 0.060, dieWinMat);
      win.position.set(p.x, VRAM.y + VRAM.h / 2 + 0.002, p.z);
      chip.userData.win = win;
      group.add(win);
      vrams.push(chip);
    }

    /* ---------- 8. 供电电感排（VRM：把 12V 降成 GPU 要的低压大电流） ---------- */
    const vrms = [];
    for (let k = 0; k < 6; k++) {
      const z = -0.36 + k * 0.144;
      const ind = kit.cyl(0.042, 0.042, 0.055, 10, kit.mat('plasticDark', { roughness: 0.72 }));
      ind.position.set(0.62, 0.0525, z);
      group.add(ind);
      const cap = kit.cyl(0.036, 0.036, 0.008, 10, kit.mats.copper);
      cap.position.set(0.62, 0.084, z);
      group.add(cap);
      const fet = kit.box(0.05, 0.022, 0.055, kit.mat('plasticDark', { roughness: 0.6 }));
      fet.position.set(0.55, 0.036, z);
      group.add(fet);
      vrms.push(ind);
    }

    /* ---------- 9. 8pin 外接供电（板 +Z 端，插电源线的地方） ---------- */
    const pwr = kit.box(0.20, 0.10, 0.10, kit.mats.plasticDark);
    pwr.position.set(0.40, 0.075, 0.505);
    group.add(pwr);
    for (const y of [0.065, 0.095]) {
      const p = kit.pins(8, 0.020, kit.mats.gold, { w: 0.011, h: 0.011, d: 0.030 });
      p.position.set(0.40, y, 0.560);
      group.add(p);
    }

    /* ---------- 10. 板边贴片电容（MLCC） ---------- */
    for (let k = 0; k < 8; k++) {
      const c = kit.box(0.014, 0.020, 0.014, kit.mats.ceramic);
      c.position.set(-0.70, 0.035, -0.45 + k * 0.13);
      group.add(c);
    }

    /* ---------- 11. 散热器总成（冷板 / 热管 / 鳍片 / 外壳 / 双风扇） ----------
       整块一起抬起，所以全部挂在 cooler 这个 Group 下。 */
    const cooler = new THREE.Group();

    // 铜冷板：底面 0.076，刚好压在 SM 顶上（0.070）而不穿模
    const coldPlate = kit.box(0.90, 0.024, 0.82, kit.mat('copper', { roughness: 0.35, metalness: 0.75 }));
    coldPlate.position.set(DIE.x, 0.088, 0);
    cooler.add(coldPlate);

    // 4 根铜热管：从冷板里钻出来，穿过鳍片堆，管端要捅到鳍片之外才看得见
    const pipeMat = kit.mat('copper', { roughness: 0.3, metalness: 0.8 });
    for (const sz of [1, -1]) {
      for (const dir of [1, -1]) {
        const pipe = kit.trace([
          [DIE.x, 0.095, sz * 0.20],
          [DIE.x + dir * 0.34, 0.104, sz * 0.22],
          [dir * 0.62, 0.112, sz * 0.24],
          [dir * 0.70, 0.112, sz * 0.24],
        ], 0.028, pipeMat, 20);
        cooler.add(pipe);
      }
    }

    // 鳍片：34 片薄板，用 InstancedMesh 一次性铺开
    const finGeo = kit.box(0.006, 0.10, 0.86, kit.mats.metal).geometry;
    const finCount = 34;
    const fins = new THREE.InstancedMesh(finGeo, kit.mat('metal', { roughness: 0.4, metalness: 0.6 }), finCount);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < finCount; i++) {
      dummy.position.set(-0.62 + i * 0.0376, 0.15, 0);
      dummy.updateMatrix();
      fins.setMatrixAt(i, dummy.matrix);
    }
    fins.castShadow = fins.receiveShadow = true;
    cooler.add(fins);

    // 外壳：顶框（中间一根分隔条分出两个风扇开口）+ 两侧裙板
    const shellMat = kit.mat('plasticDark', { roughness: 0.62 });
    for (const sz of [1, -1]) {
      const bar = kit.box(1.22, 0.014, 0.05, shellMat);
      bar.position.set(0, 0.405, sz * 0.495);
      cooler.add(bar);
    }
    for (const x of [-0.60, -0.06, 0.60]) {
      const bar = kit.box(0.05, 0.014, 1.04, shellMat);
      bar.position.set(x, 0.405, 0);
      cooler.add(bar);
    }
    for (const sz of [1, -1]) {
      // 裙板从 y = 0.24 起，下面的空间留给 +Z 端的 8pin 供电口
      const skirt = kit.box(1.24, 0.17, 0.012, shellMat);
      skirt.position.set(0, 0.325, sz * 0.51);
      cooler.add(skirt);
    }
    // 顶沿的标识色灯条（hue 只用在灯、走线这种强调件上）
    const lightBar = kit.box(1.10, 0.010, 0.040, kit.glow(hue, 0.9));
    lightBar.position.set(0, 0.417, 0.495);
    cooler.add(lightBar);

    // 双风扇：外框不动，桨叶和轮毂挂在 rotor 上整体转
    const rotors = [];
    const fanMat = kit.mat('plasticDark', { roughness: 0.7 });
    const bladeMat = kit.mat('plasticMid', { roughness: 0.55 });
    for (const fx of [-0.34, 0.28]) {
      const frame = new THREE.Mesh(new THREE.TorusGeometry(0.205, 0.022, 8, 20), fanMat);
      frame.rotation.x = Math.PI / 2;
      frame.position.set(fx, 0.34, 0);
      frame.castShadow = frame.receiveShadow = true;
      cooler.add(frame);

      const rotor = new THREE.Group();
      rotor.position.set(fx, 0.34, 0);
      const hub = kit.cyl(0.055, 0.055, 0.05, 12, fanMat);
      rotor.add(hub);
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        const blade = kit.box(0.135, 0.008, 0.055, bladeMat);
        // YXZ：先按 Rx 做出桨叶迎角，再绕 Y 转到这个桨叶的角度上
        blade.rotation.order = 'YXZ';
        blade.rotation.set(0.55, -a, 0);
        blade.position.set(Math.cos(a) * 0.115, 0, Math.sin(a) * 0.115);
        rotor.add(blade);
      }
      cooler.add(rotor);
      rotors.push(rotor);
    }

    group.add(cooler);

    /* ---------- 12. 晶片 ↔ 显存的数据流 ----------
       每个显存一颗光点：从晶片边缘出发，跨过显存控制器，落到颗粒上。
       奇偶决定方向 —— 一半是"取数据"，一半是"写回"。 */
    const flowMat = kit.glow(hue, 2.6);
    const flows = [];
    for (const v of vrams) {
      const b = v.userData.base;
      const isZ = Math.abs(b.z) > 0.30;                    // 这一颗走 ±Z 还是走 ±X
      let pts;
      if (isZ) {
        const sz = Math.sign(b.z);
        pts = [
          [b.x, yTop + 0.037, sz * 0.34],
          [b.x, yTop + 0.045, sz * 0.402],
          [b.x, yTop + 0.032, sz * 0.475],
        ];
      } else {
        const sx = Math.sign(b.x);
        pts = [
          [DIE.x + sx * 0.42, yTop + 0.037, b.z],
          [sx * 0.53, yTop + 0.045, b.z],
          [b.x, yTop + 0.032, b.z],
        ];
      }
      const path = kit.trace(pts, 0.0030, flowMat, 8);
      group.add(path);
      const dot = kit.dot(0, 0, 0, flowMat, 0.014);
      dot.userData.t = (v.userData.k % 4) / 4;
      dot.userData.trace = path;
      dot.userData.rev = v.userData.k % 2 === 1;
      dot.userData.speed = 0.5 + (v.userData.k % 3) * 0.12;
      group.add(dot);
      flows.push(dot);
    }

    /* ---------- 拆解 / 动画 ---------- */
    let explodeT = 0;                 // 只给 update 决定要不要淡出数据流用

    return {
      group,
      legend: [
        { text: 'GPU 晶片', desc: '显卡的大脑，几千个流处理器都刻在这块硅片上' },
        { text: 'SM 流处理器阵列', desc: '画面里每束光、每个像素，都是这些 SM 簇算出来的' },
        { text: '显存颗粒', desc: '把贴图和模型放在 GPU 手边，带宽比内存大得多' },
        { text: '供电电感与 MOSFET', desc: '把主板的 12V 压成 GPU 要的低压大电流' },
        { text: '双槽散热器', desc: '热管把晶片的热搬到鳍片，两个风扇再把热吹出去' },
      ],

      /** t: 0 = 合拢，1 = 完全拆解。纯函数式，反复擦洗都能复原 */
      setExplode(t) {
        explodeT = t;
        const e = kit.easeInOut(t);

        // 散热器最先让开（它罩住的东西最多），抬得也最高
        const ec = kit.easeInOut(kit.clamp01(t / 0.40));
        cooler.position.set(0, 0.80 * ec, -0.10 * ec);
        cooler.rotation.set(-0.10 * ec, 0, 0.06 * ec);

        // 晶片随后抬起
        const ed = kit.clamp01(t / 0.50);
        dieGroup.position.y = 0.16 * ed;

        // 显存最后向外散开：按预存的轴向偏移，绝不读上一帧的值
        const ev = kit.clamp01((t - 0.30) / 0.70);
        for (const v of vrams) {
          const b = v.userData.base;
          const o = v.userData.off;
          v.position.set(b.x + o.x * ev, b.y + o.y * ev, b.z + o.z * ev);
          v.userData.win.position.set(b.x + o.x * ev, b.y + VRAM.h / 2 + 0.002 + o.y * ev, b.z + o.z * ev);
        }

        // 背板微微下沉，露出板面
        backplate.position.y = -0.033 - 0.03 * e;
      },

      /** 持续动画：SM 波前 + 显存点亮 + 风扇转动
       *  位置全部由 setExplode 负责；这里只碰发光、旋转和纯动画光点。 */
      update(elapsed, dt, emphasis = 0) {
        // 波前从阵列左上角斜着扫到右下角
        const phase = (elapsed * 0.32) % 1;
        for (const sm of sms) {
          const d = Math.abs(((phase - sm.userData.wave + 0.5) % 1) - 0.5);
          const spike = Math.max(0, 1 - d * 6);
          sm.userData.mat.emissiveIntensity = 0.05 + spike * (0.85 + emphasis * 0.5);
        }

        // 显存：按序号依次亮一下，读起来就是"数据一颗一颗送到"
        for (const v of vrams) {
          const ph = (elapsed * 0.55 + v.userData.k * 0.083) % 1;
          v.userData.mat.emissiveIntensity = 0.05 + Math.exp(-ph * 9) * (0.7 + emphasis * 0.5);
        }

        // 数据流：光点沿晶片 ↔ 显存的短线来回跑
        for (const f of flows) {
          f.userData.t = (f.userData.t + dt * f.userData.speed * (0.5 + emphasis * 1.1)) % 1;
          const u = f.userData.rev ? 1 - f.userData.t : f.userData.t;
          f.position.copy(kit.pointOn(f.userData.trace, u));
          f.visible = explodeT < 0.6 && Math.min(f.userData.t, 1 - f.userData.t) > 0.06;
        }

        // 风扇：角度直接由 elapsed 算出，不做累加，反复擦洗时间也不会漂
        const rpm = 2.6 + emphasis * 2.2;
        for (const r of rotors) r.rotation.y = elapsed * rpm;
      },
    };
  },
};