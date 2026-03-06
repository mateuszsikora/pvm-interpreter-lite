import { Instruction } from "./instruction.js";

const MAX_INSTRUCTION_DISTANCE = 25;

const MAX_OPCODE = 256;
const terminationOpcodes = new Uint8Array(MAX_OPCODE);
terminationOpcodes[Instruction.TRAP] = 1;
terminationOpcodes[Instruction.FALLTHROUGH] = 1;
terminationOpcodes[Instruction.JUMP] = 1;
terminationOpcodes[Instruction.JUMP_IND] = 1;
terminationOpcodes[Instruction.LOAD_IMM_JUMP] = 1;
terminationOpcodes[Instruction.LOAD_IMM_JUMP_IND] = 1;
terminationOpcodes[Instruction.BRANCH_EQ] = 1;
terminationOpcodes[Instruction.BRANCH_NE] = 1;
terminationOpcodes[Instruction.BRANCH_GE_U] = 1;
terminationOpcodes[Instruction.BRANCH_GE_S] = 1;
terminationOpcodes[Instruction.BRANCH_LT_U] = 1;
terminationOpcodes[Instruction.BRANCH_LT_S] = 1;
terminationOpcodes[Instruction.BRANCH_EQ_IMM] = 1;
terminationOpcodes[Instruction.BRANCH_NE_IMM] = 1;
terminationOpcodes[Instruction.BRANCH_LT_U_IMM] = 1;
terminationOpcodes[Instruction.BRANCH_LT_S_IMM] = 1;
terminationOpcodes[Instruction.BRANCH_LE_U_IMM] = 1;
terminationOpcodes[Instruction.BRANCH_LE_S_IMM] = 1;
terminationOpcodes[Instruction.BRANCH_GE_U_IMM] = 1;
terminationOpcodes[Instruction.BRANCH_GE_S_IMM] = 1;
terminationOpcodes[Instruction.BRANCH_GT_U_IMM] = 1;
terminationOpcodes[Instruction.BRANCH_GT_S_IMM] = 1;

/**
 * Read a JAM variable-length u32 from `src`.
 * Advances `off[0]` past the consumed bytes. Returns the decoded value.
 */
export function readVarU32(src: Uint8Array, off: [number]): number {
	const first = src[off[0]++];
	if (first < 0x80) return first;
	if (first < 0xc0) {
		const v = ((first & 0x3f) << 8) | src[off[0]];
		off[0] += 1;
		return v;
	}
	if (first < 0xe0) {
		const o = off[0];
		off[0] += 2;
		return ((first & 0x1f) << 16) | (src[o + 1] << 8) | src[o];
	}
	if (first < 0xf0) {
		const o = off[0];
		off[0] += 3;
		return (
			((first & 0x0f) << 24) | (src[o + 2] << 16) | (src[o + 1] << 8) | src[o]
		);
	}
	const o = off[0];
	off[0] += 4;
	return new DataView(src.buffer, src.byteOffset + o, 4).getUint32(0, true);
}

/**
 * Reusable buffers for decodeProgram. Keeps pre-allocated arrays that only grow.
 * Pass the same instance to decodeProgram on every resetGeneric call to avoid
 * allocating new Uint8Array/Uint32Array every time.
 */
export class DecodeBufs {
	skip: Uint8Array = new Uint8Array(0);
	blocks: Uint8Array = new Uint8Array(0);
	jumpTable: Uint32Array = new Uint32Array(0);

	/** Ensure skip buffer is at least `len` bytes. Only grows, never shrinks. */
	ensureSkip(len: number): Uint8Array {
		if (this.skip.length < len) {
			this.skip = new Uint8Array(len);
		}
		return this.skip;
	}

	/** Ensure blocks buffer is at least `len` bytes. Only grows, never shrinks. */
	ensureBlocks(len: number): Uint8Array {
		if (this.blocks.length < len) {
			this.blocks = new Uint8Array(len);
		}
		return this.blocks;
	}

	/** Ensure jumpTable buffer is at least `len` elements. Only grows, never shrinks. */
	ensureJumpTable(len: number): Uint32Array {
		if (this.jumpTable.length < len) {
			this.jumpTable = new Uint32Array(len);
		}
		return this.jumpTable;
	}
}

export function decodeProgram(
	rawProgram: Uint8Array,
	bufs?: DecodeBufs,
): {
	code: Uint8Array;
	skip: Uint8Array;
	blocks: Uint8Array;
	jumpTable: Uint32Array;
	jumpTableSize: number;
} {
	const off: [number] = [0];
	const jumpTableLength = readVarU32(rawProgram, off);
	const jumpTableItemLength = rawProgram[off[0]++];
	const codeLength = readVarU32(rawProgram, off);

	const jumpTableLengthInBytes = jumpTableLength * jumpTableItemLength;
	const jumpTableData = rawProgram.subarray(
		off[0],
		off[0] + jumpTableLengthInBytes,
	);
	off[0] += jumpTableLengthInBytes;

	const code = rawProgram.subarray(off[0], off[0] + codeLength);
	off[0] += codeLength;

	// Read mask bits (bitVecFixLen) — ceil(codeLength/8) bytes
	const maskByteLen = Math.ceil(codeLength / 8);
	const maskBytes = rawProgram.subarray(off[0], off[0] + maskByteLen);
	off[0] += maskByteLen;

	if (off[0] !== rawProgram.length) {
		throw new Error(
			`Expecting end of input, yet there are still ${rawProgram.length - off[0]} bytes left.`,
		);
	}

	const codeLen = code.length;

	// Reuse or allocate skip table
	const skip = bufs ? bufs.ensureSkip(codeLen) : new Uint8Array(codeLen);
	let lastInstructionOffset = 0;
	for (let i = codeLen - 1; i >= 0; i--) {
		if ((maskBytes[i >> 3] >> (i & 7)) & 1) {
			lastInstructionOffset = 0;
		} else {
			lastInstructionOffset++;
		}
		skip[i] = Math.min(lastInstructionOffset, MAX_INSTRUCTION_DISTANCE);
	}

	// Reuse or allocate blocks table
	const blocksLen = codeLen + 1;
	const blocks = bufs
		? bufs.ensureBlocks(blocksLen)
		: new Uint8Array(blocksLen);
	// Must zero-fill the used portion (reusable buffer may have stale data)
	if (bufs) {
		blocks.fill(0, 0, blocksLen);
	}
	blocks[0] = 1;
	for (let i = 0; i < codeLen; i++) {
		if ((maskBytes[i >> 3] >> (i & 7)) & 1 && terminationOpcodes[code[i]]) {
			const nextPc = i + 1 + skip[i + 1];
			if (nextPc <= codeLen) {
				blocks[nextPc] = 1;
			}
		}
	}

	// Reuse or allocate jump table
	const jumpTable = bufs
		? bufs.ensureJumpTable(jumpTableLength)
		: new Uint32Array(jumpTableLength);
	for (let i = 0; i < jumpTableLength; i++) {
		let dest = 0;
		for (let j = 0; j < jumpTableItemLength; j++) {
			dest |= jumpTableData[i * jumpTableItemLength + j] << (j * 8);
		}
		jumpTable[i] = dest;
	}

	return {
		code,
		skip,
		blocks,
		jumpTable,
		jumpTableSize: jumpTableLength,
	};
}
