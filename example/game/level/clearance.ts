import type { MoverSpec, V3 } from '../level'

export interface ClearancePlacement {
    pos: V3
    shape: 'box' | 'cylinder'
    size: V3
    rot: V3
    moverKind?: MoverSpec['kind']
    travel?: V3
}

export interface ClearanceResult {
    valid: boolean
    minMargin: number
    offender?: ClearancePlacement
}

export const CHARACTER_MARGIN = 0.4
// 12 steps at the minimum rise (0.8) span 9.6m, comfortably above the largest
// vertical reach a pair can conflict over (lift travel 3.5 + clearance 3 + halves).
const WINDOW_SIZE = 12

export function horizontalSupport(placement: ClearancePlacement, dirX: number, dirZ: number) {
    if (placement.shape === 'cylinder') return placement.size[0]
    const sinTilt = Math.sin(placement.rot[0])
    const cosTilt = Math.cos(placement.rot[0])
    const sinYaw = Math.sin(placement.rot[1])
    const cosYaw = Math.cos(placement.rot[1])
    const localXDot = dirX * cosYaw - dirZ * cosTilt * sinYaw
    const localYDot = dirZ * sinTilt
    const localZDot = dirX * sinYaw + dirZ * cosTilt * cosYaw
    return placement.size[0] * Math.abs(localXDot)
        + placement.size[1] * Math.abs(localYDot)
        + placement.size[2] * Math.abs(localZDot)
}

export function verticalSupport(placement: ClearancePlacement) {
    if (placement.shape === 'cylinder') return placement.size[1]
    const sinTilt = Math.sin(placement.rot[0])
    const cosTilt = Math.cos(placement.rot[0])
    const sinYaw = Math.sin(placement.rot[1])
    const cosYaw = Math.cos(placement.rot[1])
    return placement.size[0] * Math.abs(sinTilt * sinYaw)
        + placement.size[1] * Math.abs(cosTilt)
        + placement.size[2] * Math.abs(sinTilt * cosYaw)
}

function horizontalTravel(placement: ClearancePlacement) {
    if (placement.moverKind !== 'patrol' || !placement.travel) return 0
    return Math.hypot(placement.travel[0], placement.travel[2])
}

function upwardTravel(placement: ClearancePlacement) {
    if (placement.moverKind !== 'lift' || !placement.travel) return 0
    return Math.abs(placement.travel[1])
}

function clearanceMargin(
    candidate: ClearancePlacement,
    other: ClearancePlacement,
    overheadClearance: number,
    rawSupports: boolean,
) {
    const lower = candidate.pos[1] < other.pos[1] ? candidate : other
    const higher = lower === candidate ? other : candidate
    const lowerTop = lower.pos[1] + verticalSupport(lower) + (rawSupports ? 0 : upwardTravel(lower))
    const higherBottom = higher.pos[1] - verticalSupport(higher)
    if (rawSupports && higherBottom <= lowerTop) return Number.POSITIVE_INFINITY
    if (higherBottom - lowerTop >= overheadClearance) return Number.POSITIVE_INFINITY

    const dx = higher.pos[0] - lower.pos[0]
    const dz = higher.pos[2] - lower.pos[2]
    const distance = Math.hypot(dx, dz)
    const dirX = distance === 0 ? 1 : dx / distance
    const dirZ = distance === 0 ? 0 : dz / distance
    const requiredDistance = horizontalSupport(lower, dirX, dirZ)
        + horizontalSupport(higher, dirX, dirZ)
        + (rawSupports ? 0 : horizontalTravel(lower) + horizontalTravel(higher))
        + 2 * CHARACTER_MARGIN
    return distance - requiredDistance
}

export function checkClearance(
    candidate: ClearancePlacement,
    window: readonly ClearancePlacement[],
    anchor: ClearancePlacement | undefined,
    overheadClearance: number,
): ClearanceResult {
    let minMargin = Number.POSITIVE_INFINITY
    let offender: ClearancePlacement | undefined
    for (const other of window) {
        const margin = clearanceMargin(candidate, other, overheadClearance, anchor !== undefined && other === anchor)
        if (margin >= minMargin) continue
        minMargin = margin
        offender = other
    }
    return { valid: minMargin >= 0, minMargin, offender }
}

export function appendClearancePlacement(
    window: ClearancePlacement[],
    placement: ClearancePlacement,
) {
    window.push(placement)
    if (window.length > WINDOW_SIZE) window.shift()
}
