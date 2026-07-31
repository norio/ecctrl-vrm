export interface GamepadFrame {
    connected: boolean;
    leftStick: { x: number; y: number };
    rightStick: { x: number; y: number };
    jump: boolean;
    walk: boolean;
    respawn: boolean;
    start: boolean;
}

const STICK_DEADZONE = 0.15;

function readStick(x: number | undefined, y: number | undefined) {
    const stick = { x: x ?? 0, y: y ?? 0 };
    return Math.hypot(stick.x, stick.y) < STICK_DEADZONE
        ? { x: 0, y: 0 }
        : stick;
}

function disconnectedFrame(): GamepadFrame {
    return {
        connected: false,
        leftStick: { x: 0, y: 0 },
        rightStick: { x: 0, y: 0 },
        jump: false,
        walk: false,
        respawn: false,
        start: false,
    };
}

export function readGamepad(): GamepadFrame {
    if (
        typeof navigator === "undefined"
        || typeof navigator.getGamepads !== "function"
    ) {
        return disconnectedFrame();
    }

    const gamepad = Array.from(navigator.getGamepads()).find(
        // Some browsers leave a stale, non-null Gamepad object in the slot
        // after disconnect; connected must be checked explicitly.
        (candidate) => candidate !== null && candidate.connected,
    );
    if (!gamepad) return disconnectedFrame();

    const jump = gamepad.buttons[0]?.pressed ?? false;
    return {
        connected: true,
        leftStick: readStick(gamepad.axes[0], gamepad.axes[1]),
        rightStick: readStick(gamepad.axes[2], gamepad.axes[3]),
        jump,
        walk: gamepad.buttons[4]?.pressed ?? false,
        respawn: gamepad.buttons[3]?.pressed ?? false,
        start: jump,
    };
}

export function gamepadButtonPressed(
    prev: GamepadFrame | null,
    curr: GamepadFrame,
    key: "jump" | "respawn" | "start",
): boolean {
    return curr[key] && !(prev?.[key] ?? false);
}
