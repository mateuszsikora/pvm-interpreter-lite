# pvm-interpreter-lite

A high-performance, standalone PVM (Polka Virtual Machine) interpreter written in TypeScript. Zero runtime dependencies.

## Features

- Fast dispatch-table based execution loop
- Dual gas counter: `FastGasCounter` (Number) for gas <= MAX_SAFE_INTEGER, `BigGasCounter` (BigInt) for full i64 range
- Page-based memory with page cache and buffer pooling
- Dual-view register file (shared ArrayBuffer with BigUint64Array + Int32Array overlay)
- SPI program format decoder
- All standard PVM opcodes: math, bitwise, branch, load, store, shift, move

## Install

```bash
npm install @fluffylabs/pvm-interpreter-lite
```

## Usage

```typescript
import { Interpreter } from "@fluffylabs/pvm-interpreter-lite";

const interpreter = new Interpreter();
interpreter.resetGeneric(program, 0, 1_000_000);
interpreter.runProgram();

console.log(interpreter.getStatus());
console.log(interpreter.gas.get());
```

### SPI format

```typescript
import { Interpreter } from "@fluffylabs/pvm-interpreter-lite";

const interpreter = new Interpreter();
interpreter.resetJam(spiBlob, args, 0, 1_000_000);
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
| `Interpreter` | Main interpreter class |
| `InterpreterOptions` | Options type (`{ debuggerMode?: boolean }`) |
| `Memory` | Page-based memory with `fastLoad`/`fastStore` |
| `Registers` | Dual-view register file |
| `createGasCounter` | Creates optimal gas counter for given gas value |
| `FastGasCounter` | Number-based gas counter (gas <= MAX_SAFE_INTEGER) |
| `Status` | PVM execution result enum (OK, HALT, PANIC, FAULT, HOST, OOG) |
| `Gas` | Gas type (`number \| bigint`) |
| `IGasCounter` | Gas counter interface |
| `tryAsGas` | Convert number/bigint to Gas |
| `decodeSpi` | Decodes SPI program format |
| `SpiDecodeResult` | Return type of `decodeSpi` |

## Development

```bash
npm test          # run tests
npm run qa        # biome check (format + lint)
npm run qa-fix    # auto-fix
npm run build     # compile to dist/
```
