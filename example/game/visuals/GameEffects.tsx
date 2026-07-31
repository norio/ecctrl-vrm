import * as THREE from 'three'
import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useControls } from 'leva'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'

import { blendedPalette } from '../palette'
import { livePlayer } from '../useGameStore'
import { sanitizePosition } from './atmosphereMath'
import { COLOR_GRADE_SHADER } from './postShaders'

function makeComposer(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
) {
    const composer = new EffectComposer(renderer)
    const renderPass = new RenderPass(scene, camera)
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.42, 0.7, 0.95)
    // Sanitize the bloom input: a single NaN/Inf texel entering the blur chain
    // contaminates every kernel that touches it and shows up as flickering
    // black rectangles. ESSL 1.00 has no isnan(), so use the x != x identity.
    bloomPass.materialHighPassFilter.fragmentShader =
        bloomPass.materialHighPassFilter.fragmentShader.replace(
            'vec4 texel = texture2D( tDiffuse, vUv );',
            /* glsl */ `
			vec4 texel = texture2D( tDiffuse, vUv );
			if ( !( texel.r == texel.r ) || !( texel.g == texel.g ) || !( texel.b == texel.b ) || !( texel.a == texel.a ) ) texel = vec4( 0.0 );
			texel.rgb = clamp( texel.rgb, vec3( 0.0 ), vec3( 64.0 ) );
`,
        )
    bloomPass.materialHighPassFilter.needsUpdate = true
    const smaaPass = new SMAAPass()
    const gradePass = new ShaderPass(COLOR_GRADE_SHADER)
    const outputPass = new OutputPass()
    composer.addPass(renderPass)
    composer.addPass(bloomPass)
    composer.addPass(smaaPass)
    composer.addPass(gradePass)
    composer.addPass(outputPass)
    return { composer, renderPass, bloomPass, smaaPass, gradePass, outputPass }
}

export function GameEffects(): React.ReactNode {
    const gl = useThree((state) => state.gl)
    const scene = useThree((state) => state.scene)
    const camera = useThree((state) => state.camera)
    const size = useThree((state) => state.size)
    const pixelRatio = useThree((state) => state.viewport.dpr)
    const { bloom, smaa } = useControls('Quality', { bloom: true, smaa: true })
    const passes = useMemo(() => makeComposer(gl, scene, camera), [camera, gl, scene])
    const palette = useMemo(() => blendedPalette(1), [])
    const safePlayer = useMemo(() => new THREE.Vector3(0, 1, 0), [])
    const fallStrength = useRef(0)

    useEffect(() => {
        gl.toneMappingExposure = 0.88
    }, [gl])

    useEffect(() => {
        const { composer, renderPass, bloomPass, smaaPass, gradePass, outputPass } = passes
        while (composer.passes.length > 0) composer.removePass(composer.passes[0])
        composer.addPass(renderPass)
        if (bloom) composer.addPass(bloomPass)
        if (smaa) composer.addPass(smaaPass)
        composer.addPass(gradePass)
        composer.addPass(outputPass)
    }, [bloom, passes, smaa])

    useEffect(() => {
        passes.composer.setPixelRatio(pixelRatio)
        passes.composer.setSize(size.width, size.height)
    }, [passes, pixelRatio, size.height, size.width])

    useEffect(() => () => {
        passes.bloomPass.dispose()
        passes.smaaPass.dispose()
        passes.gradePass.dispose()
        passes.outputPass.dispose()
        passes.composer.dispose()
    }, [passes])

    useFrame((state, delta) => {
        sanitizePosition(livePlayer.pos, safePlayer)
        blendedPalette(safePlayer.y, palette)

        const fallTarget = livePlayer.velY < -14 ? 1 : 0
        const response = 1 - Math.exp(-delta * (fallTarget > fallStrength.current ? 6 : 3.5))
        fallStrength.current += (fallTarget - fallStrength.current) * response

        passes.gradePass.uniforms.uFogColor.value.copy(palette.fog)
        passes.gradePass.uniforms.uTime.value = state.clock.elapsedTime
        passes.gradePass.uniforms.uFallStrength.value = fallStrength.current
        passes.composer.render(delta)
    }, 1)

    return null
}
