import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Decoder, Encoder } from "@typeberry/lib/codec";
import { decodeProgram, readVarU32 } from "./program.js";
import { extractCodeAndMetadata } from "./spi-decoder.js";

/** Encode a varU32 using the canonical typeberry Encoder. */
function encodeVarU32(value: number): Uint8Array {
	const encoder = Encoder.create();
	encoder.varU32(value);
	return new Uint8Array(encoder.viewResult().raw);
}

// ===== readVarU32 =====

describe("readVarU32", () => {
	/** Decode with typeberry Decoder as reference. */
	function referenceVarU32(data: Uint8Array): number {
		return Decoder.fromBlob(data).varU32() as number;
	}

	it("single byte: 0", () => {
		const off: [number] = [0];
		const v = readVarU32(encodeVarU32(0), off);
		assert.equal(v, 0);
		assert.equal(off[0], 1);
	});

	it("single byte: 127", () => {
		const off: [number] = [0];
		const v = readVarU32(encodeVarU32(127), off);
		assert.equal(v, 127);
		assert.equal(off[0], 1);
	});

	it("two bytes: 128", () => {
		const off: [number] = [0];
		const v = readVarU32(encodeVarU32(128), off);
		assert.equal(v, 128);
		assert.equal(off[0], 2);
	});

	it("two bytes: 16383", () => {
		const off: [number] = [0];
		const v = readVarU32(encodeVarU32(16383), off);
		assert.equal(v, 16383);
		assert.equal(off[0], 2);
	});

	it("three bytes: 16384", () => {
		const off: [number] = [0];
		const v = readVarU32(encodeVarU32(16384), off);
		assert.equal(v, 16384);
		assert.equal(off[0], 3);
	});

	it("four bytes: 2097152", () => {
		const off: [number] = [0];
		const v = readVarU32(encodeVarU32(2097152), off);
		assert.equal(v, 2097152);
		assert.equal(off[0], 4);
	});

	it("five bytes: 2^32 - 1", () => {
		const off: [number] = [0];
		const v = readVarU32(encodeVarU32(0xffffffff), off);
		assert.equal(v, 0xffffffff);
		assert.equal(off[0], 5);
	});

	it("matches typeberry Decoder for a range of values", () => {
		const testValues = [
			0, 1, 63, 64, 127, 128, 255, 256, 1000, 16383, 16384, 65535, 65536,
			100000, 2097151, 2097152, 0xffffff, 0x1000000, 0x7fffffff, 0xfffffffe,
			0xffffffff,
		];
		for (const val of testValues) {
			const encoded = encodeVarU32(val);
			const off: [number] = [0];
			const ours = readVarU32(encoded, off);
			const theirs = referenceVarU32(encoded);
			assert.equal(ours, theirs, `mismatch for value ${val}`);
		}
	});

	it("reads at non-zero offset", () => {
		const a = encodeVarU32(42);
		const b = encodeVarU32(9999);
		const combined = new Uint8Array(a.length + b.length);
		combined.set(a, 0);
		combined.set(b, a.length);

		const off: [number] = [0];
		const v1 = readVarU32(combined, off);
		assert.equal(v1, 42);
		const v2 = readVarU32(combined, off);
		assert.equal(v2, 9999);
	});
});

// ===== decodeProgram =====

describe("decodeProgram", () => {
	/** Build a raw program blob by hand. */
	function buildRawProgram(
		code: number[],
		mask: boolean[],
		jumpTableEntries: number[] = [],
		jumpTableItemLength = 0,
	) {
		const parts: number[] = [];

		// varU32: jumpTableEntries.length
		pushVarU32(parts, jumpTableEntries.length);
		// u8: item length
		parts.push(jumpTableItemLength);
		// varU32: code length
		pushVarU32(parts, code.length);

		// jump table data
		for (const dest of jumpTableEntries) {
			for (let j = 0; j < jumpTableItemLength; j++) {
				parts.push((dest >> (j * 8)) & 0xff);
			}
		}

		// code bytes
		for (const b of code) parts.push(b);

		// mask bits — packed, LSB first
		const maskByteLen = Math.ceil(code.length / 8);
		for (let i = 0; i < maskByteLen; i++) {
			let byte = 0;
			for (let bit = 0; bit < 8; bit++) {
				const idx = i * 8 + bit;
				if (idx < mask.length && mask[idx]) {
					byte |= 1 << bit;
				}
			}
			parts.push(byte);
		}

		return new Uint8Array(parts);
	}

	function pushVarU32(out: number[], value: number) {
		out.push(...encodeVarU32(value));
	}

	it("decodes a simple program with no jump table", () => {
		const code = [0x00, 0x01, 0x02];
		const mask = [true, false, true];
		const raw = buildRawProgram(code, mask);
		const result = decodeProgram(raw);

		assert.deepEqual([...result.code], code);
		assert.equal(result.jumpTableSize, 0);
		assert.equal(result.code.length, 3);
	});

	it("decodes mask bits correctly (skip table)", () => {
		// instruction, arg, instruction
		const code = [0x00, 0xff, 0x00];
		const mask = [true, false, true];
		const raw = buildRawProgram(code, mask);
		const result = decodeProgram(raw);

		assert.equal(result.skip[0], 0); // instruction start
		assert.equal(result.skip[1], 1); // skip 1 to reach next instruction
		assert.equal(result.skip[2], 0); // instruction start
	});

	it("decodes jump table", () => {
		const code = [0x00];
		const mask = [true];
		const raw = buildRawProgram(code, mask, [0x100, 0x200], 2);
		const result = decodeProgram(raw);

		assert.equal(result.jumpTableSize, 2);
		assert.equal(result.jumpTable[0], 0x100);
		assert.equal(result.jumpTable[1], 0x200);
	});

	it("marks basic block start at pc=0", () => {
		const code = [0x00];
		const mask = [true];
		const raw = buildRawProgram(code, mask);
		const result = decodeProgram(raw);

		assert.equal(result.blocks[0], 1);
	});

	it("throws on trailing bytes", () => {
		const raw = buildRawProgram([0x00], [true]);
		const padded = new Uint8Array(raw.length + 1);
		padded.set(raw);

		assert.throws(() => decodeProgram(padded), /bytes left/);
	});
});

// ===== extractCodeAndMetadata =====

describe("extractCodeAndMetadata", () => {
	/** Build a blob with varU32-prefixed metadata + trailing code. */
	function buildBlob(metadata: number[], code: number[]) {
		const parts: number[] = [];
		parts.push(...encodeVarU32(metadata.length));
		for (const b of metadata) parts.push(b);
		for (const b of code) parts.push(b);
		return new Uint8Array(parts);
	}

	it("splits metadata and code", () => {
		const blob = buildBlob([0xaa, 0xbb, 0xcc], [0x01, 0x02, 0x03]);
		const { metadata, code } = extractCodeAndMetadata(blob);

		assert.deepEqual([...metadata], [0xaa, 0xbb, 0xcc]);
		assert.deepEqual([...code], [0x01, 0x02, 0x03]);
	});

	it("handles empty metadata", () => {
		const blob = buildBlob([], [0xff]);
		const { metadata, code } = extractCodeAndMetadata(blob);

		assert.equal(metadata.length, 0);
		assert.deepEqual([...code], [0xff]);
	});

	it("handles empty code (all is metadata)", () => {
		const blob = buildBlob([0x01, 0x02], []);
		const { metadata, code } = extractCodeAndMetadata(blob);

		assert.deepEqual([...metadata], [0x01, 0x02]);
		assert.equal(code.length, 0);
	});
});
