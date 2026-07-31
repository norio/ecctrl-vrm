import * as THREE from 'three'
import { CylinderCollider, RigidBody } from '@react-three/rapier'

import type { CheckpointSpec, LevelSpec } from '../level'
import { useGameStore } from '../useGameStore'
import type { PlatformMaterialSet } from '../visuals/platformMaterials'

function isCharacterIntersection(event: { colliderObject?: THREE.Object3D }): boolean {
    return event.colliderObject?.name === 'character-capsule-collider'
}

function Checkpoint({ checkpoint, materials, muted }: {
    checkpoint: CheckpointSpec
    materials: PlatformMaterialSet
    muted: boolean
}) {
    // Muted beacons keep their sensor but skip the beam and slim the ring:
    // the start beacon would dominate the opening view, and the summit
    // checkpoint shares its spot with the goal ring which already marks it.
    return (
        <RigidBody type="fixed" colliders={false} position={checkpoint.pos}>
            <CylinderCollider
                args={[2.2, 2.2]}
                sensor
                onIntersectionEnter={(event) => {
                    if (isCharacterIntersection(event)) {
                        useGameStore.getState().setCheckpoint(checkpoint.pos, checkpoint.index)
                    }
                }}
            />
            <mesh rotation={[Math.PI / 2, 0, 0]} material={materials.get('checkpoint')}>
                <torusGeometry args={[2.2, muted ? 0.05 : 0.12, 8, 32]} />
            </mesh>
            {!muted && (
                <mesh position={[0, 3, 0]} material={materials.get('checkpointBeam')}>
                    <cylinderGeometry args={[0.12, 0.12, 6, 10]} />
                </mesh>
            )}
        </RigidBody>
    )
}

export function ProgressMarkers({ spec, materials }: { spec: LevelSpec; materials: PlatformMaterialSet }) {
    return (
        <group name="OnlyUpProgressMarkers">
            {spec.checkpoints.map((checkpoint, i) => (
                <Checkpoint
                    key={checkpoint.index}
                    checkpoint={checkpoint}
                    materials={materials}
                    muted={checkpoint.index === 0 || i === spec.checkpoints.length - 1}
                />
            ))}
            <RigidBody type="fixed" colliders={false} position={spec.goal.pos}>
                <CylinderCollider
                    args={[2.2, 3]}
                    sensor
                    onIntersectionEnter={(event) => {
                        if (isCharacterIntersection(event)) useGameStore.getState().reachSummit()
                    }}
                />
                <mesh rotation={[Math.PI / 2, 0, 0]} material={materials.get('goal')}>
                    <torusGeometry args={[3, 0.2, 10, 40]} />
                </mesh>
            </RigidBody>
        </group>
    )
}
