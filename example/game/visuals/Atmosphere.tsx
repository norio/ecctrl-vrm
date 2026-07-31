import * as THREE from 'three'
import React, { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useControls } from 'leva'

import { blendedPalette, type BiomePalette } from '../palette'
import { createRng } from '../prng'
import { livePlayer } from '../useGameStore'
import { evaluateAltitude, sanitizePosition, sunDirectionAt, type AltitudeAtmosphere } from './atmosphereMath'
import { makeCloudMaterial, makeCumulusMaterial, makeSkyMaterial } from './atmosphereNodes'

const CLOUD_LAYERS = [
    { y: 96, phase: 0.0, opacity: 0.72 },
    { y: 104, phase: 8.1, opacity: 0.68 },
    { y: 112, phase: 16.9, opacity: 0.64 },
    { y: 124, phase: 25.6, opacity: 0.58 },
    { y: 139, phase: 34.4, opacity: 0.5 },
    { y: 152, phase: 43.1, opacity: 0.44 },
    { y: 162, phase: 51.9, opacity: 0.4 },
    { y: 178, phase: 60.7, opacity: 0.35 },
    { y: 200, phase: 69.5, opacity: 0.82 },
    { y: 240, phase: 78.2, opacity: 0.78 },
    { y: 280, phase: 86.8, opacity: 0.72 },
]
const CUMULUS_COUNT = 160
const STORM_LAYER_START = 8
const BOLT_POINT_COUNT = 6
const BOLT_START_HEIGHTS = [200, 240, 280]
const LIGHTNING_COLOR = new THREE.Color('#cfe0ff')
const STORM_CLOUD_COLOR = new THREE.Color('#10131f')
const CLOUD_WHITE = new THREE.Color('#ffffff')
const LIGHTNING_FLASH_ATTACK_SECONDS = 0.04
const LIGHTNING_FLASH_DECAY_SECONDS = 0.25
const LIGHTNING_FLASH_CUTOFF_START_SECONDS = 0.3
const LIGHTNING_FLASH_DURATION_SECONDS = 0.4

function makeCumulusResources() {
    const geometry = new THREE.PlaneGeometry(1, 1)
    const phases = new Float32Array(CUMULUS_COUNT)
    const drift = new Float32Array(CUMULUS_COUNT * 2)
    const centers = new Float32Array(CUMULUS_COUNT * 3)
    const scales = new Float32Array(CUMULUS_COUNT * 2)
    const matrices = new Float32Array(CUMULUS_COUNT * 16)
    const dummy = new THREE.Object3D()
    const rng = createRng(0x51c0a7)

    for (let index = 0; index < CUMULUS_COUNT; index += 1) {
        const angle = rng.range(0, Math.PI * 2)
        const radius = rng.range(120, 400)
        const phase = rng.range(0, Math.PI * 2)
        dummy.position.set(Math.cos(angle) * radius, rng.range(88, 190), Math.sin(angle) * radius)
        const width = rng.range(24, 58)
        dummy.scale.set(width, width * rng.range(0.75, 0.9), 1)
        dummy.updateMatrix()
        dummy.matrix.toArray(matrices, index * 16)
        dummy.position.toArray(centers, index * 3)
        scales[index * 2] = dummy.scale.x
        scales[index * 2 + 1] = dummy.scale.y
        phases[index] = phase
        drift[index * 2] = Math.cos(angle + Math.PI * 0.5) * rng.range(8, 24)
        drift[index * 2 + 1] = Math.sin(angle + Math.PI * 0.5) * rng.range(8, 24)
    }

    geometry.setAttribute('aCenter', new THREE.InstancedBufferAttribute(centers, 3))
    geometry.setAttribute('aScale', new THREE.InstancedBufferAttribute(scales, 2))
    geometry.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phases, 1))
    geometry.setAttribute('aDrift', new THREE.InstancedBufferAttribute(drift, 2))
    const nodeMaterial = makeCumulusMaterial(geometry)
    return { geometry, ...nodeMaterial, matrices }
}

function makeLightningResources() {
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(BOLT_POINT_COUNT * 3), 3))
    const material = new THREE.LineBasicMaterial({
        color: LIGHTNING_COLOR,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
    })
    const line = new THREE.Line(geometry, material)
    line.name = 'OnlyUpLightningBolt'
    line.frustumCulled = false
    line.renderOrder = 7
    line.visible = false
    return { geometry, material, line }
}

export function Atmosphere(): React.ReactNode {
    const scene = useThree((state) => state.scene)
    const camera = useThree((state) => state.camera)
    const { clouds } = useControls('Quality', { clouds: true })
    const skyRef = useRef<THREE.Mesh>(null)
    const cloudGroupRef = useRef<THREE.Group>(null)
    const cumulusRef = useRef<THREE.InstancedMesh>(null)
    const lightRef = useRef<THREE.DirectionalLight>(null)
    const ambientRef = useRef<THREE.AmbientLight>(null)
    const keyLightRef = useRef<THREE.PointLight>(null)
    const targetRef = useRef<THREE.Object3D>(null)
    const hemisphereRef = useRef<THREE.HemisphereLight>(null)
    const safePlayer = useMemo(() => new THREE.Vector3(0, 1, 0), [])
    const safeCamera = useMemo(() => new THREE.Vector3(0, 1, 0), [])
    const sunDirection = useMemo(() => new THREE.Vector3(), [])
    const cameraForward = useMemo(() => new THREE.Vector3(), [])
    const cameraLeft = useMemo(() => new THREE.Vector3(), [])
    const palette = useMemo(() => blendedPalette(1), [])
    const altitude = useMemo<AltitudeAtmosphere>(() => ({
        fogNear: 35,
        fogFar: 300,
        hazeThickness: 0.075,
        cloudOpacity: 0.3,
        starStrength: 0,
        auroraStrength: 0,
        cosmosStrength: 0,
        stormStrength: 0,
    }), [])
    const fog = useMemo(() => new THREE.Fog(palette.fog, 35, 300), [palette])
    const background = useMemo(() => palette.skyHorizon.clone(), [palette])
    const lightningRng = useMemo(() => createRng(0x71a4f11), [])
    const lightning = useRef({ nextAt: 8, startedAt: Number.NEGATIVE_INFINITY })
    const cloudGeometry = useMemo(() => new THREE.CircleGeometry(600, 64), [])
    const cloudsResources = useMemo(
        () => CLOUD_LAYERS.map((layer) => makeCloudMaterial(layer.y, layer.phase)),
        [],
    )
    const cloudPalettes = useMemo<BiomePalette[]>(() => CLOUD_LAYERS.map((layer) => blendedPalette(layer.y)), [])
    const cumulus = useMemo(makeCumulusResources, [])
    const lightningBolt = useMemo(makeLightningResources, [])
    const sky = useMemo(() => makeSkyMaterial({
        skyTop: palette.skyTop,
        skyHorizon: palette.skyHorizon,
        fogColor: palette.fog,
        sunColor: palette.sunColor,
    }), [palette])

    useLayoutEffect(() => {
        const light = lightRef.current
        const target = targetRef.current
        const keyLight = keyLightRef.current
        const cumulusMesh = cumulusRef.current
        if (light && target) light.target = target
        if (keyLight) keyLight.layers.set(1)
        camera.layers.enable(1)
        if (cumulusMesh) {
            const instanceArray = cumulusMesh.instanceMatrix.array as Float32Array
            instanceArray.set(cumulus.matrices)
            cumulusMesh.instanceMatrix.needsUpdate = true
        }
    }, [camera, clouds, cumulus.matrices])

    useEffect(() => {
        const previousFog = scene.fog
        const previousBackground = scene.background
        scene.fog = fog
        scene.background = background
        return () => {
            if (scene.fog === fog) scene.fog = previousFog
            if (scene.background === background) scene.background = previousBackground
        }
    }, [background, fog, scene])

    useEffect(() => () => {
        sky.material.dispose()
        cloudGeometry.dispose()
        for (const cloud of cloudsResources) cloud.material.dispose()
        cumulus.geometry.dispose()
        cumulus.material.dispose()
        lightningBolt.geometry.dispose()
        lightningBolt.material.dispose()
    }, [cloudGeometry, cloudsResources, cumulus, lightningBolt, sky])

    useFrame((state) => {
        sanitizePosition(livePlayer.pos, safePlayer)
        sanitizePosition(state.camera.position, safeCamera)
        const safeY = safePlayer.y
        blendedPalette(safeY, palette)
        evaluateAltitude(safeY, altitude)
        sunDirectionAt(safeY, sunDirection)

        const elapsed = state.clock.elapsedTime
        const skyMesh = skyRef.current
        if (skyMesh) skyMesh.position.copy(safeCamera)
        const cloudGroup = cloudGroupRef.current
        if (cloudGroup) cloudGroup.position.set(safePlayer.x, 0, safePlayer.z)
        lightningBolt.line.position.set(safePlayer.x, 0, safePlayer.z)

        sky.uniforms.uSkyTop.value.copy(palette.skyTop)
        sky.uniforms.uSkyHorizon.value.copy(palette.skyHorizon)
        sky.uniforms.uFogColor.value.copy(palette.fog)
        sky.uniforms.uSunColor.value.copy(palette.sunColor)
        sky.uniforms.uSunDirection.value.copy(sunDirection)
        sky.uniforms.uTime.value = elapsed
        sky.uniforms.uStarStrength.value = altitude.starStrength
        sky.uniforms.uAuroraStrength.value = altitude.auroraStrength
        sky.uniforms.uCosmosStrength.value = altitude.cosmosStrength
        sky.uniforms.uHazeThickness.value = altitude.hazeThickness

        fog.color.copy(palette.fog)
        fog.near = altitude.fogNear
        fog.far = altitude.fogFar
        background.copy(palette.skyHorizon).lerp(palette.skyTop, 0.12)

        for (let index = 0; index < cloudsResources.length; index += 1) {
            const uniforms = cloudsResources[index].uniforms
            const layerPalette = cloudPalettes[index]
            blendedPalette(CLOUD_LAYERS[index].y, layerPalette)
            if (index >= STORM_LAYER_START) {
                uniforms.uColor.value.copy(layerPalette.fog).lerp(STORM_CLOUD_COLOR, 0.68)
            } else {
                uniforms.uColor.value.copy(layerPalette.fog)
                    .lerp(layerPalette.skyHorizon, 0.42)
                    .lerp(CLOUD_WHITE, 0.32)
            }
            uniforms.uTime.value = elapsed
            uniforms.uOpacity.value = altitude.cloudOpacity * CLOUD_LAYERS[index].opacity
            uniforms.uFogColor.value.copy(fog.color)
            uniforms.uFogNear.value = fog.near
            uniforms.uFogFar.value = fog.far
        }
        cumulus.uniforms.uColor.value.copy(palette.fog).lerp(palette.skyHorizon, 0.5)
        cumulus.uniforms.uOpacity.value = altitude.cloudOpacity * 0.86
        cumulus.uniforms.uTime.value = elapsed
        cumulus.uniforms.uFogColor.value.copy(fog.color)
        cumulus.uniforms.uFogNear.value = fog.near
        cumulus.uniforms.uFogFar.value = fog.far

        let flash = 0
        if (altitude.stormStrength > 0.05 && elapsed >= lightning.current.nextAt) {
            lightning.current.startedAt = elapsed
            lightning.current.nextAt = elapsed + lightningRng.range(2.5, 6)
            const positions = lightningBolt.geometry.getAttribute('position') as THREE.BufferAttribute
            const startX = lightningRng.range(-24, 24)
            const startZ = lightningRng.range(-24, 24)
            const endX = startX + lightningRng.range(-8, 8)
            const endZ = startZ + lightningRng.range(-8, 8)
            const startY = lightningRng.pick(BOLT_START_HEIGHTS)
            const drop = lightningRng.range(38, 72)
            for (let index = 0; index < BOLT_POINT_COUNT; index += 1) {
                const t = index / (BOLT_POINT_COUNT - 1)
                const jitter = index === 0 || index === BOLT_POINT_COUNT - 1 ? 0 : 1
                positions.setXYZ(
                    index,
                    THREE.MathUtils.lerp(startX, endX, t) + lightningRng.range(-4, 4) * jitter,
                    startY - drop * t,
                    THREE.MathUtils.lerp(startZ, endZ, t) + lightningRng.range(-4, 4) * jitter,
                )
            }
            positions.needsUpdate = true
        }
        const flashAge = elapsed - lightning.current.startedAt
        if (flashAge >= 0 && flashAge < LIGHTNING_FLASH_DURATION_SECONDS) {
            const attack = THREE.MathUtils.smoothstep(flashAge, 0, LIGHTNING_FLASH_ATTACK_SECONDS)
            const decayAge = Math.max(0, flashAge - LIGHTNING_FLASH_ATTACK_SECONDS)
            const decay = Math.exp(-decayAge / LIGHTNING_FLASH_DECAY_SECONDS)
            const cutoff = 1 - THREE.MathUtils.smoothstep(
                flashAge,
                LIGHTNING_FLASH_CUTOFF_START_SECONDS,
                LIGHTNING_FLASH_DURATION_SECONDS,
            )
            flash = attack * decay * cutoff * altitude.stormStrength
        }
        sky.uniforms.uSkyFlash.value = flash
        for (const cloud of cloudsResources) cloud.uniforms.uSkyFlash.value = flash
        cumulus.uniforms.uSkyFlash.value = flash
        lightningBolt.line.visible = altitude.stormStrength > 0.05 && flashAge >= 0 && flashAge < 0.2
        lightningBolt.material.opacity = lightningBolt.line.visible
            ? (1 - flashAge / 0.2) * altitude.stormStrength
            : 0

        const light = lightRef.current
        const target = targetRef.current
        if (light && target) {
            light.color.copy(palette.sunColor).lerp(LIGHTNING_COLOR, flash * 0.35)
            light.intensity = palette.sunIntensity * (1 + flash * 2.2)
            light.position.copy(sunDirection).multiplyScalar(90).add(safePlayer)
            target.position.copy(safePlayer)
            target.updateMatrixWorld()
        }
        const hemisphere = hemisphereRef.current
        if (hemisphere) {
            hemisphere.color.copy(palette.hemiSky).lerp(LIGHTNING_COLOR, flash * 0.28)
            hemisphere.groundColor.copy(palette.hemiGround)
            hemisphere.intensity = palette.hemiIntensity * (1 + flash * 1.5)
        }
        const ambient = ambientRef.current
        if (ambient) {
            ambient.color.copy(palette.skyHorizon)
            ambient.intensity = THREE.MathUtils.lerp(
                0.25,
                0.4,
                THREE.MathUtils.smoothstep(safeY, 80, 120),
            )
        }
        const keyLight = keyLightRef.current
        if (keyLight) {
            camera.getWorldDirection(cameraForward)
            cameraLeft.crossVectors(camera.up, cameraForward).normalize()
            keyLight.position.copy(safeCamera)
                .addScaledVector(camera.up, 2)
                .addScaledVector(cameraLeft, 2)
            keyLight.color.copy(palette.skyHorizon)
        }
    })

    return (
        <>
            <mesh ref={skyRef} material={sky.material} renderOrder={-1000} frustumCulled={false}>
                <sphereGeometry args={[750, 32, 20]} />
            </mesh>
            {clouds && (
                <group ref={cloudGroupRef}>
                    {CLOUD_LAYERS.map((layer, index) => (
                        <mesh
                            key={layer.y}
                            geometry={cloudGeometry}
                            material={cloudsResources[index].material}
                            position-y={layer.y}
                            rotation-x={-Math.PI * 0.5}
                            renderOrder={-20 + index}
                            frustumCulled={false}
                        />
                    ))}
                    <instancedMesh
                        ref={cumulusRef}
                        args={[cumulus.geometry, cumulus.material, CUMULUS_COUNT]}
                        frustumCulled={false}
                        renderOrder={-10}
                    />
                </group>
            )}
            <primitive object={lightningBolt.line} />
            <object3D ref={targetRef} />
            <directionalLight
                ref={lightRef}
                castShadow
                shadow-mapSize-width={2048}
                shadow-mapSize-height={2048}
                shadow-camera-left={-38}
                shadow-camera-right={38}
                shadow-camera-top={38}
                shadow-camera-bottom={-38}
                shadow-camera-near={1}
                shadow-camera-far={180}
                shadow-bias={-0.001}
                shadow-normalBias={0.035}
            />
            <hemisphereLight ref={hemisphereRef} />
            <ambientLight ref={ambientRef} intensity={0.4} />
            <pointLight ref={keyLightRef} intensity={2.5} decay={2} castShadow={false} />
        </>
    )
}
