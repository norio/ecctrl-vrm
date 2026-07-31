import * as THREE from 'three'
import { useEffect, useMemo, useRef, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import { CuboidCollider, CylinderCollider, RigidBody, type RapierRigidBody } from '@react-three/rapier'

import type { MoverSpec } from '../level'
import type { PlatformMaterialSet } from '../visuals/platformMaterials'

type TimeScaleValue = number | RefObject<number>

interface MoversProps {
    movers: MoverSpec[]
    materials: PlatformMaterialSet
    paused?: boolean
    timeScale?: TimeScaleValue
}

interface MoverRuntime {
    anchor: THREE.Vector3
    travel: THREE.Vector3
    axis: THREE.Vector3
    baseRotation: THREE.Quaternion
    spinRotation: THREE.Quaternion
    nextRotation: THREE.Quaternion
}

const readTimeScale = (value: TimeScaleValue): number => typeof value === 'number' ? value : value.current

export function Movers({ movers, materials, paused = false, timeScale = 1 }: MoversProps) {
    const bodyRefs = useRef<Array<RapierRigidBody | null>>([])
    const mapTime = useRef(0)
    const nextTranslation = useRef(new THREE.Vector3())
    const boxGeometry = useMemo(() => new THREE.BoxGeometry(2, 2, 2), [])
    const cylinderGeometry = useMemo(() => new THREE.CylinderGeometry(1, 1, 2, 24), [])
    const runtimes = useMemo<MoverRuntime[]>(() => movers.map((mover) => {
        const axis = new THREE.Vector3(...(mover.params.axis ?? (mover.kind === 'spindisc' ? [0, 1, 0] : [0, 0, 1])))
        if (axis.lengthSq() === 0) axis.set(0, 1, 0)
        axis.normalize()
        return {
            anchor: new THREE.Vector3(...mover.pos),
            travel: new THREE.Vector3(...(mover.params.travel ?? [0, 0, 0])),
            axis,
            baseRotation: new THREE.Quaternion().setFromEuler(new THREE.Euler(...mover.rot)),
            spinRotation: new THREE.Quaternion(),
            nextRotation: new THREE.Quaternion(),
        }
    }), [movers])

    useEffect(() => () => {
        boxGeometry.dispose()
        cylinderGeometry.dispose()
    }, [boxGeometry, cylinderGeometry])

    useFrame((_, delta) => {
        if (paused) return

        mapTime.current += Math.min(delta, 1 / 30) * Math.max(0, readTimeScale(timeScale))
        const time = mapTime.current

        for (let index = 0; index < movers.length; index += 1) {
            const body = bodyRefs.current[index]
            if (!body) continue
            const mover = movers[index]
            const runtime = runtimes[index]

            if (mover.kind === 'lift' || mover.kind === 'patrol') {
                const period = Math.max(0.001, mover.params.period ?? 6)
                const amount = Math.sin((Math.PI * 2 * time / period) + (mover.params.phase ?? 0))
                nextTranslation.current.copy(runtime.travel).multiplyScalar(amount).add(runtime.anchor)
                body.setNextKinematicTranslation(nextTranslation.current)
                continue
            }

            const speed = mover.params.speed ?? 0
            runtime.spinRotation.setFromAxisAngle(runtime.axis, time * speed)
            runtime.nextRotation.copy(runtime.spinRotation).multiply(runtime.baseRotation)
            body.setNextKinematicRotation(runtime.nextRotation)
        }
    })

    return (
        <group name="OnlyUpMovers">
            {movers.map((mover, index) => (
                <RigidBody
                    key={mover.id}
                    ref={(body) => { bodyRefs.current[index] = body }}
                    type="kinematicPosition"
                    colliders={false}
                    position={mover.pos}
                    rotation={mover.rot}
                    {...(mover.material === 'ice' ? { friction: 0 } : {})}
                >
                    {mover.shape === 'box' ? (
                        <>
                            <CuboidCollider args={mover.size} />
                            <mesh castShadow receiveShadow geometry={boxGeometry} material={materials.get(mover.material)} scale={mover.size} />
                        </>
                    ) : (
                        <>
                            <CylinderCollider args={[mover.size[1], mover.size[0]]} />
                            <mesh castShadow receiveShadow geometry={cylinderGeometry} material={materials.get(mover.material)} scale={mover.size} />
                        </>
                    )}
                    {mover.steps?.map((step, stepIndex) => (
                        <group key={stepIndex}>
                            <CuboidCollider args={step.size} position={step.pos} />
                            <mesh
                                castShadow
                                receiveShadow
                                geometry={boxGeometry}
                                material={materials.get(mover.material)}
                                position={step.pos}
                                scale={step.size}
                            />
                        </group>
                    ))}
                </RigidBody>
            ))}
        </group>
    )
}
