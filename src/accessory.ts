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

let currentHsvState: hsvData = {h:0, s:0, v:0, ct:2700};

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

  private readonly log: Logging;
  private readonly name: string;
  private host: string;

  private readonly ledService: Service;
  private readonly informationService: Service;

  constructor(log: Logging, config: AccessoryConfig, api: API) {
    this.log = log;
    this.name = config.name;
    this.host = config.hostName;

    this.ledService = new hap.Service.Lightbulb(this.name);

    this.ledService.getCharacteristic(hap.Characteristic.Hue)
    .on(CharacteristicEventTypes.GET, (callback: CharacteristicGetCallback) => {
      let hue = currentHsvState.h as number;
      callback(undefined, hue);
    })
    .on(CharacteristicEventTypes.SET, (value: CharacteristicValue, callback: CharacteristicSetCallback) => {
      currentHsvState.h = value as number;
      this.sendUpdate();
      callback();
    });

    this.ledService.getCharacteristic(hap.Characteristic.Saturation)
    .on(CharacteristicEventTypes.GET, (callback: CharacteristicGetCallback) => {
      let sat = currentHsvState.s as number;
      callback(undefined, sat);
    })
    .on(CharacteristicEventTypes.SET, (value: CharacteristicValue, callback: CharacteristicSetCallback) => {
      currentHsvState.s = value as number;
      this.sendUpdate();
      callback();
    });

    this.ledService.getCharacteristic(hap.Characteristic.Brightness)
    .on(CharacteristicEventTypes.GET, (callback: CharacteristicGetCallback) => {
      let brightness = currentHsvState.v as number;
      callback(undefined, brightness);
      
    })
    .on(CharacteristicEventTypes.SET, (value: CharacteristicValue, callback: CharacteristicSetCallback) => {
      currentHsvState.v = value as number;
      this.sendUpdate();
      callback();
    });

    this.ledService.getCharacteristic(hap.Characteristic.ColorTemperature)
    .on(CharacteristicEventTypes.GET, (callback: CharacteristicGetCallback) => {
      let ct = currentHsvState.ct as number;
      let m = 1000000/ct;
      callback(undefined, m);
      
    })
    .on(CharacteristicEventTypes.SET, (value: CharacteristicValue, callback: CharacteristicSetCallback) => {
      let m = value as number;
      currentHsvState.ct = 1000000/m;

      this.sendUpdate();
      callback();
    });

    this.ledService.getCharacteristic(hap.Characteristic.On) 
      .on(CharacteristicEventTypes.GET, (callback: CharacteristicGetCallback) => {

        //this.getUpdate();
        let state: boolean = currentHsvState.v > 0 ? true : false;
        callback(undefined, state);

      })
      .on(CharacteristicEventTypes.SET, (value: CharacteristicValue, callback: CharacteristicSetCallback) => {
        currentHsvState.v = value as boolean ? 100 :0;
        this.sendUpdate();

        callback();
      });

    this.informationService = new hap.Service.AccessoryInformation()
      .setCharacteristic(hap.Characteristic.Manufacturer, "Selbstbau")
      .setCharacteristic(hap.Characteristic.Model, "RGBWW Wifi Led Controller")
      .setCharacteristic(hap.Characteristic.SoftwareRevision, version);

      const timer = setInterval(() => {
        this.getUpdate();
      }, 1000*60);

    log.info("Finished initializing!");
  }

  sendUpdate(): void {

    //let req;

    let options = {
      host: this.host,
      path: '/color',
      method: 'POST',
      timeout: 5000,
      headers: {
        'Content-Type': 'application/json;charset=utf-8'
      }
    }

    request(options, response => {
      let result;
      const chunks: any = [];
      response.on('data', (chunk) => {
        chunks.push(chunk);
      });
      response.on('end', () => {
        result = Buffer.concat(chunks).toString();
        this.log.debug("received result in post:"+result);
      });
    })
    .on("error", (err) => {
      this.log.error(err.message);
    })
    .end();


    /*
    try {
      req = request(
        {
          host: this.host,
          path: '/color',
          method: 'POST',
          //timeout: 5000,
          headers: {
            'Content-Type': 'application/json;charset=utf-8'
          }
        },
        
        response => {
          let result;
          const chunks: any = [];
          response.on('data', (chunk) => {
            chunks.push(chunk);
          });
          response.on('end', () => {
            result = Buffer.concat(chunks).toString();
            this.log.debug("received result in post:"+result);
          });
        }
      );
      let requestData :requestObject = {hsv: currentHsvState, cmd:"fade", t:600};
  
      this.log.debug("sending req:" +JSON.stringify(requestData));
      req.write(JSON.stringify(requestData));

    } catch(err) {
      this.log.error(err);
    }
    try {
      if(req) req.end();
    } catch(err) {
      this.log.error(err);
    }
    */  
  }

  getUpdate(): void {
    let result: any;
    //let req;

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
        this.log.debug("received result in get: " + result);
        if(result) {
          let obj : getUpdate = JSON.parse(result);
          currentHsvState = obj.hsv;
          this.ledService.updateCharacteristic(hap.Characteristic.On, currentHsvState.v > 0 ? true : false);
          this.ledService.updateCharacteristic(hap.Characteristic.Brightness, currentHsvState.v as number);
          this.ledService.updateCharacteristic(hap.Characteristic.Saturation, currentHsvState.s as number);
          this.ledService.updateCharacteristic(hap.Characteristic.ColorTemperature, currentHsvState.ct as number);
          this.ledService.updateCharacteristic(hap.Characteristic.Hue, currentHsvState.h as number);
        }
      });
    })
    .on("error", (err) => {
      this.log.error(err.message);
    })
    .end();
/*
    try {
      req = request(
        {
          host: this.host,
          path: '/color',
          method: 'GET',
        },
        response => {
          const chunks: any = [];
          response.on('data', (chunk) => {
            chunks.push(chunk);
          });
          response.on('end', () => {
            result = Buffer.concat(chunks).toString();
            this.log.debug("received result in get: " + result);
            if(result) {
              let obj : getUpdate = JSON.parse(result);
              currentHsvState = obj.hsv;
              this.ledService.updateCharacteristic(hap.Characteristic.On, currentHsvState.v > 0 ? true : false);
              this.ledService.updateCharacteristic(hap.Characteristic.Brightness, currentHsvState.v as number);
              this.ledService.updateCharacteristic(hap.Characteristic.Saturation, currentHsvState.s as number);
              this.ledService.updateCharacteristic(hap.Characteristic.ColorTemperature, currentHsvState.ct as number);
              this.ledService.updateCharacteristic(hap.Characteristic.Hue, currentHsvState.h as number);
            }
          });
        }
      );
    } catch(err) {
      this.log.error(err);
    }
    try {
      if(req) req.end();
    } catch(err) {
      this.log.error(err);
    }
    */
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