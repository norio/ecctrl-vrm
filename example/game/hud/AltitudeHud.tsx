import { useEffect, useRef, useState } from "react";
import { biomeAt, type Biome } from "../palette";
import { livePlayer, useGameStore } from "../useGameStore";

interface HudSnapshot {
    altitude: number;
    best: number;
    seed: number;
    elapsedMs: number;
    status: "playing" | "summit";
    summitTimeMs: number | null;
}

function readSnapshot(): HudSnapshot {
    const game = useGameStore.getState();
    return {
        altitude: livePlayer.pos.y,
        best: game.bestY,
        seed: game.seed,
        elapsedMs: game.summitTimeMs ?? performance.now() - game.startedAt,
        status: game.status,
        summitTimeMs: game.summitTimeMs,
    };
}

function formatClock(milliseconds: number) {
    const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatFinalTime(milliseconds: number) {
    const centiseconds = Math.floor((Math.max(0, milliseconds) % 1000) / 10);
    return `${formatClock(milliseconds)}.${String(centiseconds).padStart(2, "0")}`;
}

export function AltitudeHud() {
    const [snapshot, setSnapshot] = useState(readSnapshot);
    const initialBiome = biomeAt(snapshot.altitude);
    const [biome, setBiome] = useState<Biome>(initialBiome);
    const [biomeVisible, setBiomeVisible] = useState(true);
    const biomeId = useRef(initialBiome.id);
    const transitionTimer = useRef<number | null>(null);

    useEffect(() => {
        const interval = window.setInterval(() => {
            const next = readSnapshot();
            setSnapshot(next);
            const nextBiome = biomeAt(next.altitude);
            if (nextBiome.id === biomeId.current || transitionTimer.current !== null) {
                return;
            }
            setBiomeVisible(false);
            transitionTimer.current = window.setTimeout(() => {
                biomeId.current = nextBiome.id;
                setBiome(nextBiome);
                setBiomeVisible(true);
                transitionTimer.current = null;
            }, 400);
        }, 100);
        return () => {
            window.clearInterval(interval);
            if (transitionTimer.current !== null) {
                window.clearTimeout(transitionTimer.current);
            }
        };
    }, []);

    return (
        <div className="altitudeHud" aria-live="polite">
            <div className="altitudeHudAltitude">
                <div className="altitudeHudCurrent">
                    {snapshot.altitude.toFixed(1)} m
                </div>
                <div className="altitudeHudBest">BEST {snapshot.best.toFixed(1)} m</div>
            </div>

            <div
                className={`altitudeHudBiome${biomeVisible ? "" : " is-changing"}`}
            >
                {biome.jpName}
            </div>

            <div className="altitudeHudRun">
                <div>SEED {snapshot.seed}</div>
                <div>{formatClock(snapshot.elapsedMs)}</div>
            </div>

            {snapshot.status === "summit" && snapshot.summitTimeMs !== null && (
                <div className="altitudeHudSummit">
                    <div className="altitudeHudSummitTitle">登頂</div>
                    <div className="altitudeHudSummitTime">
                        {formatFinalTime(snapshot.summitTimeMs)}
                    </div>
                    <div className="altitudeHudSummitRestart">R でリスタート</div>
                </div>
            )}
        </div>
    );
}
