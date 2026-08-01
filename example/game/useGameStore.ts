import * as THREE from 'three'
import { create } from 'zustand'
import type { EcctrlCameraControlsHandle } from '../../src/camera'

export const livePlayer: { pos: THREE.Vector3; velY: number; onGround: boolean } = {
    pos: new THREE.Vector3(0, 1, 0),
    velY: 0,
    onGround: false,
}

export const liveControls: { cameraControls: EcctrlCameraControlsHandle | null } = {
    cameraControls: null,
}

export interface GameState {
    screen: 'loading' | 'start' | 'playing'
    platformBakeReady: boolean
    seed: number
    status: 'playing' | 'summit'
    playerY: number
    bestY: number
    startedAt: number
    summitTimeMs: number | null
    lastCheckpoint: { pos: [number, number, number]; index: number }
    setScreen(screen: GameState['screen']): void
    setPlatformBakeReady(ready: boolean): void
    setSeed(seed: number): void
    setPlayerY(y: number): void
    setCheckpoint(pos: [number, number, number], index: number): void
    reachSummit(): void
    resetRun(): void
}

const now = () => performance.now()
const initialCheckpoint = () => ({ pos: [0, 0, 0] as [number, number, number], index: 0 })

export const useGameStore = create<GameState>()((set, get) => ({
    screen: 'loading',
    platformBakeReady: false,
    seed: 12345,
    status: 'playing',
    playerY: 0,
    bestY: 0,
    startedAt: now(),
    summitTimeMs: null,
    lastCheckpoint: initialCheckpoint(),
    setScreen: (screen) => set({ screen }),
    setPlatformBakeReady: (platformBakeReady) => set({ platformBakeReady }),
    setSeed: (seed) => {
        livePlayer.pos.set(0, 1, 0)
        livePlayer.velY = 0
        livePlayer.onGround = false
        set({
            seed: seed >>> 0,
            platformBakeReady: false,
            status: 'playing',
            playerY: 0,
            bestY: 0,
            startedAt: now(),
            summitTimeMs: null,
            lastCheckpoint: initialCheckpoint(),
        })
    },
    setPlayerY: (playerY) => set((state) => ({ playerY, bestY: Math.max(state.bestY, playerY) })),
    setCheckpoint: (pos, index) => {
        if (index <= get().lastCheckpoint.index) return
        set({ lastCheckpoint: { pos: [...pos], index } })
    },
    reachSummit: () => {
        const state = get()
        if (state.status === 'summit') return
        set({ status: 'summit', summitTimeMs: now() - state.startedAt })
    },
    resetRun: () => set({ status: 'playing', startedAt: now(), summitTimeMs: null, lastCheckpoint: initialCheckpoint() }),
}))
