import * as THREE from 'three'

import { createRng, type Prng } from '../prng'
import type {
    CheckpointSpec, DecoAnchor, DynamicSpec, GravityZone, LevelSpec, LevelTuning,
    MoverSpec, StaticPlatform, V3,
} from '../level'
import type { BiomeId } from '../palette'
import type { MaterialKind } from '../visuals/platformMaterials'

interface RoutePoint {
    pos: V3
    shape: 'box' | 'cylinder'
    size: V3
    rot: V3
    verticalHalf: number
    small: boolean
    mover: boolean
}

interface StepOptions {
    material?: MaterialKind
    shape?: 'box' | 'cylinder'
    size?: V3
    rest?: boolean
    mover?: Omit<MoverSpec, 'id' | 'pos' | 'rot' | 'size' | 'material' | 'shape'> & { shape?: 'box' | 'cylinder' }
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
const v3 = (x: number, y: number, z: number): V3 => [x, y, z]
const worldUp = new THREE.Vector3(0, 1, 0)
const tmpQuat = new THREE.Quaternion()
const tmpEuler = new THREE.Euler()
const tmpRadial = new THREE.Vector3()

function radialLedgeRotation(theta: number): V3 {
    tmpRadial.set(Math.cos(theta), 0, Math.sin(theta))
    tmpQuat.setFromUnitVectors(worldUp, tmpRadial)
    tmpEuler.setFromQuaternion(tmpQuat, 'XYZ')
    return [tmpEuler.x, tmpEuler.y, tmpEuler.z]
}

function horizontalSupport(shape: 'box' | 'cylinder', size: V3, rot: V3, dirX: number, dirZ: number) {
    if (shape === 'cylinder') return size[0]
    const sinTilt = Math.sin(rot[0])
    const cosTilt = Math.cos(rot[0])
    const sinYaw = Math.sin(rot[1])
    const cosYaw = Math.cos(rot[1])
    // Matches THREE.Euler's XYZ rotation matrix for rot.z === 0.
    const localXDot = dirX * cosYaw - dirZ * cosTilt * sinYaw
    const localYDot = dirZ * sinTilt
    const localZDot = dirX * sinYaw + dirZ * cosTilt * cosYaw
    return size[0] * Math.abs(localXDot) + size[1] * Math.abs(localYDot) + size[2] * Math.abs(localZDot)
}

function verticalSupport(shape: 'box' | 'cylinder', size: V3, rot: V3) {
    if (shape === 'cylinder') return size[1]
    const sinTilt = Math.sin(rot[0])
    const cosTilt = Math.cos(rot[0])
    const sinYaw = Math.sin(rot[1])
    const cosYaw = Math.cos(rot[1])
    return size[0] * Math.abs(sinTilt * sinYaw)
        + size[1] * Math.abs(cosTilt)
        + size[2] * Math.abs(sinTilt * cosYaw)
}

class RouteBuilder {
    angle: number
    radius = 15.6
    y = 0
    turn: -1 | 1
    point: RoutePoint = {
        pos: [0, -1.5, 0], shape: 'cylinder', size: [13, 1.5, 13], rot: [0, 0, 0],
        verticalHalf: 1.5, small: false, mover: false,
    }
    routeIndex = 0
    biomeIndex = 0
    nextRest: number
    moverId = 0

    constructor(
        readonly rng: Prng,
        readonly tuning: LevelTuning,
        readonly platforms: StaticPlatform[],
        readonly movers: MoverSpec[],
    ) {
        this.angle = rng.range(0, Math.PI * 2)
        this.turn = rng.sign()
        this.nextRest = rng.int(tuning.restEveryMin, tuning.restEveryMax)
    }

    beginBiome() {
        this.biomeIndex = 0
    }

    // A Rapier cylinder collider is round and takes its radius from size[0], so a
    // circular footprint must keep size[2] === size[0]: any extra depth would show
    // up in the mesh as an overhang the player falls straight through.
    private randomSize(biome: BiomeId, rest: boolean, circular: boolean): V3 {
        if (rest) {
            const radius = this.rng.range(this.tuning.restSizeMin, 3.2)
            return [radius, this.rng.range(0.22, 0.38), radius]
        }
        if (biome === 'storm' && this.rng.chance(0.44)) return [0.55, 0.25, circular ? 0.55 : 2.8]
        const altitudeT = clamp(this.y / 300, 0, 1)
        const upper = this.tuning.platformSizeMax
            + (this.tuning.platformSizeMaxAtStorm - this.tuning.platformSizeMax) * altitudeT
        const radius = this.tuning.platformSizeMin
            + (upper - this.tuning.platformSizeMin) * Math.pow(this.rng.next(), 1.25)
        const height = this.rng.range(0.18, 0.38)
        const depth = this.rng.range(Math.max(1.1, radius * 0.72), radius * 1.18)
        return [radius, height, circular ? radius : depth]
    }

    private candidatePosition(shape: 'box' | 'cylinder', size: V3, tilt: number, rise: number, isMover: boolean) {
        const small = Math.min(size[0], size[1], size[2]) < this.tuning.smallPlatformThreshold
        const gapLimit = small || isMover || this.point.small || this.point.mover
            ? this.tuning.tightEdgeGap
            : this.tuning.maxEdgeGap
        const previousRadius = Math.hypot(this.point.pos[0], this.point.pos[2])
        this.radius = clamp(
            this.radius + this.rng.range(-0.65, 0.65),
            this.tuning.walkerRadiusMin,
            this.tuning.walkerRadiusMax,
        )
        let candidateRot: V3 = [tilt, this.angle + Math.PI * 0.5, 0]
        const candidateVerticalHalf = verticalSupport(shape, size, candidateRot)
        const verticalGap = Math.max(0, rise - this.point.verticalHalf - candidateVerticalHalf)
        const maxHorizontalGap = Math.sqrt(Math.max(0, gapLimit * gapLimit - verticalGap * verticalGap))
        const targetHorizontalGap = Math.max(0.08, maxHorizontalGap * 0.52)
        const previousTop = this.point.pos[1] + this.point.verticalHalf
        const candidateBottom = this.y + rise - candidateVerticalHalf
        const needsOverheadClearance = candidateBottom > previousTop
            && candidateBottom - previousTop < this.tuning.overheadClearance
        if (previousRadius <= 0.001) {
            const radialX = Math.cos(this.angle)
            const radialZ = Math.sin(this.angle)
            const candidateSupport = horizontalSupport(shape, size, candidateRot, radialX, radialZ)
            this.radius = clamp(
                Math.max(this.radius, this.point.size[0] + candidateSupport + targetHorizontalGap),
                this.tuning.walkerRadiusMin,
                this.tuning.walkerRadiusMax,
            )
        } else {
            const baseAngle = this.angle
            let angleDelta = 0.35
            for (let iteration = 0; iteration < 10; iteration += 1) {
                const candidateAngle = baseAngle + this.turn * angleDelta
                const candidateX = this.radius * Math.cos(candidateAngle)
                const candidateZ = this.radius * Math.sin(candidateAngle)
                const dx = candidateX - this.point.pos[0]
                const dz = candidateZ - this.point.pos[2]
                const horizontalDistance = Math.hypot(dx, dz)
                const dirX = dx / horizontalDistance
                const dirZ = dz / horizontalDistance
                candidateRot = [tilt, candidateAngle + Math.PI * 0.5, 0]
                const supportA = horizontalSupport(this.point.shape, this.point.size, this.point.rot, dirX, dirZ)
                const supportB = horizontalSupport(shape, size, candidateRot, dirX, dirZ)
                const desiredDistance = supportA + supportB + targetHorizontalGap
                const reachableDistance = clamp(
                    desiredDistance,
                    Math.abs(previousRadius - this.radius) + 0.001,
                    previousRadius + this.radius - 0.001,
                )
                const cosine = clamp(
                    (previousRadius * previousRadius + this.radius * this.radius - reachableDistance * reachableDistance)
                        / (2 * previousRadius * this.radius),
                    -1,
                    1,
                )
                angleDelta = Math.acos(cosine)
            }
            this.angle = baseAngle + this.turn * angleDelta
            candidateRot = [tilt, this.angle + Math.PI * 0.5, 0]
        }
        const pos = v3(this.radius * Math.cos(this.angle), this.y + rise, this.radius * Math.sin(this.angle))

        if (needsOverheadClearance) {
            const dx = pos[0] - this.point.pos[0]
            const dz = pos[2] - this.point.pos[2]
            const distance = Math.hypot(dx, dz)
            const supportA = horizontalSupport(this.point.shape, this.point.size, this.point.rot, dx / distance, dz / distance)
            const supportB = horizontalSupport(shape, size, candidateRot, dx / distance, dz / distance)
            if (distance < supportA + supportB) throw new Error('Generated platform violates overhead clearance')
        }
        return { pos, rot: candidateRot, verticalHalf: candidateVerticalHalf }
    }

    addStep(biome: BiomeId, rise: number, options: StepOptions = {}) {
        const turnChance = biome === 'meadow'
            ? this.tuning.meadowTurnChance
            : biome === 'clouds' ? this.tuning.cloudsTurnChance : this.tuning.stormTurnChance
        if (this.biomeIndex > 3 && this.rng.chance(turnChance)) this.turn = this.turn === 1 ? -1 : 1
        const rest = options.rest ?? this.routeIndex >= this.nextRest
        const shape = options.shape ?? (this.rng.chance(0.3) ? 'cylinder' : 'box')
        const size = options.size ?? (this.routeIndex === 0 ? [1.4, 0.25, 1.4] : this.randomSize(biome, rest, shape === 'cylinder'))
        const tilt = biome === 'meadow' && !rest && shape === 'box'
            ? this.rng.range(-20, 20) * Math.PI / 180
            : 0
        const candidate = this.candidatePosition(shape, size, tilt, rise, Boolean(options.mover))
        const { pos, rot } = candidate
        const material = options.material ?? (this.routeIndex % 4 === 0 ? 'accent' : 'rock')

        if (options.mover) {
            this.movers.push({
                id: this.moverId++, kind: options.mover.kind, shape: options.mover.shape ?? shape,
                pos, rot, size, material, params: options.mover.params, steps: options.mover.steps,
            })
        } else {
            const platform: StaticPlatform = { shape, pos, rot, size, material }
            if (material === 'ice') platform.friction = 0
            if (material === 'cloud') platform.restitution = 0.55
            if (material === 'grip') platform.friction = -0.4
            this.platforms.push(platform)
        }

        this.y = pos[1]
        this.point = {
            pos, shape, size, rot, verticalHalf: candidate.verticalHalf,
            small: Math.min(...size) < this.tuning.smallPlatformThreshold,
            mover: Boolean(options.mover),
        }
        this.routeIndex += 1
        this.biomeIndex += 1
        if (rest) this.nextRest = this.routeIndex + this.rng.int(this.tuning.restEveryMin, this.tuning.restEveryMax)
    }

    reachBoundary(biome: BiomeId, targetY: number, choose: (index: number) => StepOptions) {
        while (targetY - this.y > this.tuning.riseMax) {
            const remaining = targetY - this.y
            const maxRise = Math.min(this.tuning.riseMax, remaining - this.tuning.riseMin)
            const preferredMin = Math.min(maxRise, Math.max(this.tuning.riseMin, this.tuning.riseMax - 0.15))
            this.addStep(biome, this.rng.range(preferredMin, maxRise), choose(this.biomeIndex))
        }
        this.addStep(biome, targetY - this.y, { ...choose(this.biomeIndex), rest: true, size: [3.1, 0.35, 3.1] })
    }
}

function addCheckpoint(spec: Pick<LevelSpec, 'checkpoints' | 'decoAnchors'>, pos: V3, biome: BiomeId) {
    const checkpoint: CheckpointSpec = { index: spec.checkpoints.length, pos: [...pos], biome }
    spec.checkpoints.push(checkpoint)
    spec.decoAnchors.push({ pos: [...pos], biome, kind: 'checkpoint', scale: 1 })
}

function addMeadowExtras(builder: RouteBuilder, dynamics: DynamicSpec[]) {
    const anchor = builder.point.pos
    const bridgeCenter: V3 = [anchor[0] + 7, anchor[1] + 0.6, anchor[2]]
    builder.platforms.push(
        { shape: 'box', pos: [bridgeCenter[0] - 4.4, anchor[1], anchor[2]], rot: [0, 0, 0], size: [1.2, 0.3, 1.5], material: 'rock' },
        { shape: 'box', pos: [bridgeCenter[0] + 4.4, anchor[1], anchor[2]], rot: [0, 0, 0], size: [1.2, 0.3, 1.5], material: 'rock' },
    )
    dynamics.push({ kind: 'seesaw', pos: bridgeCenter, size: [3.6, 0.18, 1.1], density: 200, material: 'accent' })
    for (let index = 0; index < 5; index += 1) {
        dynamics.push({
            kind: 'box', pos: [anchor[0] + 4.5 + (index % 2) * 1.1, anchor[1] + 0.6 + index * 0.82, anchor[2] - 2],
            size: [0.5, 0.5, 0.5], density: 40, material: 'accent',
        })
    }
}

function addWindmill(builder: RouteBuilder, speed: number, offset: number) {
    const pos = builder.point.pos
    builder.movers.push({
        id: builder.moverId++, kind: 'windmill', shape: 'cylinder',
        pos: [pos[0] + offset, pos[1] + 1.4, pos[2]], rot: [Math.PI / 2, 0, 0], size: [0.28, 4.6, 0.28],
        material: 'spinner', params: { axis: [0, 0, 1], speed },
    })
}

function addStormDynamics(builder: RouteBuilder, dynamics: DynamicSpec[]) {
    const anchor = builder.point.pos
    for (let index = 0; index < 4; index += 1) {
        const side = index % 2 === 0 ? -1 : 1
        dynamics.push({
            kind: 'box', pos: [anchor[0] + side * (2.5 + index * 0.35), anchor[1] + 1.1, anchor[2] + index * 1.25],
            size: [0.7, 1, 0.7], density: 40, material: 'grip',
        })
    }
}

function addOrbitAnchors(rng: Prng, anchors: DecoAnchor[], biome: BiomeId, minY: number, maxY: number, count: number) {
    for (let index = 0; index < count; index += 1) {
        const angle = rng.range(0, Math.PI * 2)
        const radius = rng.range(18, 25)
        anchors.push({ pos: [Math.cos(angle) * radius, rng.range(minY, maxY), Math.sin(angle) * radius], biome, kind: 'orbit', scale: rng.range(0.6, 1.5) })
    }
}

function addCosmos(spec: LevelSpec, builder: RouteBuilder, rng: Prng, tuning: LevelTuning) {
    const planetRadii = Array.from({ length: 4 }, () => rng.range(3.5, 5))
    const planetZones: GravityZone[] = []
    let angle = builder.angle
    for (let index = 0; index < 4; index += 1) {
        angle += builder.turn * 0.38
        const radiusFromAxis = 12.5
        const pos: V3 = [radiusFromAxis * Math.cos(angle), 304 + index * 8, radiusFromAxis * Math.sin(angle)]
        const radius = planetRadii[index]
        spec.platforms.push({ shape: 'sphere', pos, rot: [0, 0, 0], size: [radius, radius, radius], material: 'planet' })
        planetZones.push({ type: 'sphere', center: [...pos], radius: radius + 9 })
        spec.decoAnchors.push({ pos: [...pos], biome: 'cosmos', kind: 'planet', scale: radius })
        builder.point = {
            pos, shape: 'cylinder', size: [radius, radius, radius], rot: [0, 0, 0],
            verticalHalf: radius, small: false, mover: false,
        }
        builder.y = pos[1]
    }

    const entryX = builder.point.pos[0]
    const entryZ = builder.point.pos[2]
    spec.platforms.push(
        { shape: 'box', pos: [entryX, 333, entryZ], rot: [0, 0, 0], size: [3.4, 0.35, 2.2], material: 'accent' },
        { shape: 'box', pos: [entryX + 4, 342, entryZ], rot: [0, 0, 0], size: [4.5, 0.4, 1.6], material: 'accent' },
    )
    // The inverted passage must win its overlap with the last planet. Reversed
    // planet order makes unavoidable sphere overlaps pull toward the next ascent.
    spec.gravityZones.push(
        { type: 'box', min: [entryX - 6, 331, entryZ - 6], max: [entryX + 10, 344, entryZ + 6], dir: [0, 1, 0] },
        ...planetZones.reverse(),
    )

    const pillarX = entryX + 22
    const pillarZ = entryZ
    const catchPos: V3 = [entryX + 13.2, 338, entryZ]
    spec.platforms.push({ shape: 'cylinder', pos: catchPos, rot: [0, 0, 0], size: [3.3, 0.35, 3.3], material: 'accent' })
    for (let index = 0; index < 6; index += 1) {
        const t = (index + 1) / 7
        spec.platforms.push({
            shape: 'box', pos: [catchPos[0] + (pillarX - 5.2 - catchPos[0]) * t, 338 + 10 * t, pillarZ],
            rot: [0, 0, 0], size: [1.7, 0.24, 1.35], material: index % 2 ? 'rock' : 'pillar',
        })
    }

    spec.platforms.push({ shape: 'cylinder', pos: [pillarX, 380, pillarZ], rot: [0, 0, 0], size: [4.5, 32, 4.5], material: 'pillar' })
    spec.gravityZones.push({ type: 'pillar', center: [pillarX, 0, pillarZ], radius: 18, yMin: 346, yMax: 412, rimBand: 9 })
    for (let index = 0; index < tuning.pillarLedgeCount; index += 1) {
        const t = index / (tuning.pillarLedgeCount - 1)
        const theta = Math.PI + t * Math.PI * 4.4
        const radialDistance = 5.45
        spec.platforms.push({
            shape: 'box',
            pos: [pillarX + Math.cos(theta) * radialDistance, tuning.pillarLedgeMinY + (tuning.pillarLedgeMaxY - tuning.pillarLedgeMinY) * t, pillarZ + Math.sin(theta) * radialDistance],
            rot: radialLedgeRotation(theta), size: [1.75, 0.22, 1.15],
            material: index % 3 === 0 ? 'accent' : 'pillar',
        })
    }

    const discCenter: V3 = [pillarX, 412.8, pillarZ]
    const goalPos: V3 = [pillarX, 413.6, pillarZ]
    spec.platforms.push({ shape: 'cylinder', pos: discCenter, rot: [0, 0, 0], size: [6, 0.8, 6], material: 'goal' })
    spec.goal.pos = goalPos
    addCheckpoint(spec, goalPos, 'summit')
    spec.decoAnchors.push({ pos: [...goalPos], biome: 'summit', kind: 'summit', scale: 1 })
}

export function generateLevelImpl(seed: number, tuning: LevelTuning): LevelSpec {
    const rng = createRng(seed)
    const spec: LevelSpec = {
        seed, summitY: 413.6, start: [0, 1, 0], platforms: [], movers: [], dynamics: [],
        gravityZones: [], checkpoints: [], goal: { pos: [0, 413.6, 0] }, decoAnchors: [],
    }
    spec.platforms.push({ shape: 'cylinder', pos: [0, -1.5, 0], rot: [0, 0, 0], size: [13, 1.5, 13], material: 'startisle' })
    for (let index = 0; index < 5; index += 1) {
        const angle = index * Math.PI * 0.4 + 0.3
        spec.platforms.push({ shape: 'box', pos: [Math.cos(angle) * 7, 0.12, Math.sin(angle) * 7], rot: [0, angle, 0], size: [1.5, 0.12, 0.7], material: index % 2 ? 'accent' : 'rock' })
    }
    addCheckpoint(spec, [0, 0, 0], 'meadow')

    const builder = new RouteBuilder(rng, tuning, spec.platforms, spec.movers)
    builder.beginBiome()
    builder.reachBoundary('meadow', 88, (index) => {
        if (index === 17 || index === 42) return { mover: { kind: 'lift', params: { travel: [0, 3.5, 0], period: index === 17 ? 6.4 : 7.6, phase: index * 0.17 } }, material: 'mover', size: [2.5, 0.3, 2.5] }
        return {}
    })
    addMeadowExtras(builder, spec.dynamics)
    addCheckpoint(spec, builder.point.pos, 'meadow')

    builder.beginBiome()
    builder.reachBoundary('clouds', 188, (index) => {
        if (index === 14 || index === 34 || index === 53) return { mover: { kind: 'patrol', params: { travel: [index === 34 ? -5 : 5, 0, index === 34 ? 2 : -1], period: 5.4 + index * 0.02, phase: index * 0.11 } }, material: 'mover', size: [2.3, 0.3, 2.3] }
        if (index === 45) return { mover: { kind: 'spindisc', shape: 'cylinder', params: { speed: 0.35 } }, shape: 'cylinder', material: 'spinner', size: [4.5, 0.3, 4.5], rest: true }
        const roll = rng.next()
        return { material: roll < 0.3 ? 'ice' : roll < 0.5 ? 'cloud' : undefined }
    })
    addWindmill(builder, 0.58, -4)
    addWindmill(builder, 0.74, 4)
    addCheckpoint(spec, builder.point.pos, 'clouds')

    builder.beginBiome()
    builder.reachBoundary('storm', 298, (index) => {
        if (index === 27) {
            const steps = Array.from({ length: 6 }, (_, step) => ({
                pos: [Math.cos(step * Math.PI / 3) * 3.2, 0.5 + step * 0.32, Math.sin(step * Math.PI / 3) * 3.2] as V3,
                size: [1.2, 0.2, 0.8] as V3,
            }))
            return { mover: { kind: 'spindisc', shape: 'cylinder', params: { speed: 0.3 }, steps }, shape: 'cylinder', material: 'spinner', size: [5, 0.3, 5], rest: true }
        }
        return { material: index % 5 === 2 ? 'grip' : index % 4 === 0 ? 'accent' : 'rock' }
    })
    addWindmill(builder, 0.96, -4)
    addWindmill(builder, 1.14, 4)
    addStormDynamics(builder, spec.dynamics)
    addCheckpoint(spec, builder.point.pos, 'storm')

    addCosmos(spec, builder, rng, tuning)
    addOrbitAnchors(rng, spec.decoAnchors, 'meadow', 8, 86, tuning.orbitAnchorsPerBiome)
    addOrbitAnchors(rng, spec.decoAnchors, 'clouds', 94, 186, tuning.orbitAnchorsPerBiome)
    addOrbitAnchors(rng, spec.decoAnchors, 'storm', 194, 296, tuning.orbitAnchorsPerBiome)
    addOrbitAnchors(rng, spec.decoAnchors, 'cosmos', 304, 408, tuning.orbitAnchorsPerBiome)
    for (const platform of spec.platforms) {
        if (!rng.chance(tuning.ledgeAnchorChance)) continue
        const biome: BiomeId = platform.pos[1] < 90 ? 'meadow' : platform.pos[1] < 190 ? 'clouds' : platform.pos[1] < 300 ? 'storm' : platform.pos[1] < 412 ? 'cosmos' : 'summit'
        spec.decoAnchors.push({ pos: [...platform.pos], biome, kind: 'ledge', scale: rng.range(0.5, 1.2) })
    }
    return spec
}
