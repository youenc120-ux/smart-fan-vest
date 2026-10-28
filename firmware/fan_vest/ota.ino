// 無線更新韌體（OTA）
// 進入方式：開機時按住按鈕，或在手機控制頁的「診斷」按「進入無線更新模式」。
// 進入後 ESP32 會關閉藍牙、停止風扇，開一個 Wi-Fi 熱點；用手機或電腦連上後打開 http://192.168.4.1，
// 選擇 Arduino IDE「草稿碼 → 匯出已編譯的二進位檔」產生的 fan_vest.ino.bin 上傳，完成後自動重開機。
// 5 分鐘沒有上傳會自動重開機回到正常模式。

#include <WiFi.h>
#include <WebServer.h>
#include <Update.h>

const char* OTA_PASS = "fanvest123";  // 熱點密碼，至少 8 碼，請自行修改
const unsigned long OTA_TIMEOUT_MS = 5UL * 60000;

WebServer* otaServer = nullptr;
unsigned long otaStartMs = 0;

const char OTA_PAGE[] PROGMEM = R"HTML(<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>FanVest 韌體更新</title>
<style>body{font-family:sans-serif;background:#000;color:#f8fafc;max-width:420px;margin:0 auto;padding:24px}
h1{font-size:22px}p{color:#a3adbd}input,button{font-size:16px;width:100%;margin-top:12px}
button{min-height:48px;border:0;border-radius:12px;background:#fb923c;color:#000;font-weight:700}
progress{width:100%;height:16px;margin-top:16px}</style></head><body>
<h1>FanVest 韌體更新 / Firmware update</h1>
<p>選擇 .bin 檔後按上傳，完成後背心會自動重新開機。<br>Choose the .bin file and upload; the vest restarts when done.</p>
<input type="file" id="f" accept=".bin"><button id="b">上傳 Upload</button>
<progress id="p" max="100" value="0" hidden></progress><p id="m"></p>
<script>
b.onclick=()=>{const file=f.files[0];if(!file){m.textContent='請先選擇檔案 / Choose a file first';return;}
const x=new XMLHttpRequest(),d=new FormData();d.append('fw',file);p.hidden=false;
x.upload.onprogress=e=>{p.value=e.loaded/e.total*100;};
x.onload=()=>{m.textContent=x.status==200?'完成，重新開機中… / Done, restarting…':'失敗 / Failed: '+x.responseText;};
x.onerror=()=>{m.textContent='連線中斷 / Connection lost';};
x.open('POST','/update');x.send(d);};
</script></body></html>)HTML";

bool otaActive() { return otaServer != nullptr; }

void startOta() {
  if (otaActive()) return;
  ledcWrite(PIN_FAN_UPPER, 0);
  ledcWrite(PIN_FAN_LOWER, 0);
  if (BLEDevice::getInitialized()) BLEDevice::deinit(false);  // 藍牙和 Wi-Fi 同時開記憶體不夠，更新完會重開機

  WiFi.mode(WIFI_AP);
  String ssid = deviceName.length() ? deviceName + "-OTA" : String(BLE_NAME) + "-OTA";
  WiFi.softAP(ssid.c_str(), OTA_PASS);

  otaServer = new WebServer(80);
  otaServer->on("/", HTTP_GET, []() { otaServer->send_P(200, "text/html", OTA_PAGE); });
  otaServer->on(
      "/update", HTTP_POST,
      []() {
        bool ok = !Update.hasError();
        otaServer->send(ok ? 200 : 500, "text/plain", ok ? "OK" : Update.errorString());
        delay(500);
        if (ok) ESP.restart();
      },
      []() {
        HTTPUpload& up = otaServer->upload();
        if (up.status == UPLOAD_FILE_START) {
          Serial.printf("OTA 開始：%s\n", up.filename.c_str());
          Update.begin(UPDATE_SIZE_UNKNOWN);
        } else if (up.status == UPLOAD_FILE_WRITE) {
          Update.write(up.buf, up.currentSize);
        } else if (up.status == UPLOAD_FILE_END) {
          Update.end(true);
          Serial.printf("OTA 完成：%u bytes\n", up.totalSize);
        }
      });
  otaServer->begin();
  otaStartMs = millis();
  Serial.printf("無線更新模式：連上 Wi-Fi「%s」（密碼 %s），打開 http://%s\n", ssid.c_str(), OTA_PASS,
                WiFi.softAPIP().toString().c_str());
}

void otaLoop() {
  otaServer->handleClient();
  // 燈號：紫色呼吸，表示正在等待更新
  uint8_t v = (millis() / 8) % 512;
  if (v > 255) v = 511 - v;
  led.setPixelColor(0, led.Color(v / 2, 0, v));
  led.show();
  if (millis() - otaStartMs >= OTA_TIMEOUT_MS) {
    Serial.println("無線更新逾時，重新開機");
    ESP.restart();
  }
}
