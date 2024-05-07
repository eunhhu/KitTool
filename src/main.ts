import { ipcRenderer } from "electron";
const log = (...args: any[]) => ipcRenderer.send("log", args);
const emit = (event: string, ...args: any[]):void => {ipcRenderer.send(event, args)};
const on = (event: string, callback: (...args: any[]) => void):void => {ipcRenderer.on(event, callback)};
const once = (event: string, callback: (...args: any[]) => void):void => {ipcRenderer.once(event, callback)};
const off = (event: string, callback: (...args: any[]) => void):void => {ipcRenderer.off(event, callback)};
const $ = (selector: string):HTMLElement => document.querySelector(selector);
const $$ = (selector: string):NodeListOf<HTMLElement> => document.querySelectorAll(selector);
const $_ = (id: string):HTMLElement => document.getElementById(id);
const create = (tag: string, text:string = "", className?:string):HTMLElement => {
    const t = document.createElement(tag);
    t.textContent = text;
    t.className = className;
    return t;
}

type ValueType = "byte"|"int"|"float"|"double"|"string";

let states:{[key:string]:any} = {
    state : 'viewer',
    isAttaching : false,
    selectedProcess: null,
    curProcess: null,
};

$_('state').onclick = (e) => {
    const tar:Element = e.target as Element;
    if(tar.id == 'state') return;
    states["state"] = tar.id.split('-')[1]
    $$('#state > button').forEach(element => element.classList.remove('active'))
    tar.classList.add('active')
}

$_('open-attach').onclick = e => {
    states["isAttaching"] = false
    $_('attacher').classList.remove('hide')
    emit('getProcesses')
    once('getProcesses', (e, processes:[]) => {
        console.log(processes)
        processes.forEach((prc:any) => {
            const _el = create('div', `[${prc.th32ProcessID}]${prc.szExeFile}`, "w-full border-b select-none text-sm text-neutral-600 p-1 hover:bg-neutral-100");
            _el.id = "each-process";
            $_('process-list').appendChild(_el);
        })
    })
}

function toggleOnPrc(tar:Element):void {
    tar.classList.remove('hover:bg-neutral-100');
    tar.classList.remove('text-neutral-600');
    tar.classList.add('bg-blue-400');
    tar.classList.add('hover:bg-blue-500');
    tar.classList.add('text-neutral-50');
}
function toggleOffPrc(tar:Element):void {
    tar.classList.add('hover:bg-neutral-100');
    tar.classList.add('text-neutral-600');
    tar.classList.remove('bg-blue-400');
    tar.classList.remove('hover:bg-blue-500');
    tar.classList.remove('text-neutral-50');
}
$_('process-list').onclick = e => {
    const tar = (e.target as Element)
    if(tar.id != 'each-process') return;
    toggleOnPrc(tar)
    $$('#each-process').forEach(v => toggleOffPrc(v))
}

$_('attacher').onmousedown = e => {
    if(e.target == e.currentTarget){
        states["isAttaching"] = false
        $_('attacher').classList.add('hide')
    }
}

$_('attach').onclick = e => {
    states["isAttaching"] = false
    $_('attacher').classList.add('hide')
}
