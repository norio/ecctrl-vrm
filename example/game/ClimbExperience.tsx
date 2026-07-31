import { KeyboardControls, StatsGl } from "@react-three/drei";
import { Physics } from "@react-three/rapier";
import { button, useControls } from "leva";
import { useEffect, useMemo, useRef } from "react";
import { useCustomGravity } from "../../src/gravity";
import { TimeControl } from "../../src/time";
import { DebugApi } from "./DebugApi";
import { makeGravityField } from "./gravityField";
import { generateLevel } from "./level";
import { OnlyUpMap } from "./OnlyUpMap";
import { PlayerRig } from "./PlayerRig";
import { useGameStore } from "./useGameStore";
import { Atmosphere } from "./visuals/Atmosphere";
import { Decorations } from "./visuals/Decorations";
import { GameEffects } from "./visuals/GameEffects";

const ECCTRL_KEYBOARD_MAP = [
  { name: "W", keys: ["KeyW"] },
  { name: "S", keys: ["KeyS"] },
  { name: "A", keys: ["KeyA"] },
  { name: "D", keys: ["KeyD"] },
  { name: "Space", keys: ["Space"] },
  { name: "Shift", keys: ["ShiftLeft", "ShiftRight"] },
  { name: "R", keys: ["KeyR"] },
  { name: "Up", keys: ["ArrowUp"] },
  { name: "Down", keys: ["ArrowDown"] },
  { name: "Left", keys: ["ArrowLeft"] },
  { name: "Right", keys: ["ArrowRight"] },
];

export default function ClimbExperience() {
  const seed = useGameStore((state) => state.seed);
  const screen = useGameStore((state) => state.screen);
  const spec = useMemo(() => generateLevel(seed), [seed]);
  const gravityField = useMemo(() => makeGravityField(spec), [spec]);

  useEffect(() => {
    useCustomGravity.getState().setGravityField(gravityField);
  }, [gravityField]);

  const timeScale = useRef(1);
  const hasStarted = useRef(false);
  const [{ pausedPhysics, physicsDebug, physicsGravity }, setWorldSettings] = useControls(
    "World Settings",
    () => ({
      physicsDebug: false,
      pausedPhysics: true,
      physicsGravity: { value: [0, 0, 0] },
      slowMotion: {
        value: timeScale.current,
        min: 0.01,
        max: 1,
        step: 0.01,
        onChange: (value: number) => {
          timeScale.current = value;
        },
      },
    }),
    { collapsed: true },
  );

  const [{ characterModel, footIK, showStats }] = useControls(
    "Game",
    () => ({
      seed: {
        value: seed,
        step: 1,
        onChange: (value: number) => useGameStore.getState().setSeed(value >>> 0),
      },
      regenerate: button(() => useGameStore.getState().setSeed(Date.now() >>> 0)),
      characterModel: {
        value: "vrm" as "vrm" | "mannequin" | "capsule",
        options: ["vrm", "mannequin", "capsule"],
      },
      footIK: true,
      showStats: false,
    }),
    { collapsed: true },
    [seed],
  );

  useEffect(() => {
    if (screen !== "playing" || hasStarted.current) return;
    hasStarted.current = true;
    setWorldSettings({ pausedPhysics: false });
  }, [screen, setWorldSettings]);

  return (
    <>
      {showStats && <StatsGl className="performanceStats" />}
      <Atmosphere />
      <Decorations spec={spec} />
      <GameEffects />
      <DebugApi spec={spec} />

      {/* Keep Physics paused because TimeControl manually steps Rapier. */}
      <Physics debug={physicsDebug} timeStep="vary" gravity={physicsGravity} paused>
        <TimeControl paused={pausedPhysics} timeScale={timeScale} />
        <KeyboardControls map={ECCTRL_KEYBOARD_MAP}>
          <PlayerRig
            key={seed}
            spec={spec}
            paused={pausedPhysics}
            timeScale={timeScale}
            characterModel={characterModel as "vrm" | "mannequin" | "capsule"}
            footIK={footIK}
          />
        </KeyboardControls>
        <OnlyUpMap key={seed} spec={spec} paused={pausedPhysics} timeScale={timeScale} />
      </Physics>
    </>
  );
}
