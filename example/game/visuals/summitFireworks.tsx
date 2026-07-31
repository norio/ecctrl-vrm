import * as THREE from 'three'
import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'

import type { LevelSpec } from '../level'
import { BIOMES } from '../palette'
import { createRng } from '../prng'
import { useGameStore } from '../useGameStore'

export const FIREWORK_POINT_COUNT = 1200

export interface FireworkResource {
    points: THREE.Points
    geometry: THREE.BufferGeometry
    material: THREE.ShaderMaterial
}

const vertexShader = /* glsl */ `
uniform float uTime;
uniform float uTrigger;
attribute vec3 aOrigin;
attribute vec3 aColor;
attribute float aKind;
attribute float aStart;
attribute float aSeed;
varying vec3 vColor;
varying float vAlpha;
varying float vKind;
varying float vViewDepth;

void main() {
    float sequenceAge = uTime - uTrigger;
    float age = sequenceAge - aStart;
    vec3 local = aOrigin;
    float alpha = 0.0;
    float size = 6.0;
    if (aKind < 0.5) {
        float t = max(age, 0.0);
        local += position * t;
        local.y -= 2.7 * t * t;
        alpha = step(0.0, age) * (1.0 - smoothstep(1.35, 2.65, age));
        alpha *= 0.6 + 0.4 * sin(age * 17.0 + aSeed * 40.0);
        size = 5.0 + aSeed * 5.0;
    } else if (aKind < 1.5) {
        float t = max(age, 0.0);
        local += position * t;
        local.y -= 2.2 * t * t;
        local.x += sin(t * 4.0 + aSeed * 30.0) * 0.6;
        alpha = step(0.0, age) * (1.0 - smoothstep(2.5, 4.2, age));
        size = 8.0;
    } else {
        float settled = smoothstep(4.5, 5.6, sequenceAge);
        float loop = uTime * (0.35 + aSeed * 0.45) + aSeed * 30.0;
        local += vec3(sin(loop), cos(loop * 1.3), sin(loop * 0.73)) * (0.25 + aSeed * 0.45);
        alpha = settled * (0.35 + 0.65 * pow(0.5 + 0.5 * sin(loop * 4.0), 5.0));
        size = 4.0 + aSeed * 4.0;
    }

    if (alpha < 0.002) {
        gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
        gl_PointSize = 0.0;
        vColor = aColor;
        vAlpha = 0.0;
        vKind = aKind;
        vViewDepth = 0.0;
        return;
    }

    vec4 view = modelViewMatrix * vec4(local, 1.0);
    gl_Position = projectionMatrix * view;
    gl_PointSize = clamp(size * (72.0 / max(1.0, -view.z)), 1.0, 20.0);
    vColor = aColor;
    vAlpha = alpha;
    vKind = aKind;
    vViewDepth = -view.z;
}
`

const fragmentShader = /* glsl */ `
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
varying vec3 vColor;
varying float vAlpha;
varying float vKind;
varying float vViewDepth;

void main() {
    vec2 centered = gl_PointCoord - 0.5;
    float distanceToCenter = vKind > 0.5 && vKind < 1.5
        ? length(centered * vec2(1.0, 2.8))
        : length(centered);
    if (distanceToCenter > 0.5 || vAlpha < 0.002) discard;
    float soft = 1.0 - smoothstep(0.12, 0.5, distanceToCenter);
    vec3 color = vKind > 0.5 && vKind < 1.5 ? vec3(1.0, 0.67, 0.16) : vColor;
    float pmFogFactor = clamp((vViewDepth - uFogNear) / max(0.001, uFogFar - uFogNear), 0.0, 1.0);
    float fogAttenuation = 1.0 - pmFogFactor;
    gl_FragColor = vec4(color * 2.25 * fogAttenuation, vAlpha * soft * fogAttenuation);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
}
`

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

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('aOrigin', new THREE.BufferAttribute(origins, 3))
    geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3))
    geometry.setAttribute('aKind', new THREE.BufferAttribute(kinds, 1))
    geometry.setAttribute('aStart', new THREE.BufferAttribute(starts, 1))
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1))
    let maxRadiusSquared = 0
    for (let index = 0; index < positions.length; index += 3) {
        const x = positions[index]
        const y = positions[index + 1]
        const z = positions[index + 2]
        maxRadiusSquared = Math.max(maxRadiusSquared, x * x + y * y + z * z)
    }
    geometry.boundingSphere = new THREE.Sphere(
        new THREE.Vector3(),
        Math.sqrt(maxRadiusSquared),
    )
    const material = new THREE.ShaderMaterial({
        name: 'OnlyUpSummitFireworks',
        uniforms: {
            uTime: { value: 0 },
            uTrigger: { value: 1e9 },
            uFogColor: { value: new THREE.Color() },
            uFogNear: { value: 35 },
            uFogFar: { value: 300 },
        },
        vertexShader,
        fragmentShader,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
    })
    const points = new THREE.Points(geometry, material)
    points.position.set(...spec.goal.pos)
    points.frustumCulled = false
    points.renderOrder = 8
    return { points, geometry, material }
}

export function SummitFireworks({ spec }: { spec: LevelSpec }): React.ReactNode {
    const scene = useThree((state) => state.scene)
    const resource = useMemo(() => makeFireworkResource(spec), [spec])
    const previousStatus = useRef(useGameStore.getState().status)
    const armed = useRef(previousStatus.current !== 'summit')

    useEffect(() => () => {
        resource.geometry.dispose()
        resource.material.dispose()
    }, [resource])

    useFrame((state) => {
        const elapsed = state.clock.elapsedTime
        const status = useGameStore.getState().status
        if (scene.fog instanceof THREE.Fog) {
            resource.material.uniforms.uFogColor.value.copy(scene.fog.color)
            resource.material.uniforms.uFogNear.value = scene.fog.near
            resource.material.uniforms.uFogFar.value = scene.fog.far
        }
        resource.material.uniforms.uTime.value = elapsed
        if (status !== 'summit') {
            armed.current = true
            resource.material.uniforms.uTrigger.value = 1e9
        } else if (previousStatus.current === 'playing' && armed.current) {
            armed.current = false
            resource.material.uniforms.uTrigger.value = elapsed
        }
        previousStatus.current = status
    })

    return <primitive object={resource.points} />
}
