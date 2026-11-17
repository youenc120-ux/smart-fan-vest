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

// ---------- 世界座標（約 1 單位 = 3mm；z 向上） ----------
const BASE = { x: -104, y: -84, w: 208, d: 168, r: 12 };
const BASE_H = 12, FOOT_H = 5;
const TORSO = { x: -66, y: -32, w: 132, d: 64, r: 26 };
const HIP = 66, SHOULDER = 206;
const BACK = TORSO.y + TORSO.d;        // 背面（朝向觀看者的 +y 面）
const SIDE = TORSO.x + TORSO.w;        // 右側（朝向觀看者的 +x 面）
const NECK_R = 21;
const FANS = [
  { id: "f1", x: -30, z: 166, zone: "upper" },
  { id: "f2", x: 30, z: 166, zone: "upper" },
  { id: "f3", x: -30, z: 104, zone: "lower" },
  { id: "f4", x: 30, z: 104, zone: "lower" },
];
const FAN_R = 19, FAN_T = 6, BLADES = 9, PHASES = 24;

const P = k.fitProjection(
  [...k.boxCorners(BASE, -BASE_H - FOOT_H, 0), ...k.boxCorners(TORSO, HIP, SHOULDER + 10), [0, BACK + FAN_T + 4, 180], [SIDE + 22, 0, 90], [0, -6, SHOULDER + 40]],
  WIDTH, HEIGHT, { pad: 34, azimuth: 38 },
);

const at = (p) => k.iso(p, P);
const S = (paths, style) => k.solidSvg(paths, style);
const L = (d, style) => k.lineSvg(d, style);
const D = (points, style) => k.dotsSvg(points, style);
const path3 = (pts, closed = false) => k.pathOf(pts.map(at), closed);
const titled = (name, inner, extra = "") => `<g data-part="${name.id}"${extra}><title>${name.zh}</title>${inner}</g>`;

// ---------- 展示底座 ----------
function base() {
  const out = [`<path class="iso-halo" d="${k.haloOf(BASE, -BASE_H - FOOT_H, BASE_H, P)}"/>`];
  const feet = [...k.corners(BASE, 22)].sort((a, b) => k.depthOf([a[0], a[1], 0], P) - k.depthOf([b[0], b[1], 0], P));
  for (const [x, y] of feet) {
    out.push(S(k.cylinder(x, y, 8, -BASE_H - FOOT_H, 1.6, P, 28), { tone: "lo" }));
    out.push(S(k.cylinder(x, y, 6, -BASE_H - FOOT_H + 1.6, FOOT_H - 1.6, P, 28), { tone: "mid" }));
  }
  out.push(S(k.slabOf(BASE, -BASE_H, BASE_H, P, 8, 1.6), { tone: "mid" }));
  out.push(L(k.planOutline(k.insetPlan(BASE, 6), 0, P), { tone: "lo" }));
  const screws = k.corners(BASE, 11);
  out.push(L(screws.map(([x, y]) => k.ring(x, y, 2.4, 0, P, 16)).join(""), { tone: "lo" }));
  out.push(D(screws.map(([x, y]) => at([x, y, 0])), { size: 0.5 }));
  // 前緣刻度尺
  const strip = { x: -86, y: BASE.y + BASE.d - 17, w: 172, d: 7, r: 1 };
  out.push(S(k.slabOf(strip, 0, 0.6, P, 3), { tone: "lo", crease: "none" }));
  const ticks = k.topTicks(strip.x + 4, strip.x + strip.w - 4, 4, 5, strip.y + 0.8, 0.6, [2, 3.6], P);
  out.push(L(ticks.minor, { tone: "lo" }), L(ticks.major, { tone: "mid" }));
  out.push(D([at([strip.x + 2, strip.y + 3.5, 0.6]), at([strip.x + strip.w - 2, strip.y + 3.5, 0.6])], { size: 0.45 }));
  // 銘牌
  const plate = { x: -90, y: -72, w: 46, d: 22, r: 2 };
  out.push(S(k.slabOf(plate, 0, 1, P, 3, 0.4), { tone: "mid" }));
  for (const [i, w] of [[0, 30], [1, 22], [2, 26]]) out.push(L(k.lineOnTop([plate.x + 6, plate.y + 7 + i * 4.4], [plate.x + 6 + w, plate.y + 7 + i * 4.4], 1, P), { tone: "faint", free: "both" }));
  out.push(D(k.corners(plate, 2.6).map(([x, y]) => at([x, y, 1])), { size: 0.4 }));
  return out.join("");
}

// ---------- 支架 ----------
function stand() {
  const out = [];
  out.push(S(k.cylinder(0, 0, 16, 0, 3, P, 40, 0.6), { tone: "mid" }));
  out.push(D(G.dotsOf(G.frameAlong([0, 0, 3], [0, 0, 1]), 0, 12, 4, P, { all: true }), { size: 0.45 }));
  out.push(S(k.cylinder(0, 0, 5, 3, HIP - 3, P, 24), { tone: "mid", crease: "none" }));
  out.push(L([24, 44].map((z) => k.sideArc(0, 0, 5, z, P, 14)).join(""), { tone: "faint" }));
  return out.join("");
}

// ---------- 背心本體 ----------
const torsoRing = k.ringOf(TORSO, 10);
function vestBody() {
  const out = [`<path class="iso-halo" d="${k.haloOf(k.insetPlan(TORSO, 6), HIP - 2, 0.1, P)}" style="filter:blur(5px)"/>`];
  out.push(S(k.slabOf(TORSO, HIP, SHOULDER - HIP, P, 10, 1.4), {
    tone: "mid",
    inner: [
      L(k.ringSeam(torsoRing, HIP + 9, P), { tone: "lo" }),            // 下擺縫線
      L(k.ringSeam(torsoRing, SHOULDER - 9, P), { tone: "faint" }),    // 肩線縫線
      L(k.ringSeam(torsoRing, 135, P), { tone: "faint" }),             // 腰帶分割
    ].join(""),
  }));
  // 右側袖口（+x 面）
  out.push(L(k.sideRing([SIDE, 4, 168], 22, "x", P, 40), { tone: "lo" }));
  out.push(L(k.sideRing([SIDE, 4, 168], 18, "x", P, 40), { tone: "faint" }));
  // 右側縫線
  out.push(L(path3([[SIDE, 4, HIP + 9], [SIDE, 4, 146]]), { tone: "faint" }));
  // 背面中心縫線
  out.push(L(path3([[0, BACK, HIP + 9], [0, BACK, SHOULDER - 9]]), { tone: "faint" }));
  // 領口
  out.push(S(k.cylinder(0, -6, NECK_R + 5, SHOULDER, 7, P, 48, 0.6), { tone: "mid" }));
  out.push(S(k.cylinder(0, -6, NECK_R, SHOULDER + 7, 0.2, P, 48), { tone: "lo", flat: true }));
  out.push(L(k.ring(0, -6, NECK_R + 2.5, SHOULDER + 7, P, 48), { tone: "faint" }));
  return out.join("");
}

// ---------- 展示人台的脖子（從領口伸出） ----------
function mannequinNeck() {
  const out = [];
  out.push(S(k.cylinder(0, -6, 13, SHOULDER + 7, 26, P, 40), { tone: "lo", crease: "none" }));
  out.push(L(k.sideArc(0, -6, 13, SHOULDER + 20, P, 24), { tone: "faint" }));
  out.push(S(k.cylinder(0, -6, 14.5, SHOULDER + 33, 3, P, 40, 0.6), { tone: "mid" }));
  out.push(S(k.cylinder(0, -6, 3, SHOULDER + 36, 4, P, 18), { tone: "mid" }));
  out.push(L(k.knurl(0, -6, 3, SHOULDER + 36, SHOULDER + 40, 14, P), { tone: "lo" }));
  return out.join("");
}

// ---------- 風扇 ----------
const fanFrame = (f) => G.frameOf([f.x, BACK, f.z], [0, 1, 0], [1, 0, 0], [0, 0, 1]);
function bladesAt(f, phase) {
  const F = fanFrame(f);
  // 每片扇葉是一片彎曲的葉面：前緣、外緣、後緣、內緣圍成一個封閉形狀
  const r0 = 4.6, r1 = FAN_R - 3.6, width = 0.42, sweep = 0.5, s = FAN_T - 1.6, n = 8;
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
function fan(f) {
  const F = fanFrame(f);
  const out = [];
  out.push(S(G.ringBand(0, FAN_T, FAN_R - 3, FAN_R, F, P), { tone: "mid" }));                 // 外框
  out.push(S(G.disc(0, 1.2, FAN_R - 3, F, P), { tone: "lo", flat: true }));                    // 風道底
  out.push(S(G.disc(0, FAN_T - 1, 4.4, F, P), { tone: "mid" }));                               // 馬達座
  out.push(`<path data-part="${f.id}-blades" class="vest-blade" d="${bladesAt(f, 0)}"/>`);
  out.push(L([7, 11, 15].map((r) => G.circleOf(F, FAN_T + 0.2, r, P)).join(""), { tone: "lo" })); // 防護網
  out.push(L(G.spokesOf(F, FAN_T + 0.2, 4.4, FAN_R - 3, 4, P, { phase: Math.PI / 4 }), { tone: "lo" }));
  out.push(D(G.dotsOf(F, FAN_T, FAN_R - 1.5, 4, P, { all: true, phase: Math.PI / 4 }), { size: 0.5 }));
  out.push(D([at(G.pointOf(F, FAN_T + 0.2, 0, 0))], { size: 0.6, tone: "hi" }));
  return titled({ id: f.id, zh: tr(`風扇 ${f.id.slice(1)}（${f.zone === "upper" ? "上方" : "下方"}，12V）`, `Fan ${f.id.slice(1)} (${f.zone}, 12V)`) }, out.join(""));
}

// ---------- 溫濕度感測器（背面上緣） ----------
function dht() {
  const plan = { x: -8, y: BACK, w: 16, d: 3, r: 0.8 };
  const out = [S(k.slabOf(plan, 184, 14, P, 3, 0.4), { tone: "hi" })];
  for (let i = 0; i < 4; i++) out.push(L(path3([[-5 + i * 3.4, BACK + 3, 187], [-5 + i * 3.4, BACK + 3, 195]]), { tone: "lo" }));
  return titled({ id: "dht", zh: tr("DHT11 溫濕度感測器", "DHT11 temperature and humidity sensor") }, out.join(""));
}

// ---------- 右腰：電池盒與控制盒 ----------
const BATT = { x: SIDE, y: 8, w: 16, d: 26, r: 4 };
const BATT_Z = 72, BATT_H = 46;
const BOX = { x: SIDE, y: -30, w: 13, d: 30, r: 2 };
const BOX_Z = 76, BOX_H = 36;
function battery() {
  const out = [S(k.slabOf(BATT, BATT_Z, BATT_H, P, 6, 1), { tone: "hi" })];
  const fx = BATT.x + BATT.w;
  for (let i = 0; i < 4; i++) out.push(D([at([fx, BATT.y + 7 + i * 4, BATT_Z + 36])], { size: 0.9, tone: i < 3 ? "hi" : "lo" }));
  out.push(S(k.cylinder(BATT.x + BATT.w / 2, BATT.y + 18, 3, BATT_Z + BATT_H, 3, P, 20), { tone: "mid" }));   // DC 輸出
  out.push(L(k.ring(BATT.x + BATT.w / 2, BATT.y + 18, 1.2, BATT_Z + BATT_H + 3, P, 12), { tone: "lo" }));
  out.push(S(k.slabOf({ x: BATT.x + 4, y: BATT.y + 5, w: 8, d: 4, r: 1 }, BATT_Z + BATT_H, 1.2, P, 2), { tone: "lo" })); // USB 孔
  out.push(L(path3([[fx, BATT.y + 3, BATT_Z + 8], [fx, BATT.y + BATT.d - 3, BATT_Z + 8]]), { tone: "faint" }));
  return titled({ id: "battery", zh: tr("12V 電池盒（DC 輸出接風扇、USB 供電給 ESP32）", "12V battery pack (DC to the fans, USB to the ESP32)") }, out.join(""));
}
function controlBox() {
  const out = [S(k.slabOf(BOX, BOX_Z, BOX_H, P, 4, 0.8), { tone: "mid" })];
  const lid = { x: BOX.x + 1, y: BOX.y + 1, w: BOX.w - 2, d: BOX.d - 2, r: 1.5 };
  out.push(L(k.planOutline(lid, BOX_Z + BOX_H, P), { tone: "faint" }));
  out.push(D(k.corners(BOX, 2.6).map(([x, y]) => at([x, y, BOX_Z + BOX_H])), { size: 0.45 }));
  const fx = BOX.x + BOX.w;
  // 側面散熱槽
  for (let i = 0; i < 5; i++) out.push(L(path3([[fx, BOX.y + 6 + i * 4.4, BOX_Z + 8], [fx, BOX.y + 6 + i * 4.4, BOX_Z + 20]]), { tone: "lo" }));
  out.push(L(path3([[fx, BOX.y + 4, BOX_Z + 28], [fx, BOX.y + BOX.d - 4, BOX_Z + 28]]), { tone: "faint" }));
  // 線材出口
  out.push(S(k.cylinder(BOX.x + 6.5, BOX.y + 8, 2.4, BOX_Z + BOX_H, 3, P, 18), { tone: "lo" }));
  out.push(S(k.cylinder(BOX.x + 6.5, BOX.y + 22, 2.4, BOX_Z + BOX_H, 3, P, 18), { tone: "lo" }));
  return titled({ id: "box", zh: tr("控制盒：ESP32、D4184 ×2、INA219、保險絲、1N5819", "Control box: ESP32, 2 × D4184, INA219, fuse, 1N5819") }, out.join(""));
}

// ---------- 肩上：觸控、狀態燈、蜂鳴器；領口：心率 ----------
function shoulder() {
  const out = [];
  const pad = { x: 30, y: -16, w: 18, d: 14, r: 1.2 };
  out.push(titled({ id: "touch", zh: tr("觸控按鈕（TTP223）：碰一下換風速、按住切換自動／手動", "Touch button (TTP223): tap to change speed, hold to switch auto and manual") },
    S(k.slabOf(pad, SHOULDER, 1.8, P, 3, 0.4), { tone: "hi" }) +
    L([2, 3.6, 5.2].map((r) => k.ring(pad.x + 7, pad.y + 7, r, SHOULDER + 1.8, P, 28)).join(""), { tone: "lo" }) +
    D([at([pad.x + 7, pad.y + 7, SHOULDER + 1.8])], { size: 0.5, tone: "mid" })));
  out.push(titled({ id: "led", zh: tr("WS2812B 狀態燈：顏色代表溫度等級", "WS2812B status light: its colour shows the temperature level") },
    S(k.cylinder(43, 6, 4.4, SHOULDER, 2, P, 24), { tone: "mid" }) +
    `<path data-part="led-dome" class="vest-led" d="${k.cylinder(43, 6, 2.8, SHOULDER + 2, 1.6, P, 24).fill}"/>`));
  out.push(titled({ id: "buzzer", zh: tr("蜂鳴器：中暑、心率、喝水提醒", "Buzzer: heat, heart-rate and drink reminders") },
    S(k.cylinder(-40, 4, 6, SHOULDER, 5, P, 32, 0.5), { tone: "mid" }) +
    L(k.ring(-40, 4, 1.6, SHOULDER + 5, P, 16) + k.ring(-40, 4, 4, SHOULDER + 5, P, 24), { tone: "lo" })));
  out.push(titled({ id: "pulse", zh: tr("心率感測器（類比 PulseSensor）：貼在領口內側", "Pulse sensor (analog PulseSensor) inside the collar") },
    S(k.cylinder(0, 11, 3.4, SHOULDER + 7.2, 1.4, P, 24), { tone: "hi" }) +
    D([at([0, 11, SHOULDER + 8.6])], { size: 0.7, tone: "hi" })));
  return out.join("");
}

// ---------- 線材 ----------
function cables() {
  const top = BOX_Z + BOX_H + 3;
  const out = [];
  // 電池 DC → 控制盒
  out.push(k.wireSvg(at([BATT.x + BATT.w / 2, BATT.y + 18, BATT_Z + BATT_H + 3]), at([BOX.x + 6.5, BOX.y + 22, top]), { via: [at([BATT.x + BATT.w / 2, BATT.y + 18, top + 10]), at([BOX.x + 6.5, BOX.y + 22, top + 10])], tone: "mid" }));
  // 控制盒 → 上方、下方風扇（沿右側面往後背）
  const exit = [BOX.x + 6.5, BOX.y + 8, top];
  for (const [f, z] of [[FANS[1], 150], [FANS[3], 124]]) {
    out.push(k.wireSvg(at(exit), at([f.x + FAN_R, BACK + FAN_T / 2, f.z]), {
      via: [at([exit[0], exit[1], z]), at([SIDE + 1, 30, z]), at([SIDE - 8, BACK + 1, z]), at([f.x + FAN_R + 6, BACK + 1, f.z])],
      tone: "lo", flow: true,
    }));
  }
  // 上下兩組各自的一分二
  for (const [a, b] of [[FANS[1], FANS[0]], [FANS[3], FANS[2]]]) {
    out.push(k.wireSvg(at([a.x - FAN_R, BACK + FAN_T / 2, a.z]), at([b.x + FAN_R, BACK + FAN_T / 2, b.z]), { tone: "lo" }));
  }
  // 肩上元件 → 控制盒（沿右側面）
  out.push(k.wireSvg(at([pad0.x + 18, pad0.y + 7, SHOULDER + 1]), at([BOX.x + 2, BOX.y + 15, BOX_Z + BOX_H]), {
    via: [at([SIDE + 0.5, -16 + 7, SHOULDER - 2]), at([SIDE + 0.5, -16, BOX_Z + BOX_H + 8])], tone: "faint", dotted: true,
  }));
  return out.join("");
}
const pad0 = { x: 30, y: -16 };

// ---------- 手機（藍牙控制頁） ----------
const PHONE = { x: -88, y: 20, w: 34, d: 60, r: 5 };
function phone() {
  const out = [`<path class="iso-halo" d="${k.haloOf(k.insetPlan(PHONE, 2), 0, 0.1, P)}" style="filter:blur(3px)"/>`];
  out.push(S(k.slabOf(PHONE, 0, 3.4, P, 6, 0.6), { tone: "mid" }));
  const screen = k.insetPlan(PHONE, 2.4);
  out.push(S(k.slabOf(screen, 3.4, 0.1, P, 4), { tone: "lo", flat: true, crease: "none" }));
  // 儀表弧與數字
  const c = [PHONE.x + PHONE.w / 2, PHONE.y + 22];
  out.push(L(k.ring(c[0], c[1], 9, 3.6, P, 40), { tone: "faint" }));
  out.push(`<path data-part="phone-arc" class="iso-line" data-tone="lit" d="" style="stroke-width:1.4"/>`);
  out.push(k.faceTextSvg(k.topMatrix([c[0], c[1] + 2], 3.6, P, "x"), "—", { size: 4.2, tone: "hi", anchor: "middle" }).replace("<text", '<text data-part="phone-temp"'));
  for (let i = 0; i < 3; i++) out.push(L(k.lineOnTop([PHONE.x + 7, PHONE.y + 40 + i * 5], [PHONE.x + PHONE.w - 7, PHONE.y + 40 + i * 5], 3.6, P), { tone: "faint", free: "both" }));
  out.push(D([at([PHONE.x + PHONE.w / 2, PHONE.y + PHONE.d - 4, 3.4])], { size: 0.6, tone: "lo" }));
  return titled({ id: "phone", zh: tr("手機控制頁（藍牙 BLE）", "Phone control page (Bluetooth LE)") }, out.join(""));
}

// ---------- 組合（由後往前畫） ----------
const fansSorted = [...FANS].sort((a, b) => k.depthOf([a.x, BACK, a.z], P) - k.depthOf([b.x, BACK, b.z], P));
const svg = k.figureSvg({
  width: WIDTH,
  height: HEIGHT,
  label: tr("智能溫控風扇背心的成品立體圖：背心穿在展示架上，背後上下各兩顆 12V 風扇，右腰是電池盒與控制盒，肩上有觸控按鈕、狀態燈與蜂鳴器，領口內側有心率感測器，底座上放著顯示即時溫度的手機。", "The finished smart cooling vest on a display stand: two 12V fans high and two low on the back, a battery pack and control box at the right hip, a touch button, status light and buzzer on the shoulder, a pulse sensor inside the collar, and a phone on the base showing the live temperature."),
  body: [base(), phone(), stand(), vestBody(), dht(), ...fansSorted.map(fan), battery(), controlBox(), cables(), mannequinNeck(), shoulder()],
});

// 預先算好每顆風扇的扇葉轉動畫格
const bladeFrames = Object.fromEntries(FANS.map((f) => [f.id, Array.from({ length: PHASES }, (_, i) => bladesAt(f, (i / PHASES) * (Math.PI * 2 / BLADES)))]));
const phoneC = [PHONE.x + PHONE.w / 2, PHONE.y + 22];

const words = EN ? { inside: "Inside ", upper: "upper ", lower: "lower ", hr: "heart ", alert: " (alert)" } : { inside: "背心內 ", upper: "上方 ", lower: "下方 ", hr: "心率 ", alert: "（警報）" };
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

const css = `<style>.vest-blade{fill:var(--anatomy-hi);fill-opacity:.35;stroke:var(--anatomy-lit);stroke-width:.7;stroke-linejoin:round}.vest-led{fill:#0078ff;stroke:var(--anatomy-hi);stroke-width:.6;filter:drop-shadow(0 0 3px currentColor)}</style>`;
const body = css + k.plateHtml({
  fig: "Fig 1",
  title: tr("智能溫控風扇背心", "Smart cooling vest"),
  hint: tr("左右移動滑鼠改變溫度；方向鍵每次 1°C", "Move left and right to change the temperature; arrow keys step 1°C"),
  readout: tr("背心內 25.0°C · 上方 0% · 下方 0%", "Inside 25.0°C · upper 0% · lower 0%"),
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
