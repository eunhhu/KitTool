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

emit('init');

type ValueType = "byte"|"int"|"float"|"double"|"string";

let states:{[key:string]:any} = {
    state : 'viewer',
    isAttaching : false,
    curProcess: null,
    curAddress: null,
    curOffset: 0,
    loadLine: false,
    selectedType: 'byte',
    selectedBuffer: [null, 1],
    selectedAddress: null,
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
    states["loadLine"] = false;
    states["curProcess"] = null;
    states["curAddress"] = null;
    states["curOffset"] = 0;

    ($_('detach') as HTMLButtonElement).disabled = true;
    $_('viewer').innerHTML = '';
    emit('detach');
}

on('attached', (e, prc:ProcessObject) => {
    ($_('detach') as HTMLButtonElement).disabled = false;
    $_('handle').textContent = `0x${prc.handle.toString(16).toUpperCase()} - [${prc.th32ProcessID}] ${prc.szExeFile}`;
    states["curProcess"] = prc.handle;
    states["curAddress"] = prc.modBaseAddr;
    states["curOffset"] = 0;
    states["loadLine"] = true;
})

function loadLine(line:number = Math.floor($_('viewer').getClientRects().item(0).height/12)){
    if(!states["curProcess"]) return;
    if(!states["curAddress"]) return;
    const _address = states["curAddress"] + Math.floor(states["curOffset"])*0x10;
    emit('loadLine', _address, line);
}

on('loadLine', (e, buffers:string[], modBase:number) => {
    modBase = +modBase;
    $_('viewer').innerHTML = '';
    buffers.forEach((buffer, i) => {
        const _el = create('div', "", "each-buffer");
        const _a = create('div', `${(modBase + i * 0x10).toString(16).toUpperCase()}`, "each-address")
        _a.id = `${(modBase + i * 0x10).toString(16).toUpperCase()}`
        if(states["selectedAddress"] == _a.id) _a.classList.add('selected');
        _el.appendChild(_a);
        buffer.split(' ').forEach((v, j) => {
            const _b = create('div', v, "each-byte");
            _b.id = `${(modBase + i * 0x10 + j).toString(16).toUpperCase()}`;
            if(states["selectedBuffer"][0] == _b.id) _b.classList.add('selected');
            _el.appendChild(_b);
        })
        _el.appendChild(create('div', hexBufferToValue(buffer, 'string'), "each-string"));
        $_('viewer').appendChild(_el);
    })
    console.log(states["selectedBuffer"], states["selectedAddress"])
})

$_('viewer').onwheel = e => {
    if(!states["curProcess"]) return;
    if(!states["curAddress"]) return;
    states["curOffset"] += e.deltaY/100;
    loadLine();
}

$_('address').onkeydown = e => {
    if(e.key == 'Enter'){
        const _ = $_('address') as HTMLInputElement;
        gotoAddress(_.value);
        _.value = '';
    }
}
$_('goto-address').onclick = e => {
    const _ = $_('address') as HTMLInputElement;
    gotoAddress(_.value);
    _.value = '';
}
$_('offset').onkeydown = e => {
    if(e.key == 'Enter'){
        const _ = $_('offset') as HTMLInputElement;
        gotoOffset(_.value);
        _.value = '';
    }
}
$_('goto-offset').onclick = e => {
    const _ = $_('offset') as HTMLInputElement;
    gotoOffset(_.value);
    _.value = '';
}

function loop(){
    if(states["loadLine"]) loadLine();
    setTimeout(loop, 500);
}
loop();

const selTar = (tar:HTMLElement) => {
    const _ = $_('viewer').querySelector('.selected');
    if(_) _.classList.remove('selected');
    tar.classList.add('selected');
}

$_('viewer').onmousedown = e => {
    const tar = e.target as HTMLElement;
    if(tar.classList.contains('each-byte')){
        selTar(tar);
        states["selectedBuffer"] = [tar.id, 1];
        states["selectedAddress"] = null;
    } else if(tar.classList.contains('each-address')){
        selTar(tar);
        states["selectedBuffer"] = [null, 1];
        states["selectedAddress"] = tar.id;
    } else {
        const _ = $_('viewer').querySelector('.selected');
        if(_) _.classList.remove('selected');
        states["selectedBuffer"] = [null, 1];
        states["selectedAddress"] = null;
    }
}

document.onkeydown = e => {
    if(!states["curProcess"]) return;
    if(!states["curAddress"]) return;
    if(!states["selectedBuffer"][0] && !states["selectedAddress"]) return;
    if(e.key == 'ArrowRight'){
        if(states["selectedBuffer"][0]){
            states["selectedBuffer"][0] = addHex(states["selectedBuffer"][0], 1);
            const _ = $(`#${states["selectedBuffer"][0]}.each-byte`) as HTMLElement;
            selTar(_);
        } else {
            states["selectedBuffer"] = [states["selectedAddress"], 1];
            states["selectedAddress"] = null;
        }
    } else if(e.key == 'ArrowLeft'){
        if(states["selectedBuffer"][0]){
            states["selectedBuffer"][0] = addHex(states["selectedBuffer"][0], -1);
            const _ = $(`#${states["selectedBuffer"][0]}.each-byte`) as HTMLElement;
            selTar(_);
        }
    } else if(e.key == 'ArrowUp'){
        if(states["selectedBuffer"][0]){
            states["selectedBuffer"][0] = addHex(states["selectedBuffer"][0], -0x10);
            const _ = $(`#${states["selectedBuffer"][0]}.each-byte`) as HTMLElement;
            selTar(_);
        } else {
            states["selectedAddress"] = addHex(states["selectedAddress"], -0x10);
            const _ = $(`#${states["selectedAddress"]}.each-address`) as HTMLElement;
            selTar(_);
        }
    } else if(e.key == 'ArrowDown'){
        if(states["selectedBuffer"][0]){
            states["selectedBuffer"][0] = addHex(states["selectedBuffer"][0], 0x10);
            const _ = $(`#${states["selectedBuffer"][0]}.each-byte`) as HTMLElement;
            selTar(_);
        } else {
            states["selectedAddress"] = addHex(states["selectedAddress"], 0x10);
            const _ = $(`#${states["selectedAddress"]}.each-address`) as HTMLElement;
            selTar(_);
        }
    }
}

function gotoAddress(value:string){
    const tar = evaluateHexExpression(value)
    const addr = parseInt(tar, 16);
    if(!addr) return;
    states["curAddress"] = addr;
    states["curOffset"] = 0;
    loadLine();
}

function gotoOffset(value:string){
    const tar = evaluateHexExpression(value)
    const offset = parseInt(tar, 16);
    if(!offset) return;
    states["curOffset"] += offset/0x10;
    loadLine();
}

function addHex(hex:string, number:number){
    return (parseInt(hex, 16) + number).toString(16).toUpperCase();
}

function evaluateHexExpression(expression: string): string {
    // 수식에서 공백 제거
    expression = expression.replace(/\s+/g, '');

    // 수식에서 숫자와 연산자 추출
    const regex: RegExp = /([0-9A-Fa-f]+|[\+\-\*\/])/g;
    const tokens: string[] | null = expression.match(regex);

    // 수식 평가
    const result: number = evaluateTokens(tokens);

    // 10진수를 16진수로 변환하여 반환
    return result.toString(16).toUpperCase();
}

function evaluateTokens(tokens: string[]): number {
    const stack: number[] = [];
    let isFirstTokenNegative = false;

    // 첫 번째 토큰이 "-"인 경우 플래그 설정 및 인덱스 증가
    if (tokens[0] === '-') {
        isFirstTokenNegative = true;
        tokens.shift();
    }

    // '*'와 '/' 연산 처리
    let i = 0;
    while (i < tokens.length) {
        const token = tokens[i];
        if (token === '*') {
            const prev = stack.pop()!;
            const next = parseInt(tokens[i + 1], 16);
            stack.push(prev * next);
            i += 2;
        } else if (token === '/') {
            const prev = stack.pop()!;
            const next = parseInt(tokens[i + 1], 16);
            stack.push(prev / next);
            i += 2;
        } else {
            stack.push(parseInt(token, 16));
            i++;
        }
    }

    // '+'와 '-' 연산 처리
    let result = stack[0];
    for (let j = 1; j < stack.length; j += 2) {
        const operator = tokens[j];
        const operand = stack[j + 1];
        if (operator === '+') {
            result += operand;
        } else if (operator === '-') {
            result -= operand;
        } else {
            throw new Error('Invalid operator: ' + operator);
        }
    }

    // 첫 번째 토큰이 "-"인 경우 음수로 변경
    if (isFirstTokenNegative) {
        result = -result;
    }

    return result;
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