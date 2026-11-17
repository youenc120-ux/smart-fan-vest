// 智能溫控風扇背心：成品等角立體圖（anatomy 繪圖工具組）
// 用法：node build.mjs [--light]，在同一個資料夾輸出 vest-3d.html（或 vest-3d-light.html）
// 繪圖工具組路徑：環境變數 ANATOMY_KIT，預設為 git clone 到暫存資料夾的 wheresryan22/anatomy
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir } from "node:os";

const KIT = process.env.ANATOMY_KIT || join(tmpdir(), "skills-src", "anatomy");
const k = await import(pathToFileURL(join(KIT, "kit/iso-kit.mjs")).href);
const G = await import(pathToFileURL(join(KIT, "kit/lathe.mjs")).href);
const { kitScript } = await import(pathToFileURL(join(KIT, "scripts/inline-kit.mjs")).href);

const HERE = dirname(fileURLToPath(import.meta.url));
const theme = process.argv.includes("--light") ? "light" : "dark";
const EN = process.argv.includes("--en");
const tr = (zh, en) => (EN ? en : zh);
const WIDTH = 640;
const HEIGHT = 560;

// ---------- 控制模型：與韌體 fan_vest.ino 相同的自動曲線 ----------
const T0 = 26, T1 = 28, T2 = 35, DUTY_MIN = 30, BOOST = 10;
const HR_HIGH = 150;

// ---------- 世界座標（約 1 單位 = 3mm；z 向上；觀看方向來自 +x、+y） ----------
const { tubePieces, tubeSvg } = await import(pathToFileURL(join(KIT, "kit/tube.mjs")).href);
const BASE = { x: -108, y: -88, w: 216, d: 176, r: 14 };
const BASE_H = 12, FOOT_H = 5;
const HIP = 70;                                   // 背心下擺
const HEM_H = 9;                                  // 羅紋下擺
const TOP = 168;                                  // 背心肩線（身體頂面）
const TORSO = { x: -66, y: -32, w: 132, d: 64, r: 18 };
const HEM = { x: -67.2, y: -33.2, w: 134.4, d: 66.4, r: 19 };
const BACK = TORSO.y + TORSO.d;                   // 背面（朝向觀看者的 +y 面）
const SIDE = TORSO.x + TORSO.w;                   // 右側（朝向觀看者的 +x 面）
const STRAP_R = { x: 20, y: -26, w: 36, d: 52, r: 12 };
const STRAP_L = { x: -56, y: -26, w: 36, d: 52, r: 12 };
const YOKE = { x: -61, y: -27, w: 122, d: 54, r: 22 };   // 肩部（圓弧收邊）
const STRAP_TOP = TOP + 9;                             // 肩部頂面
const COLLAR = { x: -20, y: 10, w: 40, d: 18, r: 6 };
const COLLAR_TOP = STRAP_TOP + 7;
const MQ = { x: -78, y: -26, w: 156, d: 52, r: 24 };   // 人台肩膀
const MQ_TOP = COLLAR_TOP;
const NECK = [0, -4], NECK_R = 13, NECK_TOP = 214;
const FANS = [
  { id: "f1", x: -32, z: 146, zone: "upper" },
  { id: "f2", x: 32, z: 146, zone: "upper" },
  { id: "f3", x: -32, z: 98, zone: "lower" },
  { id: "f4", x: 32, z: 98, zone: "lower" },
];
const FAN_R = 19, FAN_T = 6, BLADES = 9, PHASES = 24;
const GLAND_L = 2.4, GLAND_R = 1.9, CABLE_R = 1.15;
const BOX = { x: SIDE, y: -14, w: 13, d: 28, r: 2.4 };
const BOX_Z = 84, BOX_H = 36;
const BATT = { x: 54, y: -76, w: 34, d: 46, r: 6 };
const BATT_H = 17;
const PHONE = { x: -90, y: 18, w: 34, d: 62, r: 5 };

const P = k.fitProjection(
  [...k.boxCorners(BASE, -BASE_H - FOOT_H, 0), ...k.boxCorners(TORSO, HIP, MQ_TOP), [0, BACK + FAN_T + 4, 160], [SIDE + 16, 0, 100], [NECK[0], NECK[1], NECK_TOP + 8]],
  WIDTH, HEIGHT, { pad: 30, azimuth: 38 },
);

const at = (p) => k.iso(p, P);
const S = (paths, style) => k.solidSvg(paths, style);
const L = (d, style) => k.lineSvg(d, style);
const D = (points, style) => k.dotsSvg(points, style);
const path3 = (pts, closed = false) => k.pathOf(pts.map(at), closed);
const titled = (name, inner, extra = "") => `<g data-part="${name.id}"${extra}><title>${name.zh}</title>${inner}</g>`;
const byDepth = (list, pos) => [...list].sort((a, b) => k.depthOf(pos(a), P) - k.depthOf(pos(b), P));
const cable = (points, { r = CABLE_R, bend = 4, tone = "hi" } = {}) =>
  tubePieces(G.fillet(points, bend, 7, { P, tube: r }), r, P, { maxLength: 14 }).map((piece) => tubeSvg(piece, { tone })).join("");

// ---------- 展示底座 ----------
function base() {
  const out = [`<path class="iso-halo" d="${k.haloOf(BASE, -BASE_H - FOOT_H, BASE_H, P)}"/>`];
  for (const [x, y] of byDepth(k.corners(BASE, 24), ([x, y]) => [x, y, 0])) {
    out.push(S(k.cylinder(x, y, 8.5, -BASE_H - FOOT_H, 1.6, P, 28), { tone: "lo" }));
    out.push(S(k.cylinder(x, y, 6.4, -BASE_H - FOOT_H + 1.6, FOOT_H - 1.6, P, 28), { tone: "mid" }));
  }
  out.push(S(k.slabOf(BASE, -BASE_H, BASE_H, P, 8, 1.6), { tone: "mid", inner: L(k.sideSeam(BASE, -BASE_H + 4, P), { tone: "faint" }) }));
  out.push(L(k.planOutline(k.insetPlan(BASE, 6), 0, P), { tone: "lo" }));
  const screws = k.corners(BASE, 11);
  out.push(L(screws.map(([x, y]) => k.ring(x, y, 2.4, 0, P, 16)).join(""), { tone: "lo" }));
  out.push(D(screws.map(([x, y]) => at([x, y, 0])), { size: 0.5 }));
  // 前緣刻度尺
  const strip = { x: -90, y: BASE.y + BASE.d - 17, w: 180, d: 7, r: 1 };
  out.push(S(k.slabOf(strip, 0, 0.6, P, 3), { tone: "lo", crease: "none" }));
  const ticks = k.topTicks(strip.x + 4, strip.x + strip.w - 4, 4, 5, strip.y + 0.8, 0.6, [2, 3.6], P);
  out.push(L(ticks.minor, { tone: "lo" }), L(ticks.major, { tone: "mid" }));
  out.push(D([at([strip.x + 2, strip.y + 3.5, 0.6]), at([strip.x + strip.w - 2, strip.y + 3.5, 0.6])], { size: 0.45 }));
  // 銘牌
  const plate = { x: -94, y: -76, w: 50, d: 24, r: 2 };
  out.push(S(k.slabOf(plate, 0, 1, P, 3, 0.4), { tone: "mid" }));
  out.push(L(k.planOutline(k.insetPlan(plate, 2), 1, P, 3), { tone: "faint" }));
  for (const [i, w] of [[0, 32], [1, 22], [2, 27]]) out.push(L(k.lineOnTop([plate.x + 6, plate.y + 7.5 + i * 4.6], [plate.x + 6 + w, plate.y + 7.5 + i * 4.6], 1, P), { tone: "faint", free: "both" }));
  out.push(D(k.corners(plate, 3.4).map(([x, y]) => at([x, y, 1])), { size: 0.4 }));
  return out.join("");
}

// ---------- 支架 ----------
function stand() {
  const out = [];
  const flange = G.frameAlong([0, 0, 0], [0, 0, 1]);
  out.push(S(k.cylinder(0, 0, 18, 0, 3.2, P, 48, 0.6), { tone: "mid" }));
  out.push(D(G.dotsOf(G.frameAlong([0, 0, 3.2], [0, 0, 1]), 0, 13.5, 6, P, { all: true }), { size: 0.45 }));
  out.push(L(k.ring(0, 0, 8, 3.2, P, 32), { tone: "faint" }));
  out.push(S(k.cylinder(0, 0, 5, 3.2, 30, P, 24), { tone: "mid", crease: "none" }));
  out.push(S(k.cylinder(0, 0, 8, 33.2, 8, P, 32, 0.5), { tone: "mid" }));             // 高度調整套環
  out.push(L(k.knurl(0, 0, 8, 34.4, 40, 32, P), { tone: "lo" }));
  const screw = G.frameAlong([8, 0, 37.2], [1, 0, 0]);
  out.push(S(G.disc(0, 3, 2, screw, P), { tone: "mid" }));
  out.push(S(G.disc(3, 7, 3.2, screw, P), { tone: "mid" }));
  out.push(L(G.ribsOf(screw, 3, 7, 3.2, 16, P, { seams: true }).d || "", { tone: "lo" }));
  out.push(S(k.cylinder(0, 0, 4, 41.2, HIP - 6 - 41.2, P, 24), { tone: "mid", crease: "none" }));
  out.push(S(k.cylinder(0, 0, 14, HIP - 6, 4, P, 40, 0.5), { tone: "mid" }));          // 人台座
  void flange;
  return out.join("");
}

// ---------- 肩部與領口 ----------
function yoke() {
  const out = [];
  out.push(S(k.slabOf(YOKE, TOP, STRAP_TOP - TOP, P, 10, 2.2), { tone: "mid", inner: L(k.sideSeam(YOKE, TOP + 3, P, 10), { tone: "faint" }) }));
  out.push(L(k.planOutline(k.insetPlan(YOKE, 4), STRAP_TOP, P, 8), { tone: "faint" }));     // 肩部壓線
  // 左右肩線：從領口到肩端
  out.push(L(k.lineOnTop([NECK[0] + 23, NECK[1]], [YOKE.x + YOKE.w - 4, NECK[1]], STRAP_TOP, P) + k.lineOnTop([NECK[0] - 23, NECK[1]], [YOKE.x + 4, NECK[1]], STRAP_TOP, P), { tone: "lo" }));
  return out.join("");
}
function collarRing() {
  const [x, y] = NECK;
  const out = [];
  out.push(S(k.cylinder(x, y, 23, STRAP_TOP, COLLAR_TOP - STRAP_TOP, P, 56, 0.6), { tone: "mid" }));
  out.push(L(k.knurl(x, y, 23, STRAP_TOP + 1, COLLAR_TOP - 1, 72, P, 0.3), { tone: "lo" }));          // 羅紋領
  out.push(S(k.cylinder(x, y, 17, COLLAR_TOP, 0.2, P, 48), { tone: "lo", flat: true }));
  out.push(L(k.ring(x, y, 20, COLLAR_TOP, P, 48), { tone: "faint" }));
  return out.join("");
}
function mannequinNeck() {
  const [x, y] = NECK;
  const out = [];
  out.push(S(k.cylinder(x, y, NECK_R + 4, MQ_TOP, 3, P, 40, 0.8), { tone: "lo" }));
  out.push(S(k.cylinder(x, y, NECK_R, MQ_TOP + 3, NECK_TOP - MQ_TOP - 3, P, 40), { tone: "lo", crease: "none" }));
  out.push(L(k.sideArc(x, y, NECK_R, NECK_TOP - 9, P, 24), { tone: "faint" }));
  out.push(S(k.cylinder(x, y, NECK_R + 1.6, NECK_TOP, 3, P, 40, 0.6), { tone: "mid" }));
  out.push(L(k.ring(x, y, NECK_R - 3, NECK_TOP + 3, P, 32), { tone: "faint" }));
  out.push(S(k.cylinder(x, y, 3.2, NECK_TOP + 3, 4, P, 18), { tone: "mid" }));
  out.push(L(k.knurl(x, y, 3.2, NECK_TOP + 3, NECK_TOP + 7, 14, P), { tone: "lo" }));
  return out.join("");
}

// ---------- 背心 ----------
const torsoRing = k.ringOf(TORSO, 10);
function vestBody() {
  const out = [`<path class="iso-halo" d="${k.haloOf(k.insetPlan(TORSO, 6), HIP - 2, 0.1, P)}" style="filter:blur(5px)"/>`];
  // 羅紋下擺
  out.push(S(k.slabOf(HEM, HIP, HEM_H, P, 10, 0.8), { tone: "mid" }));
  const ribs = [];
  for (let x = HEM.x + HEM.r + 2; x <= HEM.x + HEM.w - HEM.r - 2; x += 3.2) ribs.push(path3([[x, HEM.y + HEM.d, HIP + 0.6], [x, HEM.y + HEM.d, HIP + HEM_H - 0.6]]));
  for (let y = HEM.y + HEM.r + 2; y <= HEM.y + HEM.d - HEM.r - 2; y += 3.2) ribs.push(path3([[HEM.x + HEM.w, y, HIP + 0.6], [HEM.x + HEM.w, y, HIP + HEM_H - 0.6]]));
  out.push(L(ribs.join(""), { tone: "lo" }));
  // 身體（車縫：腰線、背中線、兩條背部拼接線、側縫）
  out.push(S(k.slabOf(TORSO, HIP + HEM_H, TOP - HIP - HEM_H, P, 10, 1.2), {
    tone: "mid",
    inner: [
      L(k.ringSeam(torsoRing, 122, P), { tone: "lo" }),
      L(k.ringSeam(torsoRing, TOP - 5, P), { tone: "faint" }),
    ].join(""),
  }));
  out.push(L([0, -56, 56].map((x) => path3([[x, BACK, HIP + HEM_H], [x, BACK, TOP - 5]])).join(""), { tone: "faint" }));
  out.push(L(path3([[SIDE, 0, HIP + HEM_H], [SIDE, 0, TOP - 5]]), { tone: "faint" }));
  // 側邊調整帶與扣環（右側，控制盒上方）
  const tab = { x: SIDE, y: -9, w: 1.6, d: 18, r: 0.6 };
  out.push(S(k.slabOf(tab, 136, 10, P, 2, 0.2), { tone: "mid" }));
  const buckle = { x: SIDE + 1.6, y: -11, w: 2.6, d: 22, r: 1.2 };
  out.push(S(k.slabOf(buckle, 138, 6, P, 3, 0.4), { tone: "hi" }));
  out.push(L(path3([[SIDE + 4.2, -7, 141], [SIDE + 4.2, 7, 141]]), { tone: "lo" }));
  return out.join("");
}
// ---------- 風扇 ----------
const fanFrame = (f) => G.frameOf([f.x, BACK, f.z], [0, 1, 0], [1, 0, 0], [0, 0, 1]);
function bladesAt(f, phase) {
  const F = fanFrame(f);
  const r0 = 5, r1 = FAN_R - 3.6, width = 0.42, sweep = 0.5, s = FAN_T - 1.6, n = 8;
  let d = "";
  for (let b = 0; b < BLADES; b++) {
    const a = phase + (b / BLADES) * Math.PI * 2;
    const edge = (off) => Array.from({ length: n + 1 }, (_, i) => {
      const r = r0 + (r1 - r0) * (i / n);
      return at(G.pointOf(F, s, r, a + off + sweep * (i / n) + (off ? -0.12 * (i / n) : 0)));
    });
    d += k.pathOf([...edge(0), ...edge(width).reverse()], true);
  }
  return d;
}
// 風扇側邊的出線座（+x 與 −x 方向）
const glandAt = (f, dir) => ({ o: [f.x + dir * FAN_R, BACK + 3, f.z], a: [dir, 0, 0] });
const glandEnd = (f, dir) => [f.x + dir * (FAN_R + GLAND_L), BACK + 3, f.z];
function gland(g) {
  const F = G.frameAlong(g.o, g.a);
  return S(G.disc(0, GLAND_L, GLAND_R, F, P), { tone: "mid" }) + L(G.circleOf(F, GLAND_L, CABLE_R + 0.3, P), { tone: "lo" });
}
function fan(f) {
  const F = fanFrame(f);
  const out = [];
  out.push(S(G.ringBand(0, 0.8, FAN_R, FAN_R + 2.6, F, P), { tone: "lo" }));                     // 車縫補強布
  out.push(D(G.dotsOf(F, 0.8, FAN_R + 1.3, 28, P, { all: true }), { size: 0.32, tone: "mid" }));   // 車縫線
  out.push(S(G.ringBand(0.8, FAN_T, FAN_R - 3, FAN_R, F, P), { tone: "mid" }));                    // 外框
  out.push(fadedRibs(F));
  out.push(S(G.disc(0.8, 1.6, FAN_R - 3, F, P), { tone: "lo", flat: true }));                      // 風道底
  out.push(S(G.disc(1.6, FAN_T - 1, 4.6, F, P), { tone: "mid" }));                                 // 馬達座
  out.push(`<path data-part="${f.id}-blades" class="vest-blade" d="${bladesAt(f, 0)}"/>`);
  out.push(L([7.5, 11.5, 15.4].map((r) => G.circleOf(F, FAN_T + 0.2, r, P)).join(""), { tone: "lo" })); // 防護網
  out.push(L(G.spokesOf(F, FAN_T + 0.2, 4.6, FAN_R - 3, 6, P, { phase: Math.PI / 6 }), { tone: "lo" }));
  out.push(S(G.disc(FAN_T - 0.2, FAN_T + 0.6, 4.2, F, P), { tone: "hi" }));                       // 中心貼紙
  out.push(L(G.circleOf(F, FAN_T + 0.6, 2.6, P), { tone: "faint" }));
  out.push(D(G.dotsOf(F, FAN_T, FAN_R - 1.5, 4, P, { all: true, phase: Math.PI / 4 }), { size: 0.5 }));
  return titled({ id: f.id, zh: tr(`風扇 ${f.id.slice(1)}（${f.zone === "upper" ? "上方" : "下方"}，12V）`, `Fan ${f.id.slice(1)} (${f.zone}, 12V)`) }, out.join(""));
}
function fadedRibs(F) {
  const ribs = G.ribsOf(F, 1.6, FAN_T - 0.6, FAN_R, 44, P, { fade: [0.05, 0.45], seams: true });
  return Array.isArray(ribs) ? k.fadedSvg(ribs, { tone: "lo" }) : L(ribs.d || "", { tone: "lo" });
}

// ---------- 溫濕度感測器（背面上方中央，透氣網罩） ----------
function dht() {
  const plan = { x: -8, y: BACK, w: 16, d: 3.4, r: 1 };
  const out = [S(k.slabOf(plan, 151, 14, P, 3, 0.4), { tone: "hi" })];
  const slots = [];
  for (let i = 0; i < 4; i++) slots.push(path3([[-5 + i * 3.4, BACK + 3.4, 154], [-5 + i * 3.4, BACK + 3.4, 162]]));
  out.push(L(slots.join(""), { tone: "lo" }));
  out.push(D([at([-6, BACK + 3.4, 152.6]), at([6, BACK + 3.4, 152.6])], { size: 0.4 }));
  return titled({ id: "dht", zh: tr("DHT11 溫濕度感測器", "DHT11 temperature and humidity sensor") }, out.join(""));
}

// ---------- 右側控制盒 ----------
const boxTop = BOX_Z + BOX_H;
const BOX_GLANDS = [[BOX.x + 6.5, -8], [BOX.x + 6.5, 1], [BOX.x + 6.5, 9]];
function controlBox() {
  const out = [S(k.slabOf(BOX, BOX_Z, BOX_H, P, 4, 0.8), { tone: "hi" })];
  out.push(L(k.planOutline(k.insetPlan(BOX, 1.2), boxTop, P, 4), { tone: "faint" }));
  out.push(D(k.corners(BOX, 2.4).map(([x, y]) => at([x, y, boxTop])), { size: 0.45 }));
  const fx = BOX.x + BOX.w;
  const vents = [];
  for (let i = 0; i < 6; i++) vents.push(path3([[fx, BOX.y + 5 + i * 3.6, BOX_Z + 6], [fx, BOX.y + 5 + i * 3.6, BOX_Z + 17]]));
  out.push(L(vents.join(""), { tone: "lo" }));
  out.push(L(k.sideSeam(BOX, BOX_Z + 24, P, 4), { tone: "faint" }));
  // 電源指示燈窗
  out.push(S(k.slabOf({ x: fx, y: BOX.y + 19, w: 0.6, d: 5, r: 0.8 }, BOX_Z + 28, 3, P, 2), { tone: "lo", flat: true }));
  out.push(D([at([fx + 0.6, BOX.y + 21.5, BOX_Z + 29.5])], { size: 0.7, tone: "hi" }));
  // 底部出線座（接電池）
  out.push(S(k.cylinder(BOX.x + 6.5, -8, 2.2, BOX_Z - 2.4, 2.4, P, 18), { tone: "mid" }));
  for (const [x, y] of BOX_GLANDS) out.push(S(k.cylinder(x, y, 2.2, boxTop, 2.4, P, 18), { tone: "mid" }));
  return titled({ id: "box", zh: tr("控制盒：ESP32、D4184 ×2、INA219、保險絲、1N5819", "Control box: ESP32, 2 × D4184, INA219, fuse, 1N5819") }, out.join(""));
}

// ---------- 電池（放在底座上，DC 線接到控制盒） ----------
function battery() {
  const out = [`<path class="iso-halo" d="${k.haloOf(k.insetPlan(BATT, 2), 0, 0.1, P)}" style="filter:blur(3px)"/>`];
  out.push(S(k.slabOf(BATT, 0, BATT_H, P, 8, 1.2), { tone: "hi", inner: L(k.sideSeam(BATT, 5, P, 8), { tone: "faint" }) }));
  out.push(L(k.planOutline(k.insetPlan(BATT, 3), BATT_H, P, 6), { tone: "faint" }));
  // 電量燈與四段調速鈕
  out.push(D([0, 1, 2, 3].map((i) => at([BATT.x + 9 + i * 4.4, BATT.y + 8, BATT_H])), { size: 0.85, tone: "hi" }));
  out.push(S(k.cylinder(BATT.x + 11, BATT.y + 30, 4.6, BATT_H, 1.6, P, 28, 0.4), { tone: "mid" }));
  out.push(L(k.ring(BATT.x + 11, BATT.y + 30, 2.4, BATT_H + 1.6, P, 20), { tone: "lo" }));
  // DC 輸出與 USB
  out.push(S(k.cylinder(BATT.x + 25, BATT.y + 34, 3.4, BATT_H, 3, P, 24), { tone: "mid" }));
  out.push(L(k.ring(BATT.x + 25, BATT.y + 34, 1.3, BATT_H + 3, P, 14), { tone: "lo" }));
  out.push(S(k.slabOf({ x: BATT.x + 19, y: BATT.y + 18, w: 10, d: 4, r: 1 }, BATT_H, 0.8, P, 2), { tone: "lo", flat: true }));
  return titled({ id: "battery", zh: tr("12V 電池（DC 輸出接控制盒、USB 供電給 ESP32）", "12V battery (DC to the control box, USB to the ESP32)") }, out.join(""));
}

// ---------- 線材 ----------
const fanCables = () => {
  const out = [];
  const exitTop = (i) => [BOX_GLANDS[i][0], BOX_GLANDS[i][1], boxTop + 2.4];
  // 控制盒 → 上方右風扇（繞過右後轉角）
  const corner = (z) => [[SIDE + 3, 14, z], [SIDE - 3 + 2.6, 28.4, z], [SIDE - 18, BACK + 3, z]];
  out.push(cable([exitTop(2), [exitTop(2)[0], 9, boxTop + 7], [SIDE + 3, 12, boxTop + 9], [SIDE + 3, 14, FANS[1].z], ...corner(FANS[1].z).slice(1), glandEnd(FANS[1], 1)]));
  // 控制盒 → 下方右風扇（沿右側面往下，從控制盒後方繞到背面）
  out.push(cable([exitTop(1), [exitTop(1)[0], 1, boxTop + 5], [SIDE + 3.4, 19, boxTop + 3], [SIDE + 3.4, 20, FANS[3].z + 6], [SIDE + 2, 21, FANS[3].z], ...corner(FANS[3].z).slice(1), glandEnd(FANS[3], 1)]));
  // 每排的一分二
  for (const [a, b] of [[FANS[0], FANS[1]], [FANS[2], FANS[3]]]) out.push(cable([glandEnd(a, 1), glandEnd(b, -1)]));
  // 電池 → 控制盒底部
  out.push(cable([[BATT.x + 25, BATT.y + 34, BATT_H + 3], [BATT.x + 25, BATT.y + 34, BATT_H + 14], [BOX.x + 6.5, -30, 40], [BOX.x + 6.5, -8, 66], [BOX.x + 6.5, -8, BOX_Z - 2.4]], { r: 1.35, bend: 8 }));
  return out.join("");
};
const shoulderHarness = () => cable(
  [[44, -11, STRAP_TOP + 0.9], [YOKE.x + YOKE.w - 2, -11, STRAP_TOP + 0.9], [YOKE.x + YOKE.w + 1, -11, TOP + 1], [SIDE + 1, -11, TOP + 1], [SIDE + 1, -11, 150], [SIDE + 1, -8, boxTop + 9], [BOX_GLANDS[0][0], -8, boxTop + 2.4]],
  { r: 0.8, bend: 3, tone: "mid" },
);

// ---------- 肩上：觸控、狀態燈、蜂鳴器；後領：心率 ----------
function shoulderParts() {
  const out = [];
  const pad = { x: 27, y: -19, w: 18, d: 14, r: 1.2 };
  out.push(titled({ id: "touch", zh: tr("觸控按鈕（TTP223）：碰一下換風速、按住切換自動／手動", "Touch button (TTP223): tap to change speed, hold to switch auto and manual") },
    S(k.slabOf(pad, STRAP_TOP, 1.8, P, 3, 0.4), { tone: "hi" }) +
    L([2, 3.6, 5.2].map((r) => k.ring(pad.x + 7, pad.y + 7, r, STRAP_TOP + 1.8, P, 28)).join(""), { tone: "lo" }) +
    D([at([pad.x + 7, pad.y + 7, STRAP_TOP + 1.8]), at([pad.x + 15.4, pad.y + 7, STRAP_TOP + 1.8])], { size: 0.45, tone: "mid" })));
  out.push(titled({ id: "led", zh: tr("WS2812B 狀態燈：顏色代表溫度等級", "WS2812B status light: its colour shows the temperature level") },
    S(k.cylinder(40, 9, 4.6, STRAP_TOP, 2, P, 24, 0.4), { tone: "mid" }) +
    `<path data-part="led-dome" class="vest-led" d="${k.cylinder(40, 9, 3, STRAP_TOP + 2, 1.6, P, 24).fill}"/>`));
  out.push(titled({ id: "buzzer", zh: tr("蜂鳴器：中暑、心率、喝水提醒", "Buzzer: heat, heart-rate and drink reminders") },
    S(k.cylinder(-40, 0, 6.4, STRAP_TOP, 5, P, 32, 0.5), { tone: "hi" }) +
    L(k.ring(-40, 0, 1.6, STRAP_TOP + 5, P, 16) + k.ring(-40, 0, 4.2, STRAP_TOP + 5, P, 24), { tone: "lo" })));
  out.push(titled({ id: "pulse", zh: tr("心率感測器（類比 PulseSensor）：縫在後領內側貼脖子", "Pulse sensor (analog PulseSensor) inside the back collar, against the neck") },
    S(k.cylinder(0, NECK[1] + 19.5, 3.2, COLLAR_TOP, 1.4, P, 28, 0.3), { tone: "hi" }) +
    `<path class="vest-pulse" d="${k.cylinder(0, NECK[1] + 19.5, 1.2, COLLAR_TOP + 1.4, 0.4, P, 16).fill}"/>`));
  return out.join("");
}

// ---------- 手機（藍牙控制頁） ----------
function phone() {
  const out = [`<path class="iso-halo" d="${k.haloOf(k.insetPlan(PHONE, 2), 0, 0.1, P)}" style="filter:blur(3px)"/>`];
  out.push(S(k.slabOf(PHONE, 0, 3.6, P, 6, 0.6), { tone: "mid" }));
  const screen = k.insetPlan(PHONE, 2.2);
  out.push(S(k.slabOf(screen, 3.6, 0.1, P, 4), { tone: "lo", flat: true, crease: "none" }));
  out.push(S(k.slabOf({ x: PHONE.x + 12, y: PHONE.y + 3, w: 10, d: 2.4, r: 1.2 }, 3.7, 0.1, P, 2), { tone: "mid", flat: true, crease: "none" }));
  const c = [PHONE.x + PHONE.w / 2, PHONE.y + 22];
  out.push(L(k.ring(c[0], c[1], 9, 3.8, P, 40), { tone: "faint" }));
  out.push(`<path data-part="phone-arc" class="iso-line" data-tone="lit" d="" style="stroke-width:1.4"/>`);
  out.push(k.faceTextSvg(k.topMatrix([c[0], c[1] + 2], 3.8, P, "x"), "—", { size: 4.2, tone: "hi", anchor: "middle" }).replace("<text", '<text data-part="phone-temp"'));
  // 三張小卡：上方、下方、心率
  for (let i = 0; i < 3; i++) {
    const card = { x: PHONE.x + 4 + i * 9, y: PHONE.y + 36, w: 8, d: 9, r: 1.2 };
    out.push(L(k.planOutline(card, 3.8, P, 3), { tone: "faint" }));
    out.push(L(k.lineOnTop([card.x + 2, card.y + 6], [card.x + 6, card.y + 6], 3.8, P), { tone: i === 2 ? "lit" : "lo", free: "both" }));
  }
  for (let i = 0; i < 2; i++) out.push(L(k.lineOnTop([PHONE.x + 6, PHONE.y + 50 + i * 4.6], [PHONE.x + PHONE.w - 6, PHONE.y + 50 + i * 4.6], 3.8, P), { tone: "faint", free: "both" }));
  return titled({ id: "phone", zh: tr("手機控制頁（藍牙 BLE）", "Phone control page (Bluetooth LE)") }, out.join(""));
}

// ---------- 組合（由後往前畫） ----------
const fansSorted = byDepth(FANS, (f) => [f.x, BACK, f.z]);
const glands = [glandAt(FANS[0], 1), glandAt(FANS[1], -1), glandAt(FANS[1], 1), glandAt(FANS[2], 1), glandAt(FANS[3], -1), glandAt(FANS[3], 1)];
const svg = k.figureSvg({
  width: WIDTH,
  height: HEIGHT,
  label: tr("智能溫控風扇背心的成品立體圖：背心穿在展示人台上，背後上下各兩顆 12V 風扇，右腰是控制盒，肩帶上有觸控按鈕、狀態燈與蜂鳴器，後領內側有心率感測器；12V 電池與顯示即時溫度的手機放在底座上。", "The finished smart cooling vest on a display mannequin: two 12V fans high and two low on the back, a control box at the right hip, a touch button, status light and buzzer on the shoulder straps and a pulse sensor inside the back collar; the 12V battery and a phone showing the live temperature sit on the base."),
  body: [
    base(), phone(), battery(), stand(),
    vestBody(), dht(), ...fansSorted.map(fan), fanCables(), glands.map(gland).join(""), controlBox(),
    yoke(), collarRing(), mannequinNeck(), shoulderHarness(), shoulderParts(),
  ],
});


const bladeFrames = Object.fromEntries(FANS.map((f) => [f.id, Array.from({ length: PHASES }, (_, i) => bladesAt(f, (i / PHASES) * (Math.PI * 2 / BLADES)))]));
const phoneC = [PHONE.x + PHONE.w / 2, PHONE.y + 22];

const words = EN ? { inside: "", upper: "up ", lower: "low ", hr: "", alert: " !" } : { inside: "背心內 ", upper: "上方 ", lower: "下方 ", hr: "心率 ", alert: "（警報）" };
const live = `
const W = ${JSON.stringify(words)};
const P = ${JSON.stringify(P)};
const T0 = ${T0}, T1 = ${T1}, T2 = ${T2}, DUTY_MIN = ${DUTY_MIN}, BOOST = ${BOOST}, HR_HIGH = ${HR_HIGH};
const FRAMES = ${JSON.stringify(bladeFrames)};
const PHASES = ${PHASES};
const PC = ${JSON.stringify(phoneC)};
const stage = document.querySelector(".iso-stage");
const svg = stage.querySelector("svg");
const blades = Object.fromEntries(Object.keys(FRAMES).map((id) => [id, svg.querySelector('[data-part="' + id + '-blades"]')]));
const zone = { f1: "upper", f2: "upper", f3: "lower", f4: "lower" };
const led = svg.querySelector('[data-part="led-dome"]');
const arc = svg.querySelector('[data-part="phone-arc"]');
const ptemp = svg.querySelector('[data-part="phone-temp"]');
const readout = document.querySelector("[data-readout]");
const still = matchMedia("(prefers-reduced-motion: reduce)");
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
// 與韌體相同：遲滯啟動、線性升速、下方加強
let fanOn = false;
function fansFor(t) {
  if (!fanOn && t >= T1) fanOn = true;
  if (fanOn && t < T0) fanOn = false;
  if (!fanOn) return { upper: 0, lower: 0 };
  const up = t >= T2 ? 100 : clamp(Math.round(DUTY_MIN + (t - T1) / (T2 - T1) * (100 - DUTY_MIN)), DUTY_MIN, 100);
  return { upper: up, lower: Math.min(100, up + BOOST) };
}
const ledColor = (t) => t < T1 ? "#0078ff" : t < (T1 + T2) / 2 ? "#ffb400" : t < T2 ? "#ff5a00" : "#ff2020";
const hrFor = (t) => Math.round(clamp(78 + Math.max(0, t - 27) * 6.5, 70, 175));
let temp = 25, target = 25, clock = 0, last = 0, frame = 0, visible = false, touring = true, idle = 0;
const spin = { f1: 0, f2: 0, f3: 0, f4: 0 }, speed = { upper: 0, lower: 0 };
const tourAt = (t) => 30.5 + 7.5 * Math.sin(t / 5 - 1.2);
function arcPath(pct) {
  const pts = [];
  const a0 = Math.PI * 0.75, a1 = a0 + Math.PI * 1.5 * pct / 100;
  for (let i = 0; i <= 24; i++) { const a = a0 + (a1 - a0) * i / 24; pts.push(iso([PC[0] + Math.cos(a) * 9, PC[1] + Math.sin(a) * 9, 3.7], P)); }
  return pct > 0 ? pathOf(pts) : "";
}
function draw(fans) {
  for (const id in blades) blades[id].setAttribute("d", FRAMES[id][Math.floor(spin[id]) % PHASES]);
  led.style.fill = ledColor(temp);
  arc.setAttribute("d", arcPath(Math.max(fans.upper, fans.lower)));
  const hr = hrFor(temp);
  ptemp.textContent = temp.toFixed(1) + "°";
  const text = W.inside + temp.toFixed(1) + "°C · " + W.upper + fans.upper + "% · " + W.lower + fans.lower + "% · " + W.hr + hr + " bpm" + (hr >= HR_HIGH ? W.alert : "");
  if (readout.textContent !== text) readout.textContent = text;
  stage.setAttribute("aria-valuenow", temp.toFixed(1));
  stage.setAttribute("aria-valuetext", text);
}
function tick(now) {
  const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
  last = now;
  if (touring) { clock += dt; target = tourAt(clock); }
  temp = still.matches ? target : temp + (target - temp) * (1 - Math.exp(-dt / 0.6));
  const fans = fansFor(temp);
  for (const z of ["upper", "lower"]) speed[z] += (fans[z] - speed[z]) * (1 - Math.exp(-dt / 0.8));
  if (!still.matches) for (const id in spin) spin[id] = (spin[id] + speed[zone[id]] / 100 * 3.2 * PHASES * dt + PHASES) % PHASES;
  draw(fans);
  frame = visible ? requestAnimationFrame(tick) : 0;
}
const run = () => { if (!frame && visible) { last = 0; frame = requestAnimationFrame(tick); } };
const steer = (t) => { touring = false; target = clamp(t, 22, 40); clearTimeout(idle); idle = setTimeout(() => { touring = !still.matches; clock = 0; run(); }, 4000); run(); };
new IntersectionObserver((e) => { visible = e[e.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" }).observe(stage);
if (still.matches) { touring = false; target = temp = 31; }
stage.addEventListener("pointermove", (e) => { const b = svg.getBoundingClientRect(); steer(22 + clamp((e.clientX - b.left) / b.width, 0, 1) * 18); });
stage.addEventListener("keydown", (e) => {
  const d = e.key === "ArrowRight" || e.key === "ArrowUp" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowDown" ? -1 : 0;
  if (!d) return;
  e.preventDefault();
  steer(target + d);
});
draw(fansFor(temp));
`;

const css = `<style>.vest-blade{fill:var(--anatomy-hi);fill-opacity:.35;stroke:var(--anatomy-lit);stroke-width:.7;stroke-linejoin:round}.vest-pulse{fill:#4ade80;filter:drop-shadow(0 0 2px #4ade80)}.vest-led{fill:#0078ff;stroke:var(--anatomy-hi);stroke-width:.6;filter:drop-shadow(0 0 3px currentColor)}</style>`;
const body = css + k.plateHtml({
  fig: "Fig 1",
  title: tr("智能溫控風扇背心", "Smart cooling vest"),
  hint: tr("左右移動滑鼠改變溫度；方向鍵每次 1°C", "Move to set the temperature"),
  readout: tr("背心內 25.0°C · 上方 0% · 下方 0%", "25.0°C · up 0% · low 0%"),
  keys: [
    { mark: "lit", label: tr("扇葉：依體感溫度自動調速（28°C 啟動、35°C 全速，下方多 10%）", "Fan blades: speed follows the feels-like temperature (start at 28°C, full at 35°C, lower fans +10%)") },
    { mark: "raised", label: tr("背後四顆 12V 風扇、右腰電池盒與控制盒、肩上觸控按鈕／狀態燈／蜂鳴器、領口心率感測器", "Four 12V fans on the back, battery and control box at the hip, touch button, light and buzzer on the shoulder, pulse sensor at the collar") },
  ],
  caption: tr("市售空調服改裝成溫控風扇背心。控制盒裡的 ESP32 讀取 DHT11 溫濕度、算出體感溫度，透過兩個 D4184 分別調整上方與下方風扇；INA219 量電流與電池電量，心率感測器貼在領口內側。狀態燈依溫度由藍、黃、橘變紅，手機用藍牙即時顯示。把滑鼠移到零件上可以看到名稱。", "A store-bought fan jacket rebuilt as a temperature-controlled vest. The ESP32 in the control box reads the DHT11, works out the feels-like temperature and drives the upper and lower fans through two D4184 drivers; an INA219 measures current and battery level, and a pulse sensor sits inside the collar. The status light goes from blue through yellow and orange to red, and the phone shows it all live over Bluetooth. Point at a part to see its name."),
  body: `<div class="iso-stage" tabindex="0" role="slider" aria-label="${tr("風扇背心：方向鍵調整背心內溫度", "Fan vest: arrow keys change the temperature inside the vest")}" aria-valuemin="22" aria-valuemax="40" aria-valuenow="25">${svg}</div>`,
});

const name = `vest-3d${EN ? "-en" : ""}${theme === "light" ? "-light" : ""}.html`;
writeFileSync(join(HERE, name), k.pageHtml({ title: tr("智能溫控風扇背心", "Smart cooling vest"), theme, body, script: kitScript() + live }));
console.log("wrote", name);
