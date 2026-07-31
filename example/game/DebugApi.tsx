import * as THREE from "three";
import { useEffect } from "react";
import type { RapierRigidBody } from "@react-three/rapier";
import { makeGravityField } from "./gravityField";
import type { LevelSpec } from "./level";
import { livePlayer, useGameStore } from "./useGameStore";

interface TeleportTarget {
    x: number;
    y: number;
    z: number;
}

export const debugRefs: {
    body: RapierRigidBody | null;
    pendingTeleport: TeleportTarget | null;
} = {
    body: null,
    pendingTeleport: null,
};

export interface OnlyUpDebugApi {
    teleport(y: number): void;
    teleportTo(x: number, y: number, z: number): void;
    getState(): {
        pos: [number, number, number];
        altitude: number;
        best: number;
        checkpoint: number;
        status: string;
        seed: number;
    };
    listCheckpoints(): Array<[number, number, number]>;
}

declare global {
    interface Window {
        onlyUpDebug?: OnlyUpDebugApi;
    }
}

export function requestPlayerTeleport(x: number, y: number, z: number) {
    debugRefs.pendingTeleport = { x, y, z };
}

function platformTop(platform: LevelSpec["platforms"][number]) {
    const verticalHalfExtent = platform.shape === "sphere"
        ? platform.size[0]
        : platform.size[1];
    return platform.pos[1] + verticalHalfExtent;
}

export function computeTeleportSpawn(
    spec: LevelSpec,
    y: number,
): TeleportTarget | null {
    let nearest = spec.platforms[0];
    let nearestDistance = nearest
        ? Math.abs(platformTop(nearest) - y)
        : Number.POSITIVE_INFINITY;
    for (let index = 1; index < spec.platforms.length; index += 1) {
        const platform = spec.platforms[index];
        const distance = Math.abs(platformTop(platform) - y);
        if (distance < nearestDistance) {
            nearest = platform;
            nearestDistance = distance;
        }
    }
    if (!nearest) return null;

    const surfacePoint = new THREE.Vector3(
        nearest.pos[0],
        platformTop(nearest),
        nearest.pos[2],
    );
    const gravity = makeGravityField(spec)(surfacePoint);
    if (gravity.lengthSq() > 1e-8) {
        surfacePoint.addScaledVector(gravity.normalize(), -1.5);
    }
    return { x: surfacePoint.x, y: surfacePoint.y, z: surfacePoint.z };
}

export function DebugApi({ spec }: { spec: LevelSpec }) {
    useEffect(() => {
        const api: OnlyUpDebugApi = {
            teleport(y) {
                const spawn = computeTeleportSpawn(spec, y);
                if (!spawn) return;
                requestPlayerTeleport(spawn.x, spawn.y, spawn.z);
            },
            teleportTo: requestPlayerTeleport,
            getState() {
                const game = useGameStore.getState();
                return {
                    pos: livePlayer.pos.toArray() as [number, number, number],
                    altitude: livePlayer.pos.y,
                    best: game.bestY,
                    checkpoint: game.lastCheckpoint.index,
                    status: game.status,
                    seed: game.seed,
                };
            },
            listCheckpoints() {
                return spec.checkpoints.map(({ pos }) => (
                    [pos[0], pos[1], pos[2]]
                ));
            },
        };
        window.onlyUpDebug = api;
        return () => {
            if (window.onlyUpDebug === api) delete window.onlyUpDebug;
        };
    }, [spec]);

    return null;
}
