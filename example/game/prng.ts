export interface Prng {
    next(): number
    range(min: number, max: number): number
    int(min: number, maxInclusive: number): number
    pick<T>(arr: T[]): T
    chance(probability: number): boolean
    sign(): -1 | 1
}

/** A compact, deterministic 32-bit PRNG. */
export function createRng(seed: number): Prng {
    let state = seed >>> 0

    const next = () => {
        state = (state + 0x6d2b79f5) >>> 0
        let value = state
        value = Math.imul(value ^ (value >>> 15), value | 1)
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
        return ((value ^ (value >>> 14)) >>> 0) / 0x100000000
    }

    return {
        next,
        range: (min, max) => min + (max - min) * next(),
        int: (min, maxInclusive) => Math.floor(min + next() * (maxInclusive - min + 1)),
        pick: <T>(arr: T[]) => arr[Math.min(arr.length - 1, Math.floor(next() * arr.length))],
        chance: (probability) => next() < probability,
        sign: () => next() < 0.5 ? -1 : 1,
    }
}
