// ESP32 DevKit（38 腳，DevKitC 排列）腳位圖：node build.mjs → pinout.svg、pinout.html
// 腳位與韌體 firmware/fan_vest/fan_vest.ino 一致（韌體 1.3：觸控模組、類比心率感測器）
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const W = 1500, H = 1260;

// 功能顏色
const C = {
  pwm: "#f97316", i2c: "#3b82f6", sensor: "#16a34a", pulse: "#db2777", touch: "#7c3aed",
  led: "#0891b2", buzzer: "#ca8a04", v33: "#dc2626", gnd: "#111827", idle: "#9ca3af",
};

// 38 腳 ESP32 DevKitC（天線朝上、USB 朝下），由上往下
const LEFT = ["3V3", "EN", "VP·36", "VN·39", "IO34", "IO35", "IO32", "IO33", "IO25", "IO26", "IO27", "IO14", "IO12", "GND", "IO13", "SD2", "SD3", "CMD", "5V"];
const RIGHT = ["GND", "IO23", "IO22", "TX", "RX", "IO21", "GND", "IO19", "IO18", "IO5", "IO17", "IO16", "IO4", "IO0", "IO2", "IO15", "SD1", "SD0", "CLK"];

// 有用到的腳：板上名稱 → [功能顏色, 接到的模組、接點, 說明]
const USED = {
  IO34: ["pulse", "心率感測器 S", "類比輸入（只能輸入）"],
  IO32: ["led", "WS2812B DIN", "狀態燈"],
  IO33: ["touch", "觸控模組 S", "TTP223"],
  IO25: ["pwm", "上方 D4184 PWM", "風扇 1、2"],
  IO26: ["pwm", "下方 D4184 PWM", "風扇 3、4"],
  IO14: ["buzzer", "蜂鳴器 I/O", "主動式 3.3V"],
  "GND@L": ["gnd", "兩個 D4184 的 GND", "訊號共地"],
  IO22: ["i2c", "INA219 SCL", "I2C 時脈"],
  IO21: ["i2c", "INA219 SDA", "I2C 資料"],
  IO4: ["sensor", "DHT11 DATA", "溫濕度"],
  "GND@R": ["gnd", "所有模組 GND", "6 個模組共用"],
  "3V3@L": ["v33", "所有模組 VCC", "6 個模組共用"],
};

const BOARD = { x: 560, y: 150, w: 380, h: 850 };
const PITCH = 36;
const PIN0 = BOARD.y + 110;
const font = `font-family="'Noto Sans TC','Microsoft JhengHei','PingFang TC',sans-serif"`;
const mono = `font-family="'JetBrains Mono','Consolas','Menlo',monospace"`;

const out = [];
out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">`);
out.push(`<rect width="${W}" height="${H}" fill="#fafaf9"/>`);
out.push(`<text x="60" y="70" ${font} font-size="34" font-weight="700" fill="#111827">智能溫控風扇背心　ESP32 腳位圖</text>`);
out.push(`<text x="60" y="104" ${font} font-size="17" fill="#6b7280">ESP32 DevKit 38 腳（DevKitC 排列、WROOM-32）・韌體 1.3・以板子上印的腳位名稱為準</text>`);

// 板子
const b = BOARD;
out.push(`<rect x="${b.x + 6}" y="${b.y + 8}" width="${b.w}" height="${b.h}" rx="18" fill="#000" opacity=".08"/>`);
out.push(`<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="18" fill="#1f2937"/>`);
// 天線與模組
out.push(`<rect x="${b.x + 120}" y="${b.y + 14}" width="${b.w - 240}" height="70" rx="6" fill="#374151"/>`);
out.push(`<path d="M${b.x + 135} ${b.y + 64} h15 v-30 h15 v30 h15 v-30 h15 v30 h15 v-30 h15 v30 h15 v-30 h15 v30" fill="none" stroke="#d1d5db" stroke-width="3"/>`);
out.push(`<rect x="${b.x + 110}" y="${b.y + 96}" width="${b.w - 220}" height="230" rx="6" fill="#9ca3af"/>`);
out.push(`<rect x="${b.x + 118}" y="${b.y + 104}" width="${b.w - 236}" height="214" rx="4" fill="#d1d5db"/>`);
out.push(`<text x="${b.x + b.w / 2}" y="${b.y + 200}" ${mono} font-size="20" font-weight="700" fill="#374151" text-anchor="middle">ESP32</text>`);
out.push(`<text x="${b.x + b.w / 2}" y="${b.y + 228}" ${mono} font-size="15" fill="#4b5563" text-anchor="middle">WROOM-32</text>`);
// 晶片、按鈕、USB
out.push(`<rect x="${b.x + b.w / 2 - 45}" y="${b.y + 420}" width="90" height="56" rx="4" fill="#111827"/>`);
out.push(`<text x="${b.x + b.w / 2}" y="${b.y + 453}" ${mono} font-size="13" fill="#9ca3af" text-anchor="middle">CH340</text>`);
for (const [x, label] of [[b.x + b.w / 2 - 55, "EN"], [b.x + b.w / 2 + 55, "BOOT"]]) {
  out.push(`<rect x="${x - 20}" y="${b.y + b.h - 170}" width="40" height="30" rx="4" fill="#e5e7eb"/><circle cx="${x}" cy="${b.y + b.h - 155}" r="9" fill="#4b5563"/>`);
  out.push(`<text x="${x}" y="${b.y + b.h - 120}" ${mono} font-size="13" fill="#d1d5db" text-anchor="middle">${label}</text>`);
}
out.push(`<rect x="${b.x + b.w / 2 - 38}" y="${b.y + b.h - 40}" width="76" height="56" rx="6" fill="#d1d5db" stroke="#6b7280" stroke-width="2"/>`);
out.push(`<text x="${b.x + b.w / 2}" y="${b.y + b.h + 44}" ${font} font-size="15" fill="#6b7280" text-anchor="middle">USB（接電池的 USB 孔供電）</text>`);

// 腳位與連線
const seen = new Set();
function pins(list, side) {
  const left = side === "L";
  list.forEach((name, i) => {
    const y = PIN0 + i * PITCH;
    let key = USED[name] ? name : USED[`${name}@${side}`] ? `${name}@${side}` : null;
    if (key && seen.has(key)) key = null;  // 同名的 GND 只標第一支
    if (key) seen.add(key);
    const use = key && USED[key];
    const col = use ? C[use[0]] : C.idle;
    const px = left ? b.x + 22 : b.x + b.w - 22;
    // 焊點
    out.push(`<circle cx="${px}" cy="${y}" r="11" fill="${use ? col : "#4b5563"}" stroke="#e5e7eb" stroke-width="3"/>`);
    // 板上腳位名
    out.push(`<text x="${left ? px + 22 : px - 22}" y="${y + 6}" ${mono} font-size="16" font-weight="${use ? 700 : 400}" fill="${use ? "#f9fafb" : "#9ca3af"}" text-anchor="${left ? "start" : "end"}">${name.replace("·", " ")}</text>`);
    if (!use) return;
    // 連線與標籤
    const x0 = left ? b.x - 4 : b.x + b.w + 4;
    const x1 = left ? b.x - 70 : b.x + b.w + 70;
    out.push(`<line x1="${x0}" y1="${y}" x2="${x1}" y2="${y}" stroke="${col}" stroke-width="4" stroke-linecap="round"/>`);
    out.push(`<circle cx="${x1}" cy="${y}" r="5" fill="${col}"/>`);
    const tagW = 300;
    const tx = left ? x1 - 14 - tagW : x1 + 14;
    out.push(`<rect x="${tx}" y="${y - 17}" width="${tagW}" height="34" rx="8" fill="#fff" stroke="${col}" stroke-width="2"/>`);
    out.push(`<rect x="${left ? tx + tagW - 8 : tx}" y="${y - 17}" width="8" height="34" rx="3" fill="${col}"/>`);
    const gpio = /^IO\d+$/.test(name) ? `GPIO${name.slice(2)}` : name;
    out.push(`<text x="${left ? tx + tagW - 18 : tx + 18}" y="${y + 6}" ${font} font-size="16" fill="#111827" text-anchor="${left ? "end" : "start"}"><tspan font-weight="700">${use[1]}</tspan><tspan fill="#6b7280" font-size="14">　${gpio}</tspan></text>`);
    const nx = left ? tx - 12 : tx + tagW + 12;
    out.push(`<text x="${nx}" y="${y + 5}" ${font} font-size="13.5" fill="#6b7280" text-anchor="${left ? "end" : "start"}">${use[2]}</text>`);
  });
}
pins(LEFT, "L");
pins(RIGHT, "R");

// 圖例
const legend = [["pwm", "風扇 PWM"], ["i2c", "I2C"], ["sensor", "溫濕度"], ["pulse", "心率（類比）"], ["touch", "觸控"], ["led", "狀態燈"], ["buzzer", "蜂鳴器"], ["v33", "3.3V"], ["gnd", "GND"], ["idle", "未使用"]];
legend.forEach(([k, label], i) => {
  const x = 60 + (i % 5) * 150, y = 1130 + Math.floor(i / 5) * 34;
  out.push(`<circle cx="${x + 8}" cy="${y - 6}" r="8" fill="${C[k]}"/><text x="${x + 24}" y="${y}" ${font} font-size="16" fill="#374151">${label}</text>`);
});

// 注意事項
const notes = [
  "所有模組 VCC 接 3V3，不要接 5V（INA219、心率感測器接 5V 會傷 ESP32）",
  "所有 GND 要共地：ESP32、各模組、兩個 D4184、電池負極",
  "12V 風扇電：電池 + → 3A 保險絲 → INA219 VIN+ → VIN− → 兩個 D4184 VIN+",
  "D4184 的 OUT± 接該組風扇，1N5819 並聯在 OUT±、白環接 OUT+",
  "觸控模組通電那一刻不要碰；GPIO34 是純輸入腳",
];
out.push(`<text x="830" y="1100" ${font} font-size="17" font-weight="700" fill="#111827">接線注意</text>`);
notes.forEach((n, i) => out.push(`<text x="830" y="${1130 + i * 24}" ${font} font-size="14.5" fill="#374151">・${n}</text>`));
out.push(`</svg>`);

const svg = out.join("\n");
writeFileSync(join(HERE, "pinout.svg"), svg);
writeFileSync(join(HERE, "pinout.html"), `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>ESP32 腳位圖</title><style>html,body{margin:0;background:#fafaf9}svg{display:block;width:100%;height:auto;max-width:${W}px;margin:0 auto}</style></head><body>${svg}</body></html>`);
console.log("wrote pinout.svg, pinout.html");
