import * as THREE from "three";
import { useKeyboardControls } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import {
    Suspense,
    useCallback,
    useEffect,
    useLayoutEffect,
    useRef,
    type RefObject,
} from "react";
import {
    Ecctrl,
    EcctrlAnimationStateController,
    type EcctrlHandle,
} from "../../src";
import {
    EcctrlCameraControls,
    type EcctrlCameraControlsHandle,
} from "../../src/camera";
import { useButtonStore, useJoystickStore } from "../../src/input";
import AnimatedCharacterModel from "../AnimatedCharacterModel";
import { CapsuleCahracterModel } from "../CapsuleCharacterModel";
import VrmCharacterModel from "../vrm/VrmCharacterModel";
import VrmErrorBoundary from "../vrm/VrmErrorBoundary";
import { useVrmStore } from "../vrm/useVrmStore";
import { debugRefs, requestPlayerTeleport } from "./DebugApi";
import type { LevelSpec } from "./level";
import { livePlayer, useGameStore } from "./useGameStore";

export interface PlayerRigProps {
    spec: LevelSpec;
    paused?: boolean;
    timeScale?: number | RefObject<number>;
    characterModel: "vrm" | "mannequin" | "capsule";
    footIK: boolean;
}

const zeroVelocity = { x: 0, y: 0, z: 0 };

export function PlayerRig({
    spec,
    paused = false,
    timeScale = 1,
    characterModel,
    footIK,
}: PlayerRigProps) {
    const scene = useThree((state) => state.scene);
    const vrmUrl = useVrmStore((state) => state.vrmUrl);
    const ecctrlRef = useRef<EcctrlHandle | null>(null);
    const cameraControlsRef = useRef<EcctrlCameraControlsHandle>(null);
    const cameraUp = useRef(new THREE.Vector3(0, 1, 0));
    const cameraTarget = useRef(new THREE.Vector3());
    const cameraCurrDir = useRef(new THREE.Vector3());
    const cameraFinalDir = useRef(new THREE.Vector3());
    const cameraTurnCrossAxis = useRef(new THREE.Vector3());
    const cameraCollisionMeshes = useRef<THREE.Mesh[]>([]);
    const warnedNonFiniteBody = useRef(false);
    const hudElapsed = useRef(0);
    const joystickLState = useRef({ x: 0, y: 0 });
    const buttonState = useRef({ b1: false, b2: false });
    const [subscribeKeys, getKeys] = useKeyboardControls();

    useLayoutEffect(() => {
        const mapGroup = scene.getObjectByName("OnlyUpMapGroup");
        if (!mapGroup) return;
        const meshes: THREE.Mesh[] = [];
        mapGroup.traverse((object) => {
            if (
                (object as THREE.Mesh).isMesh &&
                !(object as THREE.InstancedMesh).isInstancedMesh
            ) {
                meshes.push(object as THREE.Mesh);
            }
        });
        cameraCollisionMeshes.current = meshes;
    }, [scene, spec]);

    useEffect(() => useJoystickStore.subscribe(
        (state) => state.joysticks.left,
        (joystick) => {
            if (!joystick) return;
            joystickLState.current.x = joystick.x;
            joystickLState.current.y = joystick.y;
        },
    ), []);

    useEffect(() => useButtonStore.subscribe(({ buttons }) => {
        buttonState.current.b1 = buttons.b1 ?? false;
        buttonState.current.b2 = buttons.b2 ?? false;
    }), []);

    const teleportToCheckpoint = useCallback(() => {
        const checkpoint = useGameStore.getState().lastCheckpoint.pos;
        requestPlayerTeleport(
            checkpoint[0],
            checkpoint[1] + 1.2,
            checkpoint[2],
        );
    }, []);

    useEffect(() => {
        const unsubscribe = subscribeKeys(
            (state) => state.R,
            (pressed) => {
                if (!pressed) return;
                if (useGameStore.getState().status === "summit") {
                    useGameStore.getState().resetRun();
                    requestPlayerTeleport(
                        spec.start[0],
                        spec.start[1],
                        spec.start[2],
                    );
                    return;
                }
                teleportToCheckpoint();
            },
        );
        return unsubscribe;
    }, [spec.start, subscribeKeys, teleportToCheckpoint]);

    const sleepCharacter = useCallback(() => {
        const body = ecctrlRef.current?.body;
        if (!body) return;
        if (document.visibilityState === "hidden") {
            body.sleep();
        } else {
            setTimeout(() => body.wakeUp(), 1000);
        }
    }, []);

    useEffect(() => {
        window.addEventListener("visibilitychange", sleepCharacter);
        return () => window.removeEventListener("visibilitychange", sleepCharacter);
    }, [sleepCharacter]);

    useEffect(() => {
        const body = ecctrlRef.current?.body;
        if (!body) return;
        debugRefs.body = body;
        return () => {
            if (debugRefs.body === body) debugRefs.body = null;
        };
    }, []);

    useFrame((state, delta) => {
        const handle = ecctrlRef.current;
        if (!handle?.body) return;
        const keys = getKeys();

        const bodyPosition = handle.body.translation();
        const bodyIsFinite = Number.isFinite(bodyPosition.x)
            && Number.isFinite(bodyPosition.y)
            && Number.isFinite(bodyPosition.z);
        if (!bodyIsFinite) {
            if (!warnedNonFiniteBody.current) {
                console.warn("Only Up player body became non-finite; respawning at the last checkpoint.");
                warnedNonFiniteBody.current = true;
            }
            teleportToCheckpoint();
        } else {
            warnedNonFiniteBody.current = false;
        }

        const pendingTeleport = debugRefs.pendingTeleport;
        const teleported = pendingTeleport !== null;
        if (pendingTeleport) {
            debugRefs.pendingTeleport = null;
            handle.body.setTranslation(pendingTeleport, true);
            handle.body.setLinvel(zeroVelocity, true);
            handle.body.setAngvel(zeroVelocity, true);
            livePlayer.pos.set(
                pendingTeleport.x,
                pendingTeleport.y,
                pendingTeleport.z,
            );
            livePlayer.velY = 0;
            livePlayer.onGround = false;
        } else {
            livePlayer.pos.copy(handle.currPos);
            livePlayer.velY = handle.currLinVel.y;
            livePlayer.onGround = handle.isOnGround;
        }

        handle.setMovement({
            forward: keys.W || keys.Up,
            backward: keys.S || keys.Down,
            leftward: keys.A || keys.Left,
            rightward: keys.D || keys.Right,
            joystick: joystickLState.current,
            run: !(keys.Shift || buttonState.current.b1),
            jump: keys.Space || buttonState.current.b2,
        });

        hudElapsed.current += delta;
        if (
            hudElapsed.current >= 1 / 8 &&
            useGameStore.getState().status === "playing"
        ) {
            hudElapsed.current %= 1 / 8;
            useGameStore.getState().setPlayerY(livePlayer.pos.y);
        }

        const checkpointY = useGameStore.getState().lastCheckpoint.pos[1];
        if (livePlayer.pos.y < Math.min(-25, checkpointY - 90)) {
            teleportToCheckpoint();
        }

        if (!teleported && handle.currPos.lengthSq() > 0) {
            cameraTarget.current
                .copy(handle.currPos)
                .addScaledVector(handle.bodyYAxis, 0.5);
            cameraUp.current.copy(handle.upAxis);
        }

        if (!teleported && cameraControlsRef.current) {
            cameraControlsRef.current.moveTo(
                cameraTarget.current.x,
                cameraTarget.current.y,
                cameraTarget.current.z,
                true,
            );
            state.camera.up.lerp(cameraUp.current, 0.1);
            cameraControlsRef.current.setUp(state.camera.up);
        }

        if (!teleported && handle.isOnPlatform && cameraControlsRef.current) {
            state.camera
                .getWorldDirection(cameraCurrDir.current)
                .projectOnPlane(cameraUp.current)
                .normalize();
            cameraFinalDir.current
                .copy(cameraCurrDir.current)
                .applyQuaternion(handle.turnOnYQuat);
            cameraTurnCrossAxis.current.crossVectors(
                cameraCurrDir.current,
                cameraFinalDir.current,
            );
            let dot = THREE.MathUtils.clamp(
                cameraCurrDir.current.dot(cameraFinalDir.current),
                -1,
                1,
            );
            if (Math.abs(dot) < 1e-10) dot = 0;
            const angle = Math.atan2(
                cameraTurnCrossAxis.current.dot(cameraUp.current),
                dot,
            );
            cameraControlsRef.current.rotate(angle, 0, true);
        }
    });

    return (
        <>
            <EcctrlCameraControls
                ref={cameraControlsRef}
                makeDefault
                minPolarAngle={0.1}
                maxPolarAngle={Math.PI - 0.1}
                smoothTime={0.08}
                colliderMeshes={cameraCollisionMeshes.current}
            />

            <Ecctrl
                ref={ecctrlRef}
                position={spec.start}
                enable={!paused}
                enableCustomGravity
                gravityDirLerpSpeed={6}
                maxWalkVel={2.2}
                maxRunVel={5.5}
                jumpVel={6.5}
                fallingGravityScale={3}
                fallingMaxVel={25}
                enableToggleRun={false}
                followPlatform
                autoBalance
                debug={false}
                userData={{ ecctrl: { excludeVehicleRay: true } }}
                floatHeight={0.3}
                rayLength={1.3}
                slopeMaxAngle={1}
            >
                {(characterModel === "vrm" || characterModel === "mannequin") && (
                    <EcctrlAnimationStateController
                        ecctrl={ecctrlRef}
                        enabled={!paused}
                    />
                )}
                {characterModel === "vrm" && (
                    <VrmErrorBoundary key={vrmUrl}>
                        <Suspense fallback={null}>
                            <VrmCharacterModel
                                paused={paused}
                                timeScale={timeScale}
                                ecctrl={ecctrlRef}
                                footIKEnabled={footIK}
                            />
                        </Suspense>
                    </VrmErrorBoundary>
                )}
                {characterModel === "mannequin" && (
                    <AnimatedCharacterModel paused={paused} timeScale={timeScale} />
                )}
                {characterModel === "capsule" && (
                    <CapsuleCahracterModel position={[0, -0.6, 0]} />
                )}
            </Ecctrl>
        </>
    );
}
