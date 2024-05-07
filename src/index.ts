import { app, BrowserWindow, ipcMain } from "electron";
import { readBuffer } from "memoryjs";

const isDev = process.env.NODE_ENV === "development";

const createWindow = (id:string) => {
  const main = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
    },
    show: false,
    autoHideMenuBar: true,
    titleBarOverlay: false
  });

  main.loadFile(`public/${id}.html`);
  main.once("ready-to-show", () => {
    main.show();
  });
  return main;
};

app.whenReady().then(() => {
    const main = createWindow("main");
});

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
        app.quit();
    }
});

ipcMain.on("log", (event, args) => {
    console.log(...args);
});
