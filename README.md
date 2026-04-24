<div align="center">

# KitTool

**A lightweight Windows memory analyzer and macro runtime for running processes.**

[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](LICENSE)
[![Electron](https://img.shields.io/badge/Electron-30.x-47848F?logo=electron&logoColor=white)](https://www.electronjs.org/)
[![memoryjs](https://img.shields.io/badge/memoryjs-3.4.0-339933)](https://github.com/Rob--/memoryjs)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4+-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/TailwindCSS-3.4+-38BDF8?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)

</div>

---

## Overview

KitTool attaches to a running Windows process and lets you inspect and modify
its memory from a minimal Electron UI. On top of a standard memory viewer and
pattern-finder it ships with **KTS** (Kit Tool Script) — a tiny scripting
language for building reactive macros that read, compare, and write memory in
response to UI and keyboard events.

## Feature summary

| Area | What it does |
|---|---|
| **Viewer** | Attach to a process, scroll a hex dump, jump to an address or offset, switch between byte / int32 / float / double interpretation, save addresses to a library. |
| **Compare** | Collect multiple addresses and diff their bytes side-by-side, highlight changing regions, generate Frida-style `AA BB ?? ??` patterns from a selection. |
| **Macro** | Write KTS scripts in an in-app editor with bracket/quote auto-pairing, load and save `.kts` files, and execute init / loop / click / keydown / keyup events. |
| **Config** | Tune the viewer refresh rate and the macro loop tick from the GUI; values persist in Electron's userData directory. |
| **Hotkeys** | Keyboard shortcuts for every common action (see below). |

## Platform support

KitTool depends on [`memoryjs`](https://github.com/Rob--/memoryjs), which is a
native Node add-on that supports **Windows only**. The app also targets
Windows in its Electron builder configuration. Cloning the repo on macOS or
Linux works for editing and typechecking, but `npm install` and `electron .`
will fail because the native module cannot be built or loaded.

## Getting started

### Prerequisites

- Windows 10 or later (x64)
- [Node.js](https://nodejs.org/) 18 or newer and `npm`
- Visual Studio Build Tools (required by `memoryjs` at install time)

### Install

```bash
git clone https://github.com/eunhhu/KitTool.git
cd KitTool
npm install
```

### Build

Compile TypeScript and the Tailwind stylesheet into `dist/` and
`public/output.css` respectively:

```bash
npm run build
```

### Run

```bash
npm start
```

### Develop

`npm run dev` launches `tsc --watch` and the Tailwind watcher in parallel.
Run `npm start` in a second terminal to open Electron against the latest
build.

### Package

```bash
npm run dist
```

This produces an NSIS installer under `build/` using the settings in
`package.json > build`.

## Using the app

### Attach to a process

1. Click **Attach** (or press <kbd>Alt</kbd>+<kbd>A</kbd>).
2. Type part of the target's filename into the search box to filter the list.
3. Double-click the process, or select it and click **Attach**.

Click **Detach** (<kbd>Alt</kbd>+<kbd>D</kbd>) when you are done to release
the handle.

### Viewer

- Scroll the hex dump with the mouse wheel to change the current offset.
- Type a hex address (e.g. `7FF74E000000`) into the **Address** field to jump;
  the field accepts simple `+ - * /` expressions.
- Use **Save Current Address** (<kbd>Ctrl</kbd>+<kbd>S</kbd>) to push the
  selection into the local library on the right.
- Double-click an item in the library (or press <kbd>Enter</kbd>) to open the
  value editor and write a new value back into memory.

### Compare

- From the library, press <kbd>Ctrl</kbd>+<kbd>T</kbd> to add the selected
  addresses to the comparison set.
- Click an entry in **Compares** to inspect it. Bytes that differ between
  entries are highlighted.
- Drag a range and press **Make Pattern** to generate a Frida-style pattern
  (`A3 B1 ?? ?? 0F`) that matches the shared bytes.

### Macro editor

- The left half is the KTS script. The right half shows the dynamically
  generated UI elements and the live variable table.
- Press <kbd>Ctrl</kbd>+<kbd>Enter</kbd> to **Init** (re-parse and apply) the
  script.
- The **Sort** button pretty-prints the script and groups declarations in a
  canonical order: elements → vars → events.
- **Save** and **Load** read/write plain text `.kts` files.

### Config

The **Config** tab exposes:

- **Viewer refresh** — how often the viewer re-reads memory (milliseconds).
- **Macro tick** — how often the KTS `loop` event fires (milliseconds).

Values are persisted to `config.json` inside Electron's userData directory
and re-applied on the next launch.

## Hotkey reference

| Scope | Keys | Action |
|---|---|---|
| Global | <kbd>Alt</kbd>+<kbd>A</kbd> | Open the attach dialog |
| Global | <kbd>Alt</kbd>+<kbd>D</kbd> | Detach from the current process |
| Global | <kbd>Alt</kbd>+<kbd>1</kbd>..<kbd>6</kbd> | Switch tab (Viewer / Compare / Macro / Config / Hotkeys / Debug) |
| Viewer | <kbd>Ctrl</kbd>+<kbd>1</kbd>..<kbd>4</kbd> | Change view type (byte / int / float / double) |
| Viewer | <kbd>Ctrl</kbd>+<kbd>S</kbd> | Save selection to library |
| Viewer | <kbd>Ctrl</kbd>+<kbd>C</kbd> | Copy selected bytes to clipboard |
| Library | <kbd>↑</kbd> / <kbd>↓</kbd> | Move selection |
| Library | <kbd>Enter</kbd> | Open the value editor |
| Library | <kbd>Delete</kbd> | Remove selected entries |
| Library | <kbd>Ctrl</kbd>+<kbd>G</kbd> | Go to the selected address in the viewer |
| Library | <kbd>Ctrl</kbd>+<kbd>T</kbd> | Add selected library entries to **Compares** |
| Editor | <kbd>Enter</kbd> / <kbd>Ctrl</kbd>+<kbd>W</kbd> | Write the new value |
| Editor | <kbd>Ctrl</kbd>+<kbd>S</kbd> | Save the new value to the library |
| Macro editor | <kbd>Ctrl</kbd>+<kbd>Enter</kbd> | Init the macro |

## KTS language reference

A KTS script is a small list of declarations. Lines starting with `#` are
comments. Whitespace is only significant between tokens.

### Elements

Declare UI elements that show up in the macro view on the right-hand side:

```kts
element <type>:<id> value:"..." style:"..."
```

- `type` — `text`, `input`, or `button`.
- `id` — a unique identifier (letters, digits, `-`, `_`).
- `value` — initial content.
- `style` — a CSS string applied inline.

```kts
element button:b-read   value:"Read Value"  style:"color:red;"
element text:score      value:"0"           style:"font-size:1.5rem;"
element input:address   value:"7FF74E000000"
```

### Variables

```kts
var <name> = <value>
```

Variables are evaluated as JavaScript literals so `var x = 0x2A` and
`var s = "hello"` both work. Use the `change` command inside an event to
mutate them at runtime.

### Events

```kts
event <type> <target?> {
  <commands, if-conditions>
}
```

- `type` — one of `init`, `loop`, `click`, `keydown`, `keyup`.
- `target` — the id of the bound element (or a keycode for key events).
  Omit for `loop`.

### Commands

Two commands are available inside an event body:

```kts
change <name> = <evalValue>
write  <address> = <evalValue> as <valueType>
```

- `change` — write to a variable or the value of an `input`/`text` element.
- `write`  — write the evaluated value to the given memory address. Supported
  `valueType`s are `byte`, `int`, `float`, and `double`.

### If conditions

```kts
if <evalValue> <op> <evalValue> {
  <commands>
}
```

Supported operators: `==  !=  >=  <=  >  <`.

### Evaluated values

An **evaluated value** is either a plain JavaScript expression (which runs in
an isolated `new Function(...)` sandbox) or a template string that
interpolates `{...}` sections. Inside an evaluated value you can call the
built-in modifiers below. Modifiers can be chained by concatenation:
`fi(x)` reads memory at the integer parsed from the hex string `x` as a
float.

| Modifier | Meaning |
|---|---|
| `s` | `String(v)` |
| `n` | `Number(v)` |
| `b` | `v === 'true'` |
| `x` | `v.toString(16)` |
| `i` | `parseInt(v, 16)` |
| `*` | look up variable or element by id |
| `1` | read 1 byte at address |
| `4` | read int32 at address |
| `f` | read float at address |
| `d` | read double at address |

```kts
"Player Position : {fi('7FF74E000000')}, {f(0x7FF74E000A30)}"
# "Player Position : 43.618, 53.642"

x(0xA84B00)
# "a84b00"

s(n('30') + i('A')) + 22
# "4022"
```

### Full example

```kts
element text:score  value:"0"
element button:reset value:"Reset"

var base = 0x7FF74E000000

event loop {
  change score = fi("{x(*('base') + 0x20)}")
}

event click reset {
  write i*('base') + 0x20 = 0 as int
}
```

## Configuration

Runtime config is persisted to `config.json` inside Electron's
`app.getPath('userData')` directory. Delete the file to fall back to the
built-in defaults (viewer tick `500 ms`, macro tick `1000 / 60 ms`).

## Project layout

```
KitTool/
├─ src/
│  ├─ index.ts        # Electron main process + IPC handlers
│  ├─ main.ts         # Renderer entry point (UI, KTS runtime)
│  ├─ preload.ts      # Preload script
│  ├─ types.d.ts      # Shared TypeScript types
│  └─ memoryjs.d.ts   # memoryjs type declarations
├─ public/
│  ├─ main.html       # Main window markup
│  ├─ global.css      # Tailwind source
│  └─ favicon.ico
└─ package.json
```

## Contributing

Issues and pull requests are welcome. Before opening a PR, please:

1. Run `npm run typecheck` to make sure TypeScript is happy.
2. If you change any CSS classes, run `npm run build:css` to regenerate
   `public/output.css`.

## License

KitTool is released under the [ISC License](LICENSE). It is intended for
research and educational use on software you own or are authorized to modify.
