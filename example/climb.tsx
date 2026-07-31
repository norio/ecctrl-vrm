import "./style.css";
import * as THREE from "three";
import ReactDOM from "react-dom/client";
import { Canvas } from "@react-three/fiber";
import ClimbExperience from "./game/ClimbExperience";
import { Leva } from "leva";
import { Suspense } from "react";
import { Bvh } from "@react-three/drei";
import { Joystick, VirtualButton } from "../src/input";
import { AltitudeHud } from "./game/hud/AltitudeHud";
import { ClimbControlHints } from "./game/hud/ClimbControlHints";
import { CopyrightNotice } from "./ui/CopyrightNotice";
import { useIsTouchDevice } from "./ui/useIsTouchDevice";
import { VrmDropTarget } from "./vrm/VrmDropTarget";

document.body.classList.add("climb");

const root = ReactDOM.createRoot(document.querySelector("#root")!);

const JoystickControls = () => {
  const isTouchScreen = useIsTouchDevice();

  if (!isTouchScreen) return null;

  return (
    <>
      <Joystick id="left" joystickWrapperStyle={{ left: "0", bottom: "0" }} />
      <VirtualButton id="b1" label="Run" buttonWrapperStyle={{ right: "100px", bottom: "30px" }} />
      <VirtualButton id="b2" label="Jump" buttonWrapperStyle={{ right: "40px", bottom: "90px" }} />
    </>
  );
};

root.render(
  <>
    <Leva collapsed />
    <JoystickControls />
    <AltitudeHud />
    <ClimbControlHints />
    <CopyrightNotice />
    <VrmDropTarget />
    <Canvas
      shadows={{ type: THREE.PCFShadowMap }}
      camera={{
        fov: 75,
        near: 0.1,
        far: 1000,
        position: [0, 0, -4],
      }}
    >
      <Suspense fallback={null}>
        <Bvh firstHitOnly>
          <ClimbExperience />
        </Bvh>
      </Suspense>
    </Canvas>
  </>,
);
