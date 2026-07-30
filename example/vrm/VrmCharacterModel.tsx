import * as THREE from "three";
import { useFrame, useLoader } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import {
  VRMLoaderPlugin,
  VRMUtils,
  type VRM,
} from "@pixiv/three-vrm";
import {
  GLTFLoader,
  type GLTFParser,
} from "three/examples/jsm/loaders/GLTFLoader.js";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  useEcctrlAnimationStore,
  type EcctrlAnimationState,
} from "../../src";
import { retargetHumanoidAnimationClips } from "./VrmAnimation";
import { isVrm0 } from "./VrmMeta";
import { useVrmStore } from "./useVrmStore";

const statusToActionMap: Record<EcctrlAnimationState, string> = {
  IDLE: "Idle_Loop",
  WALK: "Walk_Loop",
  RUN: "Jog_Fwd_Loop",
  JUMP_START: "Jump_Start",
  JUMP_IDLE: "Jump_Loop",
  JUMP_FALL: "Jump_Loop",
  JUMP_LAND: "Jump_Land",
};

const requiredClipNames = Array.from(new Set(Object.values(statusToActionMap)));

const createVrmLoaderPlugin = (parser: GLTFParser) =>
  new VRMLoaderPlugin(parser);

const readTimeScale = (value: number | { current: number }) =>
  typeof value === "number" ? value : (value?.current ?? 1);

interface VrmCharacterModelProps {
  paused?: boolean;
  timeScale?: number | { current: number };
}

export default function VrmCharacterModel({
  paused = false,
  timeScale = 1,
}: VrmCharacterModelProps) {
  const vrmUrl = useVrmStore((state) => state.vrmUrl);
  const gltf = useLoader(GLTFLoader, vrmUrl, (loader) => {
    loader.register(createVrmLoaderPlugin);
  });
  const vrm = gltf.userData.vrm as VRM | undefined;
  if (!vrm) throw new Error(`Loaded file does not contain a VRM: ${vrmUrl}`);

  const { animations } = useGLTF("/AnimationLibrary.glb");
  const clips = useMemo(() => {
    if (isVrm0(vrm)) VRMUtils.rotateVRM0(vrm);
    return retargetHumanoidAnimationClips(animations, vrm, requiredClipNames);
  }, [animations, vrm]);
  const animationState = useEcctrlAnimationStore(
    (state) => state.animationState
  );

  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const actionsRef = useRef(new Map<string, THREE.AnimationAction>());
  const prevActionNameRef = useRef(statusToActionMap.IDLE);
  const prevMixerTimeScale = useRef(-1);
  const mixerTimeScale = useRef(1);
  const [canPlayNext, setCanPlayNext] = useState(true);

  useEffect(() => {
    vrm.scene.traverse((object) => {
      object.frustumCulled = false;
      if (object instanceof THREE.Mesh) {
        object.castShadow = true;
        object.receiveShadow = true;
      }
    });

    const mixer = new THREE.AnimationMixer(vrm.scene);
    const actions = new Map<string, THREE.AnimationAction>();
    for (const clip of clips) actions.set(clip.name, mixer.clipAction(clip));

    mixerRef.current = mixer;
    actionsRef.current = actions;
    prevActionNameRef.current = statusToActionMap.IDLE;
    prevMixerTimeScale.current = -1;
    setCanPlayNext(true);
    actions.get(statusToActionMap.IDLE)?.play();

    const url = vrmUrl;
    return () => {
      if (mixerRef.current === mixer) mixerRef.current = null;
      if (actionsRef.current === actions) actionsRef.current = new Map();
      mixer.stopAllAction();
      mixer.uncacheRoot(vrm.scene);
      VRMUtils.deepDispose(vrm.scene);
      useLoader.clear(GLTFLoader, url);
    };
  }, [vrm, clips, vrmUrl]);

  useEffect(() => {
    const actions = actionsRef.current;
    const nextActionName = statusToActionMap[animationState];
    const nextAction = actions.get(nextActionName);
    const prevActionName = prevActionNameRef.current;
    const prevAction = actions.get(prevActionName);
    if (!nextAction || !prevAction) return;

    const getFadeDuration = (duration: number) =>
      duration * Math.max(mixerTimeScale.current, 0.05);

    if (nextActionName !== prevActionName && canPlayNext) {
      if (
        nextActionName === statusToActionMap.JUMP_START ||
        nextActionName === statusToActionMap.JUMP_LAND
      ) {
        setCanPlayNext(false);
        nextAction.timeScale = 1.6;
        nextAction
          .reset()
          .crossFadeFrom(prevAction, getFadeDuration(0.1))
          .setLoop(THREE.LoopOnce, 1)
          .play();
        nextAction.clampWhenFinished = true;
      } else {
        setCanPlayNext(true);
        nextAction.timeScale = 1;
        nextAction
          .reset()
          .crossFadeFrom(prevAction, getFadeDuration(0.2))
          .play();
      }
      prevActionNameRef.current = nextActionName;
    }

    if (
      !canPlayNext &&
      prevActionName === statusToActionMap.JUMP_START &&
      animationState !== "JUMP_IDLE" &&
      animationState !== "JUMP_START"
    ) {
      setCanPlayNext(true);
    }

    if (
      !canPlayNext &&
      prevActionName === statusToActionMap.JUMP_LAND &&
      animationState !== "IDLE" &&
      animationState !== "JUMP_LAND"
    ) {
      setCanPlayNext(true);
    }
  }, [animationState, canPlayNext, clips]);

  useEffect(() => {
    const mixer = mixerRef.current;
    if (!mixer) return;

    const onFinished = ({ action }: { action: THREE.AnimationAction }) => {
      if (
        !canPlayNext &&
        (action.getClip().name === statusToActionMap.JUMP_START ||
          action.getClip().name === statusToActionMap.JUMP_LAND)
      ) {
        setCanPlayNext(true);
      }
    };

    mixer.addEventListener("finished", onFinished);
    return () => mixer.removeEventListener("finished", onFinished);
  }, [canPlayNext, clips]);

  useFrame((_, delta) => {
    const mixer = mixerRef.current;
    if (!mixer) return;

    const nextTimeScale = paused ? 0 : readTimeScale(timeScale);
    mixerTimeScale.current = nextTimeScale;
    if (prevMixerTimeScale.current !== nextTimeScale) {
      mixer.timeScale = nextTimeScale;
      prevMixerTimeScale.current = nextTimeScale;
    }
    mixer.update(delta);
    vrm.update(delta);
  });

  return (
    <group position={[0, -0.95, 0]}>
      <primitive object={vrm.scene} />
    </group>
  );
}
