import type { LevelSpec } from '../level'
import { BiomeParticles } from './biomeParticles'
import { DecorationInstances } from './decorationInstances'
import { SummitFireworks } from './summitFireworks'

export function Decorations({ spec }: { spec: LevelSpec }): React.ReactNode {
    return (
        <group name="OnlyUpDecorations">
            <DecorationInstances spec={spec} />
            <BiomeParticles seed={spec.seed} />
            <SummitFireworks spec={spec} />
        </group>
    )
}
