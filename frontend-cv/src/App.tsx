import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Activity,
  ArrowDownLeft,
  ArrowUpRight,
  Box,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Crosshair,
  Droplets,
  Expand,
  Focus,
  Hand,
  Layers,
  Maximize2,
  Minus,
  MousePointer2,
  Pause,
  Play,
  Plus,
  Radio,
  RotateCcw,
  ScanLine,
  ShieldCheck,
  SlidersHorizontal,
  TriangleAlert,
  Waves,
  X,
} from "lucide-react";
const DigitalTwin = lazy(() =>
  import("./components/DigitalTwin").then((m) => ({ default: m.DigitalTwin })),
);
import { demoSnapshot } from "./data/demo";
import { validateSnapshot } from "./data/validate";
import type { TwinSnapshot, TwinSource, ViewCommand } from "./data/types";
import {
  useHandTracking,
  type HandEvent,
  type InteractionMode,
} from "./gestures/useHandTracking";
function Sparkline({
  values,
  color = "#56e4e9",
}: {
  values: number[];
  color?: string;
}) {
  const max = Math.max(100, ...values);
  return (
    <svg
      viewBox="0 0 240 65"
      preserveAspectRatio="none"
      role="img"
      aria-label="Reported telemetry history"
    >
      <path
        d="M0 15H240M0 40H240M0 64H240"
        stroke="#20313b"
        strokeDasharray="3 5"
      />
      <polyline
        points={values
          .map(
            (v, i) =>
              `${(i * 240) / Math.max(1, values.length - 1)},${62 - (v / max) * 54}`,
          )
          .join(" ")}
        fill="none"
        stroke={color}
        strokeWidth="2"
      />
      <path
        d={`M0 65 ${values.map((v, i) => `L${(i * 240) / Math.max(1, values.length - 1)} ${62 - (v / max) * 54}`).join(" ")} L240 65Z`}
        fill={color}
        opacity=".07"
      />
    </svg>
  );
}
export default function App({ source }: { source?: TwinSource }) {
  const [snapshot, setSnapshot] = useState<TwinSnapshot>(() =>
      source
        ? {
            source: "live",
            timestamp: "",
            equipment: [],
            incident: null,
            forecast: null,
          }
        : demoSnapshot(),
    ),
    [scenario, setScenario] = useState("failure"),
    [selected, setSelected] = useState("T-104"),
    [paused, setPaused] = useState(false),
    [enabled, setEnabled] = useState(false),
    [command, setCommand] = useState<ViewCommand | null>(null),
    [help, setHelp] = useState(false),
    [tab, setTab] = useState("twin"),
    [connectionError, setConnectionError] = useState(""),
    [lastUpdate, setLastUpdate] = useState(Date.now()),
    [age, setAge] = useState(0);
  const [inspectorTab, setInspectorTab] = useState("telemetry");
  const [interactionMode, setInteractionMode] =
      useState<InteractionMode>("navigate"),
    [zoomLevel, setZoomLevel] = useState(0.32),
    [manualClutch, setManualClutch] = useState(false),
    [keyboardClutch, setKeyboardClutch] = useState(false);
  const onZoomChange = useCallback((level: number) => setZoomLevel(level), []);
  const stage = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (source) {
      setSnapshot({
        source: "live",
        timestamp: "",
        equipment: [],
        incident: null,
        forecast: null,
      });
      setConnectionError("Waiting for application state");
      return source.subscribe(
        (s) => {
          try {
            validateSnapshot(s);
            setSnapshot(s);
            setConnectionError("");
            setLastUpdate(Date.now());
          } catch (e) {
            setConnectionError(
              e instanceof Error ? e.message : "Invalid application snapshot",
            );
          }
        },
        (e) => setConnectionError(e.message),
      );
    }
    let tick = 0;
    setSnapshot(demoSnapshot(0, scenario));
    const id = setInterval(() => {
      setSnapshot(demoSnapshot(++tick, scenario));
      setLastUpdate(Date.now());
    }, 2000);
    return () => clearInterval(id);
  }, [source, scenario]);
  useEffect(() => {
    const id = setInterval(
      () => setAge(Math.floor((Date.now() - lastUpdate) / 1000)),
      1000,
    );
    return () => clearInterval(id);
  }, [lastUpdate]);
  const select = useCallback((id: string) => {
    setSelected(id);
    setInspectorTab("telemetry");
  }, []);
  const onGesture = useCallback(
    (e: HandEvent) => {
      if (e.gesture === "freeze") {
        setCommand({ type: "zoom-stop" });
        return;
      }
      if (help || tab !== "twin") return;
      if (e.gesture === "mode" && e.mode) {
        setInteractionMode(e.mode);
        return;
      }
      if (
        e.gesture === "zoom" &&
        interactionMode === "zoom" &&
        e.level !== undefined
      ) {
        setCommand({ type: "zoom-level", level: e.level });
        return;
      }
      if (e.gesture === "rotate") {
        setCommand({ type: "rotate", delta: e.delta ?? 0, pitch: e.pitch });
        return;
      }
      if (interactionMode !== "navigate") return;
      if (e.gesture === "palm") setPaused((p) => !p);
      if (e.gesture === "swipe")
        setCommand({ type: "rotate", delta: (e.delta ?? 1) * 0.4 });
      if (e.gesture === "point") setCommand({ type: "select", x: e.x, y: e.y });
    },
    [help, tab, interactionMode],
  );
  const tracking = useHandTracking(
    enabled,
    onGesture,
    !help && tab === "twin",
    interactionMode,
    zoomLevel,
    manualClutch || keyboardClutch,
  );
  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (
        enabled &&
        event.key === "Shift" &&
        !(event.target as HTMLElement).matches(
          "input,textarea,select,[contenteditable=true]",
        )
      ) {
        setKeyboardClutch(true);
        setCommand({ type: "zoom-stop" });
      }
    };
    const up = (event: KeyboardEvent) => {
      if (event.key === "Shift") setKeyboardClutch(false);
    };
    const blur = () => setKeyboardClutch(false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    if (!enabled) setKeyboardClutch(false);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, [enabled]);
  const requestZoom = (level: number) => {
    tracking.rearm();
    setCommand({ type: "zoom-level", level: Math.max(0, Math.min(1, level)) });
  };
  const focusSelected = useCallback(() => {
    const asset = snapshot.equipment.find((item) => item.id === selected);
    if (asset) {
      tracking.rearm();
      setTab("twin");
      setCommand({ type: "focus", position: asset.position });
    }
  }, [snapshot.equipment, selected]);
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setHelp(false);
        return;
      }
      if (
        (e.target as HTMLElement).matches(
          "input,select,textarea,[contenteditable=true]",
        ) ||
        help
      )
        return;
      const key = e.key.toLowerCase();
      if (key === " ") {
        if ((e.target as HTMLElement).closest("button,a")) return;
        e.preventDefault();
        setPaused((p) => !p);
      }
      if (key === "r") {
        tracking.rearm();
        setCommand({ type: "reset" });
      }
      if (key === "f") focusSelected();
      if (key === "+" || key === "=") {
        tracking.rearm();
        setCommand({ type: "zoom", delta: 0.85 });
      }
      if (key === "-") {
        tracking.rearm();
        setCommand({ type: "zoom", delta: 1.15 });
      }
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        setCommand({
          type: "rotate",
          delta: e.key === "ArrowLeft" ? -0.25 : 0.25,
        });
      }
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [help, focusSelected]);
  const e =
    snapshot.equipment.find((x) => x.id === selected) ?? snapshot.equipment[0];
  const warning = snapshot.equipment.filter(
    (x) => x.status === "failed" || x.status === "warning",
  ).length;
  const dataUnavailable = !!source && snapshot.equipment.length === 0;
  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#" aria-label="Tidewatch home">
          <div className="brand-icon">
            <Waves size={25} />
          </div>
          <span>
            TIDEWATCH<small>PRODUCED WATER INTELLIGENCE</small>
          </span>
        </a>
        <div className="header-divider" />
        <div className="site-id">
          <span className="tiny">OPERATIONS NETWORK</span>
          <span>
            AVON <span className="muted">/</span> NORTH FIELD{" "}
            <ChevronDown size={12} />
          </span>
        </div>
        <div className="header-right">
          <span className="event-pill">
            HACKUTD <b>ZERO DAY</b>
          </span>
          <span className="connection">
            <i className={source && connectionError ? "dot amber" : "dot"} />
            {source
              ? connectionError
                ? "DISCONNECTED"
                : "CONNECTED"
              : "DEMO ENVIRONMENT"}
          </span>
          <span className="avatar">OP</span>
        </div>
      </header>
      <div className="workspace">
        <nav className="rail" aria-label="Primary navigation">
          <div className="rail-top">
            <button
              title="Digital twin"
              aria-label="Digital twin"
              className={tab === "twin" ? "active" : ""}
              onClick={() => setTab("twin")}
            >
              <Box size={21} />
            </button>
            <button
              title="Equipment telemetry"
              aria-label="Equipment telemetry"
              className={tab === "equipment" ? "active" : ""}
              onClick={() => setTab("equipment")}
            >
              <Activity size={21} />
            </button>
            <button
              title="Gesture controls"
              aria-label="Gesture controls"
              onClick={() => setHelp(true)}
            >
              <Hand size={21} />
            </button>
          </div>
          <button
            title="Help and keyboard shortcuts"
            aria-label="Help and keyboard shortcuts"
            onClick={() => setHelp(true)}
          >
            <CircleHelp size={20} />
          </button>
          <span className="rail-version">08</span>
        </nav>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                <span /> SPATIAL OPERATIONS <ChevronRight size={10} /> PHASE 08
              </div>
              <h1>
                See the system.<span> Stay ahead.</span>
              </h1>
              <p>A new perspective on the water that keeps Avon running.</p>
            </div>
            <button
              className={`gesture-toggle ${enabled ? "enabled" : ""}`}
              onClick={() => setEnabled((x) => !x)}
            >
              <Hand size={16} />
              {enabled ? "Disable gestures" : "Enable gestures"}
              <span className="keycap">CV</span>
            </button>
          </div>
          <div className="summary-strip">
            <div>
              <span className="metric-icon">
                <Layers size={18} />
              </span>
              <section>
                <label>FIELD EQUIPMENT</label>
                <strong>
                  {snapshot.equipment.length.toString().padStart(2, "0")}{" "}
                  <small>assets monitored</small>
                </strong>
              </section>
            </div>
            <div>
              <span className="metric-icon warning">
                <TriangleAlert size={18} />
              </span>
              <section>
                <label>ATTENTION REQUIRED</label>
                <strong className="warm">
                  {warning.toString().padStart(2, "0")}{" "}
                  <small>equipment alerts</small>
                </strong>
              </section>
            </div>
            <div>
              <span className="metric-icon">
                <Activity size={18} />
              </span>
              <section>
                <label>TIME TO HIGH-HIGH</label>
                <strong>
                  {snapshot.forecast?.minutes ?? "—"}{" "}
                  <small>
                    {snapshot.forecast
                      ? `min · P10–P90: ${snapshot.forecast.p10}–${snapshot.forecast.p90}`
                      : "No active forecast"}
                  </small>
                </strong>
              </section>
            </div>
            <div>
              <span className="metric-icon magenta">
                <Radio size={18} />
              </span>
              <section>
                <label>DATA SOURCE</label>
                <strong className="source-label">
                  {source ? snapshot.source.toUpperCase() : "SYNTHETIC"}{" "}
                  <small>
                    {source
                      ? "Application subscription"
                      : "Illustrative values"}
                  </small>
                </strong>
              </section>
            </div>
          </div>
          {connectionError && (
            <div className="error-banner" role="alert">
              Application feed: {connectionError}.{" "}
              {dataUnavailable
                ? "Awaiting first snapshot."
                : "Last received values retained."}
            </div>
          )}
          <div className="content-grid">
            <section className="twin-panel panel">
              <div className="panel-heading">
                <div className="panel-title">
                  <Box size={16} />
                  <h2>
                    {tab === "twin"
                      ? "AVON DIGITAL TWIN"
                      : "EQUIPMENT TELEMETRY"}
                  </h2>
                  <span className="live-tag">
                    {source ? "APPLICATION STATE" : "SYNTHETIC DEMO"}
                  </span>
                </div>
                <button
                  className="icon-button"
                  title="Expand visualization"
                  aria-label="Expand visualization"
                  onClick={() => {
                    if (document.fullscreenElement)
                      void document.exitFullscreen();
                    else
                      void stage.current
                        ?.requestFullscreen()
                        .catch(() => setHelp(true));
                  }}
                >
                  <Maximize2 size={15} />
                </button>
              </div>
              <div className="scene" ref={stage}>
                <div className="scene-topline">
                  <div>
                    <i className={paused ? "dot amber" : "dot"} />
                    {paused ? "ANIMATION PAUSED" : "FLOW VISUALIZATION ACTIVE"}
                  </div>
                  <span>AVON / SECTOR 07</span>
                </div>
                {tab === "twin" && !dataUnavailable && (
                  <div
                    className="scene-flow-key"
                    aria-label="Illustrative flow legend"
                  >
                    <span>
                      <i className="flow-live" /> Cyan pulse · flow path
                    </span>
                    <span>
                      <i className="flow-disrupted" /> Magenta · disruption
                    </span>
                    <small>SCHEMATIC</small>
                  </div>
                )}
                {dataUnavailable ? (
                  <div className="webgl-error">
                    Waiting for backend data…
                    <br />
                    No demo values are substituted for application telemetry.
                  </div>
                ) : tab === "twin" ? (
                  <Suspense
                    fallback={
                      <div className="webgl-error">
                        Initializing spatial view…
                      </div>
                    }
                  >
                    <DigitalTwin
                      snapshot={snapshot}
                      selected={selected}
                      onSelect={select}
                      paused={paused}
                      command={command}
                      onZoomChange={onZoomChange}
                    />
                  </Suspense>
                ) : (
                  <div className="equipment-table">
                    <div className="table-head">
                      Equipment <span>Status</span>
                      <span>Level / flow</span>
                    </div>
                    {snapshot.equipment.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => select(item.id)}
                        className={selected === item.id ? "selected" : ""}
                      >
                        <span>
                          <strong>{item.id}</strong>
                          <small>{item.name}</small>
                        </span>
                        <span
                          className={
                            item.status === "failed" ? "pink-text" : ""
                          }
                        >
                          {item.status}
                        </span>
                        <b>
                          {item.level !== undefined
                            ? `${item.level.toFixed(1)}%`
                            : `${item.outflow ?? "—"} bbl/h`}
                        </b>
                      </button>
                    ))}
                  </div>
                )}
                {enabled &&
                  interactionMode === "navigate" &&
                  !help &&
                  tab === "twin" &&
                  tracking.pointer && (
                    <div
                      className="hand-cursor"
                      style={{
                        left: `${tracking.pointer.x * 100}%`,
                        top: `${tracking.pointer.y * 100}%`,
                      }}
                    >
                      <svg
                        className="dwell-ring"
                        viewBox="0 0 44 44"
                        aria-hidden="true"
                      >
                        <circle cx="22" cy="22" r="19" />
                        <circle
                          cx="22"
                          cy="22"
                          r="19"
                          pathLength="1"
                          style={{
                            strokeDasharray: `${tracking.feedback.progress} 1`,
                          }}
                        />
                      </svg>
                      <Crosshair size={24} />
                      <span>
                        {tracking.gesture === "none"
                          ? "TRACKING"
                          : tracking.gesture.toUpperCase()}
                      </span>
                    </div>
                  )}
                <div className="coordinate-label">
                  X 32.90 <span>Y −96.75</span>
                  <br />
                  <small>FIELD REFERENCE · ILLUSTRATIVE</small>
                </div>
                {enabled && tab === "twin" && (
                  <div className="gesture-scene-feedback" role="status">
                    <Hand size={13} />
                    <span>{tracking.feedback.hint}</span>
                    {tracking.runtime && <small>{tracking.runtime}</small>}
                  </div>
                )}
                <div className="scene-controls">
                  <button
                    title="Zoom in (+)"
                    aria-label="Zoom in"
                    onClick={() => requestZoom(zoomLevel + 0.1)}
                  >
                    <Plus size={17} />
                  </button>
                  <button
                    title="Zoom out (-)"
                    aria-label="Zoom out"
                    onClick={() => requestZoom(zoomLevel - 0.1)}
                  >
                    <Minus size={17} />
                  </button>
                  <span />
                  <button
                    title="Focus selected asset (F)"
                    aria-label="Focus selected asset"
                    onClick={focusSelected}
                  >
                    <Crosshair size={17} />
                  </button>
                  <button
                    title="Top view"
                    aria-label="Top view"
                    onClick={() => setCommand({ type: "top" })}
                  >
                    <Layers size={16} />
                  </button>
                  <button
                    title="Reset view (R)"
                    aria-label="Reset view"
                    onClick={() => setCommand({ type: "reset" })}
                  >
                    <Focus size={17} />
                  </button>
                </div>
                <div className="compass">
                  <span>N</span>
                  <Crosshair size={35} />
                  <small>FIELD NORTH</small>
                </div>
              </div>
              <div className="scene-toolbar">
                <div className="view-tabs">
                  <button
                    className={tab === "twin" ? "active" : ""}
                    onClick={() => {
                      setTab("twin");
                      setCommand({ type: "reset" });
                    }}
                  >
                    <Box size={13} /> Perspective
                  </button>
                  <button onClick={() => setCommand({ type: "top" })}>
                    <Layers size={13} /> Top view
                  </button>
                </div>
                <div className="legend">
                  <span>
                    <i />
                    Running
                  </span>
                  <span>
                    <i className="amber" />
                    Warning
                  </span>
                  <span>
                    <i className="pink" />
                    Fault
                  </span>
                </div>
                <button
                  className="icon-button"
                  title={paused ? "Resume animation" : "Pause animation"}
                  aria-label={paused ? "Resume animation" : "Pause animation"}
                  onClick={() => setPaused((p) => !p)}
                >
                  {paused ? <Play size={15} /> : <Pause size={15} />}
                </button>
              </div>
              {tab === "twin" && (
                <div className="zoom-toolbar">
                  <button
                    aria-label="Zoom out one step"
                    onClick={() => requestZoom(zoomLevel - 0.1)}
                  >
                    <Minus size={14} />
                    Zoom out
                  </button>
                  <label className="zoom-slider-label">
                    <span>
                      ZOOM <b>{Math.round(zoomLevel * 100)}%</b>
                    </span>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="1"
                      value={Math.round(zoomLevel * 100)}
                      aria-label="Camera zoom"
                      onChange={(event) =>
                        requestZoom(Number(event.target.value) / 100)
                      }
                    />
                  </label>
                  <button
                    aria-label="Zoom in one step"
                    onClick={() => requestZoom(zoomLevel + 0.1)}
                  >
                    Zoom in
                    <Plus size={14} />
                  </button>
                </div>
              )}
              <div className="incident-strip">
                <TriangleAlert size={17} />
                <div>
                  <strong>
                    {snapshot.incident?.title ??
                      "All monitored equipment nominal"}
                  </strong>
                  <span>
                    {snapshot.incident
                      ? "Inspect the affected asset. Operational approval stays in the core console."
                      : "Continue monitoring reported telemetry."}
                  </span>
                </div>
                {snapshot.incident && (
                  <button
                    onClick={() => select(snapshot.incident!.equipmentId)}
                  >
                    Inspect <ArrowUpRight size={14} />
                  </button>
                )}
              </div>
            </section>
            <aside className="inspector panel">
              <div className="panel-heading">
                <div className="panel-title">
                  <ScanLine size={16} />
                  <h2>ASSET INSPECTOR</h2>
                </div>
                <span className="tiny">READ ONLY</span>
              </div>
              {e && !dataUnavailable ? (
                <>
                  <div className="asset-heading">
                    <span className="asset-type">
                      {e.kind === "tank" ? (
                        <Droplets size={24} />
                      ) : (
                        <Activity size={24} />
                      )}
                    </span>
                    <div>
                      <span className="tiny">
                        {e.kind.toUpperCase()} / NORTH FIELD
                      </span>
                      <h3>
                        {e.id}
                        <span className={`status-chip ${e.status}`}>
                          {e.status === "warning"
                            ? "HIGH LEVEL"
                            : e.status.toUpperCase()}
                        </span>
                      </h3>
                      <p>{e.name}</p>
                    </div>
                  </div>
                  <div className="inspector-tabs">
                    <button
                      className={inspectorTab === "telemetry" ? "active" : ""}
                      onClick={() => setInspectorTab("telemetry")}
                    >
                      Telemetry
                    </button>
                    <button
                      className={inspectorTab === "diagnosis" ? "active" : ""}
                      onClick={() => setInspectorTab("diagnosis")}
                    >
                      Alerts & context
                    </button>
                  </div>
                  {inspectorTab === "telemetry" ? (
                    <>
                      <div className="fill-reading">
                        <label>
                          {e.kind === "tank"
                            ? "CURRENT FILL LEVEL"
                            : "REPORTED OUTFLOW"}
                        </label>
                        <div>
                          <strong>
                            {e.kind === "tank"
                              ? e.level?.toFixed(1)
                              : (e.outflow ?? "—")}
                          </strong>
                          <span>{e.kind === "tank" ? "%" : "bbl/h"}</span>
                          <small>
                            {e.kind === "tank"
                              ? `of ${e.capacity?.toLocaleString()} bbl capacity`
                              : "Latest application measurement"}
                          </small>
                        </div>
                        {e.kind === "tank" && (
                          <>
                            <div className="level-meter">
                              <span style={{ width: `${e.level ?? 0}%` }} />
                              {snapshot.source === "synthetic" && <i />}
                            </div>
                            <div className="scale">
                              <span>0%</span>
                              <span>
                                {snapshot.source === "synthetic"
                                  ? "HIGH-HIGH 95%*"
                                  : "FILL FRACTION"}
                              </span>
                              <span>100%</span>
                            </div>
                          </>
                        )}
                      </div>
                      <div className="flow-pair">
                        <div>
                          <ArrowDownLeft size={15} />
                          <label>INFLOW</label>
                          <strong>
                            {e.inflow ?? "—"}
                            <small>bbl/h</small>
                          </strong>
                        </div>
                        <div>
                          <ArrowUpRight size={15} />
                          <label>OUTFLOW</label>
                          <strong>
                            {e.outflow ?? "—"}
                            <small>bbl/h</small>
                          </strong>
                        </div>
                      </div>
                      <div className="trend">
                        <div>
                          <label>REPORTED HISTORY</label>
                          <span>
                            {snapshot.source === "synthetic"
                              ? "ILLUSTRATIVE"
                              : "SOURCE SAMPLES"}
                          </span>
                        </div>
                        <Sparkline
                          values={e.history}
                          color={e.status === "warning" ? "#ffbd73" : "#56e4e9"}
                        />
                        <div className="trend-scale">
                          <span>Earlier samples</span>
                          <span>Latest</span>
                        </div>
                      </div>
                      {e.kind === "tank" && (
                        <div className="sensors">
                          <div className="section-label">
                            <ShieldCheck size={14} /> SENSOR CROSS-CHECK
                          </div>
                          {[
                            ["Ultrasonic", e.ultrasonic],
                            ["Camera estimate", e.camera],
                            ["Flow balance", e.balance],
                          ].map(([name, value]) => (
                            <div className="sensor-row" key={String(name)}>
                              <span>
                                <i
                                  className={
                                    value == null ? "dot amber" : "dot"
                                  }
                                />
                                {name}
                              </span>
                              <strong>
                                {typeof value === "number"
                                  ? `${value.toFixed(1)}%`
                                  : "Offline"}
                              </strong>
                            </div>
                          ))}
                          <p>Estimates reported by the data source.</p>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="diagnosis">
                      <TriangleAlert size={23} />
                      <h4>
                        {snapshot.incident?.title ?? "No active incident"}
                      </h4>
                      <p>
                        {snapshot.incident?.description ??
                          "The current snapshot reports no active incident."}
                      </p>
                      <p>
                        Diagnosis, forecasts and response plans are owned by the
                        core decision engine.
                      </p>
                      <div className="info-note">
                        Gestures cannot approve a plan or operate equipment.
                      </div>
                    </div>
                  )}
                  <div className="inspector-footer">
                    <i className="dot" />{" "}
                    {source
                      ? `Last update ${age}s ago`
                      : "Synthetic preview · not field measurements"}
                  </div>
                </>
              ) : (
                <div className="diagnosis">Awaiting equipment data.</div>
              )}
            </aside>
          </div>
          <div className="bottom-grid">
            <section className="gesture-panel panel">
              <div className="gesture-copy">
                <div className="section-label">
                  <Hand size={15} /> HANDS-FREE NAVIGATION{" "}
                  <span className="beta">MEDIAPIPE</span>
                </div>
                <h3>
                  {interactionMode === "zoom"
                    ? "Spread thumb + index to zoom."
                    : "Open palm to rotate. Pinch for zoom."}
                </h3>
                <p>
                  Hold pinch 1 second: zoom. Open all fingers: rotate. In zoom,
                  keep your other fingers curled. Pull your palm down for a top
                  view; lift it for a side view. Other hand or Shift: freeze.
                </p>
                <div
                  className="hand-mode-switch"
                  role="group"
                  aria-label="Hand control mode"
                >
                  <button
                    aria-pressed={interactionMode === "zoom"}
                    onClick={() => setInteractionMode("zoom")}
                  >
                    <Expand size={13} />
                    Zoom
                  </button>
                  <button
                    aria-pressed={interactionMode === "navigate"}
                    onClick={() => setInteractionMode("navigate")}
                  >
                    <MousePointer2 size={13} />
                    Rotate / select
                  </button>
                </div>
                <div className="tracking-status">
                  <i
                    className={
                      enabled && !tracking.error ? "dot" : "dot muted-dot"
                    }
                  />
                  {tracking.status}
                  {tracking.gesture !== "none" && <b>{tracking.gesture}</b>}
                </div>
                {enabled && (
                  <div className="tracking-details">
                    <div
                      className="hold-progress"
                      role="progressbar"
                      aria-label={
                        interactionMode === "zoom"
                          ? "Current zoom"
                          : "Gesture hold progress"
                      }
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.round(
                        tracking.feedback.progress * 100,
                      )}
                    >
                      <span
                        style={{
                          width: `${tracking.feedback.progress * 100}%`,
                        }}
                      />
                    </div>
                    <p>
                      {help || tab !== "twin"
                        ? "Return to the 3D view to navigate"
                        : tracking.feedback.hint}
                    </p>
                    {tracking.metrics && (
                      <small>
                        {tracking.runtime} · {tracking.metrics.fps} processed
                        frames/s · {tracking.metrics.inferenceMs} ms inference
                      </small>
                    )}
                    {tracking.lastAction && (
                      <span className="last-gesture-action">
                        LAST ACTION / {tracking.lastAction}
                      </span>
                    )}
                  </div>
                )}
              </div>
              {enabled && (
                <div className="zoom-coach">
                  <div className="zoom-coach-heading">
                    <span>
                      {tracking.clutched
                        ? "CONTROLS FROZEN"
                        : interactionMode === "zoom"
                          ? tracking.zoom?.state === "active"
                            ? "ZOOM ACTIVE"
                            : "MATCH TO RESUME"
                          : "NAVIGATION"}
                    </span>
                    <button
                      className={
                        manualClutch ? "clutch-button engaged" : "clutch-button"
                      }
                      onClick={() => {
                        setCommand({ type: "zoom-stop" });
                        tracking.rearm();
                        setManualClutch((value) => !value);
                      }}
                    >
                      {manualClutch ? <Play size={12} /> : <Pause size={12} />}{" "}
                      {manualClutch ? "Resume controls" : "Freeze controls"}
                    </button>
                  </div>
                  <div
                    className="spread-meter"
                    aria-label="Finger spread compared with camera zoom"
                  >
                    <span
                      className="spread-fill"
                      style={{ width: `${(tracking.zoom?.raw ?? 0) * 100}%` }}
                    />
                    <i
                      className="camera-marker"
                      style={{ left: `${zoomLevel * 100}%` }}
                    />
                    <i
                      className="hand-marker"
                      style={{ left: `${(tracking.zoom?.raw ?? 0) * 100}%` }}
                    />
                  </div>
                  <div className="spread-labels">
                    <span>FINGERS CLOSED / OUT</span>
                    <span>FULL STRETCH / IN</span>
                  </div>
                  <p>
                    <span className="white-marker-key" />
                    White marker: current zoom. Cyan marker: your fingers.
                  </p>
                  <div className="range-calibration">
                    <span>{tracking.controlHand}</span>
                    <button onClick={tracking.switchControlHand}>
                      Change control hand
                    </button>
                  </div>
                  <div className="calibration-actions">
                    <button
                      disabled={tracking.spread === null}
                      onClick={tracking.calibrateClosed}
                    >
                      1. Set fingers closed
                    </button>
                    <button
                      disabled={
                        !tracking.closedCaptured || tracking.spread === null
                      }
                      onClick={tracking.calibrateOpen}
                    >
                      2. Set full stretch
                    </button>
                  </div>
                  <small role="status">
                    {tracking.calibrationMessage ||
                      "Calibrate once: touch thumb to index, set closed, then spread comfortably and set full stretch."}
                  </small>
                </div>
              )}
              {!enabled && (
                <div className="gesture-cards">
                  {[
                    {
                      icon: MousePointer2,
                      name: "Point",
                      action: "Select asset",
                    },
                    {
                      icon: Hand,
                      name: "Other palm",
                      action: "Freeze controls",
                    },
                    {
                      icon: Expand,
                      name: "Spread / close",
                      action: "Zoom in / out",
                    },
                    {
                      icon: RotateCcw,
                      name: "Swipe palm",
                      action: "Rotate view",
                    },
                  ].map((g) => (
                    <button key={g.name} onClick={() => setHelp(true)}>
                      <g.icon size={25} />
                      <strong>{g.name}</strong>
                      <small>{g.action}</small>
                    </button>
                  ))}
                </div>
              )}
              <div className={`camera-preview ${enabled ? "on" : ""}`}>
                <video ref={tracking.video} muted playsInline />
                <canvas ref={tracking.overlay} width={640} height={480} />
                {!enabled && (
                  <div>
                    <ScanLine size={24} />
                    <small>CAMERA OFF</small>
                  </div>
                )}
                <span>{enabled ? "LOCAL PROCESSING" : "OPT-IN CAMERA"}</span>
              </div>
              {tracking.error && (
                <div className="camera-error" role="alert">
                  <span>{tracking.error}</span>
                  <button onClick={tracking.retry}>
                    Retry camera <RotateCcw size={12} />
                  </button>
                </div>
              )}
            </section>
            <section className="demo-panel panel">
              <div className="section-label">
                <SlidersHorizontal size={15} />{" "}
                {source ? "APPLICATION FEED" : "DEMO SCENARIO"}
              </div>
              {source ? (
                <>
                  <h3>Backend connected</h3>
                  <p>
                    Equipment values are supplied by your application
                    subscription.
                  </p>
                </>
              ) : (
                <>
                  <select
                    aria-label="Demo scenario"
                    value={scenario}
                    onChange={(ev) => setScenario(ev.target.value)}
                  >
                    <option value="failure">S1 / Pump failure at night</option>
                    <option value="sensor">
                      S3 / Level sensor disagreement
                    </option>
                    <option value="surge">S4 / Upstream inflow surge</option>
                    <option value="normal">Normal operation</option>
                  </select>
                  <p>
                    Visual fixtures only. No decision engine or equipment
                    actuation.
                  </p>
                </>
              )}
              <button className="text-button" onClick={() => setHelp(true)}>
                Controls & integration notes <ArrowUpRight size={13} />
              </button>
            </section>
          </div>
          <footer>
            <span>
              <ShieldCheck size={12} /> VISUALIZATION ONLY · HUMAN DECISIONS
              ALWAYS
            </span>
            <span>
              {source
                ? "Application data"
                : "*Illustrative 95% threshold · all values synthetic"}{" "}
              <span className="footer-dot">/</span> BUILT FOR HACKUTD 2026
            </span>
          </footer>
        </main>
      </div>
      {help && (
        <div className="modal-backdrop" onClick={() => setHelp(false)}>
          <section
            className="help-modal panel"
            role="dialog"
            aria-modal="true"
            aria-label="Controls and integration notes"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              autoFocus
              className="modal-close icon-button"
              aria-label="Close help"
              onClick={() => setHelp(false)}
            >
              <X size={20} />
            </button>
            <div className="eyebrow">TIDEWATCH / CONTROL GUIDE</div>
            <h2>Take a closer look.</h2>
            <p>
              Drag to orbit. Scroll to zoom. Click an asset or select it below.
              Arrow keys rotate, + / − zoom, R resets, F focuses the selected
              asset, and Space pauses the flow animation. Telemetry keeps
              updating while animations are paused.
            </p>
            <div className="help-equipment">
              {snapshot.equipment.map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    select(item.id);
                    setHelp(false);
                  }}
                >
                  {item.id}
                  <ArrowUpRight size={13} />
                </button>
              ))}
            </div>
            <h3>Gesture navigation</h3>
            <p>
              Show your control hand first. In Zoom mode, thumb–index separation
              controls the whole zoom range: spread to zoom in and close to zoom
              out. Set closed and full stretch once to match your hand. Raise an
              open palm with your other hand to freeze the camera while
              repositioning. You can also hold Shift or use Freeze controls.
              After releasing, match the white current-zoom marker with the cyan
              finger marker and hold briefly to resume without a jump. Navigate
              mode keeps pointing and swipe separate from zoom. In Navigate
              mode, point steadily at an asset for 420 ms to select it, or hold
              a still open palm for 750 ms to pause the flow animation. Hold a
              pinch for one second to enter zoom; keep your middle, ring, and
              pinky fingers curled while adjusting thumb–index spread. Open all
              fingers briefly to switch back to rotation. Swipe an open palm
              sideways to rotate: faster swipes turn faster, with a comfortable
              speed limit. Relax your fingers briefly to leave rotation, then
              match the zoom marker to resume zoom. The cursor ring shows hold
              progress. Relax your hand briefly between actions; changing
              directly to another gesture does not re-arm the controls. Use
              good, even lighting. Tracking suspends while this tab is hidden.
            </p>
            <p>
              Camera frames stay on this device. Disabling gestures stops camera
              capture and tracking. Gestures never approve plans, dispatch
              equipment, or activate relays.
            </p>
            <h3>Connect the core application</h3>
            <p>
              Pass a TwinSource subscription to the App component. It accepts
              normalized simulator or SpacetimeDB snapshots and displays
              connection errors. See docs/INTEGRATION.md for the contract.
            </p>
            <button className="primary-button" onClick={() => setHelp(false)}>
              Return to the field <ChevronRight size={15} />
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
