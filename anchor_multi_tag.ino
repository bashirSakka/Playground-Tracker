/*
 * Playground Guardian — BLE Anchor (Multi-Tag)
 * Scans for ChildTag_01, ChildTag_02, ChildTag_03 simultaneously.
 * Sends { anchorID, tagID, rssi } to server for each tag seen per scan cycle.
 *
 * Change ANCHOR_ID to "A", "B", or "D" before flashing each board.
 */

#include <Arduino.h>
#include <BLEDevice.h>
#include <BLEScan.h>
#include <BLEAdvertisedDevice.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

// ─── CONFIG — change per anchor ──────────────────────────────────────────────
#define ANCHOR_ID     "D"                        // "A", "B", or "D"
#define WIFI_SSID     "Blink1EBE9D"
#define WIFI_PASS     "fadialsaka"
#define SERVER_URL    "http://10.0.0.30:5008/anchor-data"
#define SCAN_TIME     1                          // seconds per BLE scan cycle
// ─────────────────────────────────────────────────────────────────────────────

// Tags to watch — prefix match so adding Tag_04 later is one line
const char* WATCHED_TAGS[] = {
  "ChildTag_01",
  "ChildTag_02",
  "ChildTag_03"
};
const int NUM_TAGS = 3;

BLEScan* pBLEScan;

// Holds the best (strongest) RSSI seen for each tag in one scan cycle
struct TagReading {
  bool    found;
  int     rssi;
};
TagReading readings[3];   // index matches WATCHED_TAGS[]

// ─── BLE Scan Callback ────────────────────────────────────────────────────────
class ScanCallback : public BLEAdvertisedDeviceCallbacks {
  void onResult(BLEAdvertisedDevice device) override {
    if (!device.haveName()) return;

    String name = device.getName().c_str();

    for (int i = 0; i < NUM_TAGS; i++) {
      if (name == WATCHED_TAGS[i]) {
        int rssi = device.getRSSI();
        // Keep strongest reading if device advertises multiple times per scan
        if (!readings[i].found || rssi > readings[i].rssi) {
          readings[i].found = true;
          readings[i].rssi  = rssi;
        }
        break;  // name matched, no need to check other tags
      }
    }
  }
};

// ─── Send one reading to server ───────────────────────────────────────────────
void sendToServer(const char* tagID, int rssi) {
  if (WiFi.status() != WL_CONNECTED) return;

  HTTPClient http;
  http.begin(SERVER_URL);
  http.addHeader("Content-Type", "application/json");

  StaticJsonDocument<128> doc;
  doc["anchorID"] = ANCHOR_ID;
  doc["tagID"]    = tagID;
  doc["rssi"]     = rssi;

  String body;
  serializeJson(doc, body);

  int code = http.POST(body);
  if (code < 0) {
    Serial.printf("[HTTP] POST failed for %s: %s\n",
                  tagID, http.errorToString(code).c_str());
  }
  http.end();
}

// ─── Setup ────────────────────────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  Serial.printf("\nAnchor %s starting...\n", ANCHOR_ID);

  // WiFi
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.print("Connecting WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500); Serial.print(".");
  }
  Serial.printf("\nWiFi OK — IP: %s\n", WiFi.localIP().toString().c_str());

  // TX power — max range for the 3×3m room
  esp_ble_tx_power_set(ESP_BLE_PWR_TYPE_ADV,     ESP_PWR_LVL_P9);
  esp_ble_tx_power_set(ESP_BLE_PWR_TYPE_SCAN,    ESP_PWR_LVL_P9);
  esp_ble_tx_power_set(ESP_BLE_PWR_TYPE_DEFAULT, ESP_PWR_LVL_P9);

  // BLE scanner
  BLEDevice::init("");
  pBLEScan = BLEDevice::getScan();
  pBLEScan->setAdvertisedDeviceCallbacks(new ScanCallback(), true); // true = keep duplicates within scan
  pBLEScan->setActiveScan(true);
  pBLEScan->setInterval(100);
  pBLEScan->setWindow(99);

  Serial.printf("Watching %d tags. Scan interval: %ds\n", NUM_TAGS, SCAN_TIME);
}

// ─── Loop ─────────────────────────────────────────────────────────────────────
void loop() {
  // WiFi watchdog — reconnect silently if dropped
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi lost — reconnecting...");
    WiFi.reconnect();
    delay(2000);
    return;
  }

  // Clear readings before each scan
  for (int i = 0; i < NUM_TAGS; i++) {
    readings[i].found = false;
    readings[i].rssi  = 0;
  }

  // Scan
  BLEScanResults* results = pBLEScan->start(SCAN_TIME, false);
  pBLEScan->clearResults();

  // Report every tag that was seen
  int reported = 0;
  for (int i = 0; i < NUM_TAGS; i++) {
    if (readings[i].found) {
      Serial.printf("[Anchor %s] %s  RSSI: %d dBm\n",
                    ANCHOR_ID, WATCHED_TAGS[i], readings[i].rssi);
      sendToServer(WATCHED_TAGS[i], readings[i].rssi);
      reported++;
    }
  }

  if (reported == 0) {
    Serial.printf("[Anchor %s] No tags visible this cycle\n", ANCHOR_ID);
  }

  // No delay — next scan starts immediately after HTTP posts complete
}
