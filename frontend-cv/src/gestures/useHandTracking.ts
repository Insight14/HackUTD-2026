import { useEffect, useRef, useState } from "react";
import {
  classifyHand,
  GestureGate,
  gestureConfig,
  type Gesture,
  type Point,
} from "./recognizer";
export type HandEvent = {
  gesture: Gesture | "swipe" | "pan";
  x: number;
  y: number;
  delta?: number;
  dx?: number;
  dy?: number;
};
export function useHandTracking(
  enabled: boolean,
  onGesture: (e: HandEvent) => void,
) {
  const video = useRef<HTMLVideoElement>(null),
    overlay = useRef<HTMLCanvasElement>(null),
    callback = useRef(onGesture);
  callback.current = onGesture;
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
  const [status, setStatus] = useState("Camera off"),
    [gesture, setGesture] = useState<Gesture>("none"),
    [error, setError] = useState("");
  useEffect(() => {
    if (!enabled) {
      setStatus("Camera off");
      setGesture("none");
      setPointer(null);
      return;
    }
    let cancelled = false,
      raf = 0,
      stream: MediaStream | undefined,
      detector: import("@mediapipe/tasks-vision").HandLandmarker | undefined;
    const gate = new GestureGate();
    let lastFrame = -1,
      lastInference = 0,
      smoothed: Point[] | undefined,
      anchor: { x: number; t: number } | undefined,
      lastPos: { x: number; y: number; t: number } | undefined,
      lastSwipe = 0;
    setError("");
    setStatus("Loading hand tracker");
    const stop = () => {
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
      detector?.close();
      detector = undefined;
      if (video.current) video.current.srcObject = null;
    };
    async function start() {
      try {
        if (!navigator.mediaDevices?.getUserMedia)
          throw new Error(
            "Camera requires localhost or HTTPS in a supported browser.",
          );
        const { FilesetResolver, HandLandmarker } =
          await import("@mediapipe/tasks-vision");
        const vision = await FilesetResolver.forVisionTasks("/mediapipe/wasm");
        if (cancelled) return;
        const model = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: "/mediapipe/hand_landmarker.task",
            delegate: "GPU",
          },
          runningMode: "VIDEO",
          numHands: 1,
          minHandDetectionConfidence: gestureConfig.confidence,
          minHandPresenceConfidence: gestureConfig.confidence,
          minTrackingConfidence: gestureConfig.confidence,
        });
        if (cancelled) {
          model.close();
          return;
        }
        detector = model;
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480, facingMode: "user" },
          audio: false,
        });
        if (cancelled) {
          stop();
          return;
        }
        stream.getVideoTracks().forEach((track) =>
          track.addEventListener("ended", () => {
            if (!cancelled) {
              setError("Camera disconnected. Re-enable gestures to reconnect.");
              setStatus("Camera unavailable");
              stop();
            }
          }),
        );
        const v = video.current;
        if (!v) throw new Error("Camera preview unavailable.");
        v.srcObject = stream;
        await v.play();
        if (cancelled) return;
        function frame(now: number) {
          if (cancelled || !detector) return;
          try {
            if (
              v!.readyState >= 2 &&
              v!.currentTime !== lastFrame &&
              now - lastInference > 20
            ) {
              lastFrame = v!.currentTime;
              lastInference = now;
              const result = detector.detectForVideo(v!, now),
                points = result.landmarks[0];
              const ctx = overlay.current?.getContext("2d");
              ctx?.clearRect(0, 0, 640, 480);
              if (points) {
                smoothed = points.map((p, i) => ({
                  x: smoothed
                    ? smoothed[i].x + (p.x - smoothed[i].x) * gestureConfig.smoothing
                    : p.x,
                  y: smoothed
                    ? smoothed[i].y + (p.y - smoothed[i].y) * gestureConfig.smoothing
                    : p.y,
                  z: p.z,
                }));
                if (ctx) {
                  ctx.strokeStyle = "#54f8dd";
                  ctx.fillStyle = "#ee83dc";
                  ctx.lineWidth = 2;
                  for (const chain of [
                    [0, 1, 2, 3, 4],
                    [0, 5, 6, 7, 8],
                    [5, 9, 13, 17, 0],
                    [9, 10, 11, 12],
                    [13, 14, 15, 16],
                    [17, 18, 19, 20],
                  ]) {
                    ctx.beginPath();
                    chain.forEach((i, j) =>
                      j
                        ? ctx.lineTo((1 - points[i].x) * 640, points[i].y * 480)
                        : ctx.moveTo(
                            (1 - points[i].x) * 640,
                            points[i].y * 480,
                          ),
                    );
                    ctx.stroke();
                  }
                  points.forEach((p) => {
                    ctx.beginPath();
                    ctx.arc((1 - p.x) * 640, p.y * 480, 3, 0, Math.PI * 2);
                    ctx.fill();
                  });
                }
                const g = classifyHand(smoothed);
                setGesture(g);
                setStatus(
                  g === "pinch"
                    ? "Zooming in (Pinch)"
                    : g === "pinch_open"
                      ? "Zooming out (Spread)"
                      : g === "palm"
                        ? "Rotating (Move hand)"
                        : g === "point"
                          ? "Inspecting (Pointing)"
                          : "Hand tracked"
                );
                const x = 1 - smoothed[8].x,
                  y = smoothed[8].y;
                setPointer({ x, y });
                // Use center of palm (landmark 9: middle MCP) for stable, jitter-free tracking
                const palmX = 1 - smoothed[9].x;
                const palmY = smoothed[9].y;

                // Real-time continuous fluid interaction
                if (lastPos) {
                  const dx = palmX - lastPos.x;
                  const dy = palmY - lastPos.y;

                  // Filter out 1-frame tracking drop/teleport glitches
                  if (Math.abs(dx) < 0.25) {
                    if (g === "palm" && Math.abs(dx) > 0.002) {
                      callback.current({
                        gesture: "pan",
                        x,
                        y,
                        dx,
                        dy,
                        delta: -dx * 4.2,
                      });
                    }
                  }
                }
                lastPos = { x: palmX, y: palmY, t: now };

                // Continuous zoom in while holding full pinch
                if (g === "pinch") {
                  callback.current({
                    gesture: "pinch",
                    x,
                    y,
                  });
                }

                // Continuous zoom out while holding wide spread / L-shape
                if (g === "pinch_open") {
                  callback.current({
                    gesture: "pinch_open",
                    x,
                    y,
                  });
                }

                // Continuous point selection
                if (g === "point") {
                  callback.current({
                    gesture: "point",
                    x,
                    y,
                  });
                }
              } else {
                setPointer(null);
                setStatus("Searching for hand");
                setGesture("none");
                smoothed = undefined;
                anchor = undefined;
                lastPos = undefined;
                gate.reset();
              }
            }
            raf = requestAnimationFrame(frame);
          } catch (e) {
            setError(e instanceof Error ? e.message : "Hand tracking failed");
            setStatus("Tracking unavailable");
            stop();
          }
        }
        raf = requestAnimationFrame(frame);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Unable to start camera");
          setStatus("Camera unavailable");
          stop();
        }
      }
    }
    void start();
    return () => {
      cancelled = true;
      stop();
    };
  }, [enabled]);
  return { video, overlay, status, gesture, error, pointer };
}
