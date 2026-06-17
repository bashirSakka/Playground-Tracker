#include <BLEDevice.h>
#include <BLEAdvertising.h>

#define TAG_NAME "ChildTag_02"

BLEAdvertising* pAdvertising;

void setup() {
  Serial.begin(115200);
  Serial.println("Tag starting...");

  // Initialize BLE
  BLEDevice::init(TAG_NAME);

  // Maximum TX power
  BLEDevice::setPower(ESP_PWR_LVL_P9);
  Serial.println("TX Power set to maximum (+9 dBm)");

  // Setup advertising
  pAdvertising = BLEDevice::getAdvertising();

  // Faster advertising interval
  pAdvertising->setMinInterval(0x20);  // 20ms
  pAdvertising->setMaxInterval(0x40);  // 40ms

  BLEAdvertisementData advData;
  advData.setName(TAG_NAME);
  advData.setFlags(0x06);

  pAdvertising->setAdvertisementData(advData);

  pAdvertising->start();

  Serial.println("Tag broadcasting as: " + String(TAG_NAME));
  Serial.println("TX Power: +9 dBm (maximum)");
  Serial.println("Place exactly 1 meter from anchor");
}

void loop() {
  delay(1000);
  Serial.println("Broadcasting...");
}