import { useProgress } from "@react-three/drei";
import { useEffect, useRef } from "react";
import { useGameStore } from "../useGameStore";

export function LoadingScreen() {
  const screen = useGameStore((state) => state.screen);
  const { active, progress, total } = useProgress();
  const hasStartedLoading = useRef(false);

  useEffect(() => {
    if (screen !== "loading") return;
    if (active || total > 0) {
      hasStartedLoading.current = true;
    }
    if (!active && hasStartedLoading.current && progress === 100) {
      useGameStore.getState().setScreen("start");
    }
  }, [active, progress, screen, total]);

  if (screen !== "loading") return null;

  const percentage = Math.round(progress);

  return (
    <div className="loadingScreen" role="status" aria-live="polite">
      <div className="loadingScreenContent">
        <div className="loadingScreenTitle">Leap Up!</div>
        <div className="loadingScreenProgressText">{percentage}%</div>
        <div
          className="loadingScreenProgressTrack"
          role="progressbar"
          aria-label="Loading game data"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percentage}
        >
          <div
            className="loadingScreenProgressBar"
            style={{ transform: `scaleX(${progress / 100})` }}
          />
        </div>
      </div>
    </div>
  );
}
