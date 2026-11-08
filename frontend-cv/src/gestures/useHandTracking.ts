import { useEffect, useRef, useState } from "react";
import {
  classifyHand,
  GestureController,
  gestureConfig,
  type Gesture,
  type Point,
  type GestureFeedback,
} from "./recognizer";
import { HandModeSwitch } from "./mode";
import { PalmRotationController } from "./rotation";
export type HandEvent = {
  gesture: Gesture | "swipe" | "rotate" | "zoom" | "freeze" | "mode";
  mode?: InteractionMode;
  level?: number;
  x: number;
  y: number;
  delta?: number;
  pitch?: number;
};
import {
  defaultZoomRange,
  fingerSpread,
  spreadLevel,
  validZoomRange,
  SpreadZoomController,
  HandClutch,
  type ZoomRange,
  type ZoomFeedback,
} from "./zoom";
export type InteractionMode = "zoom" | "navigate";
const initialFeedback: GestureFeedback = {
  progress: 0,
  hint: "Enable gestures to start",
};
const chains = [
  [0, 1, 2, 3, 4],
  [0, 5, 6, 7, 8],
  [5, 9, 13, 17, 0],
  [9, 10, 11, 12],
  [13, 14, 15, 16],
  [17, 18, 19, 20],
];
export function useHandTracking(
  enabled: boolean,
  onGesture: (e: HandEvent) => void,
  active = true,
  mode: InteractionMode = "zoom",
  currentZoom = 0.35,
  manualClutch = false,
) {
  const video = useRef<HTMLVideoElement>(null),
    overlay = useRef<HTMLCanvasElement>(null),
    callback = useRef(onGesture);
  callback.current = onGesture;
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const zoomLevelRef = useRef(currentZoom);
  zoomLevelRef.current = currentZoom;
  const clutchRef = useRef(manualClutch);
  clutchRef.current = manualClutch;
  const resetRef = useRef(false),
    switchHandRef = useRef(false),
    lastSpreadRef = useRef<number | null>(null),
    closedDraft = useRef<number | null>(null);
  const [range, setRange] = useState<ZoomRange>(() => {
    try {
      const saved = JSON.parse(
        localStorage.getItem("tidewatch.zoom-range") ?? "null",
      );
      return saved && validZoomRange(saved) ? saved : defaultZoomRange;
    } catch {
      return defaultZoomRange;
    }
  });
  const rangeRef = useRef(range);
  rangeRef.current = range;
  const [zoom, setZoom] = useState<ZoomFeedback | null>(null),
    [clutched, setClutched] = useState(false),
    [controlHand, setControlHand] = useState("Show your control hand first"),
    [spread, setSpread] = useState<number | null>(null),
    [closedCaptured, setClosedCaptured] = useState(false),
    [calibrationMessage, setCalibrationMessage] = useState("");
  const activeRef = useRef(active);
  activeRef.current = active;
  const [attempt, setAttempt] = useState(0),
    [status, setStatus] = useState("Camera off"),
    [gesture, setGesture] = useState<Gesture>("none"),
    [error, setError] = useState(""),
    [pointer, setPointer] = useState<{ x: number; y: number } | null>(null),
    [feedback, setFeedback] = useState(initialFeedback),
    [runtime, setRuntime] = useState<"GPU" | "CPU" | null>(null),
    [metrics, setMetrics] = useState<{
      fps: number;
      inferenceMs: number;
    } | null>(null),
    [lastAction, setLastAction] = useState("");
  useEffect(() => {
    setError("");
    setPointer(null);
    setGesture("none");
    setMetrics(null);
    setRuntime(null);
    setLastAction("");
    setFeedback(initialFeedback);
    setZoom(null);
    setClutched(false);
    setSpread(null);
    lastSpreadRef.current = null;
    setControlHand("Show your control hand first");
    if (!enabled) {
      setStatus("Camera off");
      return;
    }
    let cancelled = false,
      raf = 0,
      stream: MediaStream | undefined,
      detector: import("@mediapipe/tasks-vision").HandLandmarker | undefined;
    const controller = new GestureController(),
      zoomController = new SpreadZoomController(),
      clutch = new HandClutch(),
      rotation = new PalmRotationController(),
      modeSwitch = new HandModeSwitch();
    let rotationBlocked = false;
    let primaryLabel: string | null = null,
      previousMode = modeRef.current,
      wasClutched = false,
      hadHand = false,
      awaitingClear = false;
    const freeze = () => {
      modeSwitch.reset();
      rotation.reset();
      rotationBlocked = false;
      zoomController.reset();
      controller.suspend();
      callback.current({ gesture: "freeze", x: 0, y: 0 });
    };
    let lastFrame = -1,
      lastInference = 0,
      smoothed: Point[] | undefined,
      count = 0,
      windowStart = 0,
      inferenceTotal = 0,
      wasActive = true;
    setStatus("Loading hand tracker");
    const clear = () => {
      setPointer(null);
      setGesture("none");
      setMetrics(null);
      setSpread(null);
      lastSpreadRef.current = null;
      setZoom(null);
      overlay.current
        ?.getContext("2d")
        ?.clearRect(0, 0, overlay.current.width, overlay.current.height);
    };
    const stop = () => {
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
      detector?.close();
      detector = undefined;
      if (video.current) video.current.srcObject = null;
    };
    const fail = (e: unknown) => {
      if (cancelled) return;
      freeze();
      clear();
      setFeedback({
        progress: 0,
        hint: "Mouse and keyboard controls are still available",
      });
      setError(e instanceof Error ? e.message : "Hand tracking failed");
      setStatus("Camera unavailable");
      stop();
    };
    const visibility = () => {
      freeze();
      smoothed = undefined;
      lastFrame = -1;
      count = 0;
      windowStart = 0;
      inferenceTotal = 0;
      clear();
      setFeedback({ progress: 0, hint: "Relax your hand before continuing" });
      setStatus(
        document.hidden
          ? "Tracking suspended · tab hidden"
          : "Searching for hand",
      );
    };
    document.addEventListener("visibilitychange", visibility);
    async function start() {
      try {
        if (!navigator.mediaDevices?.getUserMedia)
          throw new Error(
            "Use localhost or HTTPS in a browser with camera support.",
          );
        const { FilesetResolver, HandLandmarker } =
          await import("@mediapipe/tasks-vision");
        const vision = await FilesetResolver.forVisionTasks(
          `${import.meta.env.BASE_URL}mediapipe/wasm`,
        );
        if (cancelled) return;
        const options = {
          runningMode: "VIDEO" as const,
          numHands: 2,
          minHandDetectionConfidence: gestureConfig.confidence,
          minHandPresenceConfidence: gestureConfig.confidence,
          minTrackingConfidence: gestureConfig.confidence,
        };
        let model: import("@mediapipe/tasks-vision").HandLandmarker;
        let delegate: "GPU" | "CPU" = "GPU";
        try {
          model = await HandLandmarker.createFromOptions(vision, {
            ...options,
            baseOptions: {
              modelAssetPath: `${import.meta.env.BASE_URL}mediapipe/hand_landmarker.task`,
              delegate: "GPU",
            },
          });
        } catch (gpuError) {
          if (cancelled) return;
          delegate = "CPU";
          try {
            model = await HandLandmarker.createFromOptions(vision, {
              ...options,
              baseOptions: {
                modelAssetPath: `${import.meta.env.BASE_URL}mediapipe/hand_landmarker.task`,
                delegate: "CPU",
              },
            });
          } catch (cpuError) {
            throw new Error(
              `Hand model could not start on GPU or CPU. ${cpuError instanceof Error ? cpuError.message : String(gpuError)}`,
            );
          }
        }
        if (cancelled) {
          model.close();
          return;
        }
        detector = model;
        setRuntime(delegate);
        setStatus("Waiting for camera permission");
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 640 },
            height: { ideal: 480 },
            facingMode: "user",
          },
          audio: false,
        });
        if (cancelled) {
          stop();
          return;
        }
        stream
          .getVideoTracks()
          .forEach((track) =>
            track.addEventListener("ended", () =>
              fail(
                new Error(
                  "Camera disconnected. Use Retry camera to reconnect.",
                ),
              ),
            ),
          );
        const v = video.current;
        if (!v) throw new Error("Camera preview unavailable");
        v.srcObject = stream;
        await v.play();
        if (cancelled) return;
        function frame(now: number) {
          if (cancelled || !detector) return;
          try {
            if (!activeRef.current) {
              if (wasActive) {
                freeze();
                clear();
                count = 0;
                windowStart = 0;
                inferenceTotal = 0;
                setStatus("Tracking suspended · return to 3D");
                setFeedback({
                  progress: 0,
                  hint: "Return to the 3D view to navigate",
                });
              }
              wasActive = false;
              raf = requestAnimationFrame(frame);
              return;
            }
            wasActive = true;
            if (
              !document.hidden &&
              v!.readyState >= 2 &&
              v!.currentTime !== lastFrame &&
              now - lastInference >= 65
            ) {
              lastFrame = v!.currentTime;
              lastInference = now;
              const before = performance.now();
              const result = detector.detectForVideo(v!, now);
              inferenceTotal += performance.now() - before;
              count++;
              if (!windowStart) windowStart = now;
              if (now - windowStart >= 1000) {
                setMetrics({
                  fps: Math.round((count * 1000) / (now - windowStart)),
                  inferenceMs: Math.round(inferenceTotal / count),
                });
                count = 0;
                inferenceTotal = 0;
                windowStart = now;
              }
              const width = v!.videoWidth || 640,
                height = v!.videoHeight || 480;
              const canvas = overlay.current;
              if (
                canvas &&
                (canvas.width !== width || canvas.height !== height)
              ) {
                canvas.width = width;
                canvas.height = height;
              }
              if (switchHandRef.current) {
                awaitingClear = true;
                primaryLabel = null;
                setControlHand(
                  "Hide both hands, then show your new control hand",
                );
                switchHandRef.current = false;
                smoothed = undefined;
                freeze();
              }
              if (resetRef.current) {
                zoomController.reset();
                controller.suspend();
                resetRef.current = false;
              }
              if (previousMode !== modeRef.current) {
                freeze();
                previousMode = modeRef.current;
              }
              const hands = result.landmarks;
              const labelAt = (i: number) =>
                result.handedness[i]?.[0]?.categoryName ?? `hand-${i}`;
              if (awaitingClear && hands.length === 0) awaitingClear = false;
              if (primaryLabel === null && !awaitingClear && hands.length) {
                primaryLabel = labelAt(0);
                setControlHand(`${primaryLabel} control hand`);
              }
              const primaryIndex = hands.findIndex(
                (_, i) => labelAt(i) === primaryLabel,
              );
              const otherPalm = hands.some(
                (p, i) =>
                  i !== primaryIndex &&
                  labelAt(i) !== primaryLabel &&
                  classifyHand(p) === "palm",
              );
              const isClutched = clutch.update(
                otherPalm,
                clutchRef.current || closedDraft.current !== null,
                now,
              );
              setClutched(isClutched);
              if (isClutched && !wasClutched) freeze();
              if (!isClutched && wasClutched) freeze();
              wasClutched = isClutched;
              const points =
                  primaryIndex >= 0 ? hands[primaryIndex] : undefined,
                ctx = canvas?.getContext("2d");
              ctx?.clearRect(0, 0, width, height);
              if (points?.length === 21) {
                hadHand = true;
                smoothed = points.map((p, i) => ({
                  x: smoothed
                    ? smoothed[i].x +
                      (p.x - smoothed[i].x) * gestureConfig.smoothing
                    : p.x,
                  y: smoothed
                    ? smoothed[i].y +
                      (p.y - smoothed[i].y) * gestureConfig.smoothing
                    : p.y,
                  z: p.z,
                }));
                if (ctx) {
                  ctx.strokeStyle = "#54f8dd";
                  ctx.fillStyle = "#ee83dc";
                  ctx.lineWidth = 2;
                  for (const chain of chains) {
                    ctx.beginPath();
                    chain.forEach((i, j) =>
                      j
                        ? ctx.lineTo(
                            (1 - points[i].x) * width,
                            points[i].y * height,
                          )
                        : ctx.moveTo(
                            (1 - points[i].x) * width,
                            points[i].y * height,
                          ),
                    );
                    ctx.stroke();
                  }
                  for (const p of points) {
                    ctx.beginPath();
                    ctx.arc((1 - p.x) * width, p.y * height, 3, 0, Math.PI * 2);
                    ctx.fill();
                  }
                }
                if (ctx) {
                  for (let i = 0; i < hands.length; i++) {
                    if (i === primaryIndex) continue;
                    ctx.strokeStyle = otherPalm ? "#ffd28c" : "#ad85c5";
                    for (const chain of chains) {
                      ctx.beginPath();
                      chain.forEach((j, k) =>
                        k
                          ? ctx.lineTo(
                              (1 - hands[i][j].x) * width,
                              hands[i][j].y * height,
                            )
                          : ctx.moveTo(
                              (1 - hands[i][j].x) * width,
                              hands[i][j].y * height,
                            ),
                      );
                      ctx.stroke();
                    }
                  }
                }
                const g = classifyHand(smoothed),
                  x = Math.max(0, Math.min(1, 1 - smoothed[8].x)),
                  y = Math.max(0, Math.min(1, smoothed[8].y));
                setGesture(g);
                setPointer({ x, y });
                setStatus(isClutched ? "Controls frozen" : "Hand tracked");
                const ratio = fingerSpread(smoothed, width / height);
                lastSpreadRef.current = ratio;
                setSpread(ratio);
                const switching = modeSwitch.update(
                  g,
                  modeRef.current,
                  now,
                  isClutched,
                );
                if (switching.mode) {
                  freeze();
                  modeRef.current = switching.mode;
                  previousMode = switching.mode;
                  if (switching.mode === "zoom" && ratio !== null)
                    zoomController.activate(
                      spreadLevel(ratio, rangeRef.current),
                    );
                  callback.current({
                    gesture: "mode",
                    mode: switching.mode,
                    x,
                    y,
                  });
                }
                const turn =
                  isClutched || modeRef.current === "zoom" || switching.pending
                    ? { blockZoom: false, rotating: false, delta: 0, pitch: 0 }
                    : rotation.update(
                        g === "palm",
                        1 -
                          [0, 5, 9, 13, 17].reduce(
                            (sum, i) => sum + smoothed![i].x,
                            0,
                          ) /
                            5,
                        [0, 5, 9, 13, 17].reduce(
                          (sum, i) => sum + smoothed![i].y,
                          0,
                        ) / 5,
                        now,
                      );
                if (turn.blockZoom !== rotationBlocked) {
                  callback.current({ gesture: "freeze", x, y });
                }
                rotationBlocked = turn.blockZoom;
                if (switching.pending) {
                  callback.current({ gesture: "freeze", x, y });
                  setFeedback({
                    progress: switching.progress,
                    hint: switching.mode
                      ? switching.mode === "zoom"
                        ? "Zoom ready — spread thumb and index; keep other fingers curled"
                        : "Rotation ready — swipe your open palm"
                      : g === "pinch"
                        ? "Hold pinch for 1 second to enter zoom"
                        : "Open palm: switching to rotation",
                  });
                } else if (turn.blockZoom && !isClutched) {
                  if (turn.rotating) {
                    zoomController.reset();
                    controller.suspend();
                  }
                  setZoom(null);
                  setFeedback({
                    progress: 0,
                    hint: turn.rotating
                      ? "Swipe sideways: rotate • pull down: top view • lift: side view"
                      : "Open palm ready • swipe sideways to rotate",
                  });
                  if (turn.delta !== 0 || turn.pitch !== 0) {
                    callback.current({
                      gesture: "rotate",
                      x,
                      y,
                      delta: turn.delta,
                      pitch: turn.pitch,
                    });
                    setLastAction(
                      Math.abs(turn.pitch) > Math.abs(turn.delta)
                        ? turn.pitch > 0
                          ? "Tilting toward side view"
                          : "Tilting toward top view"
                        : turn.delta < 0
                          ? "Rotating clockwise"
                          : "Rotating counterclockwise",
                    );
                  }
                } else if (modeRef.current === "zoom" && ratio !== null) {
                  const next = zoomController.update(
                    spreadLevel(ratio, rangeRef.current),
                    zoomLevelRef.current,
                    isClutched,
                    now,
                  );
                  setZoom(next);
                  setFeedback({ progress: next.level, hint: next.hint });
                  if (next.state === "active")
                    callback.current({
                      gesture: "zoom",
                      x,
                      y,
                      level: next.level,
                    });
                } else if (isClutched) {
                  setZoom(null);
                  setFeedback({
                    progress: 0,
                    hint: "Controls frozen — reposition your control hand",
                  });
                } else {
                  setZoom(null);
                  // Pinches belong to Zoom mode; navigation never turns a resetting pinch into an action.
                  const next = controller.update(
                    {
                      gesture: g === "pinch" ? "none" : g,
                      x,
                      y,
                      palmX: 1 - smoothed[0].x,
                      palmY: smoothed[0].y,
                    },
                    now,
                  );
                  setFeedback(next);
                  if (next.action) {
                    callback.current({
                      gesture: next.action,
                      x,
                      y,
                      delta: next.delta,
                    });
                    setLastAction(next.hint);
                  }
                }
              } else {
                setPointer(null);
                setSpread(null);
                lastSpreadRef.current = null;
                setZoom(null);
                if (hadHand) {
                  freeze();
                  hadHand = false;
                }
                setGesture("none");
                setStatus(
                  isClutched ? "Controls frozen" : "Searching for control hand",
                );
                smoothed = undefined;
                setFeedback({
                  progress: 0,
                  hint: isClutched
                    ? "Controls frozen — reposition your hand"
                    : "Show your original control hand to continue",
                });
              }
            }
            raf = requestAnimationFrame(frame);
          } catch (e) {
            fail(e);
          }
        }
        raf = requestAnimationFrame(frame);
      } catch (e) {
        if (e instanceof DOMException && e.name === "NotAllowedError")
          fail(
            new Error(
              "Camera permission was denied. Allow camera access in your browser, then retry.",
            ),
          );
        else if (e instanceof DOMException && e.name === "NotFoundError")
          fail(new Error("No camera found. Connect a camera, then retry."));
        else fail(e);
      }
    }
    void start();
    return () => {
      callback.current({ gesture: "freeze", x: 0, y: 0 });
      cancelled = true;
      document.removeEventListener("visibilitychange", visibility);
      stop();
    };
  }, [enabled, attempt]);
  return {
    video,
    overlay,
    status,
    gesture,
    error,
    pointer,
    feedback,
    runtime,
    metrics,
    lastAction,
    retry: () => setAttempt((n) => n + 1),
    zoom,
    clutched,
    controlHand,
    spread,
    closedCaptured,
    calibrationMessage,
    rearm: () => {
      resetRef.current = true;
    },
    switchControlHand: () => {
      switchHandRef.current = true;
    },
    calibrateClosed: () => {
      if (lastSpreadRef.current === null) return;
      closedDraft.current = lastSpreadRef.current;
      setClosedCaptured(true);
      setCalibrationMessage(
        "Now spread thumb and index as far as is comfortable, then set full stretch.",
      );
      resetRef.current = true;
    },
    calibrateOpen: () => {
      if (closedDraft.current === null || lastSpreadRef.current === null)
        return;
      const next = { closed: closedDraft.current, open: lastSpreadRef.current };
      if (!validZoomRange(next)) {
        setCalibrationMessage(
          "Spread farther apart; the closed and open positions are too similar.",
        );
        return;
      }
      setRange(next);
      setClosedCaptured(false);
      closedDraft.current = null;
      resetRef.current = true;
      try {
        localStorage.setItem("tidewatch.zoom-range", JSON.stringify(next));
        setCalibrationMessage(
          "Range saved. Your full stretch now means 100% zoom.",
        );
      } catch {
        setCalibrationMessage(
          "Range applied for this session; browser storage is unavailable.",
        );
      }
    },
  };
}
