import { app, BrowserWindow, ipcMain, dialog, clipboard, globalShortcut } from "electron";
import path from "path";
import { readFileSync, writeFileSync } from "fs";
import { getProcesses, openProcess, readMemory, writeMemory, findPattern, ProcessObject, T_FLOAT, T_INT, T_DOUBLE, T_STRING, DataType } from "memoryjs";

ipcMain.on('readMemory', (e, addr, type, len) => {
  if(!prc) return;
  e.returnValue = rdm(addr, type, len)
})

const read = (type:ValueType, addr:number):any => {
  if(!prc) return null;
  return type == 'byte' ? readBuffer(addr, 1) : readMemory(prc.handle, addr, type)
}

const rdm = (addr:string|number, type:ValueType, len:number):any => {
  if(!prc) return null;
  return type == 'byte' ? readBuffer(+addr, +len) : readMemory(prc.handle, +addr, type)
}

ipcMain.on('writeMemory', (e, addr, type, value, len) => {
  if(!prc) return;
  wrm(addr, type, value, len)
})

const wrm = (addr:string|number, type:ValueType, value:any, len?:number):void => {
  if(!prc) return;
  const _ = type == 'byte' ? value :
    type == 'int' ? int32ToHexLE(+value) :
    type == 'float' ? floatToHexLE(+value) :
    type == 'double' ? doubleToHexLE(+value) : value;
  writeBuffer(+addr, _)
}

ipcMain.on('readBuffer', (e, addr, size) => {
  e.returnValue = readBuffer(+addr, +size)
})

ipcMain.on('writeBuffer', (e, addr, buffer) => {
  writeBuffer(+addr, buffer)
})

const createWindow = (id:string) => {
  const main = new BrowserWindow({
    width: 1000,
    height: 700,
    webPreferences: {
        preload:path.join(__dirname, 'preload.js'),
        nodeIntegration:true,
        contextIsolation:false
    },
    show: false,
    autoHideMenuBar: true,
    titleBarOverlay: false,
    icon: `public/favicon.ico`,
  });

  main.loadFile(`public/${id}.html`);
  main.once("ready-to-show", () => {
    main.show();
  });
  return main;
};

let prc:ProcessObject|null = null;
let config:{[key:string]:any} = {};
let m_elements:M_Element[] = [];
let m_vars:{[key:string]:any} = {};
let m_events:M_Event[] = [];

const readBuffer = (addr:number, size:number) => {
  let buffer = ''
  for (let i = 0; i < size; i++) {
    buffer += (+readMemory(prc.handle, +addr + i, 'byte')).toString(16).padStart(2, '0') + ' '
  }
  return buffer
}

const writeBuffer = (addr:number, buffer:string) => {
  const arr = buffer.split(' ').filter(v => v).map(v => parseInt(v, 16))
  for (let i = 0; i < arr.length; i++) {
    writeMemory(prc.handle, addr + i, arr[i], 'byte')
  }
}

app.whenReady().then(async () => {
  const main = createWindow("main");

  const getObj = (name:string):any => {
    if (Object.keys(m_vars).includes(name)) {
      return m_vars[name];
    } else {
      const _el = m_elements.find(v => v.id == name);
      if(!_el) return null;
      return _el.value;
    }
  }
  
  const setObj = (name:string, value:any):void => {
    if(Object.keys(m_vars).includes(name)){
      m_vars[name] = value;
      main.webContents.send('updateVar', m_vars)
    } else {
      const _el = m_elements.find(v => v.id == name);
      if(!_el) return;
      _el.value = value;
      main.webContents.send('setElement', name, value)
    }
  }

  /** 사용자 정의 변환 함수를 사용하여 표현식 평가 */
  const evalExp = (expression: string): any => {
    // 함수 호출을 실제 구현으로 재귀적으로 대체
    const parsedExpression = expression.replace(/([\w\*14]+)\(/g, (match, p1:string) => {
      const spl = p1.split('')
      const res = spl
      .map(v =>
        v == 's' ? 'String(' :
        v == 'n' ? 'Number(' :
        v == 'b' ? '((value) => value === \'true\')(' :
        v == 'x' ? '((value) => value.toString(16))(' :
        v == 'i' ? '((value) => parseInt(value, 16))(' :
        v == '*' ? 'getObj(' :
        v == '1' ? 'read("byte",' :
        v == '4' ? 'read("int",' :
        v == 'f' ? 'read("float",' :
        v == 'd' ? 'read("double",' : v
      ).join('')
      return `((v) => ${res}v${')'.repeat(spl.length)})(`
    });
    // 파싱된 표현식을 안전하게 평가하기 위해 new Function 사용
    const func = new Function('String', 'Number', 'getObj', 'read', 'return ' + parsedExpression);
    return func(String, Number, getObj, read);
  };

  const evalStr = (target: any): any => {
    if(typeof target != 'string') return target;
    const _tar = target;
    
    // {} 안의 모든 패턴을 찾아 반복적으로 평가
    const regex = /{([^}]+)}/g;
  
    // 대상 문자열의 각 매치를 평가된 결과로 교체
    let result = _tar;
    while (regex.test(result)) {
      result = result.replace(regex, (_, expr) => evalExp(expr));
    }
  
    // 전체 문자열이 표현식이었다면 결과를 적절한 타입으로 변환
    if (result.match(/^[\d.]+$/)) return Number(result);
    if (result === 'true' || result === 'false') return result === 'true';
    return result;
  }

  const tryEval = (target:any):any => {
    if(typeof target == 'string' && target.match(/{|}/)) return evalStr(target);
    else try {
      return evalExp(target);
    } catch (e) {
      return evalStr(target);
    }
  }

  const executeMacroEventCommands = (ev:M_Event):void => {
    ev.commands.forEach((cmd:M_Command) => {
      if(cmd.conditions.every((c:M_Condition) => {
        const t1 = tryEval(c.target);
        const t2 = tryEval(c.value);
        if(c.type == '==') return t1 == t2;
        if(c.type == '!=') return t1 != t2;
        if(c.type == '>') return t1 > t2;
        if(c.type == '<') return t1 < t2;
        if(c.type == '>=') return t1 >= t2;
        if(c.type == '<=') return t1 <= t2;
        return false;
      })){
        if(cmd.type == 'write'){
          const _addr = tryEval(cmd.target);
          const _val = tryEval(cmd.value);
          const _type = cmd.valueType;
          wrm(_addr, _type, _val);
        } else if(cmd.type == 'change'){
          setObj(`${cmd.target}`, tryEval(cmd.value));
        }
      }
    })
  }

  ipcMain.on('initMacro', (e, [macro]) => {
    m_elements = macro["elements"];
    m_vars = macro["vars"];
    m_events = macro["events"];
    main.webContents.send('updateVar', m_vars)
  })

  function macroLoop(){
    m_events.forEach((ev:M_Event) => {
      if(ev.type == 'loop') executeMacroEventCommands(ev);
    })
    setTimeout(macroLoop, +config['macroTick']);
  }

  ipcMain.on('init', (e, con:{[key:string]:any}) => {
    prc = null;
    config = con;
    macroLoop()
  })

  ipcMain.on('clickElement', (e, [id]) => {
    m_events.forEach((ev:M_Event) => {
      if(`m-${ev.target}` == id && ev.type == 'click') executeMacroEventCommands(ev);
    })
  })
  
  ipcMain.on('inputElement', (e, [id, val]) => {
    const _el = m_elements.find(v => `m-${v.id}` == id);
    if(!_el) return;
    _el.value = val;
    m_events.forEach((ev:M_Event) => {
      if(`m-${ev.target}` == id && ev.type == 'init') executeMacroEventCommands(ev);
    })
  })

  ipcMain.on('getProcesses', () => {
    main.webContents.send('getProcesses', getProcesses().filter(v => {
      if(v.szExeFile.split('.')[1]){
        return v.szExeFile.split('.')[1] == 'exe'
      } else {
        return false
      }
    }))
  })

  ipcMain.on('attach', (e, pid) => {
    const tar = getProcesses().find(v => v.th32ProcessID == pid[0])
    const pr = openProcess(tar.szExeFile);
    if(!pr) return main.webContents.send('error', 'Process not found');
    prc = pr;
    main.webContents.send('attached', prc)
  })

  ipcMain.on('detach', () => {
    prc = null;
    main.webContents.send('detached')
  })

  ipcMain.on('loadLine', (e, [addr, line, type]) => {
    const buffers:string[] = []
    const values:string[] = []
    for (let i = 0; i < line; i++) {
      let _:string = '';
      switch (type) {
        case 'byte':
          _ = readBuffer(addr + (i * 0x10), 0x10)
          break;
        case 'int':
          for (let j = 0; j < 4; j++) {
            _ += readMemory(prc.handle, +addr + (i * 0x10) + j * 4, 'int') + ' '
          }
          break;
        case 'float':
          for (let j = 0; j < 4; j++) {
            _ += readMemory(prc.handle, +addr + (i * 0x10) + j * 4, 'float') + ' '
          }
          break;
        case 'double':
          for (let j = 0; j < 2; j++) {
            _ += readMemory(prc.handle, +addr + (i * 0x10) + j * 8, 'double') + ' '
          }
          break;
      }
      buffers.push(readBuffer(addr + i * 0x10, 0x10))
      values.push(_)
    }
    main.webContents.send('loadLine', buffers, values, addr)
  })

  ipcMain.on('copy', (e, [addr, size]) => {
    const buffer = readBuffer(addr, size)
    clipboard.writeText(buffer)
  });

  ipcMain.on('loadLib', (e, [lib]) => {
    const li:{addr:number; type:string; len:number}[] = lib as any;
    const libr:{address:string;type:string;value:string}[] = [];
    li.forEach(v => {
      let _buffer:string = '';
      let _:string = '';
      switch (v.type) {
        case 'byte':
          _buffer = readBuffer(v.addr, v.len)
          _ = readBuffer(v.addr, v.len)
          break;
        case 'int':
          _buffer = readBuffer(+v.addr, 4)
          _ = `${readMemory(prc.handle, +v.addr, 'int')}`
          break;
        case 'float':
          _buffer = readBuffer(+v.addr, 4)
          _ = `${readMemory(prc.handle, +v.addr, 'float')}`
          break;
        case 'double':
          _buffer = readBuffer(+v.addr, 8)
          _ = `${readMemory(prc.handle, +v.addr, 'double')}`
          break;
      }
      libr.push({address:v.addr.toString(16).toUpperCase(), type:v.type, value:_})
    })
    main.webContents.send('loadLib', libr)
  })

  ipcMain.on('loadCompare', (e, [addrs, idx, lineCount, offset]) => {
    const lines:{value:string;o:boolean;diff:boolean;}[][] = []
    const _addrs:number[] = addrs as number[]
    const _omaps:string[][] = addrs.filter((v:number, i:number) => i != idx)
    .map((v:number) => readBuffer(v + offset, 0x10 * lineCount).split(' ').filter(v => v.trim()))
    for (let i = 0; i < lineCount; i++) {
      lines.push(readBuffer(_addrs[idx] + (i * 0x10) + offset, 0x10).split(' ').filter(v => v.trim()).map((v, j) => {
        return {
          value: v,
          o:_addrs[idx] + (i * 0x10) + offset + j == _addrs[idx],
          diff: _omaps.some((_v, k) => v != _v[(i * 0x10) + j])
        }
      }))
    }
    main.webContents.send('loadCompare', lines)
  })

  ipcMain.on('saveMacro', async (e, [macro]) => {
    const {canceled, filePath} = await dialog.showSaveDialog(main, {
      title: 'Save Macro',
      filters: [{name: 'Macro Script', extensions: ['kts']}]
    });
    if(canceled) return;
    writeFileSync(filePath, macro, 'utf-8');
  })

  ipcMain.on('loadMacro', async (e) => {
    const {canceled, filePaths} = await dialog.showOpenDialog(main, {
      title: 'Load Macro',
      filters: [{name: 'Macro Script', extensions: ['kts']}]
    });
    if(canceled) return;
    const macro = readFileSync(filePaths[0], 'utf-8');
    main.webContents.send('loadMacro', macro)
  })
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

ipcMain.on("log", (event, args) => {
  console.log(...args);
});

ipcMain.on('debug', (e, [evalStr]) => {
  eval(evalStr)
})

function hexToInt32LE(hexString: string): number {
  // Create a buffer from the hexadecimal string
  const buffer = Buffer.from(hexString, 'hex');

  // Read the 32-bit integer value from the buffer assuming little-endian format
  const intValue = buffer.readInt32LE(0);
  return intValue;
}

function hexToFloatLE(hexString: string): number {
  // Create a buffer from the hexadecimal string
  const buffer = Buffer.from(hexString, 'hex');
  
  // Read the float value from the buffer assuming little-endian format
  const floatValue = buffer.readFloatLE(0);
  return floatValue;
}

function hexToDoubleLE(hexString: string): number {
  // Create a buffer from the hexadecimal string
  const buffer = Buffer.from(hexString, 'hex');

  // Read the double value from the buffer assuming little-endian format
  const doubleValue = buffer.readDoubleLE(0);
  return doubleValue;
}

function floatToHexLE(floatValue: number): string {
  // Create a buffer for a float
  const buffer = Buffer.alloc(4);

  // Write the float value to the buffer as little-endian
  buffer.writeFloatLE(floatValue);

  // Return the hexadecimal string representation with spaces
  return buffer.toString('hex').match(/../g)?.join(' ') ?? '';
}

function int32ToHexLE(intValue: number): string {
  // Create a buffer for a 32-bit integer
  const buffer = Buffer.alloc(4);

  // Write the integer value to the buffer as little-endian
  buffer.writeInt32LE(intValue);

  // Return the hexadecimal string representation with spaces
  return buffer.toString('hex').match(/../g)?.join(' ') ?? '';
}

function doubleToHexLE(doubleValue: number): string {
  // Create a buffer for a double
  const buffer = Buffer.alloc(8);

  // Write the double value to the buffer as little-endian
  buffer.writeDoubleLE(doubleValue);

  // Return the hexadecimal string representation with spaces
  return buffer.toString('hex').match(/../g)?.join(' ') ?? '';
}