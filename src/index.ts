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

  ipcMain.on('readBuffer', (e, [addr, size]) => {
    let buffer = ''
    for (let i = 0; i < size; i++) {
      buffer += (+readMemory(prc.handle, +addr + i, 'byte')).toString(16).padStart(2, '0') + ' '
    }
    main.webContents.send('readBuffer', buffer)
  })

  ipcMain.on('loadLine', (e, [addr, line]) => {
    const buffers = []
    for (let i = 0; i < line; i++) {
      let buffer = ''
      for (let j = 0; j < 16; j++) {
        buffer += (+readMemory(prc.handle, +addr + i * 16 + j, 'byte')).toString(16).padStart(2, '0') + ' '
      }
      buffers.push(buffer)
    }
    main.webContents.send('loadLine', buffers, addr)
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
