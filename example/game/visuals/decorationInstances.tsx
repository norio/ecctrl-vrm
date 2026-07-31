import * as THREE from 'three'
import { useEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'

import type { DecoAnchor, LevelSpec } from '../level'
import { BIOMES, type BiomeId } from '../palette'
import { createRng, type Prng } from '../prng'

interface InstanceRecord {
    matrix: THREE.Matrix4
    phase: number
    color: THREE.Color
    special: number
}

interface DecorationData {
    crystals: InstanceRecord[]
    shards: InstanceRecord[]
    lanterns: InstanceRecord[]
    rings: InstanceRecord[]
    shardVertexScales: number[]
}

export interface InstancedSystem {
    mesh: THREE.InstancedMesh
    material: THREE.ShaderMaterial
    geometry: THREE.BufferGeometry
}

const vertexShader = /* glsl */ `
uniform float uTime;
uniform float uStyle;
attribute float aPhase;
attribute vec3 aColor;
attribute float aSpecial;
varying vec3 vColor;
varying vec3 vViewNormal;
varying vec3 vPatternPos;
varying float vPulse;
varying float vSpecial;
varying float vViewDepth;

mat2 rotate2d(float angle) {
    float c = cos(angle);
    float s = sin(angle);
    return mat2(c, -s, s, c);
}

void main() {
    vec3 local = position;
    vec3 localNormal = normal;
    float t = uTime + aPhase;
    vec3 drift = vec3(0.0);
    if (uStyle < 0.5) {
        local.xz = rotate2d(t * 0.55) * local.xz;
        localNormal.xz = rotate2d(t * 0.55) * localNormal.xz;
        drift.y = sin(t * 1.4) * 0.16;
    } else if (uStyle < 1.5) {
        local.xy = rotate2d(t * 0.17) * local.xy;
        local.yz = rotate2d(t * 0.11) * local.yz;
        localNormal.xy = rotate2d(t * 0.17) * localNormal.xy;
        localNormal.yz = rotate2d(t * 0.11) * localNormal.yz;
        drift = vec3(sin(uTime * 0.18), cos(uTime * 0.13), sin(uTime * 0.11)) * 0.36;
        drift += vec3(sin(t * 0.11), cos(t * 0.09), sin(t * 0.07)) * 0.1;
    } else if (uStyle < 2.5) {
        drift.x = sin(t * 0.72) * 0.22;
        drift.y = cos(t * 0.93) * 0.12;
    } else {
        local.xz = rotate2d(t * 0.22) * local.xz;
        localNormal.xz = rotate2d(t * 0.22) * localNormal.xz;
    }

    vec4 world = instanceMatrix * vec4(local, 1.0);
    world.xyz += drift;
    vec4 view = viewMatrix * world;
    mat3 instanceNormalMatrix = mat3(instanceMatrix);
    localNormal /= vec3(
        dot(instanceNormalMatrix[0], instanceNormalMatrix[0]),
        dot(instanceNormalMatrix[1], instanceNormalMatrix[1]),
        dot(instanceNormalMatrix[2], instanceNormalMatrix[2])
    );
    vViewNormal = normalize(normalMatrix * instanceNormalMatrix * localNormal);
    vColor = aColor;
    vPatternPos = local;
    vPulse = 0.72 + 0.28 * sin(t * 1.9);
    vSpecial = aSpecial;
    vViewDepth = -view.z;
    gl_Position = projectionMatrix * view;
}
`

const fragmentShader = /* glsl */ `
uniform float uStyle;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
varying vec3 vColor;
varying vec3 vViewNormal;
varying vec3 vPatternPos;
varying float vPulse;
varying float vSpecial;
varying float vViewDepth;

void main() {
    float facing = abs(vViewNormal.z);
    float rim = pow(clamp(1.0 - facing, 0.0, 1.0), 2.2);
    float faceted = 0.38 + 0.62 * max(dot(normalize(vViewNormal), normalize(vec3(0.35, 0.7, 0.55))), 0.0);
    vec3 color = vColor * (faceted + rim * 2.1) * vPulse;
    float crackWave = abs(sin(vPatternPos.x * 17.0 + sin(vPatternPos.y * 21.0) + vPatternPos.z * 13.0));
    float cracks = smoothstep(0.965, 0.995, crackWave) * vSpecial;
    color += vColor * cracks * 1.5;
    float alpha = 1.0;
    if (uStyle > 1.5) {
        color *= uStyle > 2.5 ? 1.7 : 1.5;
        alpha = uStyle > 2.5 ? 0.72 : 0.88;
    }
    alpha *= 1.0 - smoothstep(80.0, 160.0, vViewDepth);
    float pmFogFactor = clamp((vViewDepth - uFogNear) / max(0.001, uFogFar - uFogNear), 0.0, 1.0);
    if (uStyle > 1.5) {
        float fogAttenuation = 1.0 - pmFogFactor;
        color *= fogAttenuation;
        alpha *= fogAttenuation;
    } else {
        color = mix(color, uFogColor, pmFogFactor);
    }
    if (alpha < 0.002) discard;
    gl_FragColor = vec4(color, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
}
`

function biomeColor(id: BiomeId): THREE.Color {
    return BIOMES.find((biome) => biome.id === id)?.palette.emissive.clone() ?? new THREE.Color('#ffffff')
}

function makeRecord(
    position: THREE.Vector3,
    rotation: THREE.Euler,
    scale: THREE.Vector3,
    phase: number,
    color: THREE.Color,
    special = 0,
): InstanceRecord {
    const quaternion = new THREE.Quaternion().setFromEuler(rotation)
    return { matrix: new THREE.Matrix4().compose(position, quaternion, scale), phase, color, special }
}

function addCrystals(rng: Prng, anchor: DecoAnchor, output: InstanceRecord[]) {
    const count = rng.int(2, 5)
    const color = biomeColor(anchor.biome)
    for (let index = 0; index < count; index += 1) {
        const angle = rng.range(0, Math.PI * 2)
        const radius = rng.range(0.3, 1.35) * anchor.scale
        const height = rng.range(0.42, 1.08) * anchor.scale
        output.push(makeRecord(
            new THREE.Vector3(
                anchor.pos[0] + Math.cos(angle) * radius,
                anchor.pos[1] + height,
                anchor.pos[2] + Math.sin(angle) * radius,
            ),
            new THREE.Euler(rng.range(-0.2, 0.2), rng.range(0, Math.PI * 2), rng.range(-0.18, 0.18)),
            new THREE.Vector3(rng.range(0.12, 0.28), rng.range(0.32, 0.68), rng.range(0.12, 0.28)).multiplyScalar(anchor.scale),
            rng.range(0, Math.PI * 2),
            color.clone().lerp(new THREE.Color('#ffffff'), rng.range(0.08, 0.38)),
        ))
    }
}

function addShard(rng: Prng, anchor: DecoAnchor, output: InstanceRecord[]) {
    const cosmos = anchor.biome === 'cosmos'
    const color = cosmos
        ? biomeColor('cosmos').multiplyScalar(1.35)
        : BIOMES.find((biome) => biome.id === anchor.biome)?.palette.platformAccent.clone() ?? new THREE.Color('#999999')
    output.push(makeRecord(
        new THREE.Vector3(...anchor.pos),
        new THREE.Euler(rng.range(0, Math.PI), rng.range(0, Math.PI), rng.range(0, Math.PI)),
        new THREE.Vector3(rng.range(0.7, 1.5), rng.range(0.45, 1.15), rng.range(0.55, 1.3)).multiplyScalar(anchor.scale),
        rng.range(0, Math.PI * 2),
        color,
        cosmos ? 1 : 0,
    ))
}

function addLantern(rng: Prng, anchor: DecoAnchor, output: InstanceRecord[]) {
    if ((anchor.biome !== 'meadow' && anchor.biome !== 'clouds') || !rng.chance(0.17)) return
    const warm = anchor.biome === 'meadow' ? new THREE.Color('#ffd27f') : new THREE.Color('#ff9e7f')
    output.push(makeRecord(
        new THREE.Vector3(anchor.pos[0], anchor.pos[1] + rng.range(1.2, 2.1), anchor.pos[2]),
        new THREE.Euler(0, 0, 0),
        new THREE.Vector3(0.16, 0.16, 0.16).multiplyScalar(rng.range(0.8, 1.35)),
        rng.range(0, Math.PI * 2),
        warm,
    ))
}

function addSummitDecoration(rng: Prng, anchor: DecoAnchor, data: DecorationData) {
    addCrystals(rng, { ...anchor, scale: anchor.scale * 1.8 }, data.crystals)
    data.rings.push(makeRecord(
        new THREE.Vector3(anchor.pos[0], anchor.pos[1] + 1.6, anchor.pos[2]),
        new THREE.Euler(Math.PI * 0.5, 0, rng.range(-0.18, 0.18)),
        new THREE.Vector3(3.8, 3.8, 3.8).multiplyScalar(anchor.scale),
        rng.range(0, Math.PI * 2),
        biomeColor('summit').multiplyScalar(1.35),
        1,
    ))
}

function createDecorationData(spec: LevelSpec): DecorationData {
    const rng = createRng(spec.seed)
    const data: DecorationData = { crystals: [], shards: [], lanterns: [], rings: [], shardVertexScales: [] }
    for (const anchor of spec.decoAnchors) {
        if (anchor.kind === 'ledge' || anchor.kind === 'checkpoint') addCrystals(rng, anchor, data.crystals)
        if (anchor.kind === 'orbit') addShard(rng, anchor, data.shards)
        if (anchor.kind === 'ledge') addLantern(rng, anchor, data.lanterns)
        if (anchor.kind === 'summit') addSummitDecoration(rng, anchor, data)
        if (anchor.kind === 'planet') {
            const ringScale = anchor.scale * rng.range(1.05, 1.75)
            const ringStretch = rng.range(0.76, 1.32)
            data.rings.push(makeRecord(
                new THREE.Vector3(...anchor.pos),
                new THREE.Euler(rng.range(-0.35, 0.35), rng.range(0, Math.PI), rng.range(-0.25, 0.25)),
                new THREE.Vector3(
                    ringScale * ringStretch,
                    ringScale / ringStretch,
                    ringScale * rng.range(0.72, 1.18),
                ),
                rng.range(0, Math.PI * 2),
                biomeColor('cosmos'),
            ))
        }
    }
    for (let index = 0; index < 60; index += 1) data.shardVertexScales.push(rng.range(0.72, 1.28))
    return data
}

function makeGeometry(style: number, vertexScales: number[]): THREE.BufferGeometry {
    if (style === 0) return new THREE.OctahedronGeometry(1, 0)
    if (style === 1) {
        const geometry = new THREE.IcosahedronGeometry(1, 1)
        const position = geometry.getAttribute('position') as THREE.BufferAttribute
        for (let index = 0; index < position.count; index += 1) {
            const scale = vertexScales[index % vertexScales.length]
            position.setXYZ(index, position.getX(index) * scale, position.getY(index) * scale, position.getZ(index) * scale)
        }
        position.needsUpdate = true
        geometry.computeVertexNormals()
        let maxRadiusSquared = 0
        for (let index = 0; index < position.count; index += 1) {
            const x = position.getX(index)
            const y = position.getY(index)
            const z = position.getZ(index)
            maxRadiusSquared = Math.max(maxRadiusSquared, x * x + y * y + z * z)
        }
        geometry.boundingSphere = new THREE.Sphere(
            new THREE.Vector3(),
            Math.sqrt(maxRadiusSquared),
        )
        return geometry
    }
    if (style === 2) return new THREE.SphereGeometry(1, 10, 8)
    return new THREE.TorusGeometry(1, 0.025, 6, 48)
}

function makeSystem(records: InstanceRecord[], style: number, vertexScales: number[]): InstancedSystem {
    const geometry = makeGeometry(style, vertexScales)
    const phases = new Float32Array(records.length)
    const colors = new Float32Array(records.length * 3)
    const specials = new Float32Array(records.length)
    records.forEach((record, index) => {
        phases[index] = record.phase
        record.color.toArray(colors, index * 3)
        specials[index] = record.special
    })
    geometry.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phases, 1))
    geometry.setAttribute('aColor', new THREE.InstancedBufferAttribute(colors, 3))
    geometry.setAttribute('aSpecial', new THREE.InstancedBufferAttribute(specials, 1))
    const material = new THREE.ShaderMaterial({
        name: `OnlyUpDecoration-${style}`,
        uniforms: {
            uTime: { value: 0 },
            uStyle: { value: style },
            uFogColor: { value: new THREE.Color() },
            uFogNear: { value: 35 },
            uFogFar: { value: 300 },
        },
        vertexShader,
        fragmentShader,
        transparent: true,
        blending: style >= 2 ? THREE.AdditiveBlending : THREE.NormalBlending,
        depthWrite: style < 2,
    })
    const mesh = new THREE.InstancedMesh(geometry, material, records.length)
    records.forEach((record, index) => mesh.setMatrixAt(index, record.matrix))
    mesh.instanceMatrix.needsUpdate = true
    mesh.frustumCulled = false
    mesh.renderOrder = style >= 2 ? 4 : 0
    return { mesh, material, geometry }
}

export function createDecorationSystems(spec: LevelSpec): InstancedSystem[] {
    const data = createDecorationData(spec)
    return [
        makeSystem(data.crystals, 0, data.shardVertexScales),
        makeSystem(data.shards, 1, data.shardVertexScales),
        makeSystem(data.lanterns, 2, data.shardVertexScales),
        makeSystem(data.rings, 3, data.shardVertexScales),
    ]
}

export function DecorationInstances({ spec }: { spec: LevelSpec }): React.ReactNode {
    const scene = useThree((state) => state.scene)
    const systems = useMemo(() => createDecorationSystems(spec), [spec])

    useEffect(() => () => {
        for (const system of systems) {
            system.geometry.dispose()
            system.material.dispose()
        }
    }, [systems])

    useFrame((state) => {
        const elapsed = state.clock.elapsedTime
        for (const system of systems) {
            system.material.uniforms.uTime.value = elapsed
            if (scene.fog instanceof THREE.Fog) {
                system.material.uniforms.uFogColor.value.copy(scene.fog.color)
                system.material.uniforms.uFogNear.value = scene.fog.near
                system.material.uniforms.uFogFar.value = scene.fog.far
            }
        }
    })

    return (
        <group name="OnlyUpDecorationInstances">
            {systems.map((system) => <primitive key={system.material.name} object={system.mesh} />)}
        </group>
    )
}
