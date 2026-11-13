"use client";

import { Icon } from "@/components/icons";
import { places, type PlaceId } from "@/data/world";
import { ALLEY_PLATFORM, PLATFORM, TRAIN_TRACK } from "./courses";
import { CROSSWALKS, PLAZA_R, ROADS, SQUARE_AT, TURNING, WALKWAYS } from "./roads";
import { ARCADE_SPOT, BELT_SPOT, HALL_SPOT, LIFT } from "./undercity-district";
import { ARENA, GARAGE_X, TRACK, TRACK_W } from "./speedway-track";
import { SPEEDWAY_LIFT_SPOT, SPEEDWAY_STAIR_FOOT, SPEEDWAY_STAIR_TOP } from "./speedway-walk";
import { CABS, CABINET_SCALE, HALL as ARCADE_HALL } from "./arcade-hall";
import { CITY_HUBS } from "./CityAdventures";
import { UNDERCITY_ARRIVAL, UNDERCITY_CHECKPOINTS, UNDERCITY_GARAGE, UNDERCITY_ROADS, UNDERCITY_START, UNDERCITY_STOPS, UNDERCITY_STAIR_PATH, UNDERCITY_TURNINGS, UNDERCITY_WALKWAYS, type WorldLevel } from "./undercity-layout";
import styles from "./Wayfinder.module.css";

type Props = {
  current: { x: number; z: number };
  waypoint: PlaceId | null;
  mode: "overview" | "walking" | "driving" | "flying" | "train";
  level: WorldLevel;
  cabinetNames: readonly string[];
  arcadeUnlocked: boolean;
  onChoose: (id: PlaceId) => void;
  onChooseWalkTo: (x: number, z: number, label: string) => void;
  onClear: () => void;
  onClose: () => void;
};

const MIN = -11;
const MAX = 11;
const SIZE = 220;
const WORLD_SCALE = SIZE / (MAX - MIN);
const point = (x: number, z: number) => ({ x: (x - MIN) * WORLD_SCALE, y: (z - MIN) * WORLD_SCALE });
function UndercityMap({ current }: { current: { x: number; y: number } }) {
  const path = UNDERCITY_STAIR_PATH.map((item) => point(item.x, item.z));
  return (
    <svg className={styles.map} viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label="Undercity schematic showing the loop road, promenade, subway stops, garage, and stairs to Platform 404">
      <rect className={styles.ground} x="0" y="0" width={SIZE} height={SIZE} rx="14" />
      {UNDERCITY_ROADS.map((road, i) => {
        const a = point(road.x - road.hw, road.z - road.hd);
        const b = point(road.x + road.hw, road.z + road.hd);
        return <rect key={i} className={styles.road} x={a.x} y={a.y} width={b.x - a.x} height={b.y - a.y} rx="5" />;
      })}
      {UNDERCITY_TURNINGS.map((corner, i) => {
        const p = point(corner.x, corner.z);
        return <circle key={i} className={styles.road} cx={p.x} cy={p.y} r={corner.r * WORLD_SCALE} />;
      })}
      {UNDERCITY_WALKWAYS.map((pathway, i) => {
        const a = point(pathway.x - pathway.hw, pathway.z - pathway.hd);
        const b = point(pathway.x + pathway.hw, pathway.z + pathway.hd);
        return <rect key={i} className={styles.walkway} x={a.x} y={a.y} width={b.x - a.x} height={b.y - a.y} rx="3" />;
      })}
      <path className={styles.rail} d={`M ${point(-6, -8.75).x} ${point(-6, -8.75).y} H ${point(6, -8.75).x}`} />
      {UNDERCITY_STOPS.map((stop) => {
        const p = point(...stop.at);
        return <g key={stop.id}><circle className={styles.station} cx={p.x} cy={p.y} r="3.5" /><text className={styles.stationLabel} x={p.x - 12} y={p.y - 6}>{stop.label}</text></g>;
      })}
      {UNDERCITY_CHECKPOINTS.map((checkpoint) => {
        const p = point(...checkpoint.at);
        return <g key={checkpoint.id}><circle className={styles.station} cx={p.x} cy={p.y} r="2.4" /><text className={styles.stationLabel} x={p.x + 3} y={p.y - 3}>{checkpoint.label.slice(0, 2)}</text></g>;
      })}
      {(() => { const p = point(...UNDERCITY_START); return <text className={styles.stationLabel} x={p.x - 10} y={p.y - 5}>START</text>; })()}
      {(() => { const p = point(...UNDERCITY_GARAGE); return <text className={styles.stationLabel} x={p.x - 12} y={p.y - 5}>GARAGE</text>; })()}
      {[{ label: "ARCADE", at: ARCADE_SPOT }, { label: "API", at: HALL_SPOT }, { label: "BUILD", at: BELT_SPOT }, { label: "LIFT", at: LIFT }, { label: "SPEEDWAY", at: SPEEDWAY_STAIR_TOP }].map(({ label, at }) => {
        const p = point(...at);
        return <g key={label}><circle className={styles.landmark} cx={p.x} cy={p.y} r="2.5" /><text className={styles.stationLabel} textAnchor={p.x > 175 ? "end" : "start"} x={p.x + (p.x > 175 ? -4 : 4)} y={p.y - 3}>{label}</text></g>;
      })}
      <path className={styles.rail} d={`M ${path.map((p) => `${p.x},${p.y}`).join(" ")}`} />
      <text className={styles.stationLabel} x={path[0].x - 16} y={path[0].y + 14}>404 STAIRS</text>
      <circle className={styles.youHalo} cx={current.x} cy={current.y} r="6" />
      <circle className={styles.you} cx={current.x} cy={current.y} r="3.5" />
    </svg>
  );
}

function circuitPath() { return TRACK.filter((_, i) => i % 3 === 0).map((sample, i) => {
  const p = point(sample.x, sample.z);
  return `${i ? "L" : "M"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
}).join(" ") + " Z"; }

const SPEEDWAY_DESTINATIONS: { id: string; label: string; at: [number, number] }[] = [
  { id: "pit", label: "Pit garages", at: [(GARAGE_X[0] + GARAGE_X[GARAGE_X.length - 1]) / 2, -8.75] },
  { id: "arena", label: "Arena", at: [ARENA.x, ARENA.z] },
  { id: "lift", label: "Lift to lower city", at: SPEEDWAY_LIFT_SPOT },
  { id: "stairs", label: "Stairs to lower city", at: SPEEDWAY_STAIR_FOOT },
  { id: "stand", label: "Grandstand", at: [3.6, -8.75] },
];

function SpeedwayMap({ current }: { current: { x: number; y: number } }) {
  const arena = point(ARENA.x, ARENA.z);
  const path = circuitPath();
  return <svg className={styles.map} viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label="Speedway map showing the circuit, arena, pits, grandstand, lift and stairs">
    <rect className={styles.ground} width={SIZE} height={SIZE} rx="14" />
    <path className={styles.circuit} d={path} strokeWidth={TRACK_W * WORLD_SCALE} />
    <path className={styles.circuitLine} d={path} />
    <circle className={styles.arena} cx={arena.x} cy={arena.y} r={ARENA.r * WORLD_SCALE} />
    <text className={styles.stationLabel} textAnchor="middle" x={arena.x} y={arena.y + 2}>ARENA</text>
    {SPEEDWAY_DESTINATIONS.filter((item) => item.id !== "arena").map((item) => {
      const p = point(...item.at);
      const label = item.id === "pit" ? "PITS" : item.id === "lift" ? "LIFT" : item.id === "stairs" ? "STAIRS" : "STAND";
      return <g key={item.id}><circle className={styles.landmark} cx={p.x} cy={p.y} r="2.8" /><text className={styles.stationLabel} textAnchor="middle" x={p.x} y={p.y - 5}>{label}</text></g>;
    })}
    <circle className={styles.youHalo} cx={current.x} cy={current.y} r="6" />
    <circle className={styles.you} cx={current.x} cy={current.y} r="3.5" />
  </svg>;
}

const arcadePoint = (x: number, z: number) => ({ x: SIZE / 2 + x * 20, y: SIZE / 2 + z * 20 });
const ARCADE_DESTINATIONS: { id: string; label: string; at: [number, number] }[] = [
  { id: "exit", label: "Exit to the night market", at: [0, 4.55] },
  { id: "scores", label: "High scores", at: [0, -4.2] },
  { id: "prizes", label: "Prize counter", at: [-0.8, 3.9] },
  { id: "claw", label: "Claw machine", at: [0.85, 3.9] },
  ...CABS.map((cab, i) => ({ id: `cab-${i}`, label: `Cabinet ${i + 1}`, at: [cab.x + cab.face * (0.41 * CABINET_SCALE + 0.23), cab.z] as [number, number] })),
];

function ArcadeMap({ current }: { current: { x: number; z: number } }) {
  const here = arcadePoint(current.x, current.z);
  const topLeft = arcadePoint(-ARCADE_HALL.hw, -ARCADE_HALL.hd);
  return <svg className={styles.map} viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label="Arcade map showing the cabinets, high scores, prize counter, claw machine and exit">
    <rect className={styles.ground} width={SIZE} height={SIZE} rx="14" />
    <rect className={styles.walkway} x={topLeft.x} y={topLeft.y} width={ARCADE_HALL.hw * 40} height={ARCADE_HALL.hd * 40} rx="4" />
    {CABS.map((cab, i) => {
      const p = arcadePoint(cab.x, cab.z);
      return <g key={i}>
        <rect className={styles.cabinet} x={p.x - 6} y={p.y - 5} width="12" height="10" rx="2" />
        <text className={styles.stationLabel} textAnchor={cab.x < 0 ? "end" : "start"} x={p.x + (cab.x < 0 ? -10 : 10)} y={p.y + 2}>{i + 1}</text>
      </g>;
    })}
    {ARCADE_DESTINATIONS.slice(0, 4).map((item) => {
      const p = arcadePoint(...item.at);
      const label = item.id === "exit" ? "EXIT" : item.id === "scores" ? "SCORES" : item.id === "prizes" ? "PRIZES" : "CLAW";
      return <g key={item.id}><circle className={styles.landmark} cx={p.x} cy={p.y} r="2.5" /><text className={styles.stationLabel} textAnchor={item.id === "prizes" ? "end" : item.id === "claw" ? "start" : "middle"} x={p.x + (item.id === "prizes" ? -5 : item.id === "claw" ? 5 : 0)} y={p.y - 5}>{label}</text></g>;
    })}
    <circle className={styles.youHalo} cx={here.x} cy={here.y} r="6" />
    <circle className={styles.you} cx={here.x} cy={here.y} r="3.5" />
  </svg>;
}

export default function Wayfinder({ current, waypoint, mode, level, cabinetNames, arcadeUnlocked, onChoose, onChooseWalkTo, onClear, onClose }: Props) {
  const here = point(current.x, current.z);
  const destination = level === "surface" ? places.find((place) => place.id === waypoint) ?? null : null;
  const plaza = point(0, 0);
  const square = point(SQUARE_AT[0], SQUARE_AT[1]);
  const platform = point(PLATFORM[0], PLATFORM[1]);
  const alleyPlatform = point(ALLEY_PLATFORM[0], ALLEY_PLATFORM[1]);
  const trackStart = point(-TRAIN_TRACK, -TRAIN_TRACK);
  const trackEnd = point(TRAIN_TRACK, TRAIN_TRACK);
  const headingId = "wayfinder-heading";
  const modeLabel = mode === "overview" ? "" : mode[0].toUpperCase() + mode.slice(1);
  const floorName = level === "surface" ? "Surface island" : level === "undercity" ? "Lower city" : level === "speedway" ? "Speedway" : "Arcade";
  const modeName = mode === "overview" ? "Exploring" : modeLabel;
  const walkingUnavailable = mode === "driving" || mode === "flying" || mode === "train";
  const instruction = mode === "train"
    ? "Get off at a station before choosing a walking destination."
    : walkingUnavailable
      ? "Leave your vehicle before choosing a walking destination."
      : "Choose a destination to walk there.";

  return (
    <section id="cube-world-wayfinder" className={styles.panel} aria-labelledby={headingId}>
      <header className={styles.header}>
        <h2 id={headingId}>Wayfinder</h2>
        <button className={styles.close} type="button" onClick={onClose} aria-label="Close wayfinder">
          <Icon name="close" size={17} />
        </button>
      </header>

      <p className={styles.status}><strong>{floorName}</strong><span>{modeName}</span></p>
      {destination ? <p className={styles.selectedDestination}>Selected destination: <strong>{destination.label}</strong></p> : null}
      <p className={styles.instruction}>{instruction}</p>

      {level === "undercity" ? <UndercityMap current={here} /> : level === "speedway" ? <SpeedwayMap current={here} /> : level === "arcade" ? <ArcadeMap current={current} /> : (
      <svg className={styles.map} viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label="Schematic map of island roads, walkways, crossings, the sl rail loop, its sl station and Platform 404 stops, and landmarks">
        <rect className={styles.ground} x="0" y="0" width={SIZE} height={SIZE} rx="14" />
        {ROADS.map((road, i) => {
          const start = point(road.x - road.hw, road.z - road.hd);
          const end = point(road.x + road.hw, road.z + road.hd);
          return (
            <rect
              key={`${road.name}-${i}`}
              className={styles.road}
              x={start.x}
              y={start.y}
              width={Math.max(2, end.x - start.x)}
              height={Math.max(2, end.y - start.y)}
              rx="3"
            />
          );
        })}
        {TURNING.map(([x, z, radius], i) => {
          const p = point(x, z);
          return <circle key={i} className={styles.road} cx={p.x} cy={p.y} r={radius * WORLD_SCALE} />;
        })}
        <circle className={styles.road} cx={plaza.x} cy={plaza.y} r={PLAZA_R * WORLD_SCALE} />
        <circle className={styles.road} cx={square.x} cy={square.y} r={SQUARE_AT[2] * WORLD_SCALE} />
        {WALKWAYS.map((path, i) => {
          const start = point(path.x - path.hw, path.z - path.hd);
          const end = point(path.x + path.hw, path.z + path.hd);
          return <rect key={`path-${i}`} className={styles.walkway} x={start.x} y={start.y} width={Math.max(2, end.x - start.x)} height={Math.max(2, end.y - start.y)} rx="2" />;
        })}
        {CROSSWALKS.map((crossing, i) => {
          const start = point(crossing.x - crossing.hw, crossing.z - crossing.hd);
          const end = point(crossing.x + crossing.hw, crossing.z + crossing.hd);
          return <rect key={`cross-${i}`} className={styles.crosswalk} x={start.x} y={start.y} width={Math.max(2, end.x - start.x)} height={Math.max(2, end.y - start.y)} rx="1" />;
        })}
        <path className={styles.rail} d={`M ${trackStart.x} ${trackStart.y} H ${trackEnd.x} V ${trackEnd.y} H ${trackStart.x} V ${trackStart.y}`} />
        <circle className={styles.station} cx={platform.x} cy={platform.y} r="3.1" />
        <circle className={styles.station} cx={alleyPlatform.x} cy={alleyPlatform.y} r="3.1" />
        <circle className={styles.selected} cx={point(8.65, 8.7).x} cy={point(8.65, 8.7).y} r="3.4" />
        <text className={styles.stationLabel} x={platform.x + 5} y={platform.y + 2}>sl</text>
        <text className={styles.stationLabel} x={alleyPlatform.x - 17} y={alleyPlatform.y + 2}>404</text>
        <text className={styles.stationLabel} x={point(8.65, 8.7).x - 19} y={point(8.65, 8.7).y - 5}>404 stairs</text>
        {places.map((place) => {
          const p = point(place.at[0], place.at[1]);
          return (
            <circle
              key={place.id}
              className={place.id === waypoint ? styles.selected : styles.landmark}
              cx={p.x}
              cy={p.y}
              r={place.id === waypoint ? 5 : 3}
            />
          );
        })}
        {CITY_HUBS.map((hub) => {
          const p = point(hub.at[0], hub.at[1]);
          return (
            <g key={hub.id} aria-hidden="true">
              <circle className={styles.hubHalo} cx={p.x} cy={p.y} r="5.3" />
              <circle className={styles.hubMarker} cx={p.x} cy={p.y} r="3.5" fill={hub.color} />
            </g>
          );
        })}
        <circle className={styles.youHalo} cx={here.x} cy={here.y} r="6" />
        <circle className={styles.you} cx={here.x} cy={here.y} r="3.5" />
      </svg>
      )}

      {level === "surface" ? <>
      <div className={styles.legend} role="group" aria-label="Map legend">
        <span><i className={styles.legendYou} />You are here</span>
        <span><i className={styles.legendLandmark} />Landmarks</span>
        <span><i className={styles.legendWalkway} />Walkways</span>
        <span><i className={styles.legendRail} />Rail + stations</span>
        <span><i className={styles.legendHub} />Adventure hubs</span>
        {destination ? <span><i className={styles.legendDestination} />Destination</span> : null}
      </div>

      <div className={styles.listHeader}>
        <h3>Landmarks</h3>
        {waypoint ? <button className={styles.clear} type="button" onClick={onClear}>Clear destination</button> : null}
      </div>
      <ul className={styles.list}>
        {places.map((place) => (
          <li key={place.id}>
            <button
              type="button"
              className={`${styles.place} ${waypoint === place.id ? styles.active : ""}`}
              aria-pressed={waypoint === place.id}
              onClick={() => onChoose(place.id)}
            >
              <span className={styles.dot} style={{ "--place-color": place.color } as React.CSSProperties} aria-hidden="true" />
              {place.label}
              <span className={styles.kind}>{walkingUnavailable ? mode === "train" ? "Get off train" : "Exit vehicle" : mode === "walking" ? "Walk there" : "Open preview"}</span>
            </button>
          </li>
        ))}
      </ul>
      <div className={styles.listHeader}><h3>Adventure districts</h3></div>
      <ul className={styles.list}>
        {CITY_HUBS.map((hub) => (
          <li key={hub.id}>
            <button
              type="button"
              className={styles.place}
              disabled={walkingUnavailable}
              onClick={() => onChooseWalkTo(hub.walkAt[0], hub.walkAt[1], hub.label)}
            >
              <span className={styles.dot} style={{ "--place-color": hub.color } as React.CSSProperties} aria-hidden="true" />
              {hub.label}
              <span className={styles.kind}>Walk there</span>
            </button>
          </li>
        ))}
      </ul>
      <div className={styles.listHeader}><h3>Walk to</h3></div>
      <ul className={styles.list}>
        <li>
          <button
            type="button"
            className={styles.place}
            disabled={walkingUnavailable}
            onClick={() => onChooseWalkTo(8.65, 8.7, "Platform 404 stairs")}
          >
            <span className={styles.dot} style={{ "--place-color": "var(--accent)" } as React.CSSProperties} aria-hidden="true" />
            Platform 404 stairs
            <span className={styles.kind}>Walk there</span>
          </button>
        </li>
      </ul>
      </> : <>
        <div className={styles.legend} role="group" aria-label="Map legend">
          <span><i className={styles.legendYou} />You are here</span>
          <span><i className={styles.legendLandmark} />Places</span>
        </div>
        <div className={styles.listHeader}><h3>Walk to</h3></div>
        <ul className={styles.list}>
          {(level === "speedway" ? SPEEDWAY_DESTINATIONS : level === "arcade" ? ARCADE_DESTINATIONS : [
            { id: "garage", label: "Garage", at: [UNDERCITY_GARAGE[0], UNDERCITY_GARAGE[1] + 0.42] as [number, number] },
            ...UNDERCITY_STOPS.map((stop) => ({ id: stop.id, label: `${stop.label} platform`, at: [stop.at[0], stop.at[1] + 1.55] as [number, number] })),
            { id: "404", label: "Platform 404 landing", at: UNDERCITY_ARRIVAL },
            { id: "promenade", label: "Central promenade", at: [0, -0.7] as [number, number] },
            { id: "arcade", label: "Night market arcade", at: ARCADE_SPOT },
            { id: "server", label: "API wall", at: HALL_SPOT },
            { id: "pipeline", label: "Build conveyor", at: BELT_SPOT },
            { id: "lift", label: "Speedway lift", at: LIFT },
            { id: "speedway-stairs", label: "Speedway stairs", at: SPEEDWAY_STAIR_TOP },
          ]).map((destination) => {
            const cabinetIndex = level === "arcade" && destination.id.startsWith("cab-") ? Number(destination.id.slice(4)) : -1;
            const cabinetName = cabinetIndex === 9 && !arcadeUnlocked ? "Mystery cabinet" : cabinetNames[cabinetIndex];
            const label = cabinetIndex >= 0 && cabinetName ? `${destination.label} · ${cabinetName}` : destination.label;
            return <li key={destination.id}>
              <button
                type="button"
                className={styles.place}
                disabled={mode !== "walking"}
                onClick={() => onChooseWalkTo(destination.at[0], destination.at[1], label)}
              >
                <span className={styles.dot} style={{ "--place-color": "var(--accent)" } as React.CSSProperties} aria-hidden="true" />
                {label}
                <span className={styles.kind}>walk</span>
              </button>
            </li>;
          })}
        </ul>
      </>}
    </section>
  );
}
