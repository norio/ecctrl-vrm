import * as THREE from 'three'
import { useEffect, useMemo } from 'react'
import {
    BallCollider,
    CuboidCollider,
    CylinderCollider,
    InstancedRigidBodies,
    RigidBody,
    type InstancedRigidBodyProps,
} from '@react-three/rapier'

import type { StaticPlatform } from '../level'
import type { MaterialKind, PlatformMaterialSet } from '../visuals/platformMaterials'

interface StaticPlatformsProps {
    platforms: StaticPlatform[]
    materials: PlatformMaterialSet
}

interface StaticBatch {
    key: string
    shape: StaticPlatform['shape']
    material: MaterialKind
    instances: InstancedRigidBodyProps[]
}

function isCameraCollisionException(platform: StaticPlatform): boolean {
    return (
        (platform.shape === 'sphere' && platform.material === 'planet')
        || (platform.shape === 'cylinder' && platform.material === 'pillar' && platform.size[1] >= 30)
    )
}

function batchPlatforms(platforms: StaticPlatform[]): { batches: StaticBatch[]; exceptions: StaticPlatform[] } {
    const grouped = new Map<string, StaticBatch>()
    const exceptions: StaticPlatform[] = []

    platforms.forEach((platform, index) => {
        if (isCameraCollisionException(platform)) {
            exceptions.push(platform)
            return
        }

        const frictionKey = platform.friction === undefined ? 'default' : String(platform.friction)
        const restitutionKey = platform.restitution === undefined ? 'default' : String(platform.restitution)
        const key = `${platform.shape}:${platform.material}:f${frictionKey}:r${restitutionKey}`
        let batch = grouped.get(key)
        if (!batch) {
            batch = {
                key,
                shape: platform.shape,
                material: platform.material,
                instances: [],
            }
            grouped.set(key, batch)
        }
        batch.instances.push({
            key: index,
            position: platform.pos,
            rotation: platform.rot,
            scale: platform.size,
        })
    })

    return { batches: Array.from(grouped.values()), exceptions }
}

function ExplicitPlatformCollider({ platform }: { platform: StaticPlatform }) {
    if (platform.shape === 'box') return <CuboidCollider args={platform.size} />
    if (platform.shape === 'cylinder') {
        return <CylinderCollider args={[platform.size[1], platform.size[0]]} />
    }
    return <BallCollider args={[platform.size[0]]} />
}

function interactionProps(platform: StaticPlatform) {
    return {
        ...(platform.friction === undefined ? {} : { friction: platform.friction }),
        ...(platform.restitution === undefined ? {} : { restitution: platform.restitution }),
    }
}

function PlatformCollider({ platform }: { platform: StaticPlatform }) {
    return (
        <RigidBody
            type="fixed"
            colliders={false}
            position={platform.pos}
            rotation={platform.rot}
            {...interactionProps(platform)}
        >
            <ExplicitPlatformCollider platform={platform} />
        </RigidBody>
    )
}

function geometryFor(
    shape: StaticPlatform['shape'],
    geometries: Record<StaticPlatform['shape'], THREE.BufferGeometry>,
): THREE.BufferGeometry {
    return geometries[shape]
}

function StaticException({ platform, materials }: { platform: StaticPlatform; materials: PlatformMaterialSet }) {
    const geometry = platform.shape === 'sphere'
        ? <sphereGeometry args={[1, 24, 16]} />
        : <cylinderGeometry args={[1, 1, 2, 24]} />

    return (
        <RigidBody
            type="fixed"
            colliders={false}
            position={platform.pos}
            rotation={platform.rot}
            {...interactionProps(platform)}
        >
            <ExplicitPlatformCollider platform={platform} />
            <mesh
                castShadow
                receiveShadow
                scale={platform.size}
                material={materials.get(platform.material, platform.material === 'pillar' ? 'apex' : undefined)}
            >
                {geometry}
            </mesh>
        </RigidBody>
    )
}

export function StaticPlatforms({ platforms, materials }: StaticPlatformsProps) {
    const grouped = useMemo(() => batchPlatforms(platforms), [platforms])
    const geometries = useMemo<Record<StaticPlatform['shape'], THREE.BufferGeometry>>(() => ({
        box: new THREE.BoxGeometry(2, 2, 2),
        cylinder: new THREE.CylinderGeometry(1, 1, 2, 24),
        sphere: new THREE.SphereGeometry(1, 24, 16),
    }), [])

    useEffect(() => () => {
        geometries.box.dispose()
        geometries.cylinder.dispose()
        geometries.sphere.dispose()
    }, [geometries])

    return (
        <group name="OnlyUpStaticPlatforms">
            {grouped.batches.map((batch) => (
                <InstancedRigidBodies
                    key={batch.key}
                    type="fixed"
                    colliders={false}
                    instances={batch.instances}
                >
                    <instancedMesh
                        args={[
                            geometryFor(batch.shape, geometries),
                            materials.get(batch.material),
                            batch.instances.length,
                        ]}
                        count={batch.instances.length}
                        castShadow
                        receiveShadow
                        frustumCulled={false}
                    />
                </InstancedRigidBodies>
            ))}
            {platforms.filter((platform) => !isCameraCollisionException(platform)).map((platform, index) => (
                <PlatformCollider key={`collider-${index}`} platform={platform} />
            ))}
            {grouped.exceptions.map((platform, index) => (
                <StaticException key={`exception-${index}`} platform={platform} materials={materials} />
            ))}
        </group>
    )
}
