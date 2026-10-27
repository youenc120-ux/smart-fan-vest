# 溫控風扇背心

把市售空調服（12V 電池、四顆風扇）改裝成**依溫度自動調速**的風扇背心，用手機**藍牙**控制。

- 溫度感測器即時監測背心內溫度，ESP32 依溫度自動調整風速（PWM）
- 自動／手動兩種模式，手動模式用滑桿調整風速
- 遲滯控制：28°C 啟動、降到 27°C 以下才停止，避免風扇在門檻附近反覆開關
- 感測器故障時以 70% 安全轉速運轉，不會停止散熱
- 電流感測（INA219）：手機即時顯示電流、電壓、功率；超過 3A 自動停止風扇，風扇沒接好也會提醒
- 手機用瀏覽器直接連線，免安裝 App；開過一次後離線也能使用

## 專案結構

```
firmware/fan_vest/fan_vest.ino   ESP32 韌體（BLE）
docs/                            手機控制頁（GitHub Pages）
hardware/circuit.svg             接線圖
```

## 材料

| 元件 | 規格 | 數量 |
|---|---|---|
| 微控制器 | ESP32 DevKit（ESP32-WROOM-32） | 1 |
| 溫度感測器 | DS18B20 防水探頭 | 1 |
| 電流／電壓感測模組 | INA219（0.1Ω 分流電阻，最大約 3.2A） | 1 |
| MOSFET 驅動模組 | D4184 | 1 |
| 蕭特基二極體 | 1N5819 | 1 |
| 電阻 | 4.7kΩ（DS18B20 上拉） | 1 |
| 保險絲 | 3A | 1 |
| DC 轉接線 | 5.5×2.1 公＋母 | 1 組 |
| USB 線 | 電池 USB 孔 → ESP32 | 1 |

## 接線

![接線圖](hardware/circuit.svg)

| ESP32 | 接到 |
|---|---|
| GPIO25 | D4184 模組 PWM |
| GPIO4 | DS18B20 DQ（另接 4.7kΩ 到 3.3V） |
| GPIO21 | INA219 SDA |
| GPIO22 | INA219 SCL |
| 3V3 | DS18B20 VCC、INA219 VCC |
| GND | D4184 模組 GND、DS18B20 GND、INA219 GND |
| USB | 電池 USB 輸出孔 |

- 電池 DC 12V → 保險絲 → INA219 VIN+ → VIN− → 風扇正極（四顆並聯）
- 風扇負極 → D4184 模組（低側開關）→ GND
- 沒接 INA219 也能正常運作，只是手機上不會顯示電流
- 1N5819 並聯在風扇兩端，白環（陰極）接 +12V
- 電池調速固定在**最高段**，轉速由 ESP32 控制
- 所有 GND 必須共地

## 燒錄韌體

1. Arduino IDE 安裝 ESP32 開發板（**core 3.x**）
2. 程式庫管理員安裝 `OneWire`、`DallasTemperature`、`Adafruit INA219`
3. 開啟 `firmware/fan_vest/fan_vest.ino`，開發板選 **ESP32 Dev Module**，上傳

可調參數在程式開頭：`T_OFF`、`T_ON`、`T_MAX`（溫度門檻）、`DUTY_MIN`（風扇最低可轉動的轉速，請實測後調整）、`OVERCURRENT_MA`（過電流門檻）、`FAN_MIN_MA`（風扇斷線判斷電流）。

**過電流保護**：電流超過 `OVERCURRENT_MA` 持續 0.3 秒，風扇會立即停止。排除問題後，在手機上切換一次模式或調整風速即可恢復。

## 手機控制

開啟控制頁：**https://youenc120-ux.github.io/smart-fan-vest/**

1. 打開背心電源與手機藍牙
2. 點「連線裝置」，選擇 **FanVest**
3. 切換自動／手動，手動模式拖曳滑桿調整風速

| 平台 | 支援 |
|---|---|
| Android Chrome | ✅ |
| 電腦版 Chrome／Edge | ✅ |
| iPhone | 需改用 [Bluefy](https://apps.apple.com/app/bluefy-web-ble-browser/id1492822055) 瀏覽器（Safari 不支援 Web Bluetooth） |

在網址後面加上 `?demo` 可以不接硬體、用模擬資料預覽介面。

建議在 Chrome 選單選「加到主畫面」，之後像 App 一樣開啟。

## BLE 介面

服務 UUID `7a1e0001-5c2b-4f0a-9d3e-6b8f2a4c9e10`（所有數值 little-endian）

| 特徵值 | UUID 尾碼 | 屬性 | 內容 |
|---|---|---|---|
| STATUS | `…0002…` | 讀取、通知 | int16 溫度×10（-32768 = 感測器異常）、uint8 目前轉速%、uint8 自動模式、uint8 手動設定%、uint16 電壓 mV、int16 電流 mA、uint8 狀態旗標 |
| CONTROL | `…0003…` | 寫入 | uint8 自動模式（1/0）、uint8 手動設定%（寫入時也會解除過電流保護） |
| CONFIG | `…0004…` | 讀取 | int16 T0×10、int16 T1×10、int16 T2×10、uint8 最低轉速%、uint8 故障安全轉速%、uint16 過電流門檻 mA |

狀態旗標：`0x01` 找不到 INA219、`0x02` 過電流保護已跳脫、`0x04` 風扇電流過低（可能沒接好）。
