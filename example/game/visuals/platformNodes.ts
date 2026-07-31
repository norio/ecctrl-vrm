import type { Node } from 'three/webgpu'
import type { MeshStandardNodeMaterial } from 'three/webgpu'
import {
    abs,
    add,
    cameraPosition,
    cameraViewMatrix,
    clamp,
    dot,
    floor,
    fract,
    hash,
    int,
    length,
    materialColor,
    materialEmissive,
    materialRoughness,
    max,
    mix,
    mod,
    mul,
    mx_fractal_noise_float,
    normalLocal,
    normalViewGeometry,
    normalWorld,
    normalize,
    positionGeometry,
    positionLocal,
    positionWorld,
    pow,
    sin,
    smoothstep,
    step,
    sub,
    uniform,
    uniformArray,
    vec2,
    vec3,
    vec4,
} from 'three/tsl'

import { BIOMES } from '../palette'
import type { MaterialKind } from './platformMaterials'

export function createPlatformNodeUniforms() {
    return {
        time: uniform(0),
        base: uniformArray(BIOMES.map((biome) => biome.palette.platformBase.clone()), 'color'),
        accent: uniformArray(BIOMES.map((biome) => biome.palette.platformAccent.clone()), 'color'),
        emissive: uniformArray(BIOMES.map((biome) => biome.palette.emissive.clone()), 'color'),
    }
}

type PlatformNodeUniforms = ReturnType<typeof createPlatformNodeUniforms>

function noise01(point: Node) {
    return clamp(add(mul(mx_fractal_noise_float(point, 3, 2.03, 0.5), 0.5), 0.5), 0, 1)
}

function combinedNoise(world: Node) {
    return add(noise01(mul(world, 0.38)), mul(noise01(mul(world, 2.4)), 0.35))
}

function cellHash(cell: Node) {
    return hash(add(dot(vec3(cell), vec3(127.1, 311.7, 74.7)), 104729))
}

function altitudeBlend(index: number, y: Node) {
    const boundary = BIOMES[index + 1].minY
    return smoothstep(boundary - 14, boundary + 14, y)
}

function paletteSample(colors: PlatformNodeUniforms['base'], y: Node) {
    const b0 = altitudeBlend(0, y)
    const b1 = altitudeBlend(1, y)
    const b2 = altitudeBlend(2, y)
    const b3 = altitudeBlend(3, y)
    return mix(
        mix(mix(mix(colors.element(int(0)), colors.element(int(1)), b0), colors.element(int(2)), b1), colors.element(int(3)), b2),
        colors.element(int(4)),
        b3,
    )
}

function altitudeDepth(y: Node) {
    return mul(add(add(altitudeBlend(0, y), altitudeBlend(1, y)), add(altitudeBlend(2, y), altitudeBlend(3, y))), 0.25)
}

function rockColor(base: Node, noise: Node, worldY: Node, worldNormalY: Node) {
    const strata = add(0.5, mul(0.5, sin(add(mul(worldY, 4.6), mul(noise, 7)))))
    const stratified = mul(base, mix(0.76, 1.14, smoothstep(0.2, 0.82, strata)))
    const top = smoothstep(0.7, 0.9, worldNormalY)
    const meadow = sub(1, altitudeBlend(0, worldY))
    const dust = mix(vec3(1.16, 1.1, 0.94), vec3(0.72, 1.08, 0.67), meadow)
    return mul(stratified, mix(vec3(1), dust, mul(top, 0.34)))
}

function moverEdge(local: Node) {
    const p = vec3(local)
    return max(
        max(smoothstep(0.72, 0.98, abs(p.x)), smoothstep(0.72, 0.98, abs(p.z))),
        smoothstep(0.78, 1, abs(p.y)),
    )
}

function kindColor(
    kind: MaterialKind,
    uniforms: PlatformNodeUniforms,
    base: Node,
    accent: Node,
    glow: Node,
    depth: Node,
    noise: Node,
) {
    const world = vec3(positionWorld)
    const local = vec3(positionGeometry)
    const initial = mix(base, accent, kind === 'accent' ? 0.68 : kind === 'checkpoint' || kind === 'checkpointBeam' || kind === 'goal' ? 0.76 : 0.24)

    switch (kind) {
        case 'rock':
        case 'accent':
        case 'startisle':
            return rockColor(initial, noise, world.y, normalWorld.y)
        case 'ice':
            return add(
                mix(vec3(0.12, 0.42, 0.58), mul(accent, vec3(0.72, 0.95, 1.16)), add(0.58, mul(depth, 0.22))),
                mul(vec3(0.12, 0.2, 0.24), smoothstep(0.62, 0.94, noise)),
            )
        case 'grip':
            return mul(mix(vec3(0.025, 0.018, 0.02), mul(base, 0.22), 0.28), mix(0.72, 1.15, noise))
        case 'cloud':
            return mul(mix(accent, vec3(1, 0.93, 0.88), 0.72), mix(0.9, 1.12, noise))
        case 'mover':
        case 'spinner': {
            const brush = add(0.5, mul(0.5, sin(add(add(mul(world.x, 19), mul(world.z, 3)), mul(noise, 5)))))
            return mix(mul(base, 0.58), mul(accent, 1.08), add(0.35, mul(brush, 0.22)))
        }
        case 'planet': {
            const latitudeNoise = noise01(mul(local, 2.4))
            const latitude = add(0.5, mul(0.5, sin(add(mul(local.y, 8), mul(latitudeNoise, 4)))))
            const cosmosBase = mul(uniforms.base.element(int(3)), vec3(0.52, 0.62, 1.18))
            const cosmosAccent = mul(uniforms.accent.element(int(3)), vec3(1.12, 0.72, 1.16))
            const grid = mul(local, 5)
            const crater = mul(
                sub(1, smoothstep(0.13, 0.32, length(sub(fract(grid), 0.5)))),
                step(0.72, cellHash(add(floor(grid), 43))),
            )
            return mul(mix(cosmosBase, cosmosAccent, smoothstep(0.2, 0.82, latitude)), mix(1, 0.48, crater))
        }
        case 'pillar': {
            const starMetal = pow(noise01(mul(world, vec3(0.16, 0.055, 0.16))), 2)
            return mix(vec3(0.015, 0.018, 0.055), mul(accent, 0.76), starMetal)
        }
        case 'checkpoint':
        case 'checkpointBeam':
            return mul(mix(accent, glow, 0.7), add(0.82, mul(noise, 0.26)))
        case 'goal':
            return mul(mix(accent, glow, 0.86), add(0.95, mul(noise, 0.22)))
    }
}

function roughnessNode(kind: MaterialKind, noise: Node) {
    if (kind === 'ice') return clamp(add(0.035, mul(noise, 0.045)), 0.035, 0.09)
    if (kind === 'grip') return clamp(add(0.82, mul(noise, 0.16)), 0, 1)
    if (kind === 'cloud') return clamp(add(0.62, mul(noise, 0.22)), 0, 1)
    if (kind === 'mover' || kind === 'spinner') return clamp(add(0.24, mul(noise, 0.24)), 0, 1)
    if (kind === 'checkpoint' || kind === 'checkpointBeam' || kind === 'goal') return add(0.16, mul(noise, 0.08))
    return clamp(add(materialRoughness, mul(sub(noise, 0.5), 0.5)), 0.08, 1)
}

function rimIntensity(kind: MaterialKind) {
    if (kind === 'rock') return 0.15
    if (kind === 'startisle') return 0.2
    if (kind === 'accent') return 0.28
    if (kind === 'checkpoint' || kind === 'checkpointBeam') return 2.2
    if (kind === 'goal') return 0.28
    if (kind === 'planet') return 1.65
    if (kind === 'pillar') return 1.9
    return 0.62
}

function heartbeat(time: Node) {
    const phase = mod(time, 2)
    const first = sub(1, smoothstep(0, 0.075, abs(sub(phase, 0.18))))
    const second = mul(0.68, sub(1, smoothstep(0, 0.11, abs(sub(phase, 0.43)))))
    return add(first, second)
}

function extraEmissive(
    kind: MaterialKind,
    uniforms: PlatformNodeUniforms,
    glow: Node,
    depth: Node,
    noise: Node,
    pillarApex: boolean,
) {
    const { time } = uniforms
    const world = vec3(positionWorld)
    const local = vec3(positionGeometry)
    const viewDirection = normalize(sub(cameraPosition, world))
    const rim = pow(clamp(sub(1, dot(normalize(normalWorld), viewDirection)), 0, 1), 2.35)
    const rimGlow = mul(glow, mul(rim, rimIntensity(kind)))

    switch (kind) {
        case 'ice': {
            const sparkle = mul(
                mul(step(0.965, cellHash(floor(mul(world, 7)))), pow(rim, 1.6)),
                add(0.5, mul(0.5, sin(add(mul(time, 8), mul(noise, 31))))),
            )
            return add(rimGlow, mul(vec3(0.62, 0.94, 1), mul(sparkle, 1.8)))
        }
        case 'grip': {
            const grid = mul(world.xz, 2.25)
            const gridCell = floor(grid)
            const seed = cellHash(vec3(vec2(gridCell), 0))
            const radiusScale = mix(0.7, 1.3, cellHash(vec3(vec2(gridCell), 17)))
            const brightness = mix(0.805, 1.61, cellHash(vec3(vec2(gridCell), 31)))
            const radius = length(sub(abs(sub(fract(grid), 0.5)), 0))
            const dotMask = mul(
                sub(1, smoothstep(mul(0.07, radiusScale), mul(0.14, radiusScale), radius)),
                step(0.2, seed),
            )
            return add(rimGlow, mul(vec3(1, 0.3, 0.07), mul(dotMask, brightness)))
        }
        case 'cloud': {
            const under = smoothstep(0.05, 0.9, mul(normalWorld.y, -1))
            const softRim = mul(mix(vec3(1), glow, 0.35), mul(rim, 0.9))
            const underglow = mul(vec3(1, 0.31, 0.11), mul(under, add(0.18, mul(noise, 0.3))))
            return add(add(rimGlow, softRim), underglow)
        }
        case 'mover':
        case 'spinner': {
            const phase = mul(cellHash(floor(world)), Math.PI * 2)
            const pulse = add(0.45, mul(0.55, sin(add(add(mul(time, 1.8), mul(world.y, 0.08)), phase))))
            return add(rimGlow, mul(glow, mul(moverEdge(local), add(0.27, mul(pulse, 0.45)))))
        }
        case 'planet': {
            const pole = smoothstep(0.58, 0.96, abs(local.y))
            return add(rimGlow, mul(uniforms.emissive.element(int(3)), mul(pole, add(0.55, mul(noise, 0.8)))))
        }
        case 'pillar': {
            const flowingNoise = noise01(add(mul(world, 0.32), vec3(0, mul(time, -0.22), 0)))
            const veinWave = abs(sin(add(mul(add(world.x, world.z), 1.9), mul(flowingNoise, 9))))
            const vein = smoothstep(0.935, 0.995, veinWave)
            const veinGlow = mix(uniforms.emissive.element(int(3)), uniforms.emissive.element(int(4)), depth)
            const veinRadiance = mul(veinGlow, mul(vein, 1.6))
            if (!pillarApex) return add(rimGlow, veinRadiance)
            const apexFade = sub(1, smoothstep(0.7, 1, local.y))
            return add(rimGlow, mul(veinRadiance, apexFade))
        }
        case 'checkpoint':
        case 'checkpointBeam':
            return add(rimGlow, mul(glow, add(1.1, heartbeat(time))))
        case 'goal':
            return add(rimGlow, mul(glow, add(0.49, mul(heartbeat(time), 0.42))))
        default:
            return rimGlow
    }
}

function positionNode(kind: MaterialKind, time: Node, pillarApex: boolean) {
    const geometry = vec3(positionGeometry)
    if (kind === 'cloud') {
        const wave = mul(sin(add(add(mul(time, 0.72), mul(geometry.x, 2.1)), mul(geometry.z, 1.7))), 0.018)
        return add(positionLocal, mul(normalLocal, wave))
    }
    if (kind === 'pillar') {
        const apex = smoothstep(0.55, 1, geometry.y)
        const wobble = mul(mul(sin(add(mul(time, 0.55), mul(geometry.y, 5))), apex), 0.018)
        const displaced = add(positionLocal, mul(normalLocal, wobble))
        if (!pillarApex) return displaced
        const taper = mix(1, 0.3, apex)
        return vec3(
            mul(displaced.x, taper),
            displaced.y,
            mul(displaced.z, taper),
        )
    }
    return null
}

function normalNode() {
    const world = vec3(positionWorld)
    const height = noise01(mul(world, 2.4))
    const heightX = noise01(add(mul(world, 2.4), vec3(0.05, 0, 0)))
    const heightZ = noise01(add(mul(world, 2.4), vec3(0, 0, 0.05)))
    const perturbWorld = normalize(vec3(mul(sub(height, heightX), 8), 1, mul(sub(height, heightZ), 8)))
    const perturbView = vec3(mul(cameraViewMatrix, vec4(perturbWorld, 0)))
    return normalize(add(normalViewGeometry, mul(perturbView, 0.06)))
}

export function applyPlatformNodes(
    material: MeshStandardNodeMaterial,
    kind: MaterialKind,
    uniforms: PlatformNodeUniforms,
    { pillarApex = false }: { pillarApex?: boolean } = {},
) {
    const worldY = positionWorld.y
    const base = paletteSample(uniforms.base, worldY)
    const accent = paletteSample(uniforms.accent, worldY)
    const glow = paletteSample(uniforms.emissive, worldY)
    const depth = altitudeDepth(worldY)
    const noise = combinedNoise(positionWorld)
    const proceduralColor = kindColor(kind, uniforms, base, accent, glow, depth, noise)
    const topDust = mul(smoothstep(0.55, 0.95, normalWorld.y), mul(noise, 0.15))
    const sideFill = mul(sub(1, abs(normalWorld.y)), 0.16)

    const displacedPosition = positionNode(kind, uniforms.time, pillarApex)
    if (displacedPosition) material.positionNode = displacedPosition
    material.colorNode = add(
        add(mul(mix(materialColor, proceduralColor, 0.88), mix(0.82, 1.16, noise)), vec3(topDust)),
        mul(mix(base, accent, 0.55), sideFill),
    )
    material.roughnessNode = roughnessNode(kind, noise)
    material.normalNode = normalNode()
    material.emissiveNode = add(materialEmissive, extraEmissive(kind, uniforms, glow, depth, noise, pillarApex))
}
