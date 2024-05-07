import { ipcRenderer } from "electron";

const log = (...args: any[]) => ipcRenderer.send("log", args);

log("hi")

console.log("hi")