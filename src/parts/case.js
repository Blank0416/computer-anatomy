/* ============================================================
   case.js — 机箱
   拆解：外框 → 侧板 → 前面板（进风）→ 顶板 / 背板（出风）
        → 主板托盘（理线位）→ 硬盘架 → 电源仓
   动画：风道。冷空气从前面和下面进来，被元件加热后变轻，顺着
        顶部和后部排出去 —— 这是机箱唯一的原理，也是它为什么长这样。
   ============================================================ */

export default {
  id: 'case',
  name: '机箱',
  en: 'Case',
  hue: 0xb5b0a6,

  // 机箱天生比别的件大，模型里再整体等比收到 0.70（见文件末"整体缩放"），
  // 收完折算到环上的世界包围盒约 1.32×1.29×0.84 —— 不再压垮"八件等重"的构图。
  // 机位按同一比例一起收，画面构图和设计时保持一致。
  focus: { from: [1.46, 1.32, 1.55], look: [-0.01, 0.03, 0.01], fov: 36 },

  build(kit) {
    const { THREE } = kit;
    const group = new THREE.Group();
    const hue = 0xb5b0a6;

    /* ---------- 尺寸（中塔机箱：宽 0.94 / 高 1.82 / 深 1.72） ---------- */
    const HX = 0.47;     // x 半宽（左 = 主板托盘侧，右 = 玻璃侧板）
    const HY = 0.91;     // y 半高
    const HZ = 0.86;     // z 半深（-z = 前面，+z = 后面）
    const BEAM = 0.028;  // 框架钢梁厚度
    const SCALE = 0.70;  // 整体等比缩放：机箱在环上要和其他七件"等重"

    /* ---------- 可拆解子系统登记表 ---------- */
    const rigs = [];
    const rig = (g, dx, dy, dz) => {
      g.userData.base = g.position.clone();
      rigs.push({ g, d: new THREE.Vector3(dx, dy, dz) });
      return g;
    };

    const beamMat = kit.mat('metalDark', { roughness: 0.56, metalness: 0.6 });
    const beamMat2 = kit.mat('metalDark', { roughness: 0.5, metalness: 0.66, color: 0x4a5057 });

    /* ============================================================
       1. 外框：12 根钢梁焊成的笼子
       机箱的所有强度都在这个框上 —— 侧板顶板其实只是"挡板"。
       ============================================================ */
    const frameG = new THREE.Group();
    group.add(frameG);

    // 4 根立柱
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const v = kit.box(BEAM, HY * 2, BEAM, beamMat);
      v.position.set(sx * (HX - BEAM / 2), 0, sz * (HZ - BEAM / 2));
      frameG.add(v);
    }
    // 上下各 4 根横梁
    for (const sy of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const r = kit.box(BEAM, BEAM, HZ * 2, beamMat);
        r.position.set(sz * (HX - BEAM / 2), sy * (HY - BEAM / 2), 0);
        frameG.add(r);
      }
      for (const sx of [-1, 1]) {
        const r = kit.box(HX * 2, BEAM, BEAM, beamMat);
        r.position.set(0, sy * (HY - BEAM / 2), sx * (HZ - BEAM / 2));
        frameG.add(r);
      }
    }
    // 四只橡胶脚垫（让机箱离地，底部电源才有进气空间）
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const foot = kit.cyl(0.045, 0.045, 0.020, 10, kit.mats.rubber);
      foot.position.set(sx * (HX - 0.10), -HY + 0.012, sz * (HZ - 0.10));
      frameG.add(foot);
    }
    // 机箱内部的走线横梁（电源线、风扇线都从这里捆）
    const tie = kit.box(HX * 2 - 0.10, 0.020, 0.020, beamMat2);
    tie.position.set(0, 0.62, -0.74);
    frameG.add(tie);

    /* ============================================================
       2. 侧板：钢化玻璃，能直接看到里面的风道
       ============================================================ */
    const glassG = new THREE.Group();
    group.add(glassG);
    rig(glassG, 0.34, 0, 0);
    {
      const panel = kit.box(0.010, HY * 2 - 0.08, HZ * 2 - 0.16, kit.mats.glass);
      panel.position.set(HX + 0.010, 0, 0);
      glassG.add(panel);
      // 四角的手拧螺丝
      for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
        const sc = kit.cyl(0.024, 0.024, 0.016, 8, kit.mats.metal);
        sc.rotation.z = Math.PI / 2;
        sc.position.set(HX + 0.028, sy * (HY - 0.10), sz * (HZ - 0.10));
        glassG.add(sc);
      }
    }

    /* ============================================================
       3. 前面板：进风口
       冷空气从这里被抽进来 —— 所以前面板一定要"漏"，不能是块实心板。
       ============================================================ */
    const frontG = new THREE.Group();
    group.add(frontG);
    rig(frontG, 0, 0.02, -0.20);
    {
      const z = -HZ - 0.005;
      // 外框四边
      for (const [w, h, px, py] of [[HX * 2, 0.06, 0, HY - 0.03], [HX * 2, 0.06, 0, -HY + 0.03], [0.06, HY * 2, -HX + 0.03, 0], [0.06, HY * 2, HX - 0.03, 0]]) {
        const b = kit.box(w, h, 0.030, beamMat);
        b.position.set(px, py, z);
        frontG.add(b);
      }
      // 进风栅格：18 条横片，风就从缝里进去
      const geo = new THREE.BoxGeometry(HX * 2 - 0.16, 0.020, 0.024);
      const slats = new THREE.InstancedMesh(geo, beamMat2, 18);
      const m4 = new THREE.Matrix4();
      for (let i = 0; i < 18; i++) slats.setMatrixAt(i, m4.makeTranslation(0, -0.76 + i * 0.0835, z));
      slats.instanceMatrix.needsUpdate = true;
      slats.castShadow = true;
      frontG.add(slats);
      // 内侧的防尘网：风要进来，灰得留下（两层交叉的细条，缝里还能看见箱内）
      const meshMat = kit.mat('plasticMid', { roughness: 0.88, metalness: 0.02, color: 0x4a5158 });
      const hGeo = new THREE.BoxGeometry(HX * 2 - 0.22, 0.006, 0.012);
      const hMesh = new THREE.InstancedMesh(hGeo, meshMat, 14);
      for (let i = 0; i < 14; i++) hMesh.setMatrixAt(i, m4.makeTranslation(0, -0.72 + i * 0.111, z + 0.030));
      hMesh.instanceMatrix.needsUpdate = true;
      frontG.add(hMesh);
      const vGeo = new THREE.BoxGeometry(0.006, HY * 2 - 0.30, 0.012);
      const vMesh = new THREE.InstancedMesh(vGeo, meshMat, 8);
      for (let i = 0; i < 8; i++) vMesh.setMatrixAt(i, m4.makeTranslation(-0.34 + i * 0.097, 0, z + 0.024));
      vMesh.instanceMatrix.needsUpdate = true;
      frontG.add(vMesh);
      // 顶部的开机键和指示灯
      const io = kit.box(HX * 2 - 0.28, 0.075, 0.035, kit.mat('plasticDark', { roughness: 0.75 }));
      io.position.set(0, 0.78, z - 0.010);
      frontG.add(io);
      const btn = kit.cyl(0.028, 0.028, 0.014, 12, kit.mat('metal', { roughness: 0.35, metalness: 0.85 }));
      btn.rotation.x = Math.PI / 2;
      btn.position.set(0.22, 0.78, z - 0.030);
      frontG.add(btn);
      const power = kit.dot(-0.16, 0.78, z - 0.030, kit.glow(hue, 2.0), 0.014);
      frontG.add(power);
      const hdd = kit.dot(-0.06, 0.78, z - 0.030, kit.glow(0xbfa089, 1.4), 0.011);
      frontG.add(hdd);
    }

    /* ============================================================
       4. 顶板：出风口（配一条一条的散热栅）
       热空气变轻自己往上走 —— 顶上必须给它留一条路。
       ============================================================ */
    const topG = new THREE.Group();
    group.add(topG);
    rig(topG, 0, 0.20, 0);
    {
      const y = HY + 0.008;
      // 边框
      for (const [w, d, px, pz] of [[HX * 2, 0.08, 0, HZ - 0.04], [HX * 2, 0.08, 0, -HZ + 0.04], [0.08, HZ * 2, HX - 0.04, 0], [0.08, HZ * 2, -HX + 0.04, 0]]) {
        const b = kit.box(w, 0.022, d, beamMat);
        b.position.set(px, y, pz);
        topG.add(b);
      }
      // 中间的散热栅：10 条横片（缝里能看见机箱内部）
      const geo = new THREE.BoxGeometry(HX * 2 - 0.20, 0.016, 0.042);
      const slats = new THREE.InstancedMesh(geo, beamMat2, 10);
      const m4 = new THREE.Matrix4();
      for (let i = 0; i < 10; i++) slats.setMatrixAt(i, m4.makeTranslation(0, y, -0.68 + i * 0.152));
      slats.instanceMatrix.needsUpdate = true;
      slats.castShadow = true;
      topG.add(slats);
    }

    /* ============================================================
       5. 背板：主板 I/O、显卡挡板、后部排风扇都在这儿
       ============================================================ */
    const backG = new THREE.Group();
    group.add(backG);
    rig(backG, 0, 0, 0.06);
    {
      const z = HZ - 0.012;
      for (const [w, h, px, py] of [[HX * 2, 0.06, 0, HY - 0.03], [HX * 2, 0.06, 0, -HY + 0.03], [0.06, HY * 2, -HX + 0.03, 0], [0.06, HY * 2, HX - 0.03, 0], [HX * 2 - 0.12, 0.05, 0, 0.62]]) {
        const b = kit.box(w, h, 0.025, beamMat);
        b.position.set(px, py, z);
        backG.add(b);
      }
      // 主板后置 I/O 的开窗（这块方洞是主板那排接口伸出来的地方）
      const shield = kit.box(0.46, 0.20, 0.030, beamMat2);
      shield.position.set(-0.20, 0.75, z);
      backG.add(shield);
      for (let i = 0; i < 4; i++) {
        const hole = kit.box(0.09, 0.05, 0.036, kit.mats.plasticDark);
        hole.position.set(-0.34 + i * 0.10, 0.75, z);
        backG.add(hole);
      }
      // 7 条 PCIe 挡板（不用的槽位要拿挡板挡住，否则机箱漏风）
      const geo = new THREE.BoxGeometry(0.46, 0.045, 0.020);
      const slots = new THREE.InstancedMesh(geo, beamMat2, 7);
      const m4 = new THREE.Matrix4();
      for (let i = 0; i < 7; i++) slots.setMatrixAt(i, m4.makeTranslation(-0.07, -0.60 + i * 0.09, z));
      slots.instanceMatrix.needsUpdate = true;
      slots.castShadow = true;
      backG.add(slots);
    }

    /* ============================================================
       6. 主板托盘：一块竖着的钢板
       正面拧铜柱、上主板；背面的两三厘米专门用来塞电源线 ——
       这就是"理线位"的意义：线不走风道，风才顺畅。
       ============================================================ */
    const trayG = new THREE.Group();
    group.add(trayG);
    rig(trayG, -0.10, 0, 0);
    {
      const tray = kit.box(0.016, 1.10, 1.40, kit.mat('metalDark', { roughness: 0.60, metalness: 0.55, color: 0x525a63 }));
      tray.position.set(-0.30, 0.28, 0);
      trayG.add(tray);

      /* 托盘上的细节 —— 全部朝向玻璃侧板那一面：
         侧板半透明之后，透过它看进去不能只是一块黑板。 */
      // CPU 背板开窗：真机箱在托盘上挖的方洞，给散热器背板腾位置
      const cut = kit.box(0.010, 0.42, 0.42, kit.mat('metalDark', { roughness: 0.72, metalness: 0.32, color: 0x2c3238 }));
      cut.position.set(-0.288, 0.50, -0.40);
      trayG.add(cut);
      // 开窗四周的翻边
      for (const [w, h, d, py, pz] of [
        [0.014, 0.020, 0.44, 0.72, -0.40],
        [0.014, 0.020, 0.44, 0.28, -0.40],
        [0.014, 0.46, 0.020, 0.50, -0.62],
        [0.014, 0.46, 0.020, 0.50, -0.18],
      ]) {
        const rim = kit.box(w, h, d, kit.mat('metalDark', { roughness: 0.55, metalness: 0.60, color: 0x5d656e }));
        rim.position.set(-0.282, py, pz);
        trayG.add(rim);
      }
      // 两个 2.5" 硬盘位：钢板 + 一块浅色标签，是这面墙上最亮的细节
      for (const dz of [0.22, 0.36]) {
        const ssd = kit.box(0.012, 0.16, 0.11, kit.mat('metalDark', { roughness: 0.50, metalness: 0.60, color: 0x5a6169 }));
        ssd.position.set(-0.288, 0.10, dz);
        trayG.add(ssd);
        const lbl = kit.box(0.004, 0.10, 0.075, kit.mat('plasticMid', { roughness: 0.62 }));
        lbl.position.set(-0.280, 0.10, dz);
        trayG.add(lbl);
      }
      // 线束：从前面板一路绕进箱底 —— 理线位就是给它们留的
      const bundleMat = kit.mat('rubber', { roughness: 0.88, metalness: 0.02 });
      for (let i = 0; i < 4; i++) {
        const wire = kit.trace([
          [-0.286, 0.86 - i * 0.030, -0.66],
          [-0.286, 0.60 - i * 0.026, -0.70],
          [-0.286, 0.08 - i * 0.016, -0.64],
        ], 0.011, bundleMat, 12);
        trayG.add(wire);
      }
      // 显卡支撑架：长显卡尾部会自己往下坠，这根柱子顶着它
      const post = kit.box(0.020, 0.44, 0.020, kit.mat('metalDark', { roughness: 0.50, metalness: 0.62, color: 0x596069 }));
      post.position.set(-0.286, 0.26, 0.58);
      trayG.add(post);
      const clamp = kit.box(0.032, 0.020, 0.10, kit.mat('plasticDark', { roughness: 0.72 }));
      clamp.position.set(-0.276, 0.48, 0.58);
      trayG.add(clamp);
      // 6 根铜柱（主板就拧在它们上面，板子背面因此能走线）
      for (const [dy, dz] of [[-0.55, -0.60], [-0.55, 0.60], [0.55, -0.60], [0.55, 0.60], [0.55, 0.0], [-0.20, 0.0]]) {
        const st = kit.cyl(0.022, 0.022, 0.045, 8, kit.mats.gold);
        st.rotation.z = Math.PI / 2;
        st.position.set(-0.272, 0.28 + dy, dz);
        trayG.add(st);
      }
      // 三个理线孔（橡胶圈，线从这儿穿过托盘到背面）
      for (const dy of [0.42, 0.06, -0.34]) {
        const ring = kit.cyl(0.070, 0.070, 0.024, 14, kit.mats.rubber);
        ring.rotation.z = Math.PI / 2;
        ring.position.set(-0.292, 0.28 + dy, -0.60);
        trayG.add(ring);
        const hole = kit.cyl(0.055, 0.055, 0.028, 12, kit.mats.plasticDark);
        hole.rotation.z = Math.PI / 2;
        hole.position.set(-0.292, 0.28 + dy, -0.60);
        trayG.add(hole);
      }
      // 托盘前缘的走线槽
      const ch = kit.box(0.020, 0.90, 0.06, kit.mats.rubber);
      ch.position.set(-0.292, 0.30, -0.70);
      trayG.add(ch);
    }

    /* ============================================================
       7. 硬盘架：压在箱底前半部
       机械硬盘最怕震，所以它固定在钢架上，还垫了橡胶。
       ============================================================ */
    const cageG = new THREE.Group();
    group.add(cageG);
    rig(cageG, 0, 0, -0.16);
    {
      const CX = -0.26, CY = -0.66, CZ = -0.42;   // 架子中心
      for (const dz of [-0.20, 0.20]) {
        const side = kit.box(0.34, 0.38, 0.018, beamMat);
        side.position.set(CX, CY, CZ + dz);
        cageG.add(side);
      }
      const backp = kit.box(0.018, 0.38, 0.42, beamMat);
      backp.position.set(CX - 0.16, CY, CZ);
      cageG.add(backp);
      // 3 个硬盘托（每个托上放一块硬盘，前面那个把手露在外面）
      for (let i = 0; i < 3; i++) {
        const y = CY + 0.13 - i * 0.13;
        const sled = kit.box(0.30, 0.040, 0.40, beamMat2);
        sled.position.set(CX + 0.02, y, CZ);
        cageG.add(sled);
        const pad = kit.box(0.28, 0.012, 0.36, kit.mats.rubber);
        pad.position.set(CX + 0.02, y + 0.026, CZ);
        cageG.add(pad);
        const handle = kit.box(0.06, 0.030, 0.05, kit.mat('plasticDark', { roughness: 0.75 }));
        handle.position.set(CX + 0.02, y, CZ - 0.22);
        cageG.add(handle);
        // 托盘侧面的标签条：压在箱底的硬盘架也得有细节可看
        const tag = kit.box(0.006, 0.026, 0.20, kit.mat('plasticMid', { roughness: 0.62 }));
        tag.position.set(CX + 0.175, y, CZ);
        cageG.add(tag);
      }
    }

    /* ============================================================
       8. 电源仓：把电源罩在箱底下
       罩子不是为了好看 —— 罩住之后电源自己走一条独立风道，
       不跟上面抢风，机箱里也空出一块走线的地方。
       ============================================================ */
    const shroudG = new THREE.Group();
    group.add(shroudG);
    rig(shroudG, 0, 0, 0.16);
    {
      const top = kit.box(HX * 2 - 0.06, 0.020, 0.76, beamMat2);
      top.position.set(0, -0.57, 0.46);
      shroudG.add(top);
      const face = kit.box(HX * 2 - 0.06, 0.31, 0.016, beamMat2);
      face.position.set(0, -0.725, 0.085);
      shroudG.add(face);
      // 罩子上的散热缝
      const geo = new THREE.BoxGeometry(0.70, 0.014, 0.030);
      const grille = new THREE.InstancedMesh(geo, kit.mat('plasticDark', { roughness: 0.8 }), 6);
      const m4 = new THREE.Matrix4();
      for (let i = 0; i < 6; i++) grille.setMatrixAt(i, m4.makeTranslation(0, -0.565, 0.20 + i * 0.10));
      grille.instanceMatrix.needsUpdate = true;
      shroudG.add(grille);
      // 罩子里露出来的一角电源（说明这里是装电源的位置）
      const psu = kit.box(0.40, 0.26, 0.30, kit.mat('metalDark', { roughness: 0.58, metalness: 0.6, color: 0x3f454b }));
      psu.position.set(0.02, -0.745, 0.42);
      shroudG.add(psu);
    }

    /* ============================================================
       9. 风扇：前面两个进气、后面一个排气
       风扇自己不制冷，它只负责让空气流动 —— 把热搬出去的是"流过去的空气"。
       ============================================================ */
    const fans = [];
    const makeFan = (size) => {
      const g = new THREE.Group();
      const holder = new THREE.Group();
      holder.rotation.x = Math.PI / 2;    // 轴线朝 z：前面进风、后面排风
      g.add(holder);
      const frameMat = kit.mat('plasticDark', { roughness: 0.75, metalness: 0.03 });
      const bar = 0.052;
      for (const [w, d, px, pz] of [[size, bar, 0, size / 2 - bar / 2], [size, bar, 0, -size / 2 + bar / 2], [bar, size - bar * 2, size / 2 - bar / 2, 0], [bar, size - bar * 2, -size / 2 + bar / 2, 0]]) {
        const b = kit.box(w, 0.10, d, frameMat);
        b.position.set(px, 0, pz);
        holder.add(b);
      }
      const padMat = kit.mats.rubber;
      for (const [px, pz] of [[size / 2 - 0.028, size / 2 - 0.028], [size / 2 - 0.028, -size / 2 + 0.028], [-size / 2 + 0.028, size / 2 - 0.028], [-size / 2 + 0.028, -size / 2 + 0.028]]) {
        const pad = kit.cyl(0.026, 0.026, 0.020, 8, padMat);
        pad.position.set(px, 0, pz);
        holder.add(pad);
      }
      const hub = kit.cyl(0.072, 0.072, 0.070, 16, frameMat);
      holder.add(hub);
      const cap = kit.cyl(0.038, 0.038, 0.012, 12, kit.mats.metal);
      cap.position.y = 0.040;
      holder.add(cap);
      const blades = new THREE.Group();
      holder.add(blades);
      const bladeMat = kit.mat('plastic', { roughness: 0.68, metalness: 0.03, color: 0x9aa0a6 });
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        const b = kit.box(0.245, 0.010, 0.110, bladeMat);
        b.position.set(Math.cos(a) * 0.200, 0.010, Math.sin(a) * 0.200);
        b.rotation.y = -a;
        b.rotation.z = 0.44;
        blades.add(b);
        const arm = kit.box(0.100, 0.014, 0.048, frameMat);
        arm.position.set(Math.cos(a) * 0.110, 0.008, Math.sin(a) * 0.110);
        arm.rotation.y = -a;
        blades.add(arm);
      }
      return { g, blades };
    };

    // 前面两个（进气）：注意它们必须躲开硬盘架，否则会互相插进去
    const frontFansG = new THREE.Group();
    group.add(frontFansG);
    rig(frontFansG, 0, 0, -0.10);
    for (const fy of [-0.30, 0.30]) {
      const f = makeFan(0.62);
      f.g.position.set(0, fy, -0.80);
      frontFansG.add(f.g);
      fans.push({ blades: f.blades, speed: 2.6, dir: 1 });
    }
    // 后面一个（排气）
    const rearFanG = new THREE.Group();
    group.add(rearFanG);
    rig(rearFanG, 0.22, 0.05, 0);
    {
      const f = makeFan(0.62);
      f.g.position.set(0.10, 0.30, 0.74);
      rearFanG.add(f.g);
      fans.push({ blades: f.blades, speed: 2.9, dir: -1 });
    }

    /* ============================================================
       10. 风道粒子
       两条路线：① 前面板进 → 掠过元件 → 顶部/后部出；
                ② 箱底进 → 电源自己吸 → 一起往上排。
       颜色由冷（青灰）渐变到暖（灰赭），一眼看出空气"被加热了"。
       ============================================================ */
    const ROUTES = [
      // ① 前进风 → 上/后出风
      [[-0.72, -1.02], [-0.62, -0.82], [-0.35, -0.55], [-0.05, -0.05], [0.30, 0.35], [0.72, 0.60], [1.00, 0.72]],
      // ② 底部进风 → 经过电源 → 上升排出
      [[-1.00, -0.55], [-0.90, -0.42], [-0.62, -0.20], [-0.20, 0.15], [0.25, 0.45], [0.72, 0.62], [1.00, 0.72]],
    ];
    const COL_COLD = new THREE.Color(0xa8bcc8);
    const COL_HOT = new THREE.Color(0xc99a74);
    const _c = new THREE.Color();
    const air = [];
    const rng = kit.rng(20261024);
    for (let i = 0; i < 20; i++) {
      const lane = i < 14 ? 0 : 1;
      const x = lane === 0 ? [-0.20, -0.06, 0.10, 0.28][i % 4] : [0.16, 0.30][i % 2];
      const m = kit.glow(0xa8bcc8, 1.2).clone();
      const d = new THREE.Mesh(new THREE.SphereGeometry(0.017, 8, 6), m);
      d.userData.route = ROUTES[lane];
      d.userData.x = x + (rng() - 0.5) * 0.05;
      d.userData.t = (i * 0.137) % 1;
      d.userData.k = 0.75 + (i % 4) * 0.12;
      d.userData.mat = m;
      group.add(d);
      air.push(d);
    }

    const _p = new THREE.Vector3();
    const _a = new THREE.Vector3();
    const _b = new THREE.Vector3();
    function sampleRoute(route, x, u) {
      const s = kit.clamp01(u) * (route.length - 1);
      const i = Math.min(Math.floor(s), route.length - 2);
      const f = s - i;
      _a.set(x, route[i][0], route[i][1]);
      _b.set(x, route[i + 1][0], route[i + 1][1]);
      return _p.copy(_a).lerp(_b, f);
    }

    /* ============================================================
       整体缩放 + 原点归位
       1) 等比收到 SCALE：机箱天生比别人大一圈，不收的话在环上会变成
          画面的主角，压掉"八件等重"的节奏。只整体等比收，不改内部比例。
       2) 平移到包围盒中心（契约 §1.5）：侧板、前面板都往外探，重心偏一点。
       两件事都交给一个内层容器做，外层 group 的 scale 保持 1 ——
       免得和 main.js 的出场缩放动画（p.anim.scale）打架。
       数学上：内层 scale=S、position=-S·c，则任意点 p → S(p-c)，缩放后仍居中。
       ============================================================ */
    {
      const c = new THREE.Box3().setFromObject(group).getCenter(new THREE.Vector3());
      const inner = new THREE.Group();
      inner.scale.setScalar(SCALE);
      if (c.lengthSq() > 1e-10) inner.position.copy(c).multiplyScalar(-SCALE);
      for (const child of [...group.children]) inner.add(child);
      group.add(inner);
    }

    /* ============================================================
       拆解 / 动画
       ============================================================ */
    return {
      group,
      legend: [
        { text: '前面板进风', desc: '冷空气从前面和下面被吸进来' },
        { text: '主板托盘', desc: '元件都固定在它上面，板子背面专门用来藏线' },
        { text: '顶部与后部出风', desc: '空气被加热后变轻，顺着风道自己往上排' },
        { text: '硬盘架与电源仓', desc: '把最占地方的部件压到箱底，不挡风道' },
      ],

      /** t: 0 = 合拢，1 = 完全拆解。纯函数，可来回擦洗 */
      setExplode(t) {
        const e = kit.easeInOut(t);
        for (const r of rigs) {
          const b = r.g.userData.base, d = r.d;
          r.g.position.set(b.x + d.x * e, b.y + d.y * e, b.z + d.z * e);
        }
      },

      /** 持续动画：三个风扇转 + 风道粒子流动 */
      update(elapsed, dt, emphasis = 0) {
        // 角度直接由 elapsed 算出（不累加），保证同一时刻永远同一帧
        for (const f of fans) f.blades.rotation.y = elapsed * f.speed * f.dir;

        const spd = 0.10 + emphasis * 0.15;
        for (const d of air) {
          d.userData.t = (d.userData.t + dt * spd * d.userData.k) % 1;
          const u = d.userData.t;
          d.position.copy(sampleRoute(d.userData.route, d.userData.x, u));
          // 冷 → 暖：空气一边走一边被元件加热
          _c.copy(COL_COLD).lerp(COL_HOT, Math.min(u * 1.6, 1));
          d.userData.mat.color.copy(_c);
          d.userData.mat.emissive.copy(_c);
          d.userData.mat.emissiveIntensity = 0.9 + emphasis * 0.8;
          // 进出机箱两端淡出
          const edge = Math.min(u, 1 - u);
          d.visible = edge > 0.05;
        }
      },
    };
  },
};