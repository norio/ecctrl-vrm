import * as THREE from 'three'
import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { BallCollider, CuboidCollider, CylinderCollider, RigidBody, type RapierRigidBody, useRapier } from '@react-three/rapier'

import { useCustomGravity } from '../../../src/gravity'
import type { DynamicSpec } from '../level'
import type { PlatformMaterialSet } from '../visuals/platformMaterials'

interface DynamicsProps {
    dynamics: DynamicSpec[]
    materials: PlatformMaterialSet
    paused?: boolean
}

export function Dynamics({ dynamics, materials, paused = false }: DynamicsProps) {
    const { world } = useRapier()
    const applyGravityField = useCustomGravity((state) => state.applyGravityField)
    const bodyRefs = useRef<Array<RapierRigidBody | null>>([])
    const boxGeometry = useMemo(() => new THREE.BoxGeometry(2, 2, 2), [])
    const sphereGeometry = useMemo(() => new THREE.SphereGeometry(1, 20, 14), [])
    const cylinderGeometry = useMemo(() => new THREE.CylinderGeometry(1, 1, 2, 20), [])

    useEffect(() => () => {
        boxGeometry.dispose()
        sphereGeometry.dispose()
        cylinderGeometry.dispose()
    }, [boxGeometry, cylinderGeometry, sphereGeometry])

    useFrame(() => {
        if (paused) return
        for (const body of bodyRefs.current) {
            if (body) applyGravityField(body, world.timestep)
        }
    })

    return (
        <group name="OnlyUpDynamics">
            {dynamics.map((dynamic, index) => (
                <RigidBody
                    key={`${dynamic.kind}-${index}`}
                    ref={(body) => { bodyRefs.current[index] = body }}
                    colliders={false}
                    position={dynamic.pos}
                >
                    {dynamic.kind === 'seesaw' ? (
                        <>
                            <CuboidCollider args={dynamic.size} density={200} />
                            <CylinderCollider
                                args={[dynamic.size[2], 0.45]}
                                density={200}
                                position={[0, -dynamic.size[1] - 0.45, 0]}
                                rotation={[Math.PI / 2, 0, 0]}
                            />
                            <mesh castShadow receiveShadow geometry={boxGeometry} material={materials.get(dynamic.material)} scale={dynamic.size} />
                            <mesh
                                castShadow
                                receiveShadow
                                geometry={cylinderGeometry}
                                material={materials.get(dynamic.material)}
                                position={[0, -dynamic.size[1] - 0.45, 0]}
                                rotation={[Math.PI / 2, 0, 0]}
                                scale={[0.45, dynamic.size[2], 0.45]}
                            />
                        </>
                    ) : dynamic.kind === 'ball' ? (
                        <>
                            <BallCollider args={[dynamic.size[0]]} density={dynamic.density} />
                            <mesh castShadow receiveShadow geometry={sphereGeometry} material={materials.get(dynamic.material)} scale={dynamic.size[0]} />
                        </>
                    ) : (
                        <>
                            <CuboidCollider args={dynamic.size} density={dynamic.density} />
                            <mesh castShadow receiveShadow geometry={boxGeometry} material={materials.get(dynamic.material)} scale={dynamic.size} />
                        </>
                    )}
                </RigidBody>
            ))}
        </group>
    )
}
