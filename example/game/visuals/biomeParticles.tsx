import * as THREE from 'three'
import { MeshBasicNodeMaterial, PointsNodeMaterial } from 'three/webgpu'
import {
    Discard,
    Fn,
    abs,
    cameraProjectionMatrix,
    clamp,
    color,
    cos,
    float,
    fract,
    instancedBufferAttribute,
    length,
    max,
    mix,
    modelViewMatrix,
    modelWorldMatrix,
    positionGeometry,
    positionView,
    pow,
    rotate,
    // @ts-expect-error three 0.184 exports screenDPR but omits it from Three.TSL.d.ts
    screenDPR,
    select,
    sin,
    smoothstep,
    uniform,
    uv,
    varying,
    vec2,
    vec3,
    vec4,
} from 'three/tsl'
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
    points: THREE.Sprite
    material: PointsNodeMaterial
    uniforms: ParticleUniforms
}

export interface ShootingStarResource {
    mesh: THREE.Mesh
    geometry: THREE.PlaneGeometry
    material: MeshBasicNodeMaterial
    uniforms: ShootingStarUniforms
}

interface FogUniforms {
    fogColor: { value: THREE.Color }
    fogNear: { value: number }
    fogFar: { value: number }
}

interface ParticleUniforms extends FogUniforms {
    time: { value: number }
    opacity: { value: number }
}

interface ShootingStarUniforms extends FogUniforms {
    time: { value: number }
    opacity: { value: number }
}

export const PARTICLE_CONFIGS: ParticleConfig[] = [
    { mode: 'meadow', modeIndex: 0, count: 700, offset: 31, box: new THREE.Vector3(34, 24, 34), color: BIOMES[0].palette.particle.clone(), band: new THREE.Vector2(BIOMES[0].minY, BIOMES[0].maxY) },
    { mode: 'clouds', modeIndex: 1, count: 700, offset: 79, box: new THREE.Vector3(40, 30, 40), color: BIOMES[1].palette.particle.clone(), band: new THREE.Vector2(BIOMES[1].minY, BIOMES[1].maxY) },
    { mode: 'storm', modeIndex: 2, count: 900, offset: 137, box: new THREE.Vector3(42, 34, 42), color: BIOMES[2].palette.particle.clone(), band: new THREE.Vector2(BIOMES[2].minY, BIOMES[2].maxY) },
    { mode: 'cosmos', modeIndex: 3, count: 700, offset: 211, box: new THREE.Vector3(48, 38, 48), color: BIOMES[3].palette.particle.clone(), band: new THREE.Vector2(BIOMES[3].minY, BIOMES[3].maxY) },
    { mode: 'fall', modeIndex: 4, count: 500, offset: 293, box: new THREE.Vector3(22, 18, 22), color: new THREE.Color('#d7e8ff'), band: new THREE.Vector2(-10000, 10000) },
]

export const BIOME_PARTICLE_POINT_COUNT = PARTICLE_CONFIGS.reduce((sum, config) => sum + config.count, 0)

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

    const position = instancedBufferAttribute(new THREE.InstancedBufferAttribute(positions, 3))
    const particleSeed = instancedBufferAttribute(new THREE.InstancedBufferAttribute(seeds, 1))
    const particleType = instancedBufferAttribute(new THREE.InstancedBufferAttribute(types, 1))
    const time = uniform(0)
    const opacity = uniform(0)
    const fogColor = uniform(new THREE.Color())
    const fogNear = uniform(35)
    const fogFar = uniform(300)
    const box = vec3(config.box)
    const band = vec2(config.band)
    const stateNode = Fn(() => {
        const local = vec3(position).toVar()
        const size = float(5).toVar()
        if (config.mode === 'meadow') {
            const drift = vec3(
                sin(particleSeed.mul(19)).mul(0.18),
                particleSeed.mul(0.2).add(0.42),
                cos(particleSeed.mul(13)).mul(0.15),
            )
            const wrapped = local.add(drift.mul(time)).add(box.mul(0.5)).mod(box).sub(box.mul(0.5))
            local.assign(vec3(
                wrapped.x.add(sin(time.mul(0.35).add(particleSeed.mul(23))).mul(0.45)),
                wrapped.y,
                wrapped.z,
            ))
            size.assign(mix(3.5, 7, particleType))
        } else if (config.mode === 'clouds') {
            const drift = vec3(particleSeed.mul(0.15).add(0.24), 0.18, -0.08).mul(time)
            const wrapped = local.add(drift).add(box.mul(0.5)).mod(box).sub(box.mul(0.5))
            local.assign(vec3(
                wrapped.x.add(sin(time.mul(0.28).add(particleSeed.mul(17))).mul(0.8)),
                wrapped.y,
                wrapped.z.add(cos(time.mul(0.2).add(particleSeed.mul(11))).mul(0.8)),
            ))
            size.assign(mix(5, 9, particleType))
        } else if (config.mode === 'storm') {
            const rain = particleType.lessThanEqual(0.5)
            const speed = select(rain, vec3(-5.6, -24, 2.4), vec3(-1.8, 1.1, 0.7))
            const travelScale = mix(0.35, 1, particleType.oneMinus())
            const travel = speed.mul(time).mul(travelScale)
            const windPhase = particleSeed.mul(Math.PI * 2)
            const integratedSway = cos(windPhase).sub(cos(time.mul(0.7).add(windPhase)))
                .mul(0.1 / 0.7).mul(travelScale)
            const rainTravel = travel.add(vec3(
                speed.z.negate().mul(integratedSway),
                0,
                speed.x.mul(integratedSway),
            ))
            const wrapped = local.add(select(rain, rainTravel, travel))
                .add(box.mul(0.5)).mod(box).sub(box.mul(0.5))
            local.assign(wrapped)
            size.assign(select(rain, mix(12, 26, particleSeed), 7))
        } else if (config.mode === 'cosmos') {
            const drift = vec3(-0.09, particleSeed.mul(0.12).add(0.06), 0.11).mul(time)
            const wrapped = local.add(drift).add(box.mul(0.5)).mod(box).sub(box.mul(0.5))
            const direction = vec3(
                sin(particleSeed.mul(31)),
                cos(particleSeed.mul(17)),
                sin(particleSeed.mul(7)),
            ).normalize()
            local.assign(wrapped.add(direction.mul(
                sin(time.mul(0.18).add(particleSeed.mul(40))).mul(0.5),
            )))
            size.assign(mix(1.2, 3.2, particleType))
        } else {
            const direction = position.xz.add(vec2(0.001)).normalize()
            const cycle = fract(time.mul(particleSeed.mul(0.32).add(0.55)).add(particleSeed))
            const radius = cycle.mul(9).add(2.4)
            local.assign(vec3(
                direction.x.mul(radius),
                particleType.sub(0.5).mul(9).add(cycle.mul(2.5)),
                direction.y.mul(radius),
            ))
            size.assign(cycle.mul(12).add(18))
        }
        return vec4(local, size)
    })()
    const local = stateNode.xyz
    const size = stateNode.w
    const material = new PointsNodeMaterial()
    material.name = `OnlyUpParticles-${config.mode}`
    material.transparent = true
    material.depthWrite = false
    material.blending = THREE.AdditiveBlending
    material.fog = false
    material.sizeAttenuation = false
    material.alphaToCoverage = false
    material.positionNode = local
    const viewDepth = varying(positionView.z.negate())
    const pixelSize = clamp(size.mul(72).div(max(1, viewDepth)), 1, 38).div(screenDPR)
    material.sizeNode = vec2(select(opacity.lessThan(0.002), 0, pixelSize))
    const worldY = modelWorldMatrix.mul(vec4(local, 1)).y
    const bandMask = smoothstep(band.x.sub(8), band.x.add(8), worldY)
        .mul(smoothstep(band.y.sub(8), band.y.add(8), worldY).oneMinus())
    const windAngle = varying(sin(time.mul(0.7).add(particleSeed.mul(Math.PI * 2))).mul(0.1))
    const baseOpacity = opacity.mul(bandMask)
    const rainFade = mix(0.35, 1, particleSeed).mul(smoothstep(0, 6, viewDepth))
    const particleOpacity = config.mode === 'storm'
        ? baseOpacity.mul(select(particleType.lessThanEqual(0.5), rainFade, 1))
        : baseOpacity
    const type = varying(particleType)
    const alpha = varying(particleOpacity)
    const centered = positionGeometry.xy
    const baseDistance = length(centered)
    const rain = rotate(centered, windAngle.sub(0.24).negate())
    const distanceToCenter = config.mode === 'storm'
        ? select(type.lessThan(0.5), length(rain.mul(vec2(7.5, 1))), baseDistance)
        : config.mode === 'fall'
            ? length(centered.mul(vec2(7, 1)))
            : config.mode === 'clouds'
                ? select(type.greaterThan(0.58), length(centered.mul(vec2(1, 2.6))), baseDistance)
                : baseDistance
    const soft = smoothstep(0.16, 0.5, distanceToCenter).oneMinus()
    const fogAttenuation = clamp(
        viewDepth.sub(fogNear).div(max(0.001, fogFar.sub(fogNear))),
        0,
        1,
    ).oneMinus()
    const baseColor = color(config.color)
    const particleColor = config.mode === 'storm'
        ? select(type.greaterThan(0.5), vec3(0.28, 0.68, 1).mul(2.2), baseColor)
        : config.mode === 'cosmos'
            ? baseColor.mul(mix(0.8, 2.2, type))
            : baseColor
    const finalAlpha = soft.mul(alpha).mul(mix(0.42, 1, type)).mul(fogAttenuation)
    material.colorNode = Fn(() => {
        Discard(distanceToCenter.greaterThan(0.5).or(alpha.lessThan(0.002)))
        return particleColor.mul(fogAttenuation)
    })()
    material.opacityNode = finalAlpha
    const points = new THREE.Sprite(material as unknown as THREE.SpriteMaterial)
    points.count = config.count
    points.name = material.name
    points.frustumCulled = false
    points.renderOrder = 5
    return { points, material, uniforms: { time, opacity, fogColor, fogNear, fogFar } }
}

function bandOpacity(y: number, band: THREE.Vector2): number {
    const distance = y < band.x ? band.x - y : y > band.y ? y - band.y : 0
    return 1 - THREE.MathUtils.smoothstep(distance, 12, 48)
}

function syncLinearFog(uniforms: FogUniforms, scene: THREE.Scene) {
    if (!(scene.fog instanceof THREE.Fog)) return
    uniforms.fogColor.value.copy(scene.fog.color)
    uniforms.fogNear.value = scene.fog.near
    uniforms.fogFar.value = scene.fog.far
}

function ParticleField({ seed, config }: { seed: number; config: ParticleConfig }): React.ReactNode {
    const scene = useThree((state) => state.scene)
    const resource = useMemo(() => makeParticleResource(seed, config), [config, seed])
    const fallOpacity = useRef(0)

    useEffect(() => () => {
        resource.material.dispose()
    }, [resource])

    useFrame((state, delta) => {
        const uniforms = resource.uniforms
        syncLinearFog(uniforms, scene)
        uniforms.time.value = state.clock.elapsedTime
        resource.points.position.copy(livePlayer.pos)
        if (config.mode === 'fall') {
            const target = THREE.MathUtils.smoothstep(-livePlayer.velY, 14, 32)
            fallOpacity.current = THREE.MathUtils.damp(fallOpacity.current, target, 9, delta)
            uniforms.opacity.value = fallOpacity.current
        } else {
            uniforms.opacity.value = bandOpacity(livePlayer.pos.y, config.band)
        }
    })

    return <primitive object={resource.points} />
}

export function makeShootingStarResource(seed: number): ShootingStarResource {
    const rng = createRng(seed)
    for (let index = 0; index < 401; index += 1) rng.next()
    const geometry = new THREE.PlaneGeometry(1, 1, 1, 1)
    const time = uniform(0)
    const offset = uniform(rng.range(0, 9))
    const period = uniform(rng.range(5.5, 9))
    const opacity = uniform(0)
    const fogColor = uniform(new THREE.Color())
    const fogNear = uniform(35)
    const fogFar = uniform(300)
    const phase = time.add(offset).mod(period).div(period)
    const alpha = smoothstep(0, 0.012, phase)
        .mul(smoothstep(0.13, 0.18, phase).oneMinus())
        .mul(opacity)
    const travel = clamp(phase.div(0.18), 0, 1)
    const center = vec3(mix(-34, 34, travel), mix(18, -9, travel), -16)
    const viewCenter = modelViewMatrix.mul(vec4(center, 1))
    const direction = vec2(1, -0.38).normalize()
    const perpendicular = vec2(direction.y.negate(), direction.x)
    const displacedView = vec4(
        viewCenter.xy
            .add(direction.mul(positionGeometry.x).mul(15))
            .add(perpendicular.mul(positionGeometry.y).mul(0.18)),
        viewCenter.z,
        viewCenter.w,
    )
    const viewDepth = varying(viewCenter.z.negate())
    const starUv = uv()
    const tail = pow(starUv.x, 2.1)
    const core = smoothstep(0, 0.5, abs(starUv.y.sub(0.5)).mul(2)).oneMinus()
    const fogAttenuation = clamp(
        viewDepth.sub(fogNear).div(max(0.001, fogFar.sub(fogNear))),
        0,
        1,
    ).oneMinus()
    const material = new MeshBasicNodeMaterial()
    material.name = 'OnlyUpShootingStar'
    material.transparent = true
    material.depthWrite = false
    material.blending = THREE.AdditiveBlending
    material.side = THREE.DoubleSide
    material.forceSinglePass = true
    material.fog = false
    material.vertexNode = select(
        alpha.lessThan(0.002),
        vec4(2, 2, 2, 1),
        cameraProjectionMatrix.mul(displacedView),
    )
    material.colorNode = Fn(() => {
        Discard(alpha.lessThan(0.002))
        return mix(vec3(0.28, 0.42, 1), vec3(1), tail).mul(fogAttenuation)
    })()
    material.opacityNode = alpha.mul(tail).mul(core).mul(fogAttenuation)
    const mesh = new THREE.Mesh(geometry, material)
    mesh.frustumCulled = false
    mesh.renderOrder = 6
    return { mesh, geometry, material, uniforms: { time, opacity, fogColor, fogNear, fogFar } }
}

function ShootingStar({ seed }: { seed: number }): React.ReactNode {
    const scene = useThree((state) => state.scene)
    const resource = useMemo(() => makeShootingStarResource(seed), [seed])

    useEffect(() => () => {
        resource.geometry.dispose()
        resource.material.dispose()
    }, [resource])

    useFrame((state) => {
        syncLinearFog(resource.uniforms, scene)
        resource.mesh.position.copy(livePlayer.pos)
        resource.uniforms.time.value = state.clock.elapsedTime
        resource.uniforms.opacity.value = bandOpacity(livePlayer.pos.y, PARTICLE_CONFIGS[3].band)
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
