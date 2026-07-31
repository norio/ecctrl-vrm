import * as THREE from 'three'
import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useControls } from 'leva'
// @ts-expect-error @types/three@0.179 predates the runtime r184 RenderPipeline export.
import { RenderPipeline, type Node, type WebGPURenderer } from 'three/webgpu'
import {
    Fn,
    add,
    all,
    clamp,
    convertToTexture,
    equal,
    mul,
    pass,
    renderOutput,
    vec3,
    vec4,
} from 'three/tsl'
import { ao } from 'three/addons/tsl/display/GTAONode.js'
import { bloom as bloomNode } from 'three/addons/tsl/display/BloomNode.js'
import { smaa as smaaNode } from 'three/addons/tsl/display/SMAANode.js'

import { blendedPalette } from '../palette'
import { livePlayer } from '../useGameStore'
import { sanitizePosition } from './atmosphereMath'
import { createColorGradeNode } from './postShaders'

function sanitizeBloomInput(inputNode: Node) {
    return Fn(() => {
        const texel = vec4(inputNode).toVar()
        const bounded = vec4(clamp(texel.rgb, 0, 64), texel.a)
        return all(equal(texel, texel)).select(bounded, vec4(0))
    })()
}

function makePostProcessing(
    renderer: WebGPURenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    enabled: { bloom: boolean; smaa: boolean; gtao: boolean },
) {
    const scenePass = pass(scene, camera, { samples: 0 })
    const sceneColor = scenePass.getTextureNode('output')
    const sceneDepth = scenePass.getTextureNode('depth')
    const gtaoPass = enabled.gtao
        // Runtime r184 supports null to reconstruct normals from beauty-pass depth.
        ? ao(sceneDepth, null as unknown as Node, camera)
        : null

    let colorNode: Node = sceneColor
    if (gtaoPass) {
        const ambientOcclusion = gtaoPass.getTextureNode().r
        colorNode = mul(colorNode, vec4(vec3(ambientOcclusion), 1))
    }

    const bloomPass = enabled.bloom
        ? bloomNode(sanitizeBloomInput(colorNode), 0.42, 0.7, 0.95)
        : null
    if (bloomPass) colorNode = add(colorNode, bloomPass)

    const smaaInput = enabled.smaa ? convertToTexture(colorNode) : null
    const smaaPass = smaaInput ? smaaNode(smaaInput) : null
    if (smaaPass) colorNode = smaaPass

    const grade = createColorGradeNode(colorNode)
    const renderPipeline = new RenderPipeline(renderer)
    renderPipeline.outputColorTransform = false
    renderPipeline.outputNode = renderOutput(grade.outputNode)

    return { renderPipeline, scenePass, gtaoPass, bloomPass, smaaPass, smaaInput, grade }
}

function disposePostProcessing(pipeline: ReturnType<typeof makePostProcessing>): void {
    pipeline.renderPipeline.dispose()
    pipeline.grade.inputTexture.renderTarget?.dispose()
    pipeline.grade.inputTexture.dispose()
    pipeline.smaaInput?.renderTarget?.dispose()
    pipeline.smaaInput?.dispose()
    pipeline.smaaPass?.dispose()
    pipeline.bloomPass?.dispose()
    pipeline.gtaoPass?.dispose()
    pipeline.scenePass.dispose()
}

export function GameEffects(): React.ReactNode {
    const renderer = useThree((state) => state.gl) as unknown as WebGPURenderer
    const scene = useThree((state) => state.scene)
    const camera = useThree((state) => state.camera)
    const size = useThree((state) => state.size)
    const pixelRatio = useThree((state) => state.viewport.dpr)
    const { bloom, smaa, gtao, aoScale } = useControls('Quality', {
        bloom: true,
        smaa: true,
        gtao: true,
        aoScale: { value: 0.5, min: 0.25, max: 1, step: 0.05 },
    })
    const pipeline = useMemo(
        () => makePostProcessing(renderer, scene, camera, { bloom, smaa, gtao }),
        [bloom, camera, gtao, renderer, scene, smaa],
    )
    const palette = useMemo(() => blendedPalette(1), [])
    const safePlayer = useMemo(() => new THREE.Vector3(0, 1, 0), [])
    const fallStrength = useRef(0)

    useEffect(() => {
        renderer.toneMappingExposure = 0.88
    }, [renderer])

    useEffect(() => {
        if (!pipeline.gtaoPass) return
        pipeline.gtaoPass.resolutionScale = aoScale
        pipeline.gtaoPass.setSize(size.width * pixelRatio, size.height * pixelRatio)
    }, [aoScale, pipeline, pixelRatio, size.height, size.width])

    useEffect(() => () => disposePostProcessing(pipeline), [pipeline])

    useFrame((state, delta) => {
        sanitizePosition(livePlayer.pos, safePlayer)
        blendedPalette(safePlayer.y, palette)

        const fallTarget = livePlayer.velY < -14 ? 1 : 0
        const response = 1 - Math.exp(-delta * (fallTarget > fallStrength.current ? 6 : 3.5))
        fallStrength.current += (fallTarget - fallStrength.current) * response

        pipeline.grade.fogColor.value.copy(palette.fog)
        pipeline.grade.time.value = state.clock.elapsedTime
        pipeline.grade.fallStrength.value = fallStrength.current
        pipeline.renderPipeline.render()
    }, 1)

    return null
}
