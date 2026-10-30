/**
 * Mulberry32 deterministic 32-bit PRNG.
 * Given an integer seed, returns a function that produces uniform floats in [0, 1).
 */
export type PRNG = () => number;

export function createPRNG(seed: number): PRNG {
  let state = seed >>> 0;
  return function next(): number {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
