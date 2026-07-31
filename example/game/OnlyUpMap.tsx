import { useEffect, useMemo, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'

import type { LevelSpec } from './level'
import { Dynamics } from './onlyUpMap/Dynamics'
import { Movers } from './onlyUpMap/Movers'
import { ProgressMarkers } from './onlyUpMap/ProgressMarkers'
import { StaticPlatforms } from './onlyUpMap/StaticPlatforms'
import { createPlatformMaterials } from './visuals/platformMaterials'

export function OnlyUpMap({
    spec,
    paused = false,
    timeScale = 1,
}: {
    spec: LevelSpec
    paused?: boolean
    timeScale?: number | RefObject<number>
}) {
    const materials = useMemo(() => createPlatformMaterials(), [])

    useEffect(() => () => materials.dispose(), [materials])

    useFrame((state, delta) => {
        materials.update(delta, state.clock.elapsedTime)
    })

    return (
        <group name="OnlyUpMapGroup">
            <StaticPlatforms platforms={spec.platforms} materials={materials} />
            <Movers movers={spec.movers} materials={materials} paused={paused} timeScale={timeScale} />
            <Dynamics dynamics={spec.dynamics} materials={materials} paused={paused} />
            <ProgressMarkers spec={spec} materials={materials} />
        </group>
    )
}
