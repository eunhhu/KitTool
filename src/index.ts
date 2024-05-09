import { app, BrowserWindow, ipcMain } from "electron";
import path from "path";
import { getProcesses, openProcess, readMemory, writeMemory, findPattern, ProcessObject } from "memoryjs";

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

app.whenReady().then(() => {
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

ipcMain.on('writeMemory', (e, addr, value, type) => {
  e.returnValue = writeMemory(prc.handle, +addr, value, type)
})

ipcMain.on('readBuffer', (e, addr, size) => {
  e.returnValue = readBuffer(+addr, +size)
})