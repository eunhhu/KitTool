
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