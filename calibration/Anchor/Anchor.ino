#include <BLEDevice.h>
#include <BLEScan.h>
#include <BLEAdvertisedDevice.h>

// Name of tag to calibrate against
#define TARGET_TAG "ChildTag_01"

// How many readings to collect
#define NUM_READINGS 100

// BLE scan duration in seconds
#define SCAN_DURATION 1

BLEScan* pBLEScan;

// Storage for readings
int rssiReadings[NUM_READINGS];
int readingCount = 0;
bool calibrationDone = false;

// ─────────────────────────────────────
// BLE Scan Callback
// Called every time a device is found
// ─────────────────────────────────────
class ScanCallback : public BLEAdvertisedDeviceCallbacks {
  void onResult(BLEAdvertisedDevice device) {

    // Only process our specific tag
    if (device.getName() == TARGET_TAG) {

      if (readingCount < NUM_READINGS) {
        int rssi = device.getRSSI();
        rssiReadings[readingCount] = rssi;
        readingCount++;

        Serial.print("Reading ");
        Serial.print(readingCount);
        Serial.print("/");
        Serial.print(NUM_READINGS);
        Serial.print(" → RSSI: ");
        Serial.print(rssi);
        Serial.println(" dBm");
      }
    }
  }
};

// ─────────────────────────────────────
// Calculate Average RSSI
// ─────────────────────────────────────
float calculateAverage() {
  long sum = 0;
  for (int i = 0; i < NUM_READINGS; i++) {
    sum += rssiReadings[i];
  }
  return (float)sum / NUM_READINGS;
}

// ─────────────────────────────────────
// Calculate Standard Deviation
// Tells you how stable your readings are
// Lower = more stable = better calibration
// ─────────────────────────────────────
float calculateStdDev(float average) {
  float sum = 0;
  for (int i = 0; i < NUM_READINGS; i++) {
    float diff = rssiReadings[i] - average;
    sum += diff * diff;
  }
  return sqrt(sum / NUM_READINGS);
}

void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println("=============================");
  Serial.println("  BLE CALIBRATION TOOL");
  Serial.println("=============================");
  Serial.println("Instructions:");
  Serial.println("1. Upload tag code to tag ESP32");
  Serial.println("2. Place tag EXACTLY 1 meter away");
  Serial.println("3. Keep both ESP32s still");
  Serial.println("4. Wait for 100 readings");
  Serial.println("=============================");

  // Initialize BLE
  BLEDevice::init("Anchor_Calibration");
  pBLEScan = BLEDevice::getScan();
  pBLEScan->setAdvertisedDeviceCallbacks(new ScanCallback());
  pBLEScan->setActiveScan(true);
  pBLEScan->setInterval(50);
  pBLEScan->setWindow(49);

  Serial.println("Scanning for: " + String(TARGET_TAG));
  Serial.println("Starting calibration...");
}

void loop() {

  // Keep scanning until we have enough readings
  if (readingCount < NUM_READINGS) {
    pBLEScan->start(SCAN_DURATION, false);
    pBLEScan->clearResults();
  }

  // Once we have 100 readings — calculate
  if (readingCount >= NUM_READINGS && !calibrationDone) {
    calibrationDone = true;

    Serial.println("\n=============================");
    Serial.println("  CALIBRATION COMPLETE");
    Serial.println("=============================");

    // Print all raw readings
    Serial.println("\nAll Readings:");
    for (int i = 0; i < NUM_READINGS; i++) {
      Serial.print(rssiReadings[i]);
      if (i < NUM_READINGS - 1) Serial.print(", ");
      if ((i + 1) % 10 == 0) Serial.println();
    }

    // Calculate results
    float average = calculateAverage();
    float stdDev  = calculateStdDev(average);
    int   minRSSI = rssiReadings[0];
    int   maxRSSI = rssiReadings[0];

    for (int i = 1; i < NUM_READINGS; i++) {
      if (rssiReadings[i] < minRSSI) minRSSI = rssiReadings[i];
      if (rssiReadings[i] > maxRSSI) maxRSSI = rssiReadings[i];
    }

    // Print results
    Serial.println("\n=============================");
    Serial.println("  RESULTS");
    Serial.println("=============================");
    Serial.print("Average RSSI:        ");
    Serial.print(average);
    Serial.println(" dBm");

    Serial.print("Standard Deviation:  ");
    Serial.print(stdDev);
    Serial.println(" dBm");

    Serial.print("Min RSSI:            ");
    Serial.print(minRSSI);
    Serial.println(" dBm");

    Serial.print("Max RSSI:            ");
    Serial.print(maxRSSI);
    Serial.println(" dBm");

    Serial.println("\n=============================");
    Serial.println("  YOUR TXPOWER VALUE");
    Serial.println("=============================");
    Serial.print("Use this in your code:  TxPower = ");
    Serial.println((int)average);

    // Quality check
    Serial.println("\n=============================");
    Serial.println("  CALIBRATION QUALITY");
    Serial.println("=============================");
    if (stdDev < 3.0) {
      Serial.println("EXCELLENT — StdDev < 3");
      Serial.println("Your environment is stable");
    } else if (stdDev < 5.0) {
      Serial.println("GOOD — StdDev 3-5");
      Serial.println("Acceptable for senior project");
    } else if (stdDev < 8.0) {
      Serial.println("FAIR — StdDev 5-8");
      Serial.println("Consider recalibrating");
      Serial.println("Move away from metal objects");
    } else {
      Serial.println("POOR — StdDev > 8");
      Serial.println("Too much interference");
      Serial.println("Change location and retry");
    }

    Serial.println("\n=============================");
    Serial.println("Calibration finished.");
    Serial.println("Note your TxPower value above");
    Serial.println("You will need it in Step 2");
    Serial.println("=============================");
  }
}