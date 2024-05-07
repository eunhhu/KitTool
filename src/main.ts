import { ipcRenderer } from "electron";
import { ProcessObject } from "memoryjs";
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
    curProcess: null,
    curAddress: null,
};

$_('state').onclick = (e) => {
    const tar:Element = e.target as Element;
    if(tar.id == 'state') return;
    states["state"] = tar.id.split('-')[1]
    $$('#state > button').forEach(element => element.classList.remove('active'))
    tar.classList.add('active')
}

$_('open-attach').onclick = e => {
    states["isAttaching"] = true;
    $_('attacher').classList.remove('hide');
    $_('process-list').innerHTML = '';
    emit('getProcesses')
    once('getProcesses', (e, processes:[]) => {
        processes.forEach((prc:any) => {
            const _el = create('div', `[${prc.th32ProcessID}] ${prc.szExeFile}`, "each-process");
            _el.id = prc.th32ProcessID;
            $_('process-list').appendChild(_el);
        })
    })
}

$_('search-process').oninput = e => {
    const tar = e.target as HTMLInputElement;
    const val = tar.value;
    $$('.each-process').forEach(v => {
        $$('.each-process').forEach(v => v.classList.remove('selected'));
        ($_('attach') as HTMLButtonElement).disabled = true;
        if(v.textContent.toLowerCase().match(val.toLowerCase())){
            v.classList.remove('hide')
        }else{
            v.classList.add('hide')
        }
    })
}

const closeAttacher = () => {
    states["isAttaching"] = false;
    $_('attacher').classList.add('hide');
    ($_('attach') as HTMLButtonElement).disabled = true;
    $_('process-list').innerHTML = '';
    ($_('search-process') as HTMLInputElement).value = '';
}

$_('process-list').ondblclick = e => {
    if(!(e.target as Element).classList.contains('each-process')) return;
    $_('attach').click()
}
$_('process-list').onclick = e => {
    const tar = (e.target as Element)
    if(!tar.classList.contains('each-process')) return;
    $$('.each-process').forEach(v => v.classList.remove('selected'))
    tar.classList.add('selected');
    ($_('attach') as HTMLButtonElement).disabled = false;
}

$_('attacher').onmousedown = e => {if(e.target == e.currentTarget) closeAttacher();}

$_('attach').onclick = e => {
    const selected = $('.each-process.selected');
    if(!selected) return;
    const pid = selected.id;
    emit('attach', pid);
    closeAttacher();
}

$_('detach').onclick = e => {
    $_('handle').textContent = '[Select Process]';
    states["curProcess"] = null;
    ($_('detach') as HTMLButtonElement).disabled = true;
    $_('viewer').innerHTML = '';
    emit('detach');
}

on('attached', (e, prc:ProcessObject) => {
    ($_('detach') as HTMLButtonElement).disabled = false;
    $_('handle').textContent = `[0x${prc.handle.toString(16).toUpperCase()}]`;
    states["curProcess"] = prc.handle;
    states["curAddress"] = prc.modBaseAddr;
    loadLine(20);
})

function loadLine(line:number){
    if(!states["curProcess"]) return;
    emit('loadLine', states["curAddress"], line);
}

on('loadLine', (e, buffers:string[], modBase:number) => {
    modBase = +modBase;
    $_('viewer').innerHTML = '';
    buffers.forEach((buffer, i) => {
        const _el = create('div', "", "each-buffer");
        _el.id = `0x${(modBase + i * 0x10).toString(16).toUpperCase()}`;
        _el.appendChild(create('div', `${(modBase + i * 0x10).toString(16).toUpperCase()}`, "each-address"));
        buffer.split(' ').forEach((v, j) => {
            const _b = create('div', v, "each-byte");
            _b.id = `0x${(modBase + i * 0x10 + j).toString(16).toUpperCase()}`;
            _el.appendChild(_b);
        })
        _el.appendChild(create('div', hexBufferToValue(buffer, 'string'), "each-string"));
        $_('viewer').appendChild(_el);
    })
})

window.onresize = () => {
    console.log($_('viewer').getClientRects().item(0).height);
}

function hexBufferToValue(buffer:string, type:ValueType):any {
    switch(type){
        case 'byte':
            return parseInt(buffer.replace(' ', ''), 16);
        case 'int':
            return parseInt(buffer.replace(' ', ''), 16);
        case 'float':
            return parseFloat(buffer.replace(' ', ''));
        case 'double':
            return parseFloat(buffer.replace(' ', ''));
        case 'string':
            return buffer.split(' ').map(v => {
                const char = String.fromCharCode(parseInt(v, 16))
                // check if this char is printable
                return char.match(/[a-zA-Z0-9\s]/) ? char : '.';
            }).join('');
    }
}

function valueToHexBuffer(value:any, type:ValueType):string {
    switch(type){
        case 'byte':
            return value.toString(16);
        case 'int':
            return value.toString(16).padStart(8, '0');
        case 'float':
            return new Float32Array([value]).map((v:any) => v.toString(16)).join(' ');
        case 'double':
            return new Float64Array([value]).map((v:any) => v.toString(16)).join(' ');
        case 'string':
            return value.split('').map((v:string) => v.charCodeAt(0).toString(16)).join(' ');
    }
}