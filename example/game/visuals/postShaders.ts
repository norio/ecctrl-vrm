import * as THREE from 'three'
import type { Node } from 'three/webgpu'
import {
    Fn,
    If,
    clamp,
    convertToTexture,
    dot,
    fract,
    max,
    mix,
    screenCoordinate,
    screenUV,
    smoothstep,
    uniform,
    vec3,
    vec4,
} from 'three/tsl'

export function createColorGradeNode(inputNode: Node) {
    const inputTexture = convertToTexture(inputNode)
    const fogColor = uniform(new THREE.Color())
    const time = uniform(0)
    const fallStrength = uniform(0)

    const outputNode = Fn(() => {
        const fromCenter = screenUV.sub(0.5)
        const color = inputTexture.sample(screenUV).rgb.toVar()

        If(fallStrength.greaterThan(0.001), () => {
            const blurStep = fromCenter.mul(0.018).mul(fallStrength)
            const radialBlur = inputTexture.sample(screenUV.sub(blurStep)).rgb.toVar()
            radialBlur.addAssign(inputTexture.sample(screenUV.sub(blurStep.mul(2))).rgb)
            radialBlur.addAssign(inputTexture.sample(screenUV.sub(blurStep.mul(3))).rgb)
            color.assign(mix(color, radialBlur.div(3), fallStrength.mul(0.42)))
        })

        const luminance = dot(color, vec3(0.2126, 0.7152, 0.0722))
        color.assign(mix(vec3(luminance), color, 1.08))

        const shadowMask = smoothstep(0.025, 0.42, luminance).oneMinus().mul(0.065)
        color.assign(mix(color, fogColor, shadowMask))

        const radius = fromCenter.length().mul(1.4142)
        const vignetteStart = mix(0.56, 0.34, fallStrength)
        const vignetteEnd = mix(1, 0.74, fallStrength)
        const vignette = smoothstep(vignetteStart, vignetteEnd, radius)
        color.mulAssign(vignette.mul(fallStrength.mul(0.28).add(0.25)).oneMinus())

        const hashInput = screenCoordinate.add(fract(time).mul(113))
        const p = fract(vec3(hashInput.x, hashInput.y, hashInput.x).mul(0.1031)).toVar()
        p.addAssign(dot(p, p.yzx.add(33.33)))
        const hash = fract(p.x.add(p.y).mul(p.z))
        const grain = hash.sub(0.5)
            .mul(mix(2.5, 0.7, clamp(luminance, 0, 1)))
            .div(255)
        color.addAssign(grain)

        return vec4(max(color, 0), 1)
    })()

    return { outputNode, inputTexture, fogColor, time, fallStrength }
}
