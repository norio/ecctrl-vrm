import * as THREE from 'three'
import { MeshBasicNodeMaterial } from 'three/webgpu'
import {
    Fn,
    If,
    Loop,
    abs,
    asin,
    atan,
    cameraPosition,
    cameraProjectionMatrix,
    cameraViewMatrix,
    clamp,
    dot,
    exp,
    float,
    floor,
    fract,
    instancedBufferAttribute,
    length,
    mat2,
    max,
    mix,
    modelWorldMatrix,
    normalize,
    positionGeometry,
    positionWorld,
    pow,
    screenCoordinate,
    sin,
    smoothstep,
    step,
    uniform,
    uv,
    varyingProperty,
    vec2,
    vec3,
    vec4,
} from 'three/tsl'

type Vec2Node = ReturnType<typeof vec2>

const SKY_FBM_ROTATION = new THREE.Matrix2(0.8, 0.6, -0.6, 0.8)

const skyHash12 = Fn(([valueImmutable]: readonly [Vec2Node]) => {
    const value = vec2(valueImmutable)
    const point = fract(vec3(value.xyx).mul(0.1031)).toVar()
    point.addAssign(dot(point, point.yzx.add(33.33)))
    return fract(point.x.add(point.y).mul(point.z))
})

const skyNoise = Fn(([pointImmutable]: readonly [Vec2Node]) => {
    const point = vec2(pointImmutable)
    const cell = floor(point)
    const local = fract(point).toVar()
    local.assign(local.mul(local).mul(float(3).sub(local.mul(2))))
    return mix(
        mix(skyHash12(cell), skyHash12(cell.add(vec2(1, 0))), local.x),
        mix(skyHash12(cell.add(vec2(0, 1))), skyHash12(cell.add(vec2(1))), local.x),
        local.y,
    )
})

const skyFbm = Fn(([pointImmutable]: readonly [Vec2Node]) => {
    const point = vec2(pointImmutable).toVar()
    const value = float(0).toVar()
    const amplitude = float(0.5).toVar()
    const rotation = mat2(SKY_FBM_ROTATION)
    Loop({ start: 0, end: 4 }, () => {
        value.addAssign(amplitude.mul(skyNoise(point)))
        point.assign(rotation.mul(point).mul(2.03).add(17.1))
        amplitude.mulAssign(0.5)
    })
    return value
})

const cloudHash12 = Fn(([valueImmutable]: readonly [Vec2Node]) => {
    const value = vec2(valueImmutable)
    return fract(sin(dot(value, vec2(127.1, 311.7))).mul(43758.5453))
})

const cloudNoise = Fn(([pointImmutable]: readonly [Vec2Node]) => {
    const point = vec2(pointImmutable)
    const cell = floor(point)
    const local = fract(point).toVar()
    local.assign(local.mul(local).mul(float(3).sub(local.mul(2))))
    return mix(
        mix(cloudHash12(cell), cloudHash12(cell.add(vec2(1, 0))), local.x),
        mix(cloudHash12(cell.add(vec2(0, 1))), cloudHash12(cell.add(vec2(1))), local.x),
        local.y,
    )
})

const cloudFbm = Fn(([pointImmutable]: readonly [Vec2Node]) => {
    const point = vec2(pointImmutable).toVar()
    const value = float(0).toVar()
    const amplitude = float(0.52).toVar()
    Loop({ start: 0, end: 4 }, () => {
        value.addAssign(cloudNoise(point).mul(amplitude))
        point.assign(point.mul(2.07).add(vec2(13.1, 7.7)))
        amplitude.mulAssign(0.5)
    })
    return value
})

const cumulusHash12 = Fn(([valueImmutable]: readonly [Vec2Node]) => {
    const value = vec2(valueImmutable)
    return fract(sin(dot(value, vec2(41.3, 289.1))).mul(45758.5453))
})

const cumulusNoise = Fn(([pointImmutable]: readonly [Vec2Node]) => {
    const point = vec2(pointImmutable)
    const cell = floor(point)
    const local = fract(point).toVar()
    local.assign(local.mul(local).mul(float(3).sub(local.mul(2))))
    return mix(
        mix(cumulusHash12(cell), cumulusHash12(cell.add(vec2(1, 0))), local.x),
        mix(cumulusHash12(cell.add(vec2(0, 1))), cumulusHash12(cell.add(vec2(1))), local.x),
        local.y,
    )
})

const cumulusFbm = Fn(([pointImmutable]: readonly [Vec2Node]) => {
    const point = vec2(pointImmutable).toVar()
    const value = float(0).toVar()
    const amplitude = float(0.55).toVar()
    Loop({ start: 0, end: 4 }, () => {
        value.addAssign(cumulusNoise(point).mul(amplitude))
        point.assign(point.mul(2.08).add(9.3))
        amplitude.mulAssign(0.5)
    })
    return value
})

function makeNodeMaterial(parameters: THREE.MeshBasicMaterialParameters): MeshBasicNodeMaterial {
    return new MeshBasicNodeMaterial({ ...parameters, fog: false })
}

export function makeSkyMaterial(initial: {
    skyTop: THREE.Color
    skyHorizon: THREE.Color
    fogColor: THREE.Color
    sunColor: THREE.Color
}) {
    const uniforms = {
        uSkyTop: uniform(initial.skyTop.clone()).setName('uSkyTop'),
        uSkyHorizon: uniform(initial.skyHorizon.clone()).setName('uSkyHorizon'),
        uFogColor: uniform(initial.fogColor.clone()).setName('uFogColor'),
        uSunColor: uniform(initial.sunColor.clone()).setName('uSunColor'),
        uSunDirection: uniform(new THREE.Vector3(0, 1, 0)).setName('uSunDirection'),
        uTime: uniform(0).setName('uTime'),
        uStarStrength: uniform(0).setName('uStarStrength'),
        uAuroraStrength: uniform(0).setName('uAuroraStrength'),
        uCosmosStrength: uniform(0).setName('uCosmosStrength'),
        uHazeThickness: uniform(0.075).setName('uHazeThickness'),
        uSkyFlash: uniform(0).setName('uSkyFlash'),
    }
    const material = makeNodeMaterial({ side: THREE.BackSide, depthWrite: false })

    material.colorNode = Fn(() => {
        const direction = normalize(positionWorld.sub(cameraPosition))
        const upperHeight = clamp(direction.y, 0, 1)
        const zenithMix = smoothstep(0, 0.72, upperHeight)
        const skyColor = mix(uniforms.uSkyHorizon, uniforms.uSkyTop, zenithMix).toVar()
        skyColor.mulAssign(mix(0.72, 1, smoothstep(-0.3, 0.12, direction.y)))

        const horizon = exp(abs(direction.y).negate().div(max(0.025, uniforms.uHazeThickness)))
        const hazeNoise = skyFbm(vec2(atan(direction.z, direction.x).mul(2), direction.y.mul(14)))
            .mul(0.22)
            .add(0.78)
        const hazeColor = mix(uniforms.uFogColor, uniforms.uSkyHorizon, 0.5)
        skyColor.assign(mix(skyColor, hazeColor, horizon.mul(hazeNoise).mul(0.22)))

        If(uniforms.uStarStrength.greaterThan(0.001), () => {
            const longitude = atan(direction.z, direction.x).div(6.2831853).add(0.5)
            const latitude = asin(clamp(direction.y, -1, 1)).div(3.1415926).add(0.5)
            const cells = vec2(longitude, latitude).mul(vec2(900, 450))
            const cell = floor(cells)
            const local = fract(cells)
            const seed = skyHash12(cell)
            const starPosition = vec2(skyHash12(cell.add(7.2)), skyHash12(cell.add(19.7)))
            const distanceToStar = length(local.sub(starPosition))
            const point = float(1).sub(smoothstep(0.005, 0.055, distanceToStar)).mul(step(0.955, seed))
            const twinkle = sin(uniforms.uTime.mul(float(1.2).add(seed.mul(3))).add(seed.mul(83)))
                .mul(0.32)
                .add(0.68)
            const stars = point
                .mul(twinkle)
                .mul(mix(0.3, 2.6, pow(seed, 3)))
                .mul(uniforms.uStarStrength)
                .mul(smoothstep(-0.05, 0.2, direction.y))
            skyColor.addAssign(vec3(0.72, 0.82, 1).mul(stars))
        })

        If(uniforms.uCosmosStrength.greaterThan(0.001), () => {
            const milkyUv = vec2(
                direction.x.mul(0.82).add(direction.z.mul(0.57)),
                direction.y.add(direction.z.mul(0.22)).sub(direction.x.mul(0.16)),
            )
            const milkyLine = exp(pow(abs(milkyUv.y.add(milkyUv.x.mul(0.28))).mul(3.8), 2).negate())
            const milkyDetail = smoothstep(0.34, 0.9, skyFbm(milkyUv.mul(vec2(5, 8)).add(12)))
            skyColor.addAssign(
                mix(vec3(0.16, 0.28, 0.62), vec3(0.62, 0.3, 0.72), upperHeight)
                    .mul(milkyLine)
                    .mul(milkyDetail)
                    .mul(uniforms.uCosmosStrength)
                    .mul(0.62),
            )
        })

        If(uniforms.uAuroraStrength.greaterThan(0.001), () => {
            const auroraUv = vec2(
                direction.x.mul(5).add(direction.z.mul(4)).add(uniforms.uTime.mul(0.045)),
                direction.y.mul(2.1),
            )
            const warp = skyFbm(vec2(auroraUv.x.mul(0.7), uniforms.uTime.mul(0.0875))).mul(0.34)
            const ribbonA = exp(abs(
                auroraUv.y.sub(1.05).sub(warp).sub(sin(auroraUv.x.mul(1.7)).mul(0.09)),
            ).mul(-15))
            const ribbonB = exp(abs(
                auroraUv.y.sub(1.28).add(warp.mul(0.4))
                    .sub(sin(auroraUv.x.mul(2.3).add(1.8)).mul(0.07)),
            ).mul(-18))
            const ribbonC = exp(abs(
                auroraUv.y.sub(1.48).sub(warp.mul(0.25))
                    .sub(sin(auroraUv.x.mul(1.2).add(4)).mul(0.1)),
            ).mul(-20))
            const auroraMask = smoothstep(0.08, 0.48, direction.y)
                .mul(float(1).sub(smoothstep(0.8, 1.05, direction.y)))
            const rayNoise = skyFbm(vec2(
                direction.z.mul(6).add(uniforms.uTime.mul(0.04)),
                direction.y.mul(8),
            ))
            const rayStructure = sin(direction.x.mul(40).add(rayNoise.mul(6.2831853)))
                .mul(0.5)
                .add(0.5)
                .mul(0.4)
                .add(0.6)
            const auroraColor = vec3(0.16, 1, 0.72).mul(ribbonA)
                .add(vec3(0.38, 0.62, 1).mul(ribbonB))
                .add(vec3(0.82, 0.3, 1).mul(ribbonC))
            skyColor.addAssign(
                auroraColor
                    .mul(rayStructure)
                    .mul(auroraMask)
                    .mul(uniforms.uAuroraStrength)
                    .mul(skyNoise(auroraUv.mul(2.4)).mul(0.35).add(0.65)),
            )
        })

        const sunDot = dot(direction, normalize(uniforms.uSunDirection))
        const positiveSun = max(sunDot, 0)
        const sunDisc = smoothstep(0.9993, 0.99975, sunDot)
        const sunHalo = pow(positiveSun, 96).mul(0.75)
            .add(pow(positiveSun, 12).mul(0.08))
            .add(pow(positiveSun, 3).mul(0.05))
        skyColor.addAssign(uniforms.uSunColor.mul(sunHalo.add(sunDisc.mul(3.6))))
        skyColor.addAssign(vec3(0.6, 0.7, 1).mul(uniforms.uSkyFlash).mul(0.7))

        const luma = dot(skyColor, vec3(0.2126, 0.7152, 0.0722))
        const dither = skyHash12(screenCoordinate)
            .sub(0.5)
            .mul(mix(2.5, 0.7, clamp(luma, 0, 1)))
            .div(255)
        return max(skyColor.add(dither), 0)
    })()

    return { material, uniforms }
}

export function makeCloudMaterial(layerY: number, phase: number) {
    const uniforms = {
        uColor: uniform(new THREE.Color()).setName('uColor'),
        uTime: uniform(0).setName('uTime'),
        uOpacity: uniform(0).setName('uOpacity'),
        uLayerY: uniform(layerY).setName('uLayerY'),
        uPhase: uniform(phase).setName('uPhase'),
        uSkyFlash: uniform(0).setName('uSkyFlash'),
        uFogColor: uniform(new THREE.Color()).setName('uFogColor'),
        uFogNear: uniform(35).setName('uFogNear'),
        uFogFar: uniform(300).setName('uFogFar'),
    }
    const material = makeNodeMaterial({
        side: THREE.DoubleSide,
        transparent: true,
        depthWrite: false,
    })

    const fragment = Fn(() => {
        const coordinates = uv()
        const centered = coordinates.sub(0.5)
        const speedScale = mix(3, 4, fract(uniforms.uPhase.mul(0.13)))
        const flow = vec2(
            uniforms.uTime.mul(0.0035).mul(speedScale).add(uniforms.uPhase),
            uniforms.uTime.mul(-0.0022).mul(speedScale).add(uniforms.uPhase.mul(0.37)),
        )
        const broad = cloudFbm(coordinates.mul(6).add(flow))
        const detail = cloudNoise(coordinates.mul(18).sub(flow.mul(1.7)))
        const cloud = smoothstep(0.43, 0.78, broad.mul(0.82).add(detail.mul(0.25)))
        const radialFade = float(1).sub(smoothstep(0.36, 0.495, length(centered)))
        const crossingFade = smoothstep(3, 12, abs(cameraPosition.y.sub(uniforms.uLayerY)))
        const alpha = cloud.mul(radialFade).mul(crossingFade).mul(uniforms.uOpacity)
        const litColor = uniforms.uColor.mul(detail.mul(0.42).add(0.78)).toVar()
        litColor.addAssign(vec3(0.58, 0.68, 1).mul(uniforms.uSkyFlash).mul(0.65))
        const viewDepth = length(positionWorld.sub(cameraPosition))
        const fogFactor = clamp(
            viewDepth.sub(uniforms.uFogNear)
                .div(max(0.001, uniforms.uFogFar.sub(uniforms.uFogNear))),
            0,
            1,
        )
        litColor.assign(mix(litColor, uniforms.uFogColor, fogFactor))
        return vec4(litColor, alpha)
    })().toVar('cloudFragment')

    material.colorNode = fragment.rgb
    material.opacityNode = fragment.a
    return { material, uniforms }
}

export function makeCumulusMaterial(geometry: THREE.BufferGeometry) {
    const uniforms = {
        uColor: uniform(new THREE.Color()).setName('uColor'),
        uOpacity: uniform(0).setName('uOpacity'),
        uTime: uniform(0).setName('uTime'),
        uSkyFlash: uniform(0).setName('uSkyFlash'),
        uFogColor: uniform(new THREE.Color()).setName('uFogColor'),
        uFogNear: uniform(35).setName('uFogNear'),
        uFogFar: uniform(300).setName('uFogFar'),
    }
    const material = makeNodeMaterial({
        side: THREE.DoubleSide,
        transparent: true,
        depthWrite: false,
    })
    const center = instancedBufferAttribute(
        geometry.getAttribute('aCenter') as THREE.InstancedBufferAttribute,
        'vec3',
    )
    const scale = instancedBufferAttribute(
        geometry.getAttribute('aScale') as THREE.InstancedBufferAttribute,
        'vec2',
    )
    const phase = instancedBufferAttribute(
        geometry.getAttribute('aPhase') as THREE.InstancedBufferAttribute,
        'float',
    )
    const drift = instancedBufferAttribute(
        geometry.getAttribute('aDrift') as THREE.InstancedBufferAttribute,
        'vec2',
    )
    const vShade = varyingProperty('float', 'vCumulusShade')
    const vViewDepth = varyingProperty('float', 'vCumulusViewDepth')

    material.vertexNode = Fn(() => {
        const worldCenter = modelWorldMatrix.mul(vec4(center, 1)).xyz.toVar()
        const driftOffset = drift.mul(sin(uniforms.uTime.mul(0.035).add(phase)))
        worldCenter.assign(vec3(
            worldCenter.x.add(driftOffset.x),
            worldCenter.y,
            worldCenter.z.add(driftOffset.y),
        ))
        const viewPosition = cameraViewMatrix.mul(vec4(worldCenter, 1)).toVar()
        viewPosition.assign(vec4(
            viewPosition.xy.add(positionGeometry.xy.mul(scale)),
            viewPosition.zw,
        ))
        vShade.assign(sin(phase.add(uniforms.uTime.mul(0.08))).mul(0.18).add(0.82))
        vViewDepth.assign(viewPosition.z.negate())
        return cameraProjectionMatrix.mul(viewPosition)
    })()

    const fragment = Fn(() => {
        const coordinates = uv()
        const point = coordinates.sub(0.5).mul(vec2(1.3, 1.15))
        const body = float(1).sub(smoothstep(0.28, 0.72, length(point)))
        const billow = cumulusFbm(coordinates.mul(5.2).add(vec2(uniforms.uTime.mul(0.006), 0)))
        const baseFade = smoothstep(-0.48, -0.12, point.y)
        const edgeFade = smoothstep(0, 0.08, coordinates.x)
            .mul(smoothstep(0, 0.08, coordinates.y))
            .mul(smoothstep(0, 0.08, float(1).sub(coordinates.x)))
            .mul(smoothstep(0, 0.08, float(1).sub(coordinates.y)))
        const alpha = smoothstep(0.24, 0.68, body.mul(0.72).add(billow.mul(0.48)))
            .mul(baseFade)
            .mul(edgeFade)
            .mul(uniforms.uOpacity)
        const cloudColor = uniforms.uColor.mul(vShade.add(billow.mul(0.18))).toVar()
        cloudColor.addAssign(vec3(0.58, 0.68, 1).mul(uniforms.uSkyFlash).mul(0.55))
        const fogFactor = clamp(
            vViewDepth.sub(uniforms.uFogNear)
                .div(max(0.001, uniforms.uFogFar.sub(uniforms.uFogNear))),
            0,
            1,
        )
        cloudColor.assign(mix(cloudColor, uniforms.uFogColor, fogFactor))
        return vec4(cloudColor, alpha)
    })().toVar('cumulusFragment')

    material.colorNode = fragment.rgb
    material.opacityNode = fragment.a
    return { material, uniforms }
}
