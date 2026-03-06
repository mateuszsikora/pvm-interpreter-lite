/**
 * Result codes for the PVM execution.
 */
export enum Status {
	/** Continue */
	OK = 255,
	/** Finished */
	HALT = 0,
	/** Panic */
	PANIC = 1,
	/** Page-fault */
	FAULT = 2,
	/** Host-call */
	HOST = 3,
	/** Out of gas */
	OOG = 4,
}

/** Gas measuring type. Can be either a JS number or bigint. */
export type Gas = number | bigint;

/**
 * An abstraction over gas counter.
 *
 * Can be optimized to use numbers instead of bigint in case of small gas.
 */
export interface IGasCounter {
	/** Set during initialization. Needed to calculate `used()` gas. */
	initialGas: Gas;
	/** Return remaining gas. */
	get(): Gas;
	/** Overwrite remaining gas. */
	set(g: Gas): void;
	/** Subtract gas. Returns true if there was an underflow (out of gas). */
	sub(g: Gas): boolean;
	/** Gas consumed since creation. */
	used(): Gas;
}
