import { EventEmitter } from 'node:events';
import * as os from 'node:os';
import { Gpio } from 'onoff';

const GPIOPortMapSizeMax = 1024;
const Uint16Max = 65535;

function parseUint16(parseString) {
  const n = Number.parseInt(parseString, 10);
  if (0 <= n && n <= Uint16Max) return n;
  throw new RangeError(`Must be between 0 and ${Uint16Max}.`);
}

// カーネル6.6以降のオフセット
const GpioOffset =
  process.platform === "linux" &&
  os.release().localeCompare("6.6", undefined, { numeric: true }) >= 0
    ? 512
    : 0;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export class InvalidAccessError extends Error {
  constructor(message) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class OperationError extends Error {
  constructor(message) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class GPIOPortMap extends Map {}

export class GPIOAccess extends EventEmitter {
  constructor(ports) {
    super();
    this._ports = ports || new GPIOPortMap();
    this.onchange = null;

    this._ports.forEach((port) => {
      port.on("change", (event) => {
        this.emit("change", event);
      });
    });

    this.on("change", (event) => {
      if (typeof this.onchange === "function") {
        this.onchange(event);
      }
    });
  }

  get ports() {
    return this._ports;
  }

  async unexportAll() {
    const promises = Array.from(this.ports.values()).map(async (port) => {
      let isExported = false;
      try {
        isExported = port.exported; 
      } catch (error) {
        if (error.message === "Unknown export.") return;
        throw error;
      }

      if (isExported) {
        await port.unexport();
      }
    });
    await Promise.all(promises);
  }
}

export class GPIOPort extends EventEmitter {
  constructor(portNumber) {
    super();
    this._portNumber = parseUint16(portNumber.toString()) + GpioOffset;
    
    this._direction = new OperationError("Unknown direction.");
    this._exported = new OperationError("Unknown export.");
    this._exportRetry = 0;
    
    this._gpio = null;
    this.onchange = null;

    this.on("change", (event) => {
      if (typeof this.onchange === "function") {
        this.onchange(event);
      }
    });
  }

  get portNumber() { return this._portNumber; }
  get portName() { return `gpio${this._portNumber}`; }
  get pinName() { return ""; }
  
  get direction() {
    if (this._direction instanceof OperationError) throw this._direction;
    return this._direction;
  }
  
  get exported() {
    if (this._exported instanceof OperationError) throw this._exported;
    return this._exported;
  }

  async export(direction, options = {}) {
    if (direction !== "in" && direction !== "out") {
      throw new InvalidAccessError(`Must be "in" or "out".`);
    }
    
    // 既存挙動の再現: 既にexport済みの場合でも再設定を許容する
    if (!(this._exported instanceof OperationError) && this._exported === true) {
      if (this._gpio) {
        this._gpio.unexport(); // 古い設定を破棄
        this._gpio = null;
      }
    }

    let edge = 'none';
    const onoffOptions = {};

    if (direction === 'in') {
      edge = options.edge || 'both';
      if (options.debounce !== undefined) onoffOptions.debounceTimeout = options.debounce;
      if (options.activeLow !== undefined) onoffOptions.activeLow = options.activeLow;
    }

    let success = false;
    let lastError = null;

    for (let retry = 0; retry <= 10; retry++) {
      try {
        this._gpio = new Gpio(this._portNumber, direction, edge, onoffOptions);
        success = true;
        break;
      } catch (error) {
        lastError = error;
        if (retry < 10) {
          await sleep(100);
          console.warn(`[WebGPIO] May be the first time port access. Retry ${retry + 1}..`);
        }
      }
    }

    if (!success) {
      this._exported = new OperationError(lastError.message);
      throw this._exported;
    }

    if (direction === 'in' && edge !== 'none') {
      this._gpio.watch((err, value) => {
        if (err) return; // 既存コードに合わせ、エラー時は発火しない
        this.emit("change", { value, port: this });
      });
    }

    this._direction = direction;
    this._exported = true;
    this._exportRetry = 0;
  }

  async unexport() {
    if (this._exported instanceof OperationError || !this._exported || !this._gpio) {
      return;
    }

    try {
      this._gpio.unexport();
    } catch (error) {
      throw new OperationError(error.message);
    } finally {
      this._gpio = null;
      this._exported = false;
      this._direction = new OperationError("Unknown direction.");
    }
  }

  async read() {
    if (this._exported instanceof OperationError || !this._exported || this._direction !== "in") {
      throw new InvalidAccessError(`The exported must be true and direction must be "in".`);
    }

    try {
      return await this._gpio.read();
    } catch (error) {
      throw new OperationError(error.message);
    }
  }

  async write(value) {
    if (this._exported instanceof OperationError || !this._exported || this._direction !== "out") {
      throw new InvalidAccessError(`The exported must be true and direction must be "out".`);
    }

    try {
      // 既存挙動の再現: parseUint16 による緩いパースと RangeError の委譲
      const parsedValue = parseUint16(value.toString());
      await this._gpio.write(parsedValue);
    } catch (error) {
      if (error instanceof RangeError) throw error;
      throw new OperationError(error.message);
    }
  }
}

export async function requestGPIOAccess() {
  const ports = new GPIOPortMap();
  for (let portNumber = 0; portNumber < GPIOPortMapSizeMax; portNumber++) {
    ports.set(portNumber, new GPIOPort(portNumber));
  }
  return new GPIOAccess(ports);
}
