import * as THREE from 'three'

const BLEND_HALF_WIDTH = 14
const BOUNDARIES = [90, 190, 300, 412]
const FOG_NEAR = [90, 28, 30, 80, 45]
const FOG_FAR = [300, 240, 260, 650, 420]
const HAZE_THICKNESS = [0.075, 0.22, 0.13, 0.065, 0.085]
const CLOUD_OPACITY = [0.3, 0.58, 0.38, 0.16, 0.1]
const SUN_ELEVATION = [0.24, 0.14, 0.46, 0.7, 0.4]
const SUN_AZIMUTH = [0.58, 1.8, 2.7, 3.75, 4.35]

export interface AltitudeAtmosphere {
    fogNear: number
    fogFar: number
    hazeThickness: number
    cloudOpacity: number
    starStrength: number
    auroraStrength: number
    cosmosStrength: number
    stormStrength: number
}

function smoothstep(min: number, max: number, value: number): number {
    const t = THREE.MathUtils.clamp((value - min) / (max - min), 0, 1)
    return t * t * (3 - 2 * t)
}

function bandValue(y: number, values: readonly number[]): number {
    for (let index = 0; index < BOUNDARIES.length; index += 1) {
        const boundary = BOUNDARIES[index]
        if (y < boundary - BLEND_HALF_WIDTH) return values[index]
        if (y <= boundary + BLEND_HALF_WIDTH) {
            const blend = smoothstep(boundary - BLEND_HALF_WIDTH, boundary + BLEND_HALF_WIDTH, y)
            return THREE.MathUtils.lerp(values[index], values[index + 1], blend)
        }
    }
    return values[values.length - 1]
}

export function sanitizePosition(source: THREE.Vector3, safe: THREE.Vector3): THREE.Vector3 {
    if (Number.isFinite(source.x)) safe.x = source.x
    if (Number.isFinite(source.y)) safe.y = source.y
    if (Number.isFinite(source.z)) safe.z = source.z
    return safe
}

export function evaluateAltitude(y: number, out: AltitudeAtmosphere): AltitudeAtmosphere {
    out.fogNear = bandValue(y, FOG_NEAR)
    out.fogFar = bandValue(y, FOG_FAR)
    out.hazeThickness = bandValue(y, HAZE_THICKNESS)
    out.cloudOpacity = bandValue(y, CLOUD_OPACITY)
    out.starStrength = smoothstep(150, 290, y)
    out.cosmosStrength = smoothstep(286, 314, y) * (1 - smoothstep(398, 426, y))
    out.stormStrength = smoothstep(176, 204, y) * (1 - smoothstep(286, 314, y))
    out.auroraStrength = smoothstep(252, 286, y) * (
        out.stormStrength * 0.2 + out.cosmosStrength + smoothstep(398, 438, y) * 0.72
    )
    return out
}

export function sunDirectionAt(y: number, out: THREE.Vector3): THREE.Vector3 {
    const elevation = bandValue(y, SUN_ELEVATION)
    const azimuth = bandValue(y, SUN_AZIMUTH)
    const horizontal = Math.cos(elevation)
    return out.set(
        Math.cos(azimuth) * horizontal,
        Math.sin(elevation),
        Math.sin(azimuth) * horizontal,
    ).normalize()
}
