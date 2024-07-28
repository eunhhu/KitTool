import { ipcRenderer } from "electron";
import { ProcessObject } from "memoryjs";

function tryEval(str:string, els?:string):any {
    try {
        return eval(str);
    } catch(e) {
        return els || str;
    }
}

function parseMacro(ktmContent: string): Macro {
    const elements: M_Element[] = [];
    const vars: { [key: string]: any } = {};
    const events: M_Event[] = [];

    const lines = ktmContent.split('\n').map(line => line.trim()).filter(line => line && !line.startsWith('#'));
    
    let event:M_Event = null;
    let conditions:M_Condition[] = [];
    lines.forEach((line, i) => {
        const _line = line.split(' ').map(v => v.trim()).filter(v => v);
        if (_line[0] == 'element') {
            const [, type, id, propsPart] = line.match(/element (\w+):([\w\-]+) (.+)/)!;
            const props = parseProperties(propsPart);
            elements.push({
                id,
                type: type as M_ElementType,
                value: props['value'] || '',
                style: props['style'] || '',
            })
        } else if (_line[0] == 'var') {
            const [key, value] = line.split(' ').slice(1).join(' ').split('=').map(v => v.trim());
            vars[key] = tryEval(value);
        } else if (_line[0] == 'event') {
            event = {
                type: _line[1] as M_EventType,
                target: _line[2] == '{' ? null : _line[2],
                commands: []
            }
            conditions = [];
        } else if (_line[0] == 'if') {
            const cond = line.split(' ').slice(1).join(' ')
            const [target, , value] = cond.split(/(==|!=|<=|>=|<|>)/).map(v => v.trim());
            const type = cond.match(/(==|!=|<=|>=|<|>)/)![0] as M_ConditionType;
            let _t = tryEval(target.trim());
            let _v = tryEval(value.replace('{', '').trim())
            conditions.push({
                type: type as M_ConditionType,
                target: _t,
                value: _v
            })
        } else if (_line[0] == '}') {
            if(conditions.length){
                conditions.splice(-1, 1);
            } else {
                events.push(event);
                event = null;
            }
        } else if (_line[0] == 'change') {
            const [key, value] = line.split(' ').slice(1).join(' ').split('=').map(v => v.trim());
            let _value = tryEval(value);
            event.commands.push({
                type: 'change',
                target: key,
                value: _value,
                conditions: JSON.parse(JSON.stringify(conditions))
            })
        } else if (_line[0] == 'write') {
            const [key, value] = line.split(' ').slice(1).join(' ').split('=').map(v => v.trim());
            let _k = tryEval(key)
            let _v = tryEval(value.split(' as ')[0])
            let _vt = value.split(' as ')[1]
            event.commands.push({
                type: 'write',
                target: _k,
                value: _v,
                valueType: _vt as ValueType,
                conditions: JSON.parse(JSON.stringify(conditions))
            })
        } else {
            console.error(`Unknown line: ${i + 1} - ${line}`);
        }
    })

    return {
        elements,
        vars,
        events
    };
}

function parseProperties(propsPart: string): { [key: string]: string } {
    const props: { [key: string]: string } = {};
    const regex = /(\w+):"([^"]*)"/g;
    let match;
    while (match = regex.exec(propsPart)) {
        props[match[1]] = match[2];
    }
    return props;
}

const log = (...args: any[]) => ipcRenderer.send("log", args);
const emit = (event: string, ...args: any[]):void => {ipcRenderer.send(event, args)};
const emitSync = (event: string, ...args: any[]):any => {ipcRenderer.sendSync(event, args)};
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
const debug = (obj:any) => {
    ($_('debug-logger') as HTMLTextAreaElement).value = JSON.stringify(obj, null, 2) + '\n';
}


let config:{[key:string]:any} = {
    "tick": 500,
    "macroTick": 1000/60
}

emit('init', config);

let states:{[key:string]:any} = {
    state : 'viewer',
    isAttaching : false,
    curProcess: null,
    curAddress: null,
    curOffset: 0,
    loadLine: false,
    loadLib: true,
    loadCompare: true,
    selectedType: 'byte',
    selectedBuffer: [null, 1],
    selectedAddress: null,
    isMousedown: false,
    lib: [],
    selectedLib: [-1, 0], // [index, length]
    isEditing: -1, // lib index
    compares: [],
    selectedCompare: -1, // compare index
    compareOffset: 0, // comparing view offset
    macroText: "",
    m_elements: [], // HTML Elements
};
$_('call-states').onclick = e => {debug(states)};
($_('macro-code') as HTMLTextAreaElement).value = "";
$_('macro-new').onclick = e => {
    states.macroText = '';
    ($_('macro-code') as HTMLTextAreaElement).value = states.macroText;
}
$_('macro-code').oninput = e => {
    ($_('macro-code') as HTMLTextAreaElement).classList.remove('error');
    try {
        const _v = ($_('macro-code') as HTMLTextAreaElement).value;
        states.macroText = _v;
        parseMacro(_v);
    } catch (e) {
        ($_('macro-code') as HTMLTextAreaElement).classList.add('error');
    }
}
$_('macro-code').onkeydown = e => {
    const tar:HTMLTextAreaElement = (e.target as HTMLTextAreaElement)
    const start = tar.selectionStart;
    const end = tar.selectionEnd;
    const _v = tar.value; // value
    const _s = _v.substring(0, start); // start value
    const _m = _v.substring(start, end); // middle value
    const _e = _v.substring(end); // end value
    const _l = _v.split('\n'); // lines
    const _sl = _s.split('\n').length - 1; // start line offset
    const _el = _v.substring(0, end).split('\n').length - 1; // end line offset
    const _c = _l[_sl]; // current line
    const _sp = _s.split('\n')[_sl].length; // start position offset
    const _ep = _v.substring(0, end).split('\n')[_el].length; // end position offset
    const _sc = _c.substring(0, _sp); // start current
    const _ec = _c.substring(0, _ep); // end current
    const _sce = _c.substring(_sp); // start current end
    const _ece = _c.substring(_ep); // end current end
    const _t = _c.split(' ').map(v => v.trim()).filter(v => v); // tokens
    const spaced = _sc.match(/^ +$/);
    const curTabbed:number = _sc.split('  ').length - 1;
    const shiftedBL = e.shiftKey ? '{' : '[';
    const shiftedBR = e.shiftKey ? '}' : ']';
    const shiftedQ = e.shiftKey ? '"' : "'";
    const makeTab = (n:number) => '  '.repeat(n);
    const insertGrouped = (l:string, r:string) => {
        if(start == end){
            e.preventDefault();
            tar.value = _s + l + r + _e;
            tar.selectionStart = tar.selectionEnd = start + 1;
        } else {
            e.preventDefault();
            tar.value = _s + l + _m + r + _e;
            tar.selectionStart = start + 1;
            tar.selectionEnd = end + 1;
        }
    }
    if (e.code == 'Tab'){
        e.preventDefault();
        if(_sl == _el){
            tar.value = _s + '  ' + _e;
            tar.selectionStart = tar.selectionEnd = start + 2;
        } else {
            const _n = _l.slice(_sl, _el+1).map(v => '  ' + v).join('\n');
            tar.value = _s + _n + _e;
        }
    } else if (e.code == 'Enter'){
        if(e.ctrlKey){
            e.preventDefault();
            $_('macro-init').click();
        } else if(_v[start-1] == '{'){
            e.preventDefault();
            if(_v[end] == '}'){
                tar.value = _s + '\n' + makeTab(1 + curTabbed) + 
                '\n' + makeTab(curTabbed) + _e;
            } else {
                tar.value = _s + '\n' + makeTab(1 + curTabbed) + _e;
            }
            tar.selectionStart = tar.selectionEnd = start + 1 + (2 * (1 + curTabbed));
        } else if(curTabbed){
            e.preventDefault();
            tar.value = _s + '\n' + makeTab(curTabbed) + _e;
            tar.selectionStart = tar.selectionEnd = start + 1 + 2 * curTabbed;
        }
    } else if(e.code == 'Backspace'){
        if(spaced){
            if(spaced[0].length > 1){
                e.preventDefault();
                tar.value = _s.slice(0, -2) + _e;
                tar.selectionStart = tar.selectionEnd = start - 2;
            }
        } else if(start == end &&
            (_v[start-1] == '{' && _v[end] == '}' ||
            _v[start-1] == '[' && _v[end] == ']' ||
            _v[start-1] == '(' && _v[end] == ')' ||
            _v[start-1] == '"' && _v[end] == '"' ||
            _v[start-1] == "'" && _v[end] == "'")){
            e.preventDefault();
            tar.value = _s.slice(0, -1) + _v.substring(end+1);
            tar.selectionStart = tar.selectionEnd = start - 1;
        }
    } else if(e.code == 'BracketLeft'){
        insertGrouped(shiftedBL, shiftedBR);
    } else if(e.code == 'BracketRight' && e.shiftKey){
        if(spaced){
            if(spaced[0].length > 1){
                e.preventDefault();
                tar.value = _s.slice(0, -2) + '}' + _e;
                tar.selectionStart = tar.selectionEnd = start - 1;
            }
        }
    } else if(e.code == 'Quote'){
        insertGrouped(shiftedQ, shiftedQ);
    } else if(e.code == 'Digit9' && e.shiftKey){
        insertGrouped('(', ')');
    }
}
$_('macro-sort').onclick = e => {}
$_('macro-save').onclick = e => {
    emit('saveMacro', states.macroText);
}
$_('macro-load').onclick = e => {
    emit('loadMacro');
    once('loadMacro', (e, macro:string) => {
        states.macroText = macro;
        ($_('macro-code') as HTMLTextAreaElement).value = states.macroText;
    })
}
$_('macro-init').onclick = e => {
    states.m_elements = [];
    $_('macro-viewer').innerHTML = '';
    const macro = parseMacro(($_('macro-code') as HTMLTextAreaElement).value);
    macro.elements.forEach((el:M_Element) => {
        const _el = create(el.type == 'text' ? 'div' : el.type, el.value, 'macro-element');
        _el.id = `m-${el.id}`;
        _el.style.cssText = el.style;
        states.m_elements.push(el);
        $_('macro-viewer').appendChild(_el);
    })
    ipcRenderer.send('initMacro', macro);
}

on('getElement', (e, id:string) => {
    const _f = states.m_elements.find((v:M_Element) => v.id == id);
    if(_f) {
        const _el = $_(`m-${id}`);
        if(_el instanceof HTMLInputElement) e.sender.send('getElement', _el.value);
        else e.sender.send('getElement', _el.textContent);
    }
})

on('updateVars', (e, vars:{[key:string]:any}) => {
    $_('macro-vars').innerHTML = '';
    Object.keys(vars).forEach(key => {
        const el = create('div', `${key} : ${vars[key]}`, 'macro-var');
        el.id = key;
        $_('macro-vars').appendChild(el);
    })
})

$_('macro-viewer').onclick = e => { // click event
    const tar = e.target as HTMLElement;
    if(tar.classList.contains('macro-element')){
        emit('clickElement', tar.id);
    }
}
$_('macro-viewer').oninput = e => { // input event
    const tar = e.target as HTMLInputElement;
    if(tar.classList.contains('macro-element') && tar.type == 'text'){
        emit('inputElement', tar.id, tar.value);
    };
}
// window.onkeydown = e => {
//     states.m_events.forEach((ev:M_Event) => {
//         if(ev.target == e.code && ev.type == 'keydown') executeMacroEventCommands(ev);
//     })
// }
// window.onkeyup = e => {
//     states.m_events.forEach((ev:M_Event) => {
//         if(ev.target == e.code && ev.type == 'keyup') executeMacroEventCommands(ev);
//     })
// }

$_('state').onclick = (e) => {
    const tar:Element = e.target as Element;
    if(tar.id == 'state') return;
    states["state"] = tar.id.split('-')[1]
    $$('#state > button').forEach(element => element.classList.remove('active'))
    tar.classList.add('active')
    $$('.v-content').forEach(element => element.classList.add('hide'))
    $_(`v-${states["state"]}`).classList.remove('hide')
}

// Attach & Detach
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
    $_('search-process').focus();
}

// Search Process
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

// Close Attacher
const closeAttacher = () => {
    states["isAttaching"] = false;
    $_('attacher').classList.add('hide');
    ($_('attach') as HTMLButtonElement).disabled = true;
    $_('process-list').innerHTML = '';
    ($_('search-process') as HTMLInputElement).value = '';
}

// Attach
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

// Detach
$_('detach').onclick = e => {
    $$('.handle').forEach(el => {el.textContent = '[Select Process]'})
    states["loadLine"] = false;
    states["curProcess"] = null;
    states["curAddress"] = null;
    states["curOffset"] = 0;
    states["selectedBuffer"] = [null, 1];
    states["selectedAddress"] = null;
    states["selectedLib"] = [-1, 0];
    states["lib"] = [];
    states["isEditing"] = -1;
    states["compares"] = [];
    states["selectedCompare"] = -1;
    states["compareOffset"] = 0;

    ($_('detach') as HTMLButtonElement).disabled = true;
    $_('viewer').innerHTML = '';
    $_('lib-viewer').innerHTML = '';
    $_('c-lib-viewer').innerHTML = '';
    $_('compare-save').innerHTML = '';
    $_('compare-viewer').innerHTML = '';
    emit('detach');
}

on('attached', (e, prc:ProcessObject) => {
    ($_('detach') as HTMLButtonElement).disabled = false;
    $$('.handle').forEach(el => {el.textContent = `0x${prc.handle.toString(16).toUpperCase()} - [${prc.th32ProcessID}] ${prc.szExeFile}`})
    states["curProcess"] = prc.handle;
    states["curAddress"] = prc.modBaseAddr;
    states["curOffset"] = 0;
    states["loadLine"] = true;
    states["selectedBuffer"] = [null, 1];
    states["selectedAddress"] = null;
    states["selectedLib"] = [-1, 0];
    states["lib"] = [];
})

function loadLine(){
    if($_('viewer').getClientRects().length == 0) return;
    const line = Math.floor($_('viewer').getClientRects().item(0).height/12)
    if(!states["curProcess"]) return;
    if(!states["curAddress"]) return;
    if(states["state"] != 'viewer') return;
    const _address = states["curAddress"] + Math.floor(states["curOffset"])*0x10;
    emit('loadLine', _address, line, states["selectedType"]);
}

on('loadLine', (e, buffers:string[], values:string[], modBase:number) => {
    modBase = +modBase;
    $_('viewer').innerHTML = '';
    buffers.forEach((buffer, i) => {
        const _el = create('div', "", "each-buffer");
        const _a = create('div', `${(modBase + i * 0x10).toString(16).toUpperCase()}`, "each-address")
        _a.id = `${(modBase + i * 0x10).toString(16).toUpperCase()}`
        if(states["selectedAddress"] == _a.id) _a.classList.add('selected');
        _el.appendChild(_a);
        const _bs = create('div', "", "byte-values");
        const b_ar = values[i].split(' ')
        b_ar.forEach((v, j) => {
            if(!v) return;
            let _r:string = '';
            _r = v;
            const maxLen = states["selectedType"] == 'byte' ? 2 : states["selectedType"] == 'double' ? 22 : 10;
            if(_r.length > maxLen) _r = _r.slice(0, maxLen) + '..';
            const _b = create('div', _r, "each-byte");
            const _off = states["selectedType"] == 'byte' ? j : states["selectedType"] == 'double' ? j*8 : j*4;
            _b.id = (modBase + i * 0x10 + _off).toString(16).toUpperCase();
            if(states["selectedBuffer"][0] == _b.id && states["selectedBuffer"][1] == 1) _b.classList.add('selected');
            else if(
                states["selectedBuffer"][0] &&
                states["selectedBuffer"][1] > 1 &&
                parseInt(states["selectedBuffer"][0], 16) <= parseInt(_b.id, 16) &&
                parseInt(_b.id, 16) < parseInt(states["selectedBuffer"][0], 16) + states["selectedBuffer"][1]
            ) _b.classList.add('selected');
            _bs.appendChild(_b);
        })
        _el.appendChild(_bs);
        _el.appendChild(create('div', hexBufferToValue(buffer, 'string'), "each-string"));
        $_('viewer').appendChild(_el);
    })
})

function loadLib(){
    emit('loadLib', states["lib"]);
}

on('loadLib', (e, lib:{address:string;type:ValueType;value:string;}[]) => {
    $_('lib-viewer').innerHTML = '';
    $_('c-lib-viewer').innerHTML = '';
    lib.forEach((v, i) => {
        const _el = create('div', "", "each-save");
        if(states["selectedLib"][0] != -1){
            let _startPoint = states["selectedLib"][0];
            let _endPoint = states["selectedLib"][0] + states["selectedLib"][1];
            if(_startPoint < _endPoint) {
                if(_startPoint <= i && i < _endPoint) _el.classList.add('selected');
            } else {
                if(_endPoint-1 <= i && i < _startPoint+1) _el.classList.add('selected');
            }
        }
        const _a = create('div', `${v.address}`, "each-save-address")
        _a.id = v.address;
        _el.appendChild(_a);
        const _t = create('div', `${v.type}`, "each-save-type");
        _t.id = v.type;
        _el.appendChild(_t);
        let _ = `${v.value}`;
        const maxLen = 12;
        if(_.length > maxLen) _ = _.slice(0, maxLen) + '..';
        const _b = create('div', _, "each-save-value");
        _el.appendChild(_b);
        $_('lib-viewer').appendChild(_el);
        $_('c-lib-viewer').appendChild(_el.cloneNode(true));
    });
});

function loadCompare(){
    $_('compare-save').innerHTML = '';
    states["compares"].forEach((_v:number, i:number) => {
        const _el = create('div', _v.toString(16).toUpperCase(), "each-compare");
        _el.id = `${_v}`;
        if(states["selectedCompare"] == i) _el.classList.add('selected');
        $_('compare-save').appendChild(_el);
    })
    if(states["compares"].length) {
        const line = Math.floor($_('compare-viewer').getClientRects().item(0).height/12)
        const offset = Math.floor(states["compareOffset"]) * 0x10;
        emit('loadCompare', states["compares"], states["selectedCompare"] == -1 ? 0 : states["selectedCompare"], line, offset);
    } else {
        $_('compare-viewer').innerHTML = '';
        states["compareOffset"] = 0;
    }
}

on('loadCompare', (e, lines:{value:string;o:boolean;diff:boolean;}[][]) => {
    $_('compare-viewer').innerHTML = '';
    const _soff = ($_('start-offset') as HTMLInputElement).value;
    const _eoff = ($_('end-offset') as HTMLInputElement).value;
    const _isOff = _soff && _eoff;
    const _start = _isOff ? parseInt(evaluateHexExpression(_soff), 16) : 0;
    const _end = _isOff ? parseInt(evaluateHexExpression(_eoff), 16) : 0;
    lines.forEach((line, i) => {
        const _el = create('div', "", "each-cline");
        line.forEach((v, j) => {
            const _ = create('div', `${v.value}`, "each-cvalue");
            if(v.o) _.classList.add('o');
            if(v.diff) _.classList.add('diff');
            const _off = (i + states['compareOffset']) * 0x10 + j;
            if( _isOff &&
                (_start <= _off && _off <= _end) ||
                (_end <= _off && _off <= _start)
            ) _.classList.add('selected');
            _.id = `${i}-${j}`;
            _el.appendChild(_);
        })
        $_('compare-viewer').appendChild(_el);
    })
});

$_('make-pattern').onclick = e => {
    const _s = $$('.each-cvalue.selected') as NodeListOf<HTMLDivElement>;
    if(!_s.length) return;
    const _p = Array.from(_s).map(v => v.classList.contains('diff') ? '??' : v.textContent).join(' ');
    ($_('pattern-result') as HTMLInputElement).value = _p;
}

$_('compare-viewer').onwheel = e => {
    if(!states["compares"].length) return;
    states["compareOffset"] += e.deltaY/100;
    loadCompare();
}

// viewer
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

$_('selected-type').onchange = e => {
    const _ = $_('selected-type') as HTMLSelectElement;
    states["selectedType"] = _.value;
    loadLine();
}

function loop(){
    if(states["loadLine"]) loadLine();
    if(states["loadLib"]) loadLib();
    if(states["loadCompare"]) loadCompare();
    setTimeout(loop, config["tick"]);
}
loop();

// lib-viewer
document.onmousedown = e => {
    states["isMousedown"] = true;
    const tar = e.target as HTMLElement;
    if(tar.classList.contains('each-byte')){
        states["selectedBuffer"] = [tar.id, 1];
        states["selectedAddress"] = null;
        states["selectedLib"] = [-1, 0];
    } else if(tar.classList.contains('each-address')){
        states["selectedBuffer"] = [null, 1];
        states["selectedAddress"] = tar.id;
        states["selectedLib"] = [-1, 0];
    } else if(tar.classList.contains('each-save') || tar.parentElement.classList.contains('each-save')){
        const target = tar.parentElement.classList.contains('each-save') ? tar.parentElement : tar;
        states["selectedBuffer"] = [null, 1];
        states["selectedAddress"] = null;
        states["selectedLib"] = [Array.from(target.parentElement.children).indexOf(target), 1];
    } else if(tar.id != 'save-address') {
        states["selectedBuffer"] = [null, 1];
        states["selectedAddress"] = null;
        states["selectedLib"] = [-1, 0];
    }
    if(tar.classList.contains('each-compare')){
        states["selectedCompare"] = states["compares"].indexOf(+tar.id);
    } else {
        states["selectedCompare"] = -1;
    }
    if(tar.classList.contains('each-cvalue')){
        const _ = tar.id.split('-');
        const _off = (+_[0] + Math.floor(states["compareOffset"])) * 0x10 + parseInt(_[1]);
        const _text = (_off >= 0 ? _off.toString(16) : `-${Math.abs(_off).toString(16)}`).toUpperCase();
        ($_('start-offset') as HTMLInputElement).value = _text;
        ($_('end-offset') as HTMLInputElement).value = _text;
    } else if(tar.id != 'start-offset' && tar.id != 'end-offset' && tar.id != 'make-pattern'){
        ($_('start-offset') as HTMLInputElement).value = '';
        ($_('end-offset') as HTMLInputElement).value = '';
    }
    loadLine();
    loadLib();
    loadCompare();
}

// lib-viewer
document.onmousemove = e => {
    if(!states["isMousedown"]) return;
    const tar = e.target as HTMLElement;
    if(tar.classList.contains('each-byte')){
        const offset = parseInt(tar.id, 16) - parseInt(states["selectedBuffer"][0], 16);
        states["selectedBuffer"][1] = offset + 1;
        loadLine();
    } else if(tar.classList.contains('each-save')){
        const offset = Array.from(tar.parentElement.children).indexOf(tar) - states["selectedLib"][0];
        states["selectedLib"][1] = offset + 1;
        loadLib();
    }
    if(tar.classList.contains('each-cvalue')){
        const _ = tar.id.split('-');
        const _off = (+_[0] + Math.floor(states["compareOffset"])) * 0x10 + parseInt(_[1]);
        const _text = (_off >= 0 ? _off.toString(16) : `-${Math.abs(_off).toString(16)}`).toUpperCase();
        ($_('end-offset') as HTMLInputElement).value = _text;
        loadCompare();
    }
}

// lib-viewer
document.onmouseup = e => {
    states["isMousedown"] = false;
}

const closeEditor = () => {
    $_('editor').classList.add('hide');
    states["isEditing"] = -1;
    ($_('editor-addr') as HTMLInputElement).value = '';
    ($_('editor-type') as HTMLSelectElement).value = 'byte';
    ($_('editor-value') as HTMLInputElement).value = '';
}

$_('editor').onmousedown = e => {if(e.target == e.currentTarget) closeEditor();}

// global key event
document.onkeydown = async e => {
    if(e.key == '1' && e.altKey){
        $_('s-viewer').click();
    } else if(e.key == '2' && e.altKey){
        $_('s-compare').click();
    } else if(e.key == '3' && e.altKey){
        $_('s-macro').click();
    } else if(e.key == '4' && e.altKey){
        $_('s-config').click();
    } else if(e.key == '5' && e.altKey){
        $_('s-hotkeys').click();
    } else if(e.key == '6' && e.altKey){
        $_('s-debug').click();
    } else if(e.key == 'a' && e.altKey){
        $_('open-attach').click();
    } else if(e.key == 'd' && e.altKey){
        $_('detach').click();
    }
    const _ = $_('selected-type') as HTMLSelectElement;
    if(states["selectedLib"][0] == -1){
        if(e.key == '1' && e.ctrlKey){
            _.value = 'byte';
            states["selectedType"] = 'byte';
            loadLine();
        } else if(e.key == '2' && e.ctrlKey){
            _.value = 'int';
            states["selectedType"] = 'int';
            loadLine();
        } else if(e.key == '3' && e.ctrlKey){
            _.value = 'float';
            states["selectedType"] = 'float';
            loadLine();
        } else if(e.key == '4' && e.ctrlKey){
            _.value = 'double';
            states["selectedType"] = 'double';
            loadLine();
        }
    }
    if(e.key == 'Escape' && states["isAttaching"]){
        closeAttacher();
    }
    // process is attached
    if(!states["curProcess"]) return;
    if(!states["curAddress"]) return;
    if(states["isEditing"] != -1){
        if(e.key == 'Escape'){
            closeEditor();
        } else if(e.key == 's' && e.ctrlKey){
            e.preventDefault();
            $_('save-editor').click();
        } else if(e.key == 'Enter' || (e.key == 'w' && e.ctrlKey)){
            e.preventDefault();
            $_('write-editor').click();
        }
    }
    if(states["state"] == 'compare' && states["selectedCompare"] != -1){
        if(e.key == 'Delete'){
            states["compares"].splice(states["selectedCompare"], 1);
            states["selectedCompare"] = -1;
            loadCompare();
        } else if(e.key == 'ArrowUp'){
            if(states["selectedCompare"] == 0) return;
            states["selectedCompare"]--;
            loadCompare();
        } else if(e.key == 'ArrowDown'){
            if(states["selectedCompare"] == states["compares"].length-1) return;
            states["selectedCompare"]++;
            loadCompare();
        }
    }
    if(!states["selectedBuffer"][0] && !states["selectedAddress"]){
        if(states["selectedLib"][0] != -1){
            if(e.key == 'Delete'){
                let _startPoint = states["selectedLib"][0];
                let _endPoint = states["selectedLib"][0] + states["selectedLib"][1];
                if(_startPoint >= _endPoint) [_startPoint, _endPoint] = [_endPoint, _startPoint];
                let _count = _endPoint - _startPoint;
                states["lib"].splice(_startPoint, _count);
                states["selectedLib"] = [-1, 0];
                loadLib();
            } else if(e.key == 'ArrowUp'){
                if(states["selectedLib"][0] == 0) return;
                states["selectedLib"][0]--;
                loadLib();
            } else if(e.key == 'ArrowDown'){
                if(states["selectedLib"][0] == states["lib"].length-1) return;
                states["selectedLib"][0]++;
                loadLib();
            } else if(e.key == 'g' && e.ctrlKey){
                if(document.activeElement.tagName == 'INPUT') return;
                e.preventDefault();
                const _addr = states["lib"][states["selectedLib"][0]].addr.toString(16).toUpperCase();
                gotoAddress(_addr);
            } else if(e.key == 'Enter'){
                if(document.activeElement.tagName == 'INPUT') return;
                e.preventDefault();
                states["isEditing"] = states["selectedLib"][0];
                $_('editor').classList.remove('hide');
                const _tr = states["lib"][states["selectedLib"][0]];
                loadLib();
                ($_('editor-addr') as HTMLInputElement).value = _tr.addr.toString(16).toUpperCase();
                ($_('editor-type') as HTMLSelectElement).value = _tr.type;
                const _val = emitSync('readMemory', _tr.addr, _tr.type, _tr.len);
                ($_('editor-value') as HTMLInputElement).value = _val;
                ($_('editor-value') as HTMLInputElement).focus();
                ($_('editor-value') as HTMLInputElement).select();
            } else if(e.key == 'c' && e.ctrlKey){
                if(document.activeElement.tagName == 'INPUT') return;
                e.preventDefault();
                const _tr = states["lib"][states["selectedLib"][0]];
                navigator.clipboard.writeText(_tr.addr.toString(16).toUpperCase());
            } else if(e.key == '1' && e.ctrlKey){
                for(let i = 0; i < states["selectedLib"][1]; i++){
                    states["lib"][states["selectedLib"][0] + i].type = 'byte';
                }
                loadLib();
            } else if(e.key == '2' && e.ctrlKey){
                for(let i = 0; i < states["selectedLib"][1]; i++){
                    states["lib"][states["selectedLib"][0] + i].type = 'int';
                }
                loadLib();
            } else if(e.key == '3' && e.ctrlKey){
                for(let i = 0; i < states["selectedLib"][1]; i++){
                    states["lib"][states["selectedLib"][0] + i].type = 'float';
                }
                loadLib();
            } else if(e.key == '4' && e.ctrlKey){
                for(let i = 0; i < states["selectedLib"][1]; i++){
                    states["lib"][states["selectedLib"][0] + i].type = 'double';
                }
                loadLib();
            } else if(e.key == 't' && e.ctrlKey){
                e.preventDefault();
                for(let i = 0; i < states["selectedLib"][1]; i++){
                    const _tr = states["lib"][states["selectedLib"][0] + i];
                    states["compares"].push(_tr.addr);
                }
                loadLib();
                loadCompare();
            }
        }
    } else {
        if(e.key == 'ArrowRight'){
            if(states["selectedBuffer"][0]){
                states["selectedBuffer"][0] = addHex(states["selectedBuffer"][0], 1);
            } else {
                states["selectedBuffer"] = [states["selectedAddress"], 1];
                states["selectedAddress"] = null;
            }
        } else if(e.key == 'ArrowLeft'){
            if(states["selectedBuffer"][0]){
                states["selectedBuffer"][0] = addHex(states["selectedBuffer"][0], -1);
            }
        } else if(e.key == 'ArrowUp'){
            if(states["selectedBuffer"][0]){
                states["selectedBuffer"][0] = addHex(states["selectedBuffer"][0], -0x10);
            } else {
                states["selectedAddress"] = addHex(states["selectedAddress"], -0x10);
            }
        } else if(e.key == 'ArrowDown'){
            if(states["selectedBuffer"][0]){
                states["selectedBuffer"][0] = addHex(states["selectedBuffer"][0], 0x10);
            } else {
                states["selectedAddress"] = addHex(states["selectedAddress"], 0x10);
            }
        } else if(e.key == 'c' && e.ctrlKey){
            if(document.activeElement.tagName == 'INPUT') return;
            e.preventDefault();
            if(states["selectedBuffer"][0]){
                const addr = parseInt(states["selectedBuffer"][0], 16);
                const len = states["selectedBuffer"][1];
                emit('copy', addr, len);
                once('copy', (e, buffer:string) => {
                    navigator.clipboard.writeText(buffer);
                })
            } else if(states["selectedAddress"]){
                navigator.clipboard.writeText(states["selectedAddress"]);
            }
        } else if(e.key == 's' && e.ctrlKey){
            e.preventDefault();
            if(states["isEditing"] != -1) return;
            if(document.activeElement.tagName == 'INPUT') return;
            e.preventDefault();
            AddToLib();
        }
        loadLine();
    }
}

$_('save-address').onclick = e => {
    AddToLib();
}

function AddToLib(){
    const tar = states["selectedBuffer"][0] || states["selectedAddress"]
    if(tar){
        const addr = parseInt(tar, 16);
        const len = states["selectedBuffer"][0] ? states["selectedBuffer"][1] : 1;
        const type = states["selectedType"];
        if(type != 'byte' && len != 1) {
            // push multiple values
            const _byteLen = type == 'doube' ? 8 : 4;
            const _count = Math.ceil(len / _byteLen);
            for(let i = 0; i < _count; i++){
                states["lib"].push({addr: addr + i * _byteLen, type, len: 1});
            }
        } else {
            states["lib"].push({addr, type, len});
        }
        loadLib();
    }
}

$_('editor-addr').oninput = e => {
    const _ = $_('editor-address') as HTMLInputElement;
    const _val = $_('editor-value') as HTMLInputElement;
    const _type = ($_('editor-type') as HTMLSelectElement).value;
    const _addr = parseInt(_.value, 16);
    const _len = states["lib"][states["isEditing"]].len;
    _val.value = emitSync('readMemory', _addr, _type, _len);
}

($_('editor-type') as HTMLSelectElement).oninput = e => {
    const _ = $_('editor-type') as HTMLSelectElement;
    const _val = $_('editor-value') as HTMLInputElement;
    const _type = _.value;
    const _addr = parseInt(($_('editor-addr') as HTMLInputElement).value, 16);
    const _len = states["lib"][states["isEditing"]].len;
    _val.value = emitSync('readMemory', _addr, _type, _len);
}

$_('save-editor').onclick = e => {
    const _addr = parseInt(($_('editor-addr') as HTMLInputElement).value, 16);
    const _type = ($_('editor-type') as HTMLSelectElement).value;
    const _val = ($_('editor-value') as HTMLInputElement).value;
    const _len = _type == 'byte' ? _val.split(' ').filter(v => v).length : _type == 'double' ? 8 : 4;
    states["lib"][states["isEditing"]] = {addr: _addr, type: _type, len: _len};
    closeEditor();
    loadLib();
}

$_('write-editor').onclick = e => {
    const _addr = parseInt(($_('editor-addr') as HTMLInputElement).value, 16);
    const _type = ($_('editor-type') as HTMLSelectElement).value;
    const _val = ($_('editor-value') as HTMLInputElement).value;
    const _len = _type == 'byte' ? _val.split(' ').filter(v => v).length : _type == 'double' ? 8 : 4;
    ipcRenderer.send('writeMemory', _addr, _type, _val, _len);
    states["lib"][states["isEditing"]] = {addr: _addr, type: _type, len: _len};
    closeEditor();
    loadLib();
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
            return buffer.split(' ').filter(v => v).map(v => {
                const char = String.fromCharCode(parseInt(v, 16))
                // check if this char is printable
                return char.match(/[a-zA-Z0-9\s]/) ? char : '.';
            }).join('');
    }
}

function hexToNumberLE(hexString: string, bytes: number, isFloat: boolean = false): number {
    // Remove spaces and create an array of bytes
    const cleanedHex = hexString.replace(/\s+/g, '');
    const byteCount = cleanedHex.length / 2;
    const buffer = new ArrayBuffer(byteCount);
    const view = new DataView(buffer);

    // Fill the buffer with the hex values
    for (let i = 0; i < byteCount; i++) {
        const byteHex = cleanedHex.substring(i * 2, i * 2 + 2);
        view.setUint8(i, parseInt(byteHex, 16));
    }

    // Read the number from the DataView
    if (bytes === 4 && isFloat) {
        return view.getFloat32(0, true); // true for little-endian
    } else if (bytes === 4) {
        return view.getInt32(0, true); // true for little-endian
    } else if (bytes === 8 && isFloat) {
        return view.getFloat64(0, true); // true for little-endian
    }

    return 0; // Default return if no valid case found
}

function numberToHexLE(value: number, bytes: number, isFloat: boolean = false): string {
    // Create an ArrayBuffer with the necessary length
    const buffer = new ArrayBuffer(bytes);
    const view = new DataView(buffer);

    // Write the number to the DataView
    if (bytes === 4 && isFloat) {
        view.setFloat32(0, value, true); // true for little-endian
    } else if (bytes === 4) {
        view.setInt32(0, value, true); // true for little-endian
    } else if (bytes === 8 && isFloat) {
        view.setFloat64(0, value, true); // true for little-endian
    }

    // Convert to hexadecimal string with spaces
    let hex = [];
    for (let i = 0; i < bytes; i++) {
        hex.push(('00' + view.getUint8(i).toString(16)).slice(-2));
    }
    return hex.join(' ');
}

function reverseBuffer(buffer:string):string {
    return buffer.split(' ').reverse().join(' ');
}