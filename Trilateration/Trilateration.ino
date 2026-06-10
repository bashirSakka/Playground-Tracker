#include <BLEDevice.h>
#include <BLEScan.h>
#include <BLEAdvertisedDevice.h>
#include <WiFi.h>
#include <esp_bt.h>
#include <HTTPClient.h>

// ─────────────────────────────────────
// CHANGE THESE PER ANCHOR
// ─────────────────────────────────────
#define ANCHOR_ID  "A"
#define ANCHOR_X   0
#define ANCHOR_Y 3

// ─────────────────────────────────────
// SAME FOR ALL ANCHORS
// ─────────────────────────────────────
#define TARGET_TAG  "ChildTag_01"
#define SCAN_TIME   1

const char* ssid      = "Blink1EBE9D";
const char* password  = "fadialsaka";
const char* serverURL = "http://10.0.0.21:3000/anchor-data";

BLEScan* pBLEScan;

// ─────────────────────────────────────
// SEND TO SERVER — rssi only
// distance is calculated server-side
// ─────────────────────────────────────
void sendToServer(String tagID, int rssi) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi lost — reconnecting...");
    WiFi.begin(ssid, password);
    delay(1000);
    return;
  }

  HTTPClient http;
  http.begin(serverURL);
  http.addHeader("Content-Type", "application/json");

  String payload = "{";
  payload += "\"anchorID\":\"" + String(ANCHOR_ID) + "\",";
  payload += "\"tagID\":\""   + tagID              + "\",";
  payload += "\"rssi\":"      + String(rssi);
  payload += "}";

  int response = http.POST(payload);

  Serial.println(
    "Anchor " + String(ANCHOR_ID) +
    " | RSSI: " + String(rssi) + " dBm" +
    " | Server: " + String(response)
  );

  http.end();
}

// ─────────────────────────────────────
// BLE CALLBACK
// ─────────────────────────────────────
class ScanCallback : public BLEAdvertisedDeviceCallbacks {
  void onResult(BLEAdvertisedDevice device) {
    if (device.getName() == TARGET_TAG) {
      int rssi     = device.getRSSI();
      String tagID = device.getName().c_str();
      sendToServer(tagID, rssi);
    }
  }
};

// ─────────────────────────────────────
// SETUP
// ─────────────────────────────────────
void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println("Anchor " + String(ANCHOR_ID) + " starting...");

  // Connect WiFi
  WiFi.begin(ssid, password);
  Serial.print("Connecting to WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi connected: " + WiFi.localIP().toString());

  // Initialize BLE
  BLEDevice::init("Anchor_" + String(ANCHOR_ID));

  // ─────────────────────────────────────

  pBLEScan = BLEDevice::getScan();
  pBLEScan->setAdvertisedDeviceCallbacks(new ScanCallback());
  pBLEScan->setActiveScan(true);
  pBLEScan->setInterval(40);
  pBLEScan->setWindow(39);

  Serial.println("Scanning for: " + String(TARGET_TAG));
}

// ─────────────────────────────────────
// LOOP
// ─────────────────────────────────────
void loop() {
  pBLEScan->start(SCAN_TIME, false);
  pBLEScan->clearResults();
  delay(100);
}