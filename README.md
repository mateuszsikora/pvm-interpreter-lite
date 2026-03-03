# pvm-interpreter-lite

A high-performance PVM (Polka Virtual Machine) interpreter written in TypeScript.

## Features

- Fast dispatch-table based execution loop
- Dual gas counter: `FastGasCounter` (Number) for gas <= MAX_SAFE_INTEGER, `BigGasCounter` (BigInt) for full i64 range
- Page-based memory with page cache and buffer pooling
- Dual-view register file (shared ArrayBuffer with BigUint64Array + Int32Array overlay)
- SPI program format decoder
- All standard PVM opcodes: math, bitwise, branch, load, store, shift, move

## Install

```bash
npm install pvm-interpreter-lite
```

Peer dependency: `@typeberry/lib`

## Usage

```typescript
import { Interpreter } from "pvm-interpreter-lite";
import { tryAsGas } from "@typeberry/lib/pvm-interface";

const interpreter = new Interpreter();
interpreter.resetGeneric(program, 0, tryAsGas(1_000_000));
interpreter.runProgram();

console.log(interpreter.getStatus());
console.log(interpreter.gas.get());
```

### SPI format

```typescript
import { Interpreter, decodeSpi } from "pvm-interpreter-lite";
import { tryAsGas } from "@typeberry/lib/pvm-interface";

const interpreter = new Interpreter();
interpreter.resetJam(spiBlob, args, 0, tryAsGas(1_000_000));
interpreter.runProgram();
```

### Debugger mode

```typescript
const interpreter = new Interpreter({ debuggerMode: true });
// Forces BigGasCounter, allowing gas.set() with arbitrary values at runtime
```

## API

| Export | Description |
|---|---|
| `Interpreter` | Main interpreter class implementing `IPvmInterpreter` |
| `InterpreterOptions` | Options type (`{ debuggerMode?: boolean }`) |
| `Memory` | Page-based memory implementing `IMemory` |
| `Registers` | Register file implementing `IRegisters` |
| `createGasCounter` | Creates optimal gas counter for given gas value |
| `FastGasCounter` | Number-based gas counter (gas <= MAX_SAFE_INTEGER) |
| `decodeSpi` | Decodes SPI program format |
| `SpiDecodeResult` | Return type of `decodeSpi` |

## Development

```bash
npm test          # run tests
npm run qa        # biome check (format + lint)
npm run qa-fix    # auto-fix
npm run build     # compile to dist/
```
