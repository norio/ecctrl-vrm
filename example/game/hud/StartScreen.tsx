import { useProgress } from "@react-three/drei";
import { useEffect, useRef, type ChangeEvent } from "react";
import { useIsTouchDevice } from "../../ui/useIsTouchDevice";
import { useVrmStore } from "../../vrm/useVrmStore";
import { gamepadButtonPressed, readGamepad, type GamepadFrame } from "../gamepad";
import { liveControls, useGameStore } from "../useGameStore";

export function StartScreen() {
  const screen = useGameStore((state) => state.screen);
  const setScreen = useGameStore((state) => state.setScreen);
  const isTouchDevice = useIsTouchDevice();
  const { active } = useProgress();
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isTouchDevice) return;
    const handlePointerLockChange = () => {
      if (
        useGameStore.getState().screen === "playing"
        && document.pointerLockElement === null
      ) {
        useGameStore.getState().setScreen("start");
      }
    };
    document.addEventListener("pointerlockchange", handlePointerLockChange);
    return () => document.removeEventListener("pointerlockchange", handlePointerLockChange);
  }, [isTouchDevice]);

  useEffect(() => {
    if (screen !== "start") return;

    let animationFrame = 0;
    // Seed with a snapshot instead of null so a button already held when the
    // start screen (re)appears is not misread as a fresh rising edge.
    let previousFrame: GamepadFrame | null = readGamepad();
    const pollGamepad = () => {
      const currentFrame = readGamepad();
      if (gamepadButtonPressed(previousFrame, currentFrame, "start")) {
        // Gamepad sessions do not acquire pointer lock.
        setScreen("playing");
        return;
      }
      previousFrame = currentFrame;
      animationFrame = requestAnimationFrame(pollGamepad);
    };

    animationFrame = requestAnimationFrame(pollGamepad);
    return () => cancelAnimationFrame(animationFrame);
  }, [screen, setScreen]);

  if (screen !== "start") return null;

  const startGame = () => {
    setScreen("playing");
    if (isTouchDevice) return;
    try {
      liveControls.cameraControls?.lockPointer();
    } catch {
      // Pointer lock may be temporarily unavailable after an unlock.
    }
  };

  const loadVrm = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    useVrmStore.getState().setVrm(URL.createObjectURL(file), file.name);
  };

  return (
    <div className="startScreen" role="dialog" aria-modal="true" aria-labelledby="startScreenTitle">
      <div className="startScreenCard">
        <h1 className="startScreenTitle" id="startScreenTitle">Leap Up!</h1>
        <p className="startScreenHint">WASD to move · Space to jump</p>
        <button
          className="startScreenButton is-primary"
          type="button"
          onClick={startGame}
          disabled={active}
        >
          Start
        </button>
        <button
          className="startScreenButton"
          type="button"
          onClick={() => fileInputRef.current?.click()}
        >
          Load VRM File
        </button>
        <input
          className="startScreenFileInput"
          ref={fileInputRef}
          type="file"
          accept=".vrm"
          onChange={loadVrm}
        />
        {active && <div className="startScreenLoading">Loading…</div>}
      </div>
    </div>
  );
}
