import { app, BrowserWindow, ipcMain } from "electron";
import path from "path";
import { getProcesses, readBuffer } from "memoryjs";

const createWindow = (id:string) => {
  const main = new BrowserWindow({
    width: 1000,
    height: 700,
    webPreferences: {
        preload:path.join(__dirname, 'preload.js'),
        nodeIntegration:true,
        contextIsolation:false,
        webSecurity:false
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

app.whenReady().then(() => {
  const main = createWindow("main");

  ipcMain.on('getProcesses', () => {
    main.webContents.send('getProcesses', getProcesses())
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
