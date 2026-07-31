import * as THREE from 'three'

import { BIOMES } from '../palette'
import { buildPlatformShaderChunks } from './platformShaderChunks'

export type MaterialKind = 'rock' | 'accent' | 'ice' | 'grip' | 'cloud' | 'mover' | 'spinner' | 'planet' | 'pillar' | 'checkpoint' | 'checkpointBeam' | 'goal' | 'startisle'

export interface PlatformMaterialSet {
    get(kind: MaterialKind): THREE.Material
    update(dt: number, elapsed: number): void
    dispose(): void
}

interface PlatformUniforms {
    uPmTime: { value: number }
    uPmBase: { value: THREE.Color[] }
    uPmAccent: { value: THREE.Color[] }
    uPmEmissive: { value: THREE.Color[] }
    uPmBoundaries: { value: THREE.Vector4 }
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

function makeUniforms(): PlatformUniforms {
    return {
        uPmTime: { value: 0 },
        uPmBase: { value: BIOMES.map((biome) => biome.palette.platformBase.clone()) },
        uPmAccent: { value: BIOMES.map((biome) => biome.palette.platformAccent.clone()) },
        uPmEmissive: { value: BIOMES.map((biome) => biome.palette.emissive.clone()) },
        uPmBoundaries: {
            value: new THREE.Vector4(
                BIOMES[1].minY,
                BIOMES[2].minY,
                BIOMES[3].minY,
                BIOMES[4].minY,
            ),
        },
    }
}

function inject(source: string, anchor: string, addition: string): string {
    if (!source.includes(anchor)) throw new Error(`Three.js shader anchor missing: ${anchor}`)
    return source.replace(anchor, `${anchor}\n${addition}`)
}

function makeKindMaterial(kind: MaterialKind, uniforms: PlatformUniforms): THREE.MeshStandardMaterial {
    const chunks = buildPlatformShaderChunks(kind)
    const material = new THREE.MeshStandardMaterial(materialParameters(kind))
    material.name = `OnlyUpPlatform-${kind}`
    material.dithering = true
    material.customProgramCacheKey = () => `platform-${kind}`
    material.onBeforeCompile = (shader) => {
        shader.uniforms.uPmTime = uniforms.uPmTime
        shader.uniforms.uPmBase = uniforms.uPmBase
        shader.uniforms.uPmAccent = uniforms.uPmAccent
        shader.uniforms.uPmEmissive = uniforms.uPmEmissive
        shader.uniforms.uPmBoundaries = uniforms.uPmBoundaries

        shader.vertexShader = inject(shader.vertexShader, '#include <common>', chunks.vertexPars)
        shader.vertexShader = inject(shader.vertexShader, '#include <beginnormal_vertex>', chunks.vertexNormal)
        shader.vertexShader = inject(shader.vertexShader, '#include <begin_vertex>', chunks.vertexPosition)
        shader.fragmentShader = inject(shader.fragmentShader, '#include <common>', chunks.fragmentPars)
        shader.fragmentShader = inject(shader.fragmentShader, '#include <color_fragment>', chunks.albedo)
        shader.fragmentShader = inject(shader.fragmentShader, '#include <roughnessmap_fragment>', chunks.roughness)
        shader.fragmentShader = inject(shader.fragmentShader, '#include <normal_fragment_maps>', chunks.normalPerturb)
        shader.fragmentShader = inject(shader.fragmentShader, '#include <emissivemap_fragment>', chunks.emissive)
    }
    return material
}

export function createPlatformMaterials(): PlatformMaterialSet {
    const uniforms = {} as Record<MaterialKind, PlatformUniforms>
    const materials = {} as Record<MaterialKind, THREE.MeshStandardMaterial>
    for (const kind of MATERIAL_KINDS) {
        uniforms[kind] = makeUniforms()
        materials[kind] = makeKindMaterial(kind, uniforms[kind])
    }

    return {
        get(kind) {
            return materials[kind]
        },
        update(_dt, elapsed) {
            for (const kind of MATERIAL_KINDS) uniforms[kind].uPmTime.value = elapsed
        },
        dispose() {
            for (const kind of MATERIAL_KINDS) materials[kind].dispose()
        },
    }
}
