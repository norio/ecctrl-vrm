import * as THREE from 'three'
import { MeshStandardNodeMaterial } from 'three/webgpu'

import { BIOMES } from '../palette'
import { applyPlatformNodes, createPlatformNodeUniforms } from './platformNodes'

export type MaterialKind = 'rock' | 'accent' | 'ice' | 'grip' | 'cloud' | 'mover' | 'spinner' | 'planet' | 'pillar' | 'checkpoint' | 'checkpointBeam' | 'goal' | 'startisle'

export interface PlatformMaterialSet {
    get(kind: MaterialKind, variant?: 'apex'): THREE.Material
    update(dt: number, elapsed: number): void
    dispose(): void
}

const MATERIAL_KINDS: MaterialKind[] = [
    'rock',
    'accent',
    'ice',
    'grip',
    'cloud',
    'mover',
    'spinner',
    'planet',
    'pillar',
    'checkpoint',
    'checkpointBeam',
    'goal',
    'startisle',
]

function materialParameters(kind: MaterialKind): THREE.MeshStandardMaterialParameters {
    switch (kind) {
        case 'rock':
            return { color: '#c7c1b4', roughness: 0.82, metalness: 0.02 }
        case 'accent':
            return { color: '#e2d5bd', roughness: 0.68, metalness: 0.04 }
        case 'ice':
            return { color: '#82d9ee', roughness: 0.06, metalness: 0.1, transparent: true, opacity: 0.92 }
        case 'grip':
            return { color: '#261d20', roughness: 0.94, metalness: 0.02 }
        case 'cloud':
            return { color: '#f1e9ed', roughness: 0.72, metalness: 0 }
        case 'mover':
            return { color: '#9ca9bd', roughness: 0.36, metalness: 0.62 }
        case 'spinner':
            return { color: '#938cba', roughness: 0.3, metalness: 0.72 }
        case 'planet':
            return { color: '#765f9f', roughness: 0.7, metalness: 0.02 }
        case 'pillar':
            return { color: '#292a4c', roughness: 0.48, metalness: 0.52 }
        case 'checkpoint':
            return {
                color: BIOMES[2].palette.emissive,
                emissive: BIOMES[2].palette.emissive,
                emissiveIntensity: 1.5,
                roughness: 0.18,
                metalness: 0.16,
            }
        case 'checkpointBeam':
            return {
                color: BIOMES[2].palette.emissive,
                emissive: BIOMES[2].palette.emissive,
                emissiveIntensity: 1.5,
                roughness: 0.18,
                metalness: 0.16,
                transparent: true,
                opacity: 0.3,
                depthWrite: false,
            }
        case 'goal':
            return {
                color: BIOMES[4].palette.emissive,
                emissive: BIOMES[4].palette.emissive,
                emissiveIntensity: 0.56,
                roughness: 0.14,
                metalness: 0.2,
            }
        case 'startisle':
            return { color: '#b8b39b', roughness: 0.9, metalness: 0 }
    }
}

function makeKindMaterial(
    kind: MaterialKind,
    uniforms: ReturnType<typeof createPlatformNodeUniforms>,
    pillarApex = false,
): MeshStandardNodeMaterial {
    const material = new MeshStandardNodeMaterial(materialParameters(kind))
    material.name = `OnlyUpPlatform-${kind}${pillarApex ? '-apex' : ''}`
    material.dithering = true
    applyPlatformNodes(material, kind, uniforms, { pillarApex })
    return material
}

export function createPlatformMaterials(): PlatformMaterialSet {
    const uniforms = createPlatformNodeUniforms()
    const materials = {} as Record<MaterialKind, MeshStandardNodeMaterial>
    for (const kind of MATERIAL_KINDS) {
        materials[kind] = makeKindMaterial(kind, uniforms)
    }
    const pillarApexMaterial = makeKindMaterial('pillar', uniforms, true)

    return {
        get(kind, variant) {
            if (kind === 'pillar' && variant === 'apex') return pillarApexMaterial
            return materials[kind]
        },
        update(_dt, elapsed) {
            uniforms.time.value = elapsed
        },
        dispose() {
            for (const kind of MATERIAL_KINDS) materials[kind].dispose()
            pillarApexMaterial.dispose()
        },
    }
}
