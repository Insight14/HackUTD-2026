# Phase 8 integration handoff

This is the frontend workstream only. It does not implement the simulator, SpacetimeDB schema, decision engine, Nemotron, OpenCV level estimation, or hardware. No gesture handler can approve plans or actuate equipment. All displayed demo telemetry and forecasts are explicitly synthetic fixtures, not engineering calculations.

## Bring it into the core React app

`frontend-cv/src/App.tsx` exports the complete console. `DigitalTwin` can also be mounted independently. The shared types live in `frontend-cv/src/data/types.ts`.

Pass a `TwinSource` to `<App source={source} />`. A source implements:

```ts
interface TwinSource {
  subscribe(
    next: (snapshot: TwinSnapshot) => void,
    error: (error: Error) => void,
  ): () => void;
}
```

Within your existing official SpacetimeDB SDK subscriptions, combine tank_state, pump_state, level_estimates, alerts and engine forecasts into a complete TwinSnapshot. Call `next(snapshot)` after relevant updates, call `error(error)` on subscription/connection failure, and return your SDK cleanup function. The frontend makes no assumptions about generated bindings, reducer names, credentials or backend endpoints. There are no invented network endpoints. Snapshot transforms should happen in the core app adapter.

- `source`: live or simulator for application data; synthetic only for fixtures.
- `timestamp`: ISO timestamp of the source measurement.
- `equipment`: stable id, display name, kind, status, three-dimensional position, optional level (0–100), capacity (bbl), inflow/outflow (bbl/h), reported history samples, sensor estimates. `camera: null` means vision offline, never zero.
- `incident`: engine-provided title, description and affected equipment ID, or null.
- `forecast`: engine-provided time to threshold, P10/P90 bounds and cost per minute, or null. The frontend does not calculate recommendations.

The current scene plumbing reflects the illustrative Avon topology and stable demo IDs. When your topology changes, update the pipe paths in DigitalTwin.tsx alongside the equipment positions. The high-high marker is an explicitly illustrative 95% reference, not an authoritative backend threshold. Move it into your topology config during core integration.

A disconnected application source retains the last received snapshot and shows the connection error. It does not substitute synthetic demo values. The fixture selector is available only when no source is supplied.

## Camera / MediaPipe

The installed official `@mediapipe/tasks-vision` package supplies WASM copied to public/mediapipe/wasm. The official hand_landmarker float16 v1 model is bundled at public/mediapipe/hand_landmarker.task. No camera frames are transmitted. Tracking is opt-in, requires HTTPS or localhost, and is unloaded when disabled or unmounted. If camera/model initialization fails, mouse and keyboard remain available and an error appears.

`recognizer.ts` contains configurable confidence thresholds, 420 ms stable dwell, 1100 ms cooldown, palm-normalized pinch distance and smoothing. `useHandTracking.ts` limits inference to about 15 Hz, tracks one hand, and draws a mirrored skeleton overlay. Inference is synchronous on the main thread; use a worker if testing on target hardware shows unacceptable latency. Pinch zoom is one step per release, not a continuous drag. Point projects the fingertip into scene coordinates and raycasts against equipment; aim at the 3D object. Swipe requires an open palm and is measured in a short time window.

Gestures: point = select; held open palm = pause/resume animation; pinch = zoom in one step; open-palm swipe = rotate. The hand must return to a neutral pose before repeating a held gesture. Pausing animation does not freeze telemetry. Mouse drag, wheel, asset buttons, equipment table and keyboard are always retained.

Official references verified during implementation:
- https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker?tab=Web
- https://r3f.docs.pmnd.rs/getting-started/introduction
- https://r3f.docs.pmnd.rs/api/canvas

## Track alignment

EOG: the visualization makes failed pumps, tank levels, inflow/outflow and provided forecasts easy to inspect. SpacetimeDB: the core app must supply actual shared state through its subscription adapter; this standalone frontend does not by itself satisfy the primary-functionality requirement. NVIDIA: Nemotron/tool workflow belongs to the core app and is not claimed as integrated here. Verify event eligibility and submission rules with organizers.
