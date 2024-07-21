import { app, BrowserWindow, ipcMain, dialog } from "electron";
import path from "path";
import { readFileSync, writeFileSync } from "fs";
import { getProcesses, openProcess, readMemory, writeMemory, findPattern, ProcessObject, T_FLOAT, T_INT, T_DOUBLE, T_STRING, DataType } from "memoryjs";

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

  ipcMain.on('init', () => {
    prc = null;
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

ipcMain.on('readMemory', (e, addr, type, len) => {
  if(!prc) return;
  e.returnValue = type == 'byte' ? readBuffer(+addr, +len) : readMemory(prc.handle, +addr, type)
})

ipcMain.on('writeMemory', (e, addr, type, value, len) => {
  if(!prc) return;
  const _ = type == 'byte' ? value :
    type == 'int' ? int32ToHexLE(+value) :
    type == 'float' ? floatToHexLE(+value) :
    type == 'double' ? doubleToHexLE(+value) : value;
  e.returnValue = writeBuffer(+addr, _)
})

ipcMain.on('readBuffer', (e, addr, size) => {
  e.returnValue = readBuffer(+addr, +size)
})

ipcMain.on('writeBuffer', (e, addr, buffer) => {
  writeBuffer(+addr, buffer)
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