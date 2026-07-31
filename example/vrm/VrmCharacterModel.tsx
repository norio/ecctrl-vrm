import * as THREE from "three";
import { useFrame, useLoader } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { useRapier } from "@react-three/rapier";
import { QueryFilterFlags } from "@dimforge/rapier3d-compat";
import {
  VRMLoaderPlugin,
  VRMUtils,
  type VRM,
} from "@pixiv/three-vrm";
import { MToonMaterialLoaderPlugin } from "@pixiv/three-vrm-materials-mtoon";
import { MToonNodeMaterial } from "@pixiv/three-vrm-materials-mtoon/nodes";
import {
  GLTFLoader,
  type GLTFParser,
} from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import {
  useEcctrlAnimationStore,
  type EcctrlAnimationState,
  type EcctrlHandle,
} from "../../src";
import {
  CharacterFootIK,
  footIKSettings,
  type CharacterFootIKDeps,
  type FootIKGroundHit,
} from "./FootIK";
import { assetUrl } from "../assetUrl";
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
  new VRMLoaderPlugin(parser, {
    mtoonMaterialPlugin: new MToonMaterialLoaderPlugin(parser, {
      materialType: MToonNodeMaterial,
    }),
  });

const readTimeScale = (value: number | { current: number }) =>
  typeof value === "number" ? value : (value?.current ?? 1);

interface VrmCharacterModelProps {
  paused?: boolean;
  timeScale?: number | { current: number };
  ecctrl?: RefObject<EcctrlHandle | null>;
  footIKEnabled?: boolean;
}

export default function VrmCharacterModel({
  paused = false,
  timeScale = 1,
  ecctrl,
  footIKEnabled = true,
}: VrmCharacterModelProps) {
  const { world, rapier } = useRapier();
  const vrmUrl = useVrmStore((state) => state.vrmUrl);
  const gltf = useLoader(GLTFLoader, vrmUrl, (loader) => {
    loader.register(createVrmLoaderPlugin);
  });
  const vrm = gltf.userData.vrm as VRM | undefined;
  if (!vrm) throw new Error(`Loaded file does not contain a VRM: ${vrmUrl}`);

  const { animations } = useGLTF(assetUrl("AnimationLibrary.glb"));
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
  const groupRef = useRef<THREE.Group>(null);
  const footIKRef = useRef<CharacterFootIK | null>(null);
  const [canPlayNext, setCanPlayNext] = useState(true);
  const groundRay = useMemo(
    () =>
      new rapier.Ray(
        { x: 0, y: 0, z: 0 },
        { x: 0, y: -1, z: 0 }
      ),
    [rapier]
  );

  const castGroundRay: CharacterFootIKDeps["castGroundRay"] = (
    origin,
    maxDistance,
    out: FootIKGroundHit
  ) => {
    const body = ecctrl?.current?.body;
    if (!body) return false;
    groundRay.origin.x = origin.x;
    groundRay.origin.y = origin.y;
    groundRay.origin.z = origin.z;
    const hit = world.castRayAndGetNormal(
      groundRay,
      maxDistance,
      false,
      QueryFilterFlags.EXCLUDE_SENSORS,
      undefined,
      undefined,
      body,
      undefined
    );
    if (!hit) return false;
    out.pointY = groundRay.pointAt(hit.timeOfImpact).y;
    out.normal.copy(hit.normal);
    return true;
  };
  const isOnGround = () => ecctrl?.current?.isOnGround ?? false;

  useEffect(() => {
    vrm.scene.traverse((object) => {
      object.frustumCulled = false;
      if (object instanceof THREE.Mesh) {
        object.layers.enable(1);
        object.castShadow = true;
        object.receiveShadow = true;
        const materials = Array.isArray(object.material)
          ? object.material
          : [object.material];
        for (const candidate of materials) {
          // The shadow pass renders every group of a multi-material mesh
          // through one shared override material, so mixed side values force
          // a WebGPU pipeline rebuild per group per frame (periodic stalls).
          candidate.shadowSide = THREE.DoubleSide;
          const material = candidate as MToonNodeMaterial;
          if (material.isMToonNodeMaterial !== true) continue;
          material.shadeColorFactor.lerp(material.color, 0.5);
          material.rimLightingMixFactor = 0.6;
          material.parametricRimFresnelPowerFactor = 2.5;
          material.parametricRimColorFactor
            .set("#cfe0ff")
            .multiplyScalar(0.18);
        }
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
    footIKRef.current = new CharacterFootIK(vrm, groupRef.current!, {
      castGroundRay,
      isOnGround,
    });

    const url = vrmUrl;
    return () => {
      footIKRef.current = null;
      if (mixerRef.current === mixer) mixerRef.current = null;
      if (actionsRef.current === actions) actionsRef.current = new Map();
      mixer.stopAllAction();
      mixer.uncacheRoot(vrm.scene);
      VRMUtils.deepDispose(vrm.scene);
      useLoader.clear(GLTFLoader, url);
    };
  }, [vrm, clips, vrmUrl]);

  useEffect(() => {
    footIKSettings.enabled = footIKEnabled ?? true;
  }, [footIKEnabled]);

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
    footIKRef.current?.update(delta);
  });

  return (
    <group position={[0, -0.95, 0]} ref={groupRef}>
      <primitive object={vrm.scene} />
    </group>
  );
}
