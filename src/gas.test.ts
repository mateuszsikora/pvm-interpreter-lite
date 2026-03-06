import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { BigGasCounter, createGasCounter, FastGasCounter } from "./gas.js";

describe("FastGasCounter", () => {
	it("subOne: counts down correctly", () => {
		const gc = new FastGasCounter(3);
		assert.equal(gc.subOne(), false);
		assert.equal(gc.subOne(), false);
		assert.equal(gc.subOne(), false);
		assert.equal(gc.subOne(), true); // 4th -> OOG
	});

	it("subOne: gas=0 -> OOG immediately", () => {
		const gc = new FastGasCounter(0);
		assert.equal(gc.subOne(), true);
	});

	it("get: returns 0 after OOG", () => {
		const gc = new FastGasCounter(1);
		gc.subOne();
		gc.subOne(); // OOG
		assert.equal(Number(gc.get()), 0);
	});

	it("subOne: gas=1 -> one step then OOG", () => {
		const gc = new FastGasCounter(1);
		assert.equal(gc.subOne(), false);
		assert.equal(gc.subOne(), true);
	});

	it("get: returns remaining gas", () => {
		const gc = new FastGasCounter(5);
		gc.subOne();
		gc.subOne();
		assert.equal(Number(gc.get()), 3);
	});

	it("used: returns consumed gas", () => {
		const gc = new FastGasCounter(10);
		gc.subOne();
		gc.subOne();
		gc.subOne();
		assert.equal(Number(gc.used()), 3);
	});

	it("used: returns initialGas (not more) after OOG via subOne", () => {
		const gc = new FastGasCounter(2);
		gc.subOne(); // counter=1
		gc.subOne(); // counter=0
		gc.subOne(); // OOG, counter was -1 internally
		assert.equal(Number(gc.used()), 2); // must be 2, not 3
	});

	it("used: returns initialGas after OOG via sub", () => {
		const gc = new FastGasCounter(5);
		gc.sub(10); // OOG
		assert.equal(Number(gc.used()), 5);
	});

	it("sub: subtracts bulk gas", () => {
		const gc = new FastGasCounter(10);
		assert.equal(gc.sub(5), false);
		assert.equal(Number(gc.get()), 5);
	});

	it("sub: exact amount -> no OOG", () => {
		const gc = new FastGasCounter(10);
		assert.equal(gc.sub(10), false);
		assert.equal(Number(gc.get()), 0);
	});

	it("sub: more than remaining -> OOG", () => {
		const gc = new FastGasCounter(10);
		assert.equal(gc.sub(11), true);
	});

	it("set: reduces gas to lower value", () => {
		const gc = new FastGasCounter(10);
		gc.set(5);
		assert.equal(Number(gc.get()), 5);
	});

	it("set: same value is allowed", () => {
		const gc = new FastGasCounter(10);
		gc.set(10);
		assert.equal(Number(gc.get()), 10);
	});

	it("set: zero is allowed", () => {
		const gc = new FastGasCounter(10);
		gc.set(0);
		assert.equal(Number(gc.get()), 0);
		assert.equal(gc.subOne(), true); // OOG
	});

	it("set: throws when trying to increase gas", () => {
		const gc = new FastGasCounter(5);
		gc.subOne(); // counter = 4
		assert.throws(
			() => gc.set(5),
			/FastGasCounter.set\(\) cannot increase gas/,
		);
	});
});

describe("BigGasCounter", () => {
	it("subOne: handles gas > MAX_SAFE_INTEGER", () => {
		const bigGas = BigInt(Number.MAX_SAFE_INTEGER) + 100n;
		const gc = new BigGasCounter(bigGas);
		assert.equal(gc.subOne(), false);
		assert.equal(BigInt(gc.get()), BigInt(Number.MAX_SAFE_INTEGER) + 99n);
	});

	it("subOne: small gas exhausts correctly", () => {
		const gc = new BigGasCounter(2);
		assert.equal(gc.subOne(), false);
		assert.equal(gc.subOne(), false);
		assert.equal(gc.subOne(), true);
	});

	it("subOne: gas=0 -> OOG immediately", () => {
		const gc = new BigGasCounter(0);
		assert.equal(gc.subOne(), true);
	});

	it("get: returns correct total for large values", () => {
		const val = BigInt(Number.MAX_SAFE_INTEGER) + 42n;
		const gc = new BigGasCounter(val);
		assert.equal(BigInt(gc.get()), val);
	});

	it("used: tracks correctly across overflow boundary", () => {
		const bigGas = BigInt(Number.MAX_SAFE_INTEGER) + 10n;
		const gc = new BigGasCounter(bigGas);
		gc.subOne();
		gc.subOne();
		gc.subOne();
		assert.equal(BigInt(gc.used()), 3n);
	});

	it("sub: large cost within range", () => {
		const bigGas = BigInt(Number.MAX_SAFE_INTEGER) + 1000n;
		const gc = new BigGasCounter(bigGas);
		assert.equal(gc.sub(BigInt(Number.MAX_SAFE_INTEGER) + 500n), false);
		assert.equal(BigInt(gc.get()), 500n);
	});

	it("sub: cost exceeds remaining -> OOG", () => {
		const bigGas = BigInt(Number.MAX_SAFE_INTEGER) + 1000n;
		const gc = new BigGasCounter(bigGas);
		gc.sub(BigInt(Number.MAX_SAFE_INTEGER) + 500n);
		assert.equal(gc.sub(501), true);
	});

	it("sub: small cost on large gas", () => {
		const bigGas = BigInt(Number.MAX_SAFE_INTEGER) + 100n;
		const gc = new BigGasCounter(bigGas);
		assert.equal(gc.sub(50), false);
		assert.equal(BigInt(gc.get()), BigInt(Number.MAX_SAFE_INTEGER) + 50n);
	});

	it("sub: exact amount -> no OOG", () => {
		const gc = new BigGasCounter(100);
		assert.equal(gc.sub(100), false);
		assert.equal(BigInt(gc.get()), 0n);
	});

	it("sub: cost > MAX_SAFE_INTEGER on large gas", () => {
		const gas = BigInt(Number.MAX_SAFE_INTEGER) * 3n;
		const gc = new BigGasCounter(gas);
		const cost = BigInt(Number.MAX_SAFE_INTEGER) * 2n;
		assert.equal(gc.sub(cost), false);
		assert.equal(BigInt(gc.get()), BigInt(Number.MAX_SAFE_INTEGER));
	});

	it("set: resets to large value", () => {
		const gc = new BigGasCounter(100);
		gc.subOne();
		gc.set(BigInt(Number.MAX_SAFE_INTEGER) + 50n);
		assert.equal(BigInt(gc.get()), BigInt(Number.MAX_SAFE_INTEGER) + 50n);
	});

	it("set: resets to small value", () => {
		const bigGas = BigInt(Number.MAX_SAFE_INTEGER) + 100n;
		const gc = new BigGasCounter(bigGas);
		gc.set(42);
		assert.equal(BigInt(gc.get()), 42n);
	});

	it("set: resets to zero", () => {
		const gc = new BigGasCounter(100);
		gc.set(0);
		assert.equal(BigInt(gc.get()), 0n);
		assert.equal(gc.subOne(), true);
	});
});

describe("createGasCounter", () => {
	it("selects FastGasCounter for small values", () => {
		const gc = createGasCounter(1000);
		assert.ok(gc instanceof FastGasCounter);
	});

	it("selects BigGasCounter for large values", () => {
		const gc = createGasCounter(BigInt(Number.MAX_SAFE_INTEGER) + 1n);
		assert.ok(gc instanceof BigGasCounter);
	});

	it("selects FastGasCounter for MAX_SAFE_INTEGER exactly", () => {
		const gc = createGasCounter(Number.MAX_SAFE_INTEGER);
		assert.ok(gc instanceof FastGasCounter);
	});

	it("forceBigGas: uses BigGasCounter even for small values", () => {
		const gc = createGasCounter(100, true);
		assert.ok(gc instanceof BigGasCounter);
	});

	it("forceBigGas: set() works on small-value BigGasCounter", () => {
		const gc = createGasCounter(100, true);
		gc.set(BigInt(Number.MAX_SAFE_INTEGER) + 1n);
		assert.equal(BigInt(gc.get()), BigInt(Number.MAX_SAFE_INTEGER) + 1n);
	});
});
