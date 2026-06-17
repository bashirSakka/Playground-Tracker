#include <BLEDevice.h>
#include <BLEScan.h>
#include <BLEAdvertisedDevice.h>
#include <WiFi.h>
#include <esp_bt.h>
#include <HTTPClient.h>
#include <math.h>

// ─────────────────────────────────────
// CHANGE THESE 4 LINES PER ANCHOR
// ─────────────────────────────────────
#define ANCHOR_ID   "A"   // "A", "B", "C", "D"
#define ANCHOR_X    0     // A=0, B=3, C=0, D=3
#define ANCHOR_Y    3  // A=3, B=3, C=0, D=0
#define TXPOWER     -74   // A=-74, B=-73, C=-74, D=-73

// ─────────────────────────────────────
// THESE STAY SAME FOR ALL ANCHORS
// ─────────────────────────────────────
#define N           2.7
#define TARGET_TAG  "ChildTag_01"
#define SCAN_TIME   1

const char* ssid      = "Blink1EBE9D";
const char* password  = "fadialsaka";
const char* serverURL = "http://10.0.0.21:3000/anchor-data";

BLEScan* pBLEScan;

// ─────────────────────────────────────
/ CALCULATION
// ─────────────────────────────────────
// ─────────────────────────────────────
// SEND TO SERVER
// ─────────────────────────────────────
void sendToServer(String tagID, int rssi, floa) {
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
  payload += "\"anchorX\":"   + String(ANCHOR_X)   + ",";
  payload += "\"anchorY\":"   + String(ANCHOR_Y)   + ",";
  payload += "\"tagID\":\""   + tagID              + "\",";
  payload += "\"rssi\":"      + String(rssi)        + ",";
  payload += "\":"  + Strin);
  payload += "}";

  int response = http.POST(payload);

  Serial.println("Anchor " + String(ANCHOR_ID) +
                 " | RSSI: " + String(rssi) +
                 " dBm : " + Strin) +
                 "m | Server: " + String(response));

  http.end();
}

// ─────────────────────────────────────
// BLE CALLBACK
// ─────────────────────────────────────
class ScanCallback : public BLEAdvertisedDeviceCallbacks {
  void onResult(BLEAdvertisedDevice device) {
    if (device.getName() == TARGET_TAG) {
      int rssi       = device.getRSSI();
    
      String tagID   = device.getName().c_str();
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
  Serial.println("Position: (" + String(ANCHOR_X) +
                 "," + String(ANCHOR_Y) + ")");
  Serial.println("TxPower: " + String(TXPOWER));

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