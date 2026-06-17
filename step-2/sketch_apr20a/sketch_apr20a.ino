#include <BLEDevice.h>
#include <BLEAdvertising.h>
#include "esp_gap_ble_api.h"

#define TAG_NAME "ChildTag_01"

BLEAdvertising* pAdvertising;


void setup() {
  Serial.begin(115200);

  BLEDevice::init(TAG_NAME);
 esp_ble_tx_power_set(ESP_BLE_PWR_TYPE_DEFAULT, ESP_PWR_LVL_P9);
  pAdvertising = BLEDevice::getAdvertising();
  pAdvertising->setMinInterval(0x20);
  pAdvertising->setMaxInterval(0x40);

  BLEAdvertisementData advData;
  advData.setName(TAG_NAME);
  advData.setFlags(0x06);
  pAdvertising->setAdvertisementData(advData);
  pAdvertising->start();

  Serial.println("Tag broadcasting: " + String(TAG_NAME));
}

void loop() {
  delay(500);
}