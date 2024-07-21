
type ValueType = "byte"|"int"|"float"|"double"|"string";
type M_EventType = 'init'|'loop'|'keydown'|'keyup'|'click'
type M_CommandType = 'write'|'change'
type M_ConditionType = '=='|'!='|'>'|'<'|'>='|'<='

interface M_Condition {
    type:M_ConditionType;
    target:any; // evaluated value
    value:any; // evaluated value
}

interface M_Command {
    type:M_CommandType;
    target:string|number;
    // write : evaluated value
    // read : evaluated value
    // change : element id or variable name
    value:any;
    // write : evaluated value
    // read : binding element id or variable name
    // change : evaluated value
    valueType?:ValueType;
    // write : ValueType
    // read : ValueType
    conditions:M_Condition[];
}

interface M_Event {
    type:M_EventType;
    target?:string; // if type is keydown or keyup, target is keycode. else target is element id (don't use in loop)
    commands:M_Command[];
}

type M_ElementType = 'input'|'text'|'button';

interface M_Element {
    id:string;
    type:M_ElementType;
    value:string; // inner text content
    style:string; // css style
}

interface Macro {
    elements:M_Element[];
    vars:{[key:string]:string};
    events:M_Event[];
}

function parseKTM(ktmContent: string): Macro {
    const elements: M_Element[] = [];
    const vars: { [key: string]: any } = {};
    const events: M_Event[] = [];

    const lines = ktmContent.split('\n').map(line => line.trim()).filter(line => line && !line.startsWith('#'));

    lines.forEach((line) => {
        if (line.startsWith('element')) {
            const [, elementType, elementId, ...rest] = line.match(/element (\w+):([\w\-]+) (.+)/)!;
            const restJoined = rest.join(' ');
            const props:{[key:string]:string} = {};
            restJoined.split(/(\w+):"/).slice(1).forEach((part, idx, array) => {
                if (idx % 2 === 0) {
                    const key = part;
                    const value = array[idx + 1].split('"')[0];
                    props[key] = value;
                }
            });

            elements.push({
                id: elementId,
                type: elementType as M_ElementType,
                value: props['value'] || '',
                style: props['style'] || ''
            });
        } else if (line.startsWith('var')) {
            const [, varName, varValue] = line.match(/var (\w+) = (.+)/)!;
            vars[varName] = parseValue(varValue);
        } else if (line.startsWith('event')) {
            const eventCommands: M_Command[] = [];
            const eventType = line.split(' ')[1] as M_EventType;
            let idx = lines.indexOf(line) + 1;

            while (idx < lines.length && !lines[idx].startsWith('event')) {
                const cmdLine = lines[idx].trim();
                if (cmdLine.startsWith('change')) {
                    const [, target, value] = cmdLine.match(/change (\w+) = (.+)/)!;
                    eventCommands.push({
                        type: 'change',
                        target,
                        value: parseValue(value),
                        conditions: []
                    });
                } else if (cmdLine.startsWith('write')) {
                    const [, target, value, valueType] = cmdLine.match(/write (.+) = (.+) as (\w+)/)!;
                    eventCommands.push({
                        type: 'write',
                        target: target.replaceAll('{', '').replaceAll('}', ''),
                        value: parseValue(value),
                        valueType: valueType as ValueType,
                        conditions: []
                    });
                }
                idx++;
            }

            events.push({
                type: eventType,
                commands: eventCommands
            });
        }
    });

    return {
        elements,
        vars,
        events
    };
}

function parseValue(value: string): any {
    // Remove surrounding quotes for strings and leave other types (numbers, booleans) intact
    if (value.startsWith('"') && value.endsWith('"')) {
        return value.slice(1, -1);
    } else if (isNaN(Number(value)) && value !== 'true' && value !== 'false') {
        // It's a string without quotes
        return value;
    }
    return JSON.parse(value);
}

// 예시 .ktm 컨텐츠 사용
const ktmContent = `# m.ktm

element text:t-base value:"Base Address"
element input:i-base value:""
element button:b-pinon value:"Pin On" style:"color:aqua;"
element button:b-pinoff value:"Pin Off"

var pin = false
var base = 0
var text1 = "test"

event loop {
  if "{*('pin')}" == true {
    write "{*('base') + 0x0}" = 900000 as float
  }
}

event click b-pinoff {
  change pin = false
}

event click b-pinon {
  change pin = true
  change base = "*{'i-base'}"
}
`;

console.log(JSON.stringify(parseKTM(ktmContent), null, 2));
