import * as THREE from 'three'
import type { GravityZone, LevelSpec } from './level'

const GRAVITY = 9.81
const EPSILON = 1e-8
const gravityDirection = new THREE.Vector3()
const pillarRimPoint = new THREE.Vector3()

interface BoxDirection {
    x: number
    y: number
    z: number
}

function normalizedBoxDirections(zones: GravityZone[]): Array<BoxDirection | null> {
    return zones.map((zone) => {
        if (zone.type !== 'box') return null
        const length = Math.hypot(zone.dir[0], zone.dir[1], zone.dir[2])
        if (length <= EPSILON) return { x: 0, y: -1, z: 0 }
        return { x: zone.dir[0] / length, y: zone.dir[1] / length, z: zone.dir[2] / length }
    })
}

/**
 * Builds a zero-allocation hot-path gravity function. Zones are evaluated in
 * declaration order; when zones overlap, the first matching zone wins.
 */
export function makeGravityField(spec: LevelSpec): (objectPos: THREE.Vector3) => THREE.Vector3 {
    const zones = spec.gravityZones
    const boxDirections = normalizedBoxDirections(zones)

    return (objectPos: THREE.Vector3) => {
        for (let index = 0; index < zones.length; index += 1) {
            const zone = zones[index]

            if (zone.type === 'sphere') {
                const dx = zone.center[0] - objectPos.x
                const dy = zone.center[1] - objectPos.y
                const dz = zone.center[2] - objectPos.z
                if (Math.abs(dx) >= zone.radius || Math.abs(dy) >= zone.radius || Math.abs(dz) >= zone.radius) continue
                const distanceSquared = dx * dx + dy * dy + dz * dz
                if (distanceSquared >= zone.radius * zone.radius) continue
                if (distanceSquared <= EPSILON) return gravityDirection.set(0, -GRAVITY, 0)
                return gravityDirection.set(dx, dy, dz).multiplyScalar(GRAVITY / Math.sqrt(distanceSquared))
            }

            if (zone.type === 'pillar') {
                const dx = objectPos.x - zone.center[0]
                const dz = objectPos.z - zone.center[2]
                if (Math.abs(dx) >= zone.radius || Math.abs(dz) >= zone.radius || objectPos.y < zone.yMin || objectPos.y > zone.yMax) continue
                const distanceSquared = dx * dx + dz * dz
                if (distanceSquared >= zone.radius * zone.radius) continue

                const bottomRimY = zone.yMin + zone.rimBand
                const topRimY = zone.yMax - zone.rimBand
                if (objectPos.y < bottomRimY) {
                    const rimScale = distanceSquared > EPSILON ? zone.radius / Math.sqrt(distanceSquared) : 0
                    pillarRimPoint.set(zone.center[0] + dx * rimScale, bottomRimY, zone.center[2] + dz * rimScale)
                    gravityDirection.subVectors(objectPos, pillarRimPoint)
                } else if (objectPos.y < topRimY) {
                    gravityDirection.set(zone.center[0] - objectPos.x, 0, zone.center[2] - objectPos.z)
                } else {
                    const rimScale = distanceSquared > EPSILON ? zone.radius / Math.sqrt(distanceSquared) : 0
                    pillarRimPoint.set(zone.center[0] + dx * rimScale, topRimY, zone.center[2] + dz * rimScale)
                    gravityDirection.subVectors(objectPos, pillarRimPoint)
                }
                const lengthSquared = gravityDirection.lengthSq()
                if (lengthSquared <= EPSILON) return gravityDirection.set(0, -GRAVITY, 0)
                return gravityDirection.multiplyScalar(GRAVITY / Math.sqrt(lengthSquared))
            }

            if (
                objectPos.x < zone.min[0] || objectPos.x > zone.max[0]
                || objectPos.y < zone.min[1] || objectPos.y > zone.max[1]
                || objectPos.z < zone.min[2] || objectPos.z > zone.max[2]
            ) continue
            const direction = boxDirections[index]!
            return gravityDirection.set(direction.x * GRAVITY, direction.y * GRAVITY, direction.z * GRAVITY)
        }

        return gravityDirection.set(0, -GRAVITY, 0)
    }
}
