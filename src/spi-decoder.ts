import { readVarU32 } from "./program.js";

const PAGE_SIZE = 4096;
const SEGMENT_SIZE = 65536; // 0x10000
const DATA_LENGTH = 16777216; // 0x1000000
const STACK_SEGMENT = 0xfefe0000;
const ARGS_SEGMENT = 0xfeff0000;
const LAST_PAGE = 0xffff0000;

const NO_OF_REGISTERS = 13;

interface SpiMemorySegment {
	start: number;
	end: number;
	data: Uint8Array | null;
}

export interface SpiDecodeResult {
	code: Uint8Array;
	registers: BigUint64Array;
	readonlySegments: SpiMemorySegment[];
	writeableSegments: SpiMemorySegment[];
	sbrkIndex: number;
	heapEnd: number;
}

function alignToPageSize(size: number): number {
	return Math.ceil(size / PAGE_SIZE) * PAGE_SIZE;
}

function alignToSegmentSize(size: number): number {
	return Math.ceil(size / SEGMENT_SIZE) * SEGMENT_SIZE;
}

export function extractCodeAndMetadata(blobWithMetadata: Uint8Array) {
	const off: [number] = [0];
	const metadataLen = readVarU32(blobWithMetadata, off);
	const metadata = blobWithMetadata.subarray(off[0], off[0] + metadataLen);
	const code = blobWithMetadata.subarray(off[0] + metadataLen);
	return { metadata, code };
}

export function decodeSpi(spi: Uint8Array, args: Uint8Array): SpiDecodeResult {
	const dv = new DataView(spi.buffer, spi.byteOffset, spi.byteLength);
	let off = 0;

	// u24 LE
	const oLength = spi[off] | (dv.getUint16(off + 1, true) << 8);
	off += 3;
	const wLength = spi[off] | (dv.getUint16(off + 1, true) << 8);
	off += 3;

	if (args.length > DATA_LENGTH) {
		throw new Error(
			`Incorrect arguments length: ${args.length} > ${DATA_LENGTH}`,
		);
	}
	if (oLength > DATA_LENGTH) {
		throw new Error(
			`Incorrect readonly segment length: ${oLength} > ${DATA_LENGTH}`,
		);
	}
	const readOnlyLength = oLength;
	if (wLength > DATA_LENGTH) {
		throw new Error(
			`Incorrect heap segment length: ${wLength} > ${DATA_LENGTH}`,
		);
	}
	const heapLength = wLength;

	const noOfHeapZerosPages = dv.getUint16(off, true);
	off += 2;
	const stackSize = spi[off] | (dv.getUint16(off + 1, true) << 8);
	off += 3;

	const readOnlyMemory = spi.subarray(off, off + readOnlyLength);
	off += readOnlyLength;
	const initialHeap = spi.subarray(off, off + heapLength);
	off += heapLength;

	const codeLength = dv.getUint32(off, true);
	off += 4;
	const code = spi.subarray(off, off + codeLength);
	off += codeLength;

	if (off !== spi.length) {
		throw new Error(
			`Expecting end of input, yet there are still ${spi.length - off} bytes left.`,
		);
	}

	const readonlyDataStart = SEGMENT_SIZE;
	const readonlyDataEnd = SEGMENT_SIZE + alignToPageSize(readOnlyLength);
	const heapDataStart = 2 * SEGMENT_SIZE + alignToSegmentSize(readOnlyLength);
	const heapDataEnd = heapDataStart + alignToPageSize(heapLength);
	const heapZerosEnd =
		heapDataStart +
		alignToPageSize(heapLength) +
		noOfHeapZerosPages * PAGE_SIZE;
	const stackStart = STACK_SEGMENT - alignToPageSize(stackSize);
	const stackEnd = STACK_SEGMENT;
	const argsStart = ARGS_SEGMENT;
	const argsEnd = argsStart + alignToPageSize(args.length);

	const readableMemory: SpiMemorySegment[] = [];
	if (readOnlyLength > 0) {
		readableMemory.push({
			start: readonlyDataStart,
			end: readonlyDataEnd,
			data: readOnlyMemory,
		});
	}
	if (args.length > 0) {
		readableMemory.push({ start: argsStart, end: argsEnd, data: args });
	}

	const writeableMemory: SpiMemorySegment[] = [];
	if (heapLength > 0) {
		writeableMemory.push({
			start: heapDataStart,
			end: heapDataEnd,
			data: initialHeap,
		});
	}
	if (heapDataEnd < heapZerosEnd) {
		writeableMemory.push({ start: heapDataEnd, end: heapZerosEnd, data: null });
	}
	if (stackStart < stackEnd) {
		writeableMemory.push({ start: stackStart, end: stackEnd, data: null });
	}

	const regs = new BigUint64Array(NO_OF_REGISTERS);
	regs[0] = BigInt(LAST_PAGE);
	regs[1] = BigInt(STACK_SEGMENT);
	regs[7] = BigInt(ARGS_SEGMENT);
	regs[8] = BigInt(args.length);

	return {
		code,
		registers: regs,
		readonlySegments: readableMemory,
		writeableSegments: writeableMemory,
		sbrkIndex: heapZerosEnd,
		heapEnd: stackStart,
	};
}
