import type { BiomeId } from './palette'
import type { MaterialKind } from './visuals/platformMaterials'
import { generateLevelImpl } from './level/generator'

export type V3 = [number, number, number]

export interface StaticPlatform {
    shape: 'box' | 'cylinder' | 'sphere'
    pos: V3
    rot: V3
    /** Half extents. Cylinder colliders are round, so size[2] must equal size[0]. */
    size: V3
    material: MaterialKind
    friction?: number
    restitution?: number
}

export interface MoverSpec {
    id: number
    kind: 'lift' | 'patrol' | 'spindisc' | 'windmill'
    shape: 'box' | 'cylinder'
    pos: V3
    rot: V3
    /** Half extents. Cylinder colliders are round, so size[2] must equal size[0]. */
    size: V3
    material: MaterialKind
    params: { axis?: V3; travel?: V3; period?: number; speed?: number; phase?: number }
    steps?: Array<{ pos: V3; size: V3 }>
}

export type GravityZone =
    | { type: 'sphere'; center: V3; radius: number }
    | { type: 'pillar'; center: V3; radius: number; yMin: number; yMax: number; rimBand: number }
    | { type: 'box'; min: V3; max: V3; dir: V3 }

export interface CheckpointSpec { index: number; pos: V3; biome: BiomeId }
export interface DecoAnchor { pos: V3; biome: BiomeId; kind: 'ledge' | 'orbit' | 'checkpoint' | 'summit' | 'planet'; scale: number }

export interface LevelSpec {
    seed: number
    summitY: number
    start: V3
    platforms: StaticPlatform[]
    movers: MoverSpec[]
    gravityZones: GravityZone[]
    checkpoints: CheckpointSpec[]
    goal: { pos: V3 }
    decoAnchors: DecoAnchor[]
}

export interface LevelTuning {
    maxRunVel: number
    jumpVel: number
    fallingGravityScale: number
    flatJumpReach: number
    jumpHeight: number
    riseMin: number
    riseMax: number
    maxEdgeGap: number
    tightEdgeGap: number
    smallPlatformThreshold: number
    platformSizeMin: number
    platformSizeMax: number
    platformSizeMaxAtStorm: number
    restEveryMin: number
    restEveryMax: number
    restSizeMin: number
    overheadClearance: number
    walkerRadiusMin: number
    walkerRadiusMax: number
    meadowTurnChance: number
    cloudsTurnChance: number
    stormTurnChance: number
    ledgeAnchorChance: number
    orbitAnchorsPerBiome: number
    checkpointAltitudes: readonly [number, number, number, number]
    pillarLedgeCount: number
    pillarLedgeMinY: number
    pillarLedgeMaxY: number
}

export const TUNING: LevelTuning = {
    maxRunVel: 5.5,
    jumpVel: 6.5,
    fallingGravityScale: 3,
    flatJumpReach: 5.5,
    jumpHeight: 2.1,
    riseMin: 0.8,
    riseMax: 1.6,
    maxEdgeGap: 3,
    tightEdgeGap: 2.2,
    smallPlatformThreshold: 1.4,
    platformSizeMin: 1.1,
    platformSizeMax: 3.2,
    platformSizeMaxAtStorm: 2.15,
    restEveryMin: 8,
    restEveryMax: 10,
    restSizeMin: 2.6,
    overheadClearance: 3,
    walkerRadiusMin: 9,
    walkerRadiusMax: 16,
    meadowTurnChance: 0.06,
    cloudsTurnChance: 0.09,
    stormTurnChance: 0.18,
    ledgeAnchorChance: 0.3,
    orbitAnchorsPerBiome: 8,
    checkpointAltitudes: [0, 88, 188, 298],
    pillarLedgeCount: 42,
    pillarLedgeMinY: 348,
    pillarLedgeMaxY: 410,
}

export function generateLevel(seed: number): LevelSpec {
    return generateLevelImpl(seed >>> 0, TUNING)
}
