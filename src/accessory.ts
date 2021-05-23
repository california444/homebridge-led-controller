/**
 * Copyright Roman Schlich
 * Februar 2021
 * Homebrigde Plugin for https://forum.fhem.de/index.php?topic=70738.0
 * Update URL for new vbs SW: https://raw.githubusercontent.com/verybadsoldier/esp_rgbww_fhemmodule/master/controls_espledcontroller.txt
 * API Spec: https://github.com/verybadsoldier/esp_rgbww_firmware/wiki/HTTP-Interface
 */

import {
  AccessoryConfig,
  AccessoryPlugin,
  API,
  APIEvent,
  CharacteristicEventTypes,
  CharacteristicGetCallback,
  CharacteristicSetCallback,
  CharacteristicValue,
  HAP,
  Logging,
  Service
} from "homebridge";
import { request } from 'http';

interface hsvData {
    h: number;
    s: number;
    v: number;
    ct: number;
}

interface requestObject {
    hsv: hsvData;
    cmd: string;
    t: number;
    q?: Boolean;
    d?: Number;
}

interface getUpdate {
  raw?: {
    r: number;
    g: number;
    b: number;
    ww: number;
    cw:number;
  }
  hsv: hsvData;
}

let hap: HAP;

const PLUGIN_NAME = 'homebridge-rgbww-led-controller';
const ACCESSORY_NAME = 'RGBWW-LED-Controller';
const version = require('../package.json').version; 
/*
 * Initializer function called when the plugin is loaded.
 */
export = (api: API) => {
  hap = api.hap;
  api.registerAccessory(PLUGIN_NAME, ACCESSORY_NAME, LedLight);
};

class LedLight implements AccessoryPlugin {

  private updateIntervalMinutes:number = 30;

  private currentHsvState: hsvData = {h:0, s:0, v:0, ct:2700};

  private readonly log: Logging;
  private readonly name: string;
  private host: string;
  private timer: NodeJS.Timeout;
  private api:API;

  private readonly ledService: Service;
  private readonly informationService: Service;

  constructor(log: Logging, config: AccessoryConfig, api: API) {
    this.log = log;
    this.name = config.name;
    this.host = config.hostName;
    this.api = api;

    this.ledService = new hap.Service.Lightbulb(this.name);

    this.ledService.getCharacteristic(hap.Characteristic.Hue)
    .on(CharacteristicEventTypes.GET, (callback: CharacteristicGetCallback) => {
      let hue = this.currentHsvState.h as number;
      callback(undefined, hue);
    })
    .on(CharacteristicEventTypes.SET, (value: CharacteristicValue, callback: CharacteristicSetCallback) => {
      if(this.currentHsvState.h != value as number) {
        this.currentHsvState.h = value as number;
        this.sendUpdate();
      }
      callback();
    });

    this.ledService.getCharacteristic(hap.Characteristic.Saturation)
    .on(CharacteristicEventTypes.GET, (callback: CharacteristicGetCallback) => {
      let sat = this.currentHsvState.s as number;
      callback(undefined, sat);
    })
    .on(CharacteristicEventTypes.SET, (value: CharacteristicValue, callback: CharacteristicSetCallback) => {
      if(this.currentHsvState.s != value as number) {
        this.currentHsvState.s = value as number;
        this.sendUpdate();
      }
      callback();
    });

    this.ledService.getCharacteristic(hap.Characteristic.Brightness)
    .on(CharacteristicEventTypes.GET, (callback: CharacteristicGetCallback) => {
      let brightness = this.currentHsvState.v as number;
      callback(undefined, brightness);
    })
    .on(CharacteristicEventTypes.SET, (value: CharacteristicValue, callback: CharacteristicSetCallback) => {
      if(this.currentHsvState.v != value as number) {
        this.currentHsvState.v = value as number;
        this.sendUpdate();
      }
      callback();
    });

    this.ledService.getCharacteristic(hap.Characteristic.ColorTemperature)
    .on(CharacteristicEventTypes.GET, (callback: CharacteristicGetCallback) => {
      let ct = this.currentHsvState.ct as number;
      callback(undefined, 1000000/ct);
      
    })
    .on(CharacteristicEventTypes.SET, (value: CharacteristicValue, callback: CharacteristicSetCallback) => {
      let m = value as number;
      if(this.currentHsvState.ct != 1000000/m) {
        this.currentHsvState.ct = 1000000/m;
        this.sendUpdate();
      }
      callback();
    });

    this.ledService.getCharacteristic(hap.Characteristic.On) 
      .on(CharacteristicEventTypes.GET, (callback: CharacteristicGetCallback) => {
        callback(undefined, this.currentHsvState.v > 0 ? 1:0);
      })
      .on(CharacteristicEventTypes.SET, (value: CharacteristicValue, callback: CharacteristicSetCallback) => {
        if(this.currentHsvState.v != ((value == 1) ? 100 :0)) {
          this.currentHsvState.v = (value == 1) ? 100 :0;
          this.sendUpdate();
        }
        callback();
      });

    this.informationService = new hap.Service.AccessoryInformation()
      .setCharacteristic(hap.Characteristic.Manufacturer, "Selbstbau")
      .setCharacteristic(hap.Characteristic.Model, "RGBWW Wifi Led Controller")
      .setCharacteristic(hap.Characteristic.SoftwareRevision, version);

       this.timer = setInterval(() => {
        this.getUpdate();
      }, 1000*60*this.updateIntervalMinutes);

      api.on(APIEvent.SHUTDOWN, this.shutdown.bind(this));

      this.getUpdate();
    
    log.info("Finished initializing!");
  }

  shutdown(): void {
    this.log.info("Shutdown");
    clearTimeout(this.timer);
  }

  sendUpdate(): void {
    let options = {
      host: this.host,
      path: '/color',
      method: 'POST',
      timeout: 5000,
      headers: {
        'Content-Type': 'application/json;charset=utf-8'
      }
    }
    let requestData :requestObject = {hsv: this.currentHsvState, cmd:"fade", t:600};
  
    this.log.debug("Sending request: " +JSON.stringify(requestData));

    request(options, response => {
      let result;
      const chunks: any = [];
      response.on('data', (chunk) => {
        chunks.push(chunk);
      });
      response.on('end', () => {
        result = Buffer.concat(chunks).toString();
        this.log.info("Set result: "+result);
      });
    })
    .on("error", (err) => {
      this.log.error("Set error: "+ err.message);
      this.ledService.getCharacteristic(hap.Characteristic.On)
      .updateValue(new this.api.hap.HapStatusError(this.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE));
    })
    .end(JSON.stringify(requestData));
    setTimeout(() => {
      this.getUpdate();
    }, 1000);
  }

  getUpdate(): void {
    let result: any;

    let options = {
      host: this.host,
      path: '/color',
      method: 'GET',
      timeout: 5000
    }

    request(options, response => {
      const chunks: any = [];
      response.on('data', (chunk) => {
        chunks.push(chunk);
      });
      response.on('end', () => {
        result = Buffer.concat(chunks).toString();
        this.log.debug("Cyclic status poll: " + result);
        if(result) {
          let obj : getUpdate = JSON.parse(result);
          this.currentHsvState = obj.hsv;
          if(this.currentHsvState.ct == 0) this.currentHsvState.ct = 2700;
      
          this.ledService.updateCharacteristic(hap.Characteristic.Brightness, this.currentHsvState.v as number);
          this.ledService.updateCharacteristic(hap.Characteristic.Saturation, this.currentHsvState.s as number);
          this.ledService.updateCharacteristic(hap.Characteristic.ColorTemperature, 1000000/this.currentHsvState.ct as number);
          this.ledService.updateCharacteristic(hap.Characteristic.Hue, this.currentHsvState.h as number);
          this.ledService.updateCharacteristic(hap.Characteristic.On, this.currentHsvState.v > 0 ? 1 : 0);
        }
      });
    })
    .on("error", (err) => {
      this.log.error(err.message);
      this.ledService.getCharacteristic(hap.Characteristic.On)
      .updateValue(new this.api.hap.HapStatusError(this.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE));
    })
    .end();
  }

  /*
   * This method is optional to implement. It is called when HomeKit ask to identify the accessory.
   * Typical this only ever happens at the pairing process.
   */
  identify(): void {
    this.log("Identify!"+ACCESSORY_NAME);
  }

  /*
   * This method is called directly after creation of this instance.
   * It should return all services which should be added to the accessory.
   */
  getServices(): Service[] {
    return [
      this.informationService,
      this.ledService,
    ];
  }
}