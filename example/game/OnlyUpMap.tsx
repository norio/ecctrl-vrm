import { useEffect, useMemo, type RefObject } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import type { WebGPURenderer } from 'three/webgpu'

import type { LevelSpec } from './level'
import { Movers } from './onlyUpMap/Movers'
import { ProgressMarkers } from './onlyUpMap/ProgressMarkers'
import { StaticPlatforms } from './onlyUpMap/StaticPlatforms'
import { createPlatformMaterials } from './visuals/platformMaterials'
import { useGameStore } from './useGameStore'

export function OnlyUpMap({
    spec,
    paused = false,
    timeScale = 1,
}: {
    spec: LevelSpec
    paused?: boolean
    timeScale?: number | RefObject<number>
}) {
    const renderer = useThree((state) => state.gl as unknown as WebGPURenderer)
    const staticMaterials = useMemo(() => createPlatformMaterials({ bake: true }), [])
    const dynamicMaterials = useMemo(() => createPlatformMaterials(), [])

    useEffect(() => () => {
        staticMaterials.dispose()
        dynamicMaterials.dispose()
    }, [dynamicMaterials, staticMaterials])

    useEffect(() => {
        let cancelled = false
        useGameStore.getState().setPlatformBakeReady(false)
        void staticMaterials.prepare(renderer)
            .catch((error: unknown) => {
                console.warn('足場テクスチャの初期ベイクに失敗したため、手続き型マテリアルを使用します。', error)
            })
            .finally(() => {
                if (!cancelled) useGameStore.getState().setPlatformBakeReady(true)
            })
        return () => {
            cancelled = true
        }
    }, [renderer, staticMaterials])

    useFrame((state, delta) => {
        staticMaterials.update(delta, state.clock.elapsedTime)
        dynamicMaterials.update(delta, state.clock.elapsedTime)
    })

    return (
        <group name="OnlyUpMapGroup">
            <StaticPlatforms platforms={spec.platforms} materials={staticMaterials} />
            <Movers movers={spec.movers} materials={dynamicMaterials} paused={paused} timeScale={timeScale} />
            <ProgressMarkers spec={spec} materials={dynamicMaterials} />
        </group>
    )
}
