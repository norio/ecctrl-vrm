import * as THREE from 'three'
import { PointsNodeMaterial } from 'three/webgpu'
import {
    Discard,
    Fn,
    clamp,
    cos,
    instancedBufferAttribute,
    length,
    max,
    mix,
    positionGeometry,
    positionView,
    pow,
    // @ts-expect-error three 0.184 exports screenDPR but omits it from Three.TSL.d.ts
    screenDPR,
    select,
    sin,
    smoothstep,
    step,
    uniform,
    varying,
    vec2,
    vec3,
} from 'three/tsl'
import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'

import type { LevelSpec } from '../level'
import { BIOMES } from '../palette'
import { createRng } from '../prng'
import { useGameStore } from '../useGameStore'

export const FIREWORK_POINT_COUNT = 1200

export interface FireworkResource {
    points: THREE.Sprite
    material: PointsNodeMaterial
    uniforms: {
        time: { value: number }
        trigger: { value: number }
        fogColor: { value: THREE.Color }
        fogNear: { value: number }
        fogFar: { value: number }
    }
}

function randomDirection(rng: ReturnType<typeof createRng>, speedMin: number, speedMax: number): THREE.Vector3 {
    const azimuth = rng.range(0, Math.PI * 2)
    const vertical = rng.range(-0.78, 0.92)
    const radial = Math.sqrt(Math.max(0, 1 - vertical * vertical))
    return new THREE.Vector3(Math.cos(azimuth) * radial, vertical, Math.sin(azimuth) * radial)
        .multiplyScalar(rng.range(speedMin, speedMax))
}

function writeVector(target: Float32Array, index: number, value: THREE.Vector3) {
    value.toArray(target, index * 3)
}

export function makeFireworkResource(spec: LevelSpec): FireworkResource {
    const rng = createRng(spec.seed)
    const positions = new Float32Array(FIREWORK_POINT_COUNT * 3)
    const origins = new Float32Array(FIREWORK_POINT_COUNT * 3)
    const colors = new Float32Array(FIREWORK_POINT_COUNT * 3)
    const kinds = new Float32Array(FIREWORK_POINT_COUNT)
    const starts = new Float32Array(FIREWORK_POINT_COUNT)
    const seeds = new Float32Array(FIREWORK_POINT_COUNT)
    const burstColors = [
        BIOMES[0].palette.emissive,
        BIOMES[1].palette.emissive,
        BIOMES[2].palette.emissive,
        BIOMES[3].palette.emissive,
        BIOMES[4].palette.emissive,
    ]

    let cursor = 0
    const burstCount = 6
    const particlesPerBurst = 110
    for (let burst = 0; burst < burstCount; burst += 1) {
        const angle = rng.range(0, Math.PI * 2)
        const radius = rng.range(2.5, 8.5)
        const origin = new THREE.Vector3(Math.cos(angle) * radius, rng.range(4, 10), Math.sin(angle) * radius)
        const color = rng.pick(burstColors).clone().lerp(new THREE.Color('#ffffff'), rng.range(0.05, 0.35))
        for (let index = 0; index < particlesPerBurst; index += 1) {
            writeVector(positions, cursor, randomDirection(rng, 4.5, 9.5))
            writeVector(origins, cursor, origin)
            color.toArray(colors, cursor * 3)
            kinds[cursor] = 0
            starts[cursor] = burst * 0.68 + rng.range(-0.05, 0.05)
            seeds[cursor] = rng.next()
            cursor += 1
        }
    }

    const confettiCount = 260
    for (let index = 0; index < confettiCount; index += 1) {
        const angle = rng.range(0, Math.PI * 2)
        const origin = new THREE.Vector3(rng.range(-5, 5), rng.range(8, 15), rng.range(-5, 5))
        const velocity = new THREE.Vector3(Math.cos(angle) * rng.range(0.5, 2.7), rng.range(0.5, 3.2), Math.sin(angle) * rng.range(0.5, 2.7))
        writeVector(positions, cursor, velocity)
        writeVector(origins, cursor, origin)
        new THREE.Color('#ffbf45').lerp(new THREE.Color('#fff3a8'), rng.next()).toArray(colors, cursor * 3)
        kinds[cursor] = 1
        starts[cursor] = rng.range(0.7, 2.7)
        seeds[cursor] = rng.next()
        cursor += 1
    }

    while (cursor < FIREWORK_POINT_COUNT) {
        const angle = rng.range(0, Math.PI * 2)
        const radius = rng.range(2.5, 11)
        const origin = new THREE.Vector3(Math.cos(angle) * radius, rng.range(0.5, 8), Math.sin(angle) * radius)
        writeVector(positions, cursor, new THREE.Vector3())
        writeVector(origins, cursor, origin)
        BIOMES[4].palette.emissive.clone().lerp(new THREE.Color('#ffffff'), rng.range(0.1, 0.7)).toArray(colors, cursor * 3)
        kinds[cursor] = 2
        starts[cursor] = 0
        seeds[cursor] = rng.next()
        cursor += 1
    }

    const velocity = instancedBufferAttribute(new THREE.InstancedBufferAttribute(positions, 3))
    const origin = instancedBufferAttribute(new THREE.InstancedBufferAttribute(origins, 3))
    const particleColor = instancedBufferAttribute(new THREE.InstancedBufferAttribute(colors, 3))
    const kind = instancedBufferAttribute(new THREE.InstancedBufferAttribute(kinds, 1))
    const start = instancedBufferAttribute(new THREE.InstancedBufferAttribute(starts, 1))
    const particleSeed = instancedBufferAttribute(new THREE.InstancedBufferAttribute(seeds, 1))
    const time = uniform(0)
    const trigger = uniform(1e9)
    const fogColor = uniform(new THREE.Color())
    const fogNear = uniform(35)
    const fogFar = uniform(300)
    const sequenceAge = time.sub(trigger)
    const age = sequenceAge.sub(start)
    const t = max(age, 0)
    const burstBase = origin.add(velocity.mul(t))
    const burstLocal = vec3(burstBase.x, burstBase.y.sub(t.mul(t).mul(2.7)), burstBase.z)
    const burstAlpha = step(0, age)
        .mul(smoothstep(1.35, 2.65, age).oneMinus())
        .mul(sin(age.mul(17).add(particleSeed.mul(40))).mul(0.4).add(0.6))
    const confettiBase = origin.add(velocity.mul(t))
    const confettiLocal = vec3(
        confettiBase.x.add(sin(t.mul(4).add(particleSeed.mul(30))).mul(0.6)),
        confettiBase.y.sub(t.mul(t).mul(2.2)),
        confettiBase.z,
    )
    const confettiAlpha = step(0, age).mul(smoothstep(2.5, 4.2, age).oneMinus())
    const loop = time.mul(particleSeed.mul(0.45).add(0.35)).add(particleSeed.mul(30))
    const ambientLocal = origin.add(vec3(
        sin(loop),
        cos(loop.mul(1.3)),
        sin(loop.mul(0.73)),
    ).mul(particleSeed.mul(0.45).add(0.25)))
    const ambientAlpha = smoothstep(4.5, 5.6, sequenceAge).mul(
        pow(sin(loop.mul(4)).mul(0.5).add(0.5), 5).mul(0.65).add(0.35),
    )
    const isBurst = kind.lessThan(0.5)
    const isConfetti = kind.lessThan(1.5)
    const local = select(isBurst, burstLocal, select(isConfetti, confettiLocal, ambientLocal))
    const alpha = select(isBurst, burstAlpha, select(isConfetti, confettiAlpha, ambientAlpha))
    const size = select(
        isBurst,
        particleSeed.mul(5).add(5),
        select(isConfetti, 8, particleSeed.mul(4).add(4)),
    )
    const material = new PointsNodeMaterial()
    material.name = 'OnlyUpSummitFireworks'
    material.transparent = true
    material.depthWrite = false
    material.blending = THREE.AdditiveBlending
    material.fog = false
    material.sizeAttenuation = false
    material.alphaToCoverage = false
    material.positionNode = local
    const viewDepth = varying(positionView.z.negate())
    const pixelSize = clamp(size.mul(72).div(max(1, viewDepth)), 1, 20).div(screenDPR)
    material.sizeNode = vec2(select(alpha.lessThan(0.002), 0, pixelSize))
    const fragmentKind = varying(kind)
    const fragmentAlpha = varying(alpha)
    const fragmentColor = varying(particleColor)
    const confetti = fragmentKind.greaterThan(0.5).and(fragmentKind.lessThan(1.5))
    const centered = positionGeometry.xy
    const distanceToCenter = select(
        confetti,
        length(centered.mul(vec2(1, 2.8))),
        length(centered),
    )
    const soft = smoothstep(0.12, 0.5, distanceToCenter).oneMinus()
    const fogAttenuation = clamp(
        viewDepth.sub(fogNear).div(max(0.001, fogFar.sub(fogNear))),
        0,
        1,
    ).oneMinus()
    const finalColor = select(confetti, vec3(1, 0.67, 0.16), fragmentColor)
        .mul(2.25).mul(fogAttenuation)
    material.colorNode = Fn(() => {
        Discard(distanceToCenter.greaterThan(0.5).or(fragmentAlpha.lessThan(0.002)))
        return finalColor
    })()
    material.opacityNode = fragmentAlpha.mul(soft).mul(fogAttenuation)
    const points = new THREE.Sprite(material as unknown as THREE.SpriteMaterial)
    points.count = FIREWORK_POINT_COUNT
    points.position.set(...spec.goal.pos)
    points.frustumCulled = false
    points.renderOrder = 8
    return { points, material, uniforms: { time, trigger, fogColor, fogNear, fogFar } }
}

export function SummitFireworks({ spec }: { spec: LevelSpec }): React.ReactNode {
    const scene = useThree((state) => state.scene)
    const resource = useMemo(() => makeFireworkResource(spec), [spec])
    const previousStatus = useRef(useGameStore.getState().status)
    const armed = useRef(previousStatus.current !== 'summit')

    useEffect(() => () => {
        resource.material.dispose()
    }, [resource])

    useFrame((state) => {
        const elapsed = state.clock.elapsedTime
        const status = useGameStore.getState().status
        if (scene.fog instanceof THREE.Fog) {
            resource.uniforms.fogColor.value.copy(scene.fog.color)
            resource.uniforms.fogNear.value = scene.fog.near
            resource.uniforms.fogFar.value = scene.fog.far
        }
        resource.uniforms.time.value = elapsed
        if (status !== 'summit') {
            armed.current = true
            resource.uniforms.trigger.value = 1e9
        } else if (previousStatus.current === 'playing' && armed.current) {
            armed.current = false
            resource.uniforms.trigger.value = elapsed
        }
        previousStatus.current = status
    })

    return <primitive object={resource.points} />
}
