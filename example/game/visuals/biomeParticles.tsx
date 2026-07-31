import * as THREE from 'three'
import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'

import { BIOMES } from '../palette'
import { createRng } from '../prng'
import { livePlayer } from '../useGameStore'

type ParticleMode = 'meadow' | 'clouds' | 'storm' | 'cosmos' | 'fall'

export interface ParticleConfig {
    mode: ParticleMode
    modeIndex: number
    count: number
    offset: number
    box: THREE.Vector3
    color: THREE.Color
    band: THREE.Vector2
}

export interface ParticleResource {
    points: THREE.Points
    geometry: THREE.BufferGeometry
    material: THREE.ShaderMaterial
}

export interface ShootingStarResource {
    mesh: THREE.Mesh
    geometry: THREE.PlaneGeometry
    material: THREE.ShaderMaterial
}

export const PARTICLE_CONFIGS: ParticleConfig[] = [
    { mode: 'meadow', modeIndex: 0, count: 700, offset: 31, box: new THREE.Vector3(34, 24, 34), color: BIOMES[0].palette.particle.clone(), band: new THREE.Vector2(BIOMES[0].minY, BIOMES[0].maxY) },
    { mode: 'clouds', modeIndex: 1, count: 700, offset: 79, box: new THREE.Vector3(40, 30, 40), color: BIOMES[1].palette.particle.clone(), band: new THREE.Vector2(BIOMES[1].minY, BIOMES[1].maxY) },
    { mode: 'storm', modeIndex: 2, count: 900, offset: 137, box: new THREE.Vector3(42, 34, 42), color: BIOMES[2].palette.particle.clone(), band: new THREE.Vector2(BIOMES[2].minY, BIOMES[2].maxY) },
    { mode: 'cosmos', modeIndex: 3, count: 700, offset: 211, box: new THREE.Vector3(48, 38, 48), color: BIOMES[3].palette.particle.clone(), band: new THREE.Vector2(BIOMES[3].minY, BIOMES[3].maxY) },
    { mode: 'fall', modeIndex: 4, count: 500, offset: 293, box: new THREE.Vector3(22, 18, 22), color: new THREE.Color('#d7e8ff'), band: new THREE.Vector2(-10000, 10000) },
]

export const BIOME_PARTICLE_POINT_COUNT = PARTICLE_CONFIGS.reduce((sum, config) => sum + config.count, 0)

const particleVertex = /* glsl */ `
uniform float uTime;
uniform float uOpacity;
uniform float uMode;
uniform vec3 uBox;
uniform vec2 uBand;
attribute float aSeed;
attribute float aType;
varying float vOpacity;
varying float vType;
varying float vMode;
varying float vViewDepth;
varying float vWindAngle;

vec3 wrapBox(vec3 value) {
    return mod(value + uBox * 0.5, uBox) - uBox * 0.5;
}

void main() {
    vec3 local = position;
    float size = 5.0;
    vWindAngle = 0.0;
    if (uOpacity < 0.002) {
        gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
        gl_PointSize = 0.0;
        vOpacity = 0.0;
        vType = aType;
        vMode = uMode;
        vViewDepth = 0.0;
        return;
    }
    if (uMode < 0.5) {
        vec3 drift = vec3(sin(aSeed * 19.0) * 0.18, 0.42 + aSeed * 0.2, cos(aSeed * 13.0) * 0.15);
        local = wrapBox(local + drift * uTime);
        local.x += sin(uTime * 0.35 + aSeed * 23.0) * 0.45;
        size = mix(3.5, 7.0, aType);
    } else if (uMode < 1.5) {
        vec3 drift = vec3(0.24 + aSeed * 0.15, 0.18, -0.08) * uTime;
        local = wrapBox(local + drift);
        local.xz += vec2(sin(uTime * 0.28 + aSeed * 17.0), cos(uTime * 0.2 + aSeed * 11.0)) * 0.8;
        size = mix(5.0, 9.0, aType);
    } else if (uMode < 2.5) {
        vec3 speed = aType > 0.5 ? vec3(-1.8, 1.1, 0.7) : vec3(-5.6, -24.0, 2.4);
        float travelScale = mix(0.35, 1.0, 1.0 - aType);
        vec3 travel = speed * uTime * travelScale;
        if (aType <= 0.5) {
            float windPhase = aSeed * 6.2831853;
            vWindAngle = sin(uTime * 0.7 + windPhase) * 0.1;
            vec2 perpendicular = vec2(-speed.z, speed.x);
            float integratedSway = (0.1 / 0.7) * (cos(windPhase) - cos(uTime * 0.7 + windPhase));
            travel.xz += perpendicular * integratedSway * travelScale;
        }
        local = wrapBox(local + travel);
        size = aType > 0.5 ? 7.0 : mix(12.0, 26.0, aSeed);
    } else if (uMode < 3.5) {
        vec3 drift = vec3(-0.09, 0.06 + aSeed * 0.12, 0.11) * uTime;
        local = wrapBox(local + drift);
        local += normalize(vec3(sin(aSeed * 31.0), cos(aSeed * 17.0), sin(aSeed * 7.0))) * sin(uTime * 0.18 + aSeed * 40.0) * 0.5;
        size = mix(1.2, 3.2, aType);
    } else {
        vec2 direction = normalize(position.xz + vec2(0.001));
        float cycle = fract(uTime * (0.55 + aSeed * 0.32) + aSeed);
        local = vec3(direction.x, (aType - 0.5) * 9.0 + cycle * 2.5, direction.y) * vec3(2.4 + cycle * 9.0, 1.0, 2.4 + cycle * 9.0);
        size = 18.0 + cycle * 12.0;
    }

    vec4 world = modelMatrix * vec4(local, 1.0);
    float bandMask = smoothstep(uBand.x - 8.0, uBand.x + 8.0, world.y)
        * (1.0 - smoothstep(uBand.y - 8.0, uBand.y + 8.0, world.y));
    vec4 view = viewMatrix * world;
    gl_Position = projectionMatrix * view;
    gl_PointSize = clamp(size * (72.0 / max(1.0, -view.z)), 1.0, 38.0);
    vOpacity = uOpacity * bandMask;
    if (uMode > 1.5 && uMode < 2.5 && aType <= 0.5) {
        vOpacity *= mix(0.35, 1.0, aSeed) * smoothstep(0.0, 6.0, -view.z);
    }
    vType = aType;
    vMode = uMode;
    vViewDepth = -view.z;
}
`

const particleFragment = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
varying float vOpacity;
varying float vType;
varying float vMode;
varying float vViewDepth;
varying float vWindAngle;

void main() {
    vec2 centered = gl_PointCoord - 0.5;
    float distanceToCenter;
    if (vMode > 1.5 && vMode < 2.5 && vType < 0.5) {
        float angle = -0.24 + vWindAngle;
        mat2 rotation = mat2(cos(angle), -sin(angle), sin(angle), cos(angle));
        vec2 rain = rotation * centered;
        distanceToCenter = length(rain * vec2(7.5, 1.0));
    } else if (vMode > 3.5) {
        distanceToCenter = length(centered * vec2(7.0, 1.0));
    } else if (vMode > 0.5 && vMode < 1.5 && vType > 0.58) {
        distanceToCenter = length(centered * vec2(1.0, 2.6));
    } else {
        distanceToCenter = length(centered);
    }
    if (distanceToCenter > 0.5 || vOpacity < 0.002) discard;
    float soft = 1.0 - smoothstep(0.16, 0.5, distanceToCenter);
    vec3 color = uColor;
    if (vMode > 1.5 && vMode < 2.5 && vType > 0.5) color = vec3(0.28, 0.68, 1.0) * 2.2;
    if (vMode > 2.5 && vMode < 3.5) color *= mix(0.8, 2.2, vType);
    float pmFogFactor = clamp((vViewDepth - uFogNear) / max(0.001, uFogFar - uFogNear), 0.0, 1.0);
    float fogAttenuation = 1.0 - pmFogFactor;
    gl_FragColor = vec4(
        color * fogAttenuation,
        soft * vOpacity * mix(0.42, 1.0, vType) * fogAttenuation
    );
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
}
`

function setOriginCenteredBoundingSphere(
    geometry: THREE.BufferGeometry,
    positions: Float32Array,
) {
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
}

export function makeParticleResource(seed: number, config: ParticleConfig): ParticleResource {
    const rng = createRng(seed)
    for (let index = 0; index < config.offset; index += 1) rng.next()
    const positions = new Float32Array(config.count * 3)
    const seeds = new Float32Array(config.count)
    const types = new Float32Array(config.count)
    for (let index = 0; index < config.count; index += 1) {
        const offset = index * 3
        if (config.mode === 'fall') {
            const angle = rng.range(0, Math.PI * 2)
            positions[offset] = Math.cos(angle)
            positions[offset + 1] = rng.range(-1, 1)
            positions[offset + 2] = Math.sin(angle)
        } else {
            positions[offset] = rng.range(-config.box.x * 0.5, config.box.x * 0.5)
            positions[offset + 1] = rng.range(-config.box.y * 0.5, config.box.y * 0.5)
            positions[offset + 2] = rng.range(-config.box.z * 0.5, config.box.z * 0.5)
        }
        seeds[index] = rng.next()
        types[index] = config.mode === 'storm'
            ? (rng.chance(0.08) ? rng.range(0.65, 1) : rng.range(0, 0.45))
            : rng.next()
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1))
    geometry.setAttribute('aType', new THREE.BufferAttribute(types, 1))
    setOriginCenteredBoundingSphere(geometry, positions)
    const material = new THREE.ShaderMaterial({
        name: `OnlyUpParticles-${config.mode}`,
        uniforms: {
            uTime: { value: 0 },
            uOpacity: { value: 0 },
            uMode: { value: config.modeIndex },
            uBox: { value: config.box },
            uBand: { value: config.band },
            uColor: { value: config.color },
            uFogColor: { value: new THREE.Color() },
            uFogNear: { value: 35 },
            uFogFar: { value: 300 },
        },
        vertexShader: particleVertex,
        fragmentShader: particleFragment,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
    })
    const points = new THREE.Points(geometry, material)
    points.name = material.name
    points.frustumCulled = false
    points.renderOrder = 5
    return { points, geometry, material }
}

function bandOpacity(y: number, band: THREE.Vector2): number {
    const distance = y < band.x ? band.x - y : y > band.y ? y - band.y : 0
    return 1 - THREE.MathUtils.smoothstep(distance, 12, 48)
}

function syncLinearFog(material: THREE.ShaderMaterial, scene: THREE.Scene) {
    if (!(scene.fog instanceof THREE.Fog)) return
    material.uniforms.uFogColor.value.copy(scene.fog.color)
    material.uniforms.uFogNear.value = scene.fog.near
    material.uniforms.uFogFar.value = scene.fog.far
}

function ParticleField({ seed, config }: { seed: number; config: ParticleConfig }): React.ReactNode {
    const scene = useThree((state) => state.scene)
    const resource = useMemo(() => makeParticleResource(seed, config), [config, seed])
    const fallOpacity = useRef(0)

    useEffect(() => () => {
        resource.geometry.dispose()
        resource.material.dispose()
    }, [resource])

    useFrame((state, delta) => {
        const uniforms = resource.material.uniforms
        syncLinearFog(resource.material, scene)
        uniforms.uTime.value = state.clock.elapsedTime
        resource.points.position.copy(livePlayer.pos)
        if (config.mode === 'fall') {
            const target = THREE.MathUtils.smoothstep(-livePlayer.velY, 14, 32)
            fallOpacity.current = THREE.MathUtils.damp(fallOpacity.current, target, 9, delta)
            uniforms.uOpacity.value = fallOpacity.current
        } else {
            uniforms.uOpacity.value = bandOpacity(livePlayer.pos.y, config.band)
        }
    })

    return <primitive object={resource.points} />
}

const shootingVertex = /* glsl */ `
uniform float uTime;
uniform float uOffset;
uniform float uPeriod;
uniform float uOpacity;
varying vec2 vUv;
varying float vAlpha;
varying float vViewDepth;

void main() {
    float phase = mod(uTime + uOffset, uPeriod) / uPeriod;
    float alpha = smoothstep(0.0, 0.012, phase) * (1.0 - smoothstep(0.13, 0.18, phase)) * uOpacity;
    vUv = uv;
    vAlpha = alpha;
    vViewDepth = 0.0;
    if (alpha < 0.002) {
        gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
        return;
    }
    float travel = clamp(phase / 0.18, 0.0, 1.0);
    vec3 center = vec3(mix(-34.0, 34.0, travel), mix(18.0, -9.0, travel), -16.0);
    vec4 viewCenter = modelViewMatrix * vec4(center, 1.0);
    vec2 direction = normalize(vec2(1.0, -0.38));
    vec2 perpendicular = vec2(-direction.y, direction.x);
    viewCenter.xy += direction * position.x * 15.0 + perpendicular * position.y * 0.18;
    vViewDepth = -viewCenter.z;
    gl_Position = projectionMatrix * viewCenter;
}
`

const shootingFragment = /* glsl */ `
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
varying vec2 vUv;
varying float vAlpha;
varying float vViewDepth;
void main() {
    float tail = pow(vUv.x, 2.1);
    float core = 1.0 - smoothstep(0.0, 0.5, abs(vUv.y - 0.5) * 2.0);
    float pmFogFactor = clamp((vViewDepth - uFogNear) / max(0.001, uFogFar - uFogNear), 0.0, 1.0);
    float fogAttenuation = 1.0 - pmFogFactor;
    gl_FragColor = vec4(
        mix(vec3(0.28, 0.42, 1.0), vec3(1.0), tail) * fogAttenuation,
        vAlpha * tail * core * fogAttenuation
    );
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
}
`

export function makeShootingStarResource(seed: number): ShootingStarResource {
    const rng = createRng(seed)
    for (let index = 0; index < 401; index += 1) rng.next()
    const geometry = new THREE.PlaneGeometry(1, 1, 1, 1)
    const material = new THREE.ShaderMaterial({
        name: 'OnlyUpShootingStar',
        uniforms: {
            uTime: { value: 0 },
            uOffset: { value: rng.range(0, 9) },
            uPeriod: { value: rng.range(5.5, 9) },
            uOpacity: { value: 0 },
            uFogColor: { value: new THREE.Color() },
            uFogNear: { value: 35 },
            uFogFar: { value: 300 },
        },
        vertexShader: shootingVertex,
        fragmentShader: shootingFragment,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        forceSinglePass: true,
    })
    const mesh = new THREE.Mesh(geometry, material)
    mesh.frustumCulled = false
    mesh.renderOrder = 6
    return { mesh, geometry, material }
}

function ShootingStar({ seed }: { seed: number }): React.ReactNode {
    const scene = useThree((state) => state.scene)
    const resource = useMemo(() => makeShootingStarResource(seed), [seed])

    useEffect(() => () => {
        resource.geometry.dispose()
        resource.material.dispose()
    }, [resource])

    useFrame((state) => {
        syncLinearFog(resource.material, scene)
        resource.mesh.position.copy(livePlayer.pos)
        resource.material.uniforms.uTime.value = state.clock.elapsedTime
        resource.material.uniforms.uOpacity.value = bandOpacity(livePlayer.pos.y, PARTICLE_CONFIGS[3].band)
    })

    return <primitive object={resource.mesh} />
}

export function BiomeParticles({ seed }: { seed: number }): React.ReactNode {
    return (
        <group name="OnlyUpBiomeParticles">
            {PARTICLE_CONFIGS.map((config) => <ParticleField key={config.mode} seed={seed} config={config} />)}
            <ShootingStar seed={seed} />
        </group>
    )
}
