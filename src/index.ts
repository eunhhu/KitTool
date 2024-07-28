import { app, BrowserWindow, ipcMain, dialog } from "electron";
import path from "path";
import { read, readFileSync, writeFileSync } from "fs";
import { getProcesses, openProcess, readMemory, writeMemory, findPattern, ProcessObject, T_FLOAT, T_INT, T_DOUBLE, T_STRING, DataType } from "memoryjs";


ipcMain.handle('readMemory', (e, addr, type, len) => {
  if(!prc) return;
  return rdm(addr, type, len)
})
function rdm(addr:string|number, type:ValueType, len:number):any{
  return type == 'byte' ? readBuffer(+addr, +len) : readMemory(prc.handle, +addr, type)
}

ipcMain.on('writeMemory', (e, addr, type, value, len) => {
  if(!prc) return;
  wrm(addr, type, value, len)
})
function wrm(addr:string|number, type:ValueType, value:any, len?:number):void{
  const _ = type == 'byte' ? value :
    type == 'int' ? int32ToHexLE(+value) :
    type == 'float' ? floatToHexLE(+value) :
    type == 'double' ? doubleToHexLE(+value) : value;
  writeBuffer(+addr, _)
}

ipcMain.handle('readBuffer', (e, addr, size) => {
  return readBuffer(+addr, +size)
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
let m_vars:{[key:string]:any} = {};
let m_events:{[key:string]:any}[] = [];

function macroLoop(){
  setTimeout(macroLoop, config['macroTick']);
}

function getObj(name:string):any{
  if(Object.keys(m_vars).includes(name)) return m_vars[name];
  ipcMain.emit('getElement', name)
  ipcMain.once('getElement', (e, [data]) => {
    return data;
  })
}

function setObj(name:string, value:any){
  if(Object.keys(m_vars).includes(name)){
    m_vars[name] = value;
    ipcMain.emit('updateVar', m_vars)
  }
}

function executeMacroEventCommands(ev:M_Event){
  ev.commands.forEach((cmd:M_Command) => {
      if(cmd.conditions.every((c:M_Condition) => {
          const t1 = evaluated(c.target);
          const t2 = evaluated(c.value);
          if(c.type == '==') return t1 == t2;
          if(c.type == '!=') return t1 != t2;
          if(c.type == '>') return t1 > t2;
          if(c.type == '<') return t1 < t2;
          if(c.type == '>=') return t1 >= t2;
          if(c.type == '<=') return t1 <= t2;
          return false;
      })){
          if(cmd.type == 'write'){
              const _addr = evaluated(cmd.target);
              const _val = evaluated(cmd.value);
              const _type = cmd.valueType;
              wrm(_addr, _type, _val);
          } else if(cmd.type == 'change'){
              setObj(`${cmd.target}`, evaluated(cmd.value));
          }
      }
  })
}

function evaluated(target: any): any {
  if(typeof target != 'string') return target;
  const _tar = target;

  const read = (type:ValueType, addr:number, len?:number) => {
    if(prc) return rdm(addr, type, len);
    else return null;
  }

  // {} 안의 모든 패턴을 찾아 반복적으로 평가
  const regex = /{([^}]+)}/g;

  // 사용자 정의 변환 함수를 사용하여 표현식 평가
  const evaluateExpression = (expression: string): any => {
    // 함수 호출을 실제 구현으로 재귀적으로 대체
    const parsedExpression = expression.replace(/([\w\*14]+)\(/g, (match, p1) => {
      switch (p1) {
        case 's': return 'String(';
        case 'n': return 'Number(';
        case 'b': return '((value) => value === \'true\')('; // 불리언 변환
        case 'x': return '((value) => value.toString(16))('; // 16진수 문자열 변환
        case 'i': return '((value) => parseInt(value, 16))('; // 문자열을 16진수로 파싱
        case '*': return 'getObj('; // 예시를 위한 직접 매핑
        case '1': return 'read("byte",'; // 예시를 위한 직접 매핑
        case '4': return 'read("int",'; // 예시를 위한 직접 매핑
        case 'f': return 'read("float",'; // 예시를 위한 직접 매핑
        case 'd': return 'read("double",'; // 예시를 위한 직접 매핑
        default: return match; // 알 수 없는 함수는 변환 없이 그대로 둠
      }
    });

    // 파싱된 표현식을 안전하게 평가하기 위해 new Function 사용
    try {
      const func = new Function('String', 'Number', 'getObj', 'read', 'return ' + parsedExpression);
      return func(String, Number, getObj, read);
    } catch (err) {
      console.error('표현식 평가 중 오류 발생:', expression, err);
      return '';
    }
  };

  // 대상 문자열의 각 매치를 평가된 결과로 교체
  let result = _tar;
  while (regex.test(result)) {
      result = result.replace(regex, (_, expr) => evaluateExpression(expr));
  }

  // 전체 문자열이 표현식이었다면 결과를 적절한 타입으로 변환
  if (result.match(/^[\d.]+$/)) return Number(result);
  if (result === 'true' || result === 'false') return result === 'true';
  return result;
}

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

  ipcMain.on('inputElement', (e, [id]) => {
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
    main.webContents.send('copy', buffer)
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
    const _omaps:string[][] = addrs.filter((v:number, i:number) => i != idx).map((v:number) => readBuffer(v + offset, 0x10 * lineCount).split(' ').filter(v => v.trim()))
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
      filters: [{name: 'Macro', extensions: ['ktm']}]
    });
    if(canceled) return;
    writeFileSync(filePath, macro, 'utf-8');
  })

  ipcMain.on('loadMacro', async (e) => {
    const {canceled, filePaths} = await dialog.showOpenDialog(main, {
      title: 'Load Macro',
      filters: [{name: 'Macro', extensions: ['ktm']}]
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