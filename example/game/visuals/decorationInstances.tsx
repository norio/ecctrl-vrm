import * as THREE from 'three'
import { MeshBasicNodeMaterial, type Node } from 'three/webgpu'
import {
    Discard,
    Fn,
    abs,
    buffer,
    cameraViewMatrix,
    clamp,
    cos,
    dot,
    instancedBufferAttribute,
    instanceIndex,
    max,
    mix,
    modelNormalMatrix,
    normalGeometry,
    positionGeometry,
    positionView,
    pow,
    rotate,
    sin,
    smoothstep,
    transformNormal,
    uniform,
    varying,
    vec2,
    vec3,
    vec4,
} from 'three/tsl'
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
    material: MeshBasicNodeMaterial
    geometry: THREE.BufferGeometry
    uniforms: {
        time: { value: number }
        fogColor: { value: THREE.Color }
        fogNear: { value: number }
        fogFar: { value: number }
    }
}

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
    const phaseAttribute = new THREE.InstancedBufferAttribute(phases, 1)
    const colorAttribute = new THREE.InstancedBufferAttribute(colors, 3)
    const specialAttribute = new THREE.InstancedBufferAttribute(specials, 1)
    geometry.setAttribute('aPhase', phaseAttribute)
    geometry.setAttribute('aColor', colorAttribute)
    geometry.setAttribute('aSpecial', specialAttribute)
    const material = new MeshBasicNodeMaterial()
    material.name = `OnlyUpDecoration-${style}`
    material.transparent = true
    material.blending = style >= 2 ? THREE.AdditiveBlending : THREE.NormalBlending
    material.depthWrite = style < 2
    material.fog = false
    const mesh = new THREE.InstancedMesh(geometry, material, records.length)
    records.forEach((record, index) => mesh.setMatrixAt(index, record.matrix))
    mesh.instanceMatrix.needsUpdate = true

    const time = uniform(0)
    const fogColor = uniform(new THREE.Color())
    const fogNear = uniform(35)
    const fogFar = uniform(300)
    const phase = instancedBufferAttribute(phaseAttribute)
    const instanceColor = instancedBufferAttribute(colorAttribute)
    const special = instancedBufferAttribute(specialAttribute)
    const instanceMatrixNode = buffer(
        mesh.instanceMatrix.array,
        'mat4',
        Math.max(records.length, 1),
    ).element(instanceIndex)
    const t = time.add(phase)
    let local: Node = positionGeometry
    let localNormal: Node = normalGeometry
    let drift: Node = vec3(0)

    if (style === 0) {
        const angle = t.mul(-0.55)
        const rotatedPosition = rotate(positionGeometry.xz, angle)
        const rotatedNormal = rotate(normalGeometry.xz, angle)
        local = vec3(rotatedPosition.x, positionGeometry.y, rotatedPosition.y)
        localNormal = vec3(rotatedNormal.x, normalGeometry.y, rotatedNormal.y)
        drift = vec3(0, sin(t.mul(1.4)).mul(0.16), 0)
    } else if (style === 1) {
        const positionXY = rotate(positionGeometry.xy, t.mul(-0.17))
        const positionYZ = rotate(vec2(positionXY.y, positionGeometry.z), t.mul(-0.11))
        const normalXY = rotate(normalGeometry.xy, t.mul(-0.17))
        const normalYZ = rotate(vec2(normalXY.y, normalGeometry.z), t.mul(-0.11))
        local = vec3(positionXY.x, positionYZ.x, positionYZ.y)
        localNormal = vec3(normalXY.x, normalYZ.x, normalYZ.y)
        drift = vec3(
            sin(time.mul(0.18)),
            cos(time.mul(0.13)),
            sin(time.mul(0.11)),
        ).mul(0.36).add(vec3(
            sin(t.mul(0.11)),
            cos(t.mul(0.09)),
            sin(t.mul(0.07)),
        ).mul(0.1))
    } else if (style === 2) {
        localNormal = normalGeometry
        drift = vec3(sin(t.mul(0.72)).mul(0.22), cos(t.mul(0.93)).mul(0.12), 0)
    } else {
        const angle = t.mul(-0.22)
        const rotatedPosition = rotate(positionGeometry.xz, angle)
        const rotatedNormal = rotate(normalGeometry.xz, angle)
        local = vec3(rotatedPosition.x, positionGeometry.y, rotatedPosition.y)
        localNormal = vec3(rotatedNormal.x, normalGeometry.y, rotatedNormal.y)
    }

    const worldLocal = instanceMatrixNode.mul(vec4(local, 1)).xyz.add(drift)
    material.positionNode = worldLocal
    const viewNormal = varying(cameraViewMatrix.transformDirection(
        modelNormalMatrix.mul(transformNormal(localNormal, instanceMatrixNode)),
    ).normalize())
    const patternPosition = varying(local)
    const viewDepth = varying(positionView.z.negate())
    const pulse = varying(sin(t.mul(1.9)).mul(0.28).add(0.72))
    const vertexColor = varying(instanceColor)
    const vertexSpecial = varying(special)
    const facing = abs(viewNormal.z)
    const rim = pow(clamp(facing.oneMinus(), 0, 1), 2.2)
    const faceted = max(dot(viewNormal.normalize(), vec3(0.35, 0.7, 0.55).normalize()), 0)
        .mul(0.62).add(0.38)
    const crackWave = abs(sin(
        patternPosition.x.mul(17)
            .add(sin(patternPosition.y.mul(21)))
            .add(patternPosition.z.mul(13)),
    ))
    const cracks = smoothstep(0.965, 0.995, crackWave).mul(vertexSpecial)
    const baseColor = vertexColor.mul(faceted.add(rim.mul(2.1))).mul(pulse)
        .add(vertexColor.mul(cracks).mul(1.5))
    const distanceAlpha = smoothstep(80, 160, viewDepth).oneMinus()
    const fogFactor = clamp(
        viewDepth.sub(fogNear).div(max(0.001, fogFar.sub(fogNear))),
        0,
        1,
    )
    const fogAttenuation = fogFactor.oneMinus()
    const shadedColor = style >= 2
        ? baseColor.mul(style === 3 ? 1.7 : 1.5).mul(fogAttenuation)
        : mix(baseColor, fogColor, fogFactor)
    const alpha = style >= 2
        ? distanceAlpha.mul(style === 3 ? 0.72 : 0.88).mul(fogAttenuation)
        : distanceAlpha
    material.colorNode = Fn(() => {
        Discard(alpha.lessThan(0.002))
        return shadedColor
    })()
    material.opacityNode = alpha
    mesh.frustumCulled = false
    mesh.renderOrder = style >= 2 ? 4 : 0
    return { mesh, material, geometry, uniforms: { time, fogColor, fogNear, fogFar } }
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
            system.uniforms.time.value = elapsed
            if (scene.fog instanceof THREE.Fog) {
                system.uniforms.fogColor.value.copy(scene.fog.color)
                system.uniforms.fogNear.value = scene.fog.near
                system.uniforms.fogFar.value = scene.fog.far
            }
        }
    })

    return (
        <group name="OnlyUpDecorationInstances">
            {systems.map((system) => <primitive key={system.material.name} object={system.mesh} />)}
        </group>
    )
}
