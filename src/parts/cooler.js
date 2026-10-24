/* ============================================================
   cooler.js — 散热器（双塔 6 热管风冷，PA120 风格）
   ------------------------------------------------------------
   实物参照（DETAIL-SPEC §8）：
     塔体 125 × 135 × 157mm（含两把 120mm 风扇）
     6 × Ø6mm 烧结热管（每塔 3 根：从底座弯出 → 竖直穿过该塔鳍片 → 管口从塔顶露出）
     每塔 42–53 片 0.4mm 薄铝鳍片，间距 1.8mm，堆高 ~110mm
     40 × 40mm C1100 铜底（镜面接触面 + 镀镍）
     Intel LGA1851 扣具：78 × 78mm 孔距、四颗弹簧螺丝
     两把 120 × 120 × 25mm 风扇（一把在外侧、一把夹在两塔之间）

   ── 坐标与尺寸约定 ──
     局部 +Y = 塔轴：从底座接触面指向鳍片顶
               （layout.js 里那句「局部 y 是底座→鳍片顶那条轴」）
     局部 +X = 两塔排开的方向 = 风扇吹风方向（风穿过鳍片缝）
     局部 +Z = 鳍片进深方向（120mm 那条边）
     原点 = 包围盒中心，底座接触面在 y = -0.6315

   ── 为什么总高是 1.262（不能随便改）──
     layout.js 把散热器钉在世界 X = 0.15 + 0.33 · 局部Y，
     底座落位 = 0.15 - 0.33 · 0.631 = -0.0582，正好压在 cpu 顶盖
     X = -0.0585 上。总高一变，底座就会浮起来或陷进 CPU 里，
     所以这里把接触面固定在 -0.6315、塔顶（含热管口）固定在 +0.6305。

   ── 比例与「可读性放大」（DETAIL-SPEC §0.3 允许 1.5–2×）──
     k = 0.008 场景单位 / mm（125mm 宽 → 1.0，157mm 高 → 1.256）
     0.4mm 鳍片 → 0.0032 已经几乎看不见，这里放大到 0.0055（1.7×）；
     间距同步 1.8mm → 0.0165（1.15×），片数 53（规格 42–53 的上限）。
     薄板一律靠「折边轮廓 + 拉丝贴图」立住，不靠厚度。

   ── 拆解（setExplode）──
     热管留在原地当骨架，两塔向上分开、两把风扇沿各自轴向抽出、
     底座与扣具往下退。所有位移都是 t 的直接函数（无累加，可逆）。
   ============================================================ */

export default {
  id: 'cooler',
  name: '散热器',
  en: 'Cooler',
  hue: 0x9bb2c4,
  // 机位方向：main.js 只取这个向量的方向，距离由展开态包围球反解（FILL 0.62）。
  // 模长仍然给到 2.5 左右，是为了让 tools/place.mjs 的旧公式（它把 from 当距离用）
  // 也判成「留了白」，两边都不报警。
  focus: { from: [1.40, 1.32, 1.60], look: [0, 0.05, 0], fov: 34 },

  build(kit) {
    const { THREE } = kit;
    const D = kit.detail;
    const group = new THREE.Group();

    /* ---------- 0. 尺寸常量 ---------- */
    const Y_BOT = -0.6315;              // 接触面（贴 CPU 顶盖）
    const BASE_W = 0.34;                // 铜底 40mm → 0.32，取 0.34 好压住 IHS
    const MIRROR_T = 0.004;
    const BASE_T = 0.026;
    const Y_BASE_TOP = Y_BOT + MIRROR_T + BASE_T;   // -0.6015

    const FIN_Y0 = -0.28;               // 鳍片堆底（下方留出热管爬升段）
    const FIN_Y1 = 0.58;                // 鳍片堆顶
    const FIN_N = 53;
    const FIN_PITCH = 0.0165;
    const FIN_THICK = 0.0055;
    const FIN_Z = 0.96;                 // 鳍片进深 120mm
    const TOWER_W = 0.40;               // 每塔沿 X 的厚度 50mm
    const TOWER_X = 0.31;               // 两塔中心 x = ±0.31
    const TOWER_FACE = TOWER_X - TOWER_W / 2;       // 0.11 = 塔内侧壁

    const PIPE_R = 0.025;

    const FAN_R = 0.44;                 // 120mm 扇 → 外径 0.946
    const FAN_HALF = 0.50;              // 方形扇框半宽（125mm 含框）
    const FAN_T = 0.20;                 // 扇框厚 25mm
    const FAN_Y = 0.12;                 // 扇心高度（扇比鳍片堆略低，真机也这样）
    const FAN_X = [-0.62, 0];           // 外侧一把 + 两塔之间一把
    const FAN_BAR = 0.055;              // 扇框边宽

    /* ---------- 1. 材质（全部走 kit 缓存 / detail 派生） ---------- */
    const M = {
      fin: D.mat.brushed(0xa9b0b6, { rough: 0.30, metal: 0.82, repeat: 2.6 }),
      finEdge: D.mat.brushed(0x9198a0, { rough: 0.36, metal: 0.78, repeat: 1.4 }),
      steel: D.mat.brushed(0x9aa1a8, { rough: 0.38, metal: 0.76, repeat: 2.0 }),
      copper: kit.mat('copper', { roughness: 0.24, metalness: 0.90 }),
      nickel: kit.mat('metal', { color: 0xd6dade, roughness: 0.07, metalness: 1.0 }),
      pipe: D.mat.brushed(0xcd8a5e, { rough: 0.22, metal: 0.92, repeat: 2.0 }),  // 烧结铜管
      frame: D.mat.grain(0x262b31, { rough: 0.62, bump: 0.55 }),
      blade: kit.mat('plasticMid', { color: 0x5e666e, roughness: 0.52 }),
      rubber: kit.mat('rubber', { color: 0x22262a, roughness: 0.95 }),
      black: kit.mat('plasticDark', { color: 0x15181c, roughness: 0.86 }),
      screw: kit.mat('metalDark', { color: 0x3a3f45, roughness: 0.42, metalness: 0.85 }),
    };

    /** 塔顶冷光装饰线用的共享自发光材质（clone 一份，才能每帧改强度） */
    const glowMat = kit.glow(0x9bb2c4, 0.9).clone();

    /* ---------- 2. 小工具 ---------- */
    const rigs = [];
    /** 登记一个可拆解子组：base 位置 + 抽出方向。setExplode 只做「base + d·e」 */
    const rig = (obj, dx, dy, dz) => {
      obj.userData.base = obj.position.clone();
      rigs.push({ obj, d: new THREE.Vector3(dx, dy, dz) });
      return obj;
    };
    /** 丝印/铭牌贴片（MeshBasicMaterial + 程序化贴图，Node 下 map=null 也不报错） */
    const sticker = (lines, w, h, o = {}) => {
      const tex = D.tex.plate(lines, { w: 512, h: 128, ...o });
      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        opacity: o.opacity ?? 0.66,
        depthWrite: false,
        toneMapped: true,
        side: THREE.DoubleSide,
      });
      return new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    };
    const dummy = new THREE.Object3D();

    /* ---------- 3. 底座：镜面接触面 + 铜底 ---------- */
    const baseGroup = new THREE.Group();
    group.add(baseGroup);

    // 接触面：抛光镀镍薄片（这一面直接压 CPU 顶盖，最亮的一块）
    const mirror = D.parts.cbox(BASE_W - 0.02, MIRROR_T, BASE_W - 0.02, M.nickel, 0.0014, 0.026);
    mirror.position.y = Y_BOT + MIRROR_T / 2;
    baseGroup.add(mirror);

    // 铜底主体：C1100 铜，四周厚倒角（倒角接住一线灯，件就有了重量感）
    const basePlate = D.parts.cbox(BASE_W, BASE_T, BASE_W, M.copper, 0.006, 0.032);
    basePlate.position.y = Y_BOT + MIRROR_T + BASE_T / 2;
    baseGroup.add(basePlate);

    // 铜底顶面：热管压槽（热管从底座里升出来的那几道沟，用压扁的暗槽示意）
    for (const pz of [-0.105, 0, 0.105]) {
      const groove = kit.box(0.22, 0.004, 0.036, M.copper);
      groove.position.set(0, Y_BASE_TOP + 0.001, pz);
      baseGroup.add(groove);
    }
    // 铜底侧面两道铣削台阶（分模线）
    for (const sx of [-1, 1]) {
      const step = kit.box(0.006, 0.010, BASE_W - 0.04, M.nickel);
      step.position.set(sx * (BASE_W / 2 - 0.002), Y_BASE_TOP - 0.012, 0);
      baseGroup.add(step);
    }
    rig(baseGroup, 0, -0.055, 0);

    /* ---------- 4. 扣具：两根横担 + 四颗弹簧螺丝（78mm 孔距） ---------- */
    const mountGroup = new THREE.Group();
    group.add(mountGroup);
    for (const bz of [-0.312, 0.312]) {
      const bar = D.parts.cbox(0.74, 0.020, 0.052, M.steel, 0.004, 0.012);
      bar.position.set(0, -0.575, bz);
      mountGroup.add(bar);
      // 压筋：横担中段压出的一道加强筋
      const rib = kit.box(0.30, 0.011, 0.020, M.steel);
      rib.position.set(0, -0.562, bz);
      mountGroup.add(rib);
      // 横担与铜底之间的两块压块
      for (const bx of [-0.10, 0.10]) {
        const pad = kit.box(0.06, 0.014, 0.048, M.steel);
        pad.position.set(bx, -0.590, bz);
        mountGroup.add(pad);
      }
    }
    // 四颗弹簧螺丝：螺纹柱 → 弹簧三圈 → 圆头 → 十字槽
    for (const sx of [-0.312, 0.312]) {
      for (const sz of [-0.312, 0.312]) {
        const g = new THREE.Group();
        g.position.set(sx, -0.575, sz);
        const post = kit.cyl(0.017, 0.017, 0.070, 10, M.screw);
        post.position.y = -0.020;
        g.add(post);
        const collar = kit.cyl(0.024, 0.024, 0.008, 12, M.screw);
        collar.position.y = 0.016;
        g.add(collar);
        for (let i = 0; i < 3; i++) {
          const coil = kit.cyl(0.031, 0.031, 0.011, 12, M.screw);
          coil.position.y = 0.028 + i * 0.015;
          g.add(coil);
        }
        const head = kit.cyl(0.028, 0.028, 0.017, 12, M.screw);
        head.position.y = 0.086;
        g.add(head);
        for (const a of [0, Math.PI / 2]) {
          const slot = kit.box(0.048, 0.006, 0.008, M.black);
          slot.position.y = 0.095;
          slot.rotation.y = a;
          g.add(slot);
        }
        mountGroup.add(g);
      }
    }
    rig(mountGroup, 0, -0.10, 0);

    /* ---------- 5. 6 根热管（每塔 3 根：底座弯出 → 竖直穿该塔鳍片 → 管口露出） ---------- */
    // 为什么不是「一根管拱过两塔」：两塔之间要塞一把 120mm 风扇，
    // 拱桥会正好从风扇顶框里穿过去（真实散热器也不是这么做的 —— PA120 是
    // 每根管在自己的塔里竖直穿过鳍片，管口从塔顶露出来，所以这里照实物排）。
    // Catmull-Rom 拐角会外扩，所以拐弯处补足采样点压住曲率，
    // 让「竖直段」真的是直的（热管看起来才像管，不像面条）。
    const pipeGroup = new THREE.Group();
    group.add(pipeGroup);
    const pipes = [];
    const PIPE_TIP_Y = 0.598;
    const mkPipe = (pts) => {
      const curve = new THREE.CatmullRomCurve3(
        pts.map((p) => new THREE.Vector3(p[0], p[1], p[2])),
        false,
        'catmullrom',
        0.32,
      );
      // 比 kit.trace 多一圈径向细分：Ø6 的管用 6 边会看出棱
      const geo = new THREE.TubeGeometry(curve, 48, PIPE_R, 9, false);
      const mesh = new THREE.Mesh(geo, M.pipe);
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.userData.curve = curve;
      return mesh;
    };
    for (const side of [-1, 1]) {
      const legs = [0.19, 0.30, 0.41].map((v) => side * v);
      const entries = [0.055, 0.055, 0.055].map((v) => side * v);
      for (let i = 0; i < 3; i++) {
        const L = legs[i];
        const E = entries[i];
        const z = (i - 1) * 0.105;
        const midX = (E + L) / 2;
        const pts = [
          // 从底座里升出来的一小段（藏在铜底里）
          [E, -0.600, z],
          [E, -0.586, z],
          [E, -0.572, z],
          // 90° 向外弯：竖直 → 水平
          [E + side * 0.014, -0.558, z],
          [E + side * 0.036, -0.534, z],
          [E + side * 0.065, -0.517, z],
          // 水平段（走在鳍片堆下方的空档里）
          [midX, -0.512, z],
          // 90° 向上弯：水平 → 竖直
          [L - side * 0.065, -0.517, z],
          [L - side * 0.036, -0.534, z],
          [L - side * 0.014, -0.558, z],
          [L, -0.572, z],
          // 竖直穿过 53 片鳍片
          [L, -0.470, z],
          [L, -0.240, z],
          [L, 0.010, z],
          [L, 0.260, z],
          [L, 0.470, z],
          [L, 0.560, z],
          [L, PIPE_TIP_Y, z],
        ];
        const mesh = mkPipe(pts);
        pipeGroup.add(mesh);
        pipes.push(mesh);
        // 管口封头（烧结管顶端是圆头的，不是切平的）
        const cap = new THREE.Mesh(
          new THREE.SphereGeometry(PIPE_R * 0.96, 10, 6),
          M.pipe,
        );
        cap.position.set(L, PIPE_TIP_Y, z);
        cap.castShadow = true;
        pipeGroup.add(cap);
      }
    }

    /* ---------- 6. 双塔鳍片（InstancedMesh：主板 + 四边折边） ---------- */
    const mkTower = (cx, capLines) => {
      const g = new THREE.Group();
      g.position.x = cx;

      const plateGeo = new THREE.BoxGeometry(TOWER_W, FIN_THICK, FIN_Z);
      const edgeGeoX = new THREE.BoxGeometry(0.011, FIN_THICK * 2.6, FIN_Z);
      const edgeGeoZ = new THREE.BoxGeometry(TOWER_W, FIN_THICK * 2.6, 0.011);
      const plates = new THREE.InstancedMesh(plateGeo, M.fin, FIN_N);
      const eL = new THREE.InstancedMesh(edgeGeoX, M.finEdge, FIN_N);
      const eR = new THREE.InstancedMesh(edgeGeoX, M.finEdge, FIN_N);
      const eF = new THREE.InstancedMesh(edgeGeoZ, M.finEdge, FIN_N);
      const eB = new THREE.InstancedMesh(edgeGeoZ, M.finEdge, FIN_N);
      const all = [plates, eL, eR, eF, eB];
      for (const m of all) {
        m.castShadow = m.receiveShadow = true;
        g.add(m);
      }

      const hw = TOWER_W / 2;
      const hz = FIN_Z / 2;
      for (let i = 0; i < FIN_N; i++) {
        const y = FIN_Y0 + i * FIN_PITCH;
        dummy.position.set(0, y, 0);
        dummy.updateMatrix();
        plates.setMatrixAt(i, dummy.matrix);
        dummy.position.set(-hw + 0.0055, y, 0);
        dummy.updateMatrix();
        eL.setMatrixAt(i, dummy.matrix);
        dummy.position.set(hw - 0.0055, y, 0);
        dummy.updateMatrix();
        eR.setMatrixAt(i, dummy.matrix);
        dummy.position.set(0, y, -hz + 0.0055);
        dummy.updateMatrix();
        eF.setMatrixAt(i, dummy.matrix);
        dummy.position.set(0, y, hz - 0.0055);
        dummy.updateMatrix();
        eB.setMatrixAt(i, dummy.matrix);
      }
      for (const m of all) m.instanceMatrix.needsUpdate = true;

      // 塔顶盖板：把最上面那片折边收口，顺便给一块铭牌
      const cap = D.parts.cbox(TOWER_W + 0.008, 0.016, FIN_Z + 0.010, M.steel, 0.004, 0.016);
      cap.position.y = FIN_Y1 + 0.012;
      g.add(cap);
      const name = sticker(capLines, 0.30, 0.085, { ink: '#cfd4d8', opacity: 0.5 });
      name.rotation.x = -Math.PI / 2;
      name.position.set(0, FIN_Y1 + 0.0212, 0);
      g.add(name);

      // 盖板两端的压紧螺丝
      for (const bx of [-TOWER_W / 2 + 0.045, TOWER_W / 2 - 0.045]) {
        const sc = D.parts.screw(0.020, 0.010, M.screw);
        sc.position.set(bx, FIN_Y1 + 0.0225, FIN_Z / 2 - 0.055);
        g.add(sc);
      }

      // 盖板前沿的一条冷光装饰线（全案的灯语：hue = 0x9bb2c4）
      const accent = kit.box(0.30, 0.005, 0.010, glowMat);
      accent.position.set(0, FIN_Y1 + 0.0195, -FIN_Z / 2 + 0.030);
      g.add(accent);

      // 塔底两块小压板（真实散热器底部有压住鳍片叠的钢片）
      for (const bx of [-TOWER_W / 2 + 0.02, TOWER_W / 2 - 0.02]) {
        const clamp = kit.box(0.020, 0.012, FIN_Z - 0.02, M.steel);
        clamp.position.set(bx, FIN_Y0 - 0.008, 0);
        g.add(clamp);
      }

      group.add(g);
      return g;
    };

    const towerA = mkTower(-TOWER_X, ['DUAL TOWER 120', '6 ×  Ø6  HEAT PIPE']);
    const towerB = mkTower(TOWER_X, ['0.4mm FIN  ·  1.8mm PITCH', '53 PLATES  /  TOWER']);
    rig(towerA, -0.10, 0.13, 0);
    rig(towerB, 0.10, 0.13, 0);

    // 塔身外侧的铭牌：贴在塔 B 的 +X 外表面（正是默认机位能看到的那一面）
    const plateBack = kit.box(0.007, 0.130, 0.360, M.steel);
    plateBack.position.set(TOWER_W / 2 + 0.0035, 0.18, 0);
    towerB.add(plateBack);
    const nameplate = sticker(['PA-120', 'DUAL TOWER  ·  6 HEAT PIPE'], 0.34, 0.11, {
      ink: '#e8ecef', opacity: 0.6,
    });
    nameplate.rotation.y = Math.PI / 2;
    nameplate.position.set(TOWER_W / 2 + 0.0075, 0.18, 0);
    towerB.add(nameplate);

    /* ---------- 7. 两把 120mm 风扇（真弧叶片 + 方形扇框 + 减震垫） ---------- */
    const rotors = [];
    const fanGroup = new THREE.Group();
    group.add(fanGroup);

    const mkFan = (cx, idx) => {
      const assembly = new THREE.Group();
      assembly.position.set(cx, FAN_Y, 0);

      // D.parts.fan 的轴 = 局部 Y，叶片是锥筒带（真弧面）；
      // 这里把整把扇装进 holder，绕 Z 转 -90° 让轴变成 ±X（风沿 X 吹过鳍片）
      const holder = new THREE.Group();
      holder.rotation.z = -Math.PI / 2;
      assembly.add(holder);

      const f = D.parts.fan({
        r: FAN_R,
        blades: 9,
        hubR: 0.078,
        thick: FAN_T * 0.80,
        frameMat: M.frame,
        bladeMat: M.blade,
      });
      holder.add(f.group);
      // D.parts.fan 的叶片倾角是常数 0.62rad，Ø120 的扇上会沿轴扫出 ±0.25，
      // 比 25mm 厚的扇框还厚 —— 在转子上做一次**轴向压扁**（0.42×）把叶面
      // 收回扇框里：径向尺寸不变、看上去更像真扇（典型叶尖角 15–20°），
      // 也不改 detail.js（那是全案共用的工具）。
      f.rotor.scale.set(1, 0.42, 1);
      f.rotor.userData.rpm = 9.5 + idx * 0.7;
      rotors.push(f.rotor);

      // 方形扇框：长边沿 Y/Z，厚度沿风扇轴（局部 Y）
      const barOff = FAN_HALF - FAN_BAR / 2;
      for (const sz of [-1, 1]) {
        const bar = kit.box(FAN_HALF * 2, FAN_T, FAN_BAR, M.frame);
        bar.position.set(0, 0, sz * barOff);
        holder.add(bar);
      }
      for (const sx of [-1, 1]) {
        const bar = kit.box(FAN_BAR, FAN_T, (FAN_HALF - FAN_BAR) * 2, M.frame);
        bar.position.set(sx * barOff, 0, 0);
        holder.add(bar);
      }

      // 四角：减震垫（两面）+ 固定螺丝
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          const px = sx * barOff;
          const pz = sz * barOff;
          for (const sy of [-1, 1]) {
            const pad = kit.box(0.070, 0.018, 0.070, M.rubber);
            pad.position.set(px, sy * (FAN_T / 2 + 0.004), pz);
            holder.add(pad);
          }
          const screw = D.parts.screw(0.026, 0.012, M.screw);
          // 螺丝放在扇框外侧（局部 -Y → 旋转后朝 -X，也就是整机里朝镜头那面）
          screw.position.set(px, -(FAN_T / 2 + 0.016), pz);
          holder.add(screw);
        }
      }

      // 轮毂贴纸：同样朝外侧，观众才看得见
      // （转子在轴向上被压扁到 0.42×，所以轮毂正面在 -0.0242，贴纸就贴在它前面）
      const badge = sticker(['120  PWM', '9  BLADE'], 0.11, 0.048, { ink: '#9fb6c6', opacity: 0.55 });
      badge.rotation.x = Math.PI / 2;
      badge.position.y = -0.0265;
      holder.add(badge);

      // 风扇固定钢条：两根竖条卡在扇框两侧，两头折出 90° 的卡爪抓住鳍片边缘
      // （assembly 空间里 +X = 风扇轴方向 = 朝塔/朝外，和模型 X 同向）
      const inward = cx <= 0 ? 1 : 1;   // 外侧扇与中间扇都是「往 +X 那边」够向鳍片塔
      for (const sz of [-1, 1]) {
        const strapZ = sz * (FAN_HALF + 0.010);
        const strap = D.parts.cbox(0.016, FAN_HALF * 2 - 0.06, 0.024, M.steel, 0.003, 0.008);
        strap.position.set(0, 0, strapZ);
        assembly.add(strap);
        // 上下两道卡爪：从钢条往塔的方向折出，末端压到鳍片折边上
        for (const sy of [-1, 1]) {
          const hook = kit.box(0.135, 0.020, 0.020, M.steel);
          hook.position.set(inward * 0.072, sy * (FAN_HALF - 0.085), strapZ);
          assembly.add(hook);
        }
      }

      fanGroup.add(assembly);
      return assembly;
    };

    const fanOuter = mkFan(FAN_X[0], 0);
    const fanMid = mkFan(FAN_X[1], 1);
    rig(fanOuter, -0.26, 0, 0);
    rig(fanMid, 0, 0, 0.24);

    /* ---------- 7b. 风扇线束 + PWM 插头（真实装机里最容易被忘掉的一点点） ---------- */
    const cableGroup = new THREE.Group();
    group.add(cableGroup);
    for (const [cx, dir] of [[FAN_X[0], -1], [FAN_X[1], 1]]) {
      // 从扇框下沿引出的一束扁线，往下垂一段再收进一个黑色插头
      const path = [
        [cx + dir * 0.02, FAN_Y - FAN_HALF + 0.03, -0.30],
        [cx + dir * 0.05, FAN_Y - FAN_HALF - 0.05, -0.33],
        [cx + dir * 0.06, FAN_Y - FAN_HALF - 0.14, -0.36],
        [cx + dir * 0.05, FAN_Y - FAN_HALF - 0.20, -0.40],
      ];
      const curve = new THREE.CatmullRomCurve3(
        path.map((p) => new THREE.Vector3(p[0], p[1], p[2])), false, 'catmullrom', 0.4,
      );
      const cable = new THREE.Mesh(new THREE.TubeGeometry(curve, 18, 0.009, 5, false), M.black);
      cable.castShadow = true;
      cableGroup.add(cable);
      // 线束根部的小卡扣
      const clip = kit.box(0.030, 0.026, 0.016, M.black);
      clip.position.set(cx + dir * 0.02, FAN_Y - FAN_HALF + 0.02, -0.30);
      cableGroup.add(clip);
      // PWM 插头（4pin 母头）
      const plug = kit.box(0.040, 0.030, 0.026, M.black);
      plug.position.set(cx + dir * 0.05, FAN_Y - FAN_HALF - 0.225, -0.41);
      cableGroup.add(plug);
      const pins = kit.box(0.030, 0.008, 0.020, kit.mats.gold);
      pins.position.set(cx + dir * 0.05, FAN_Y - FAN_HALF - 0.238, -0.41);
      cableGroup.add(pins);
    }

    /* ---------- 8. 热流光子：沿 6 根热管从底座爬到塔顶（热→冷） ---------- */
    const flowGroup = new THREE.Group();
    group.add(flowGroup);
    const HOT = new THREE.Color(0xd9a077);
    const COLD = new THREE.Color(0x8fb4c6);
    const dotGeo = new THREE.SphereGeometry(0.020, 7, 5);
    const dots = [];
    for (const pipe of pipes) {
      for (let k = 0; k < 2; k++) {
        const mat = kit.glow(0xd9a077, 1.8).clone();
        const dot = new THREE.Mesh(dotGeo, mat);
        dot.userData.pipe = pipe;
        dot.userData.phase = k * 0.5 + 0.03;
        dot.userData.spd = 0.105;
        flowGroup.add(dot);
        dots.push(dot);
      }
    }

    /* ---------- 9. 拆解 / 每帧 / 图例 ---------- */
    function setExplode(t) {
      const e = kit.easeInOut(kit.clamp01(t));
      for (const r of rigs) {
        const b = r.obj.userData.base;
        r.obj.position.set(b.x + r.d.x * e, b.y + r.d.y * e, b.z + r.d.z * e);
      }
    }

    function update(elapsed, dt, emphasis = 0) {
      const boost = 1 + emphasis * 0.5;
      // 风扇转速：elapsed 的纯函数（不累加 dt，拆解后继续转也一致）
      for (const r of rotors) r.rotation.y = elapsed * r.userData.rpm;
      // 塔顶冷光装饰线：同样只由 elapsed 决定，纯函数
      glowMat.emissiveIntensity = (0.62 + 0.26 * Math.sin(elapsed * 1.4)) * boost;
      // 热流：u 只由 elapsed + 相位决定；颜色从暖铜色渐变到冷铝色
      for (const d of dots) {
        const u = (elapsed * d.userData.spd + d.userData.phase) % 1;
        d.position.copy(kit.pointOn(d.userData.pipe, u));
        const m = d.material;
        m.color.copy(HOT).lerp(COLD, u);
        m.emissive.copy(HOT).lerp(COLD, u);
        m.emissiveIntensity = (2.0 - u * 1.4) * boost;
        d.scale.setScalar(0.82 + (1 - u) * 0.34);
      }
    }

    setExplode(0);

    const legend = [
      { text: '底座（接触面）', desc: '抛光铜底压在顶盖上，这里把热「吸」出来' },
      { text: '热管 × 6', desc: '管里液体受热蒸发往上跑，蒸气到塔顶冷凝再回流' },
      { text: '鳍片阵列', desc: '每塔 53 片 0.4mm 薄铝，把热摊成一大片面积' },
      { text: '风扇 × 2', desc: '把空气推过鳍片缝 —— 它只负责散热链的最后一步' },
      { text: '扣具', desc: '78mm 孔距四颗弹簧螺丝，让底座压力均匀' },
    ];

    return { group, setExplode, update, legend };
  },
};
