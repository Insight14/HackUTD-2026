# Tidewatch · Phase 8

A HackUTD Zero Day themed interactive 3D produced-water digital twin with optional MediaPipe hand navigation. Built with React, TypeScript, Vite, Tailwind CSS, React Three Fiber and Three.js.

## Run locally

```sh
cd frontend-cv
npm ci
npm run dev
```

Open the printed localhost URL. Build with `npm run build`; test gesture recognition with `npm test`.

The default experience uses clearly labeled synthetic fixtures. Select a scenario to preview normal operation, a pump failure, sensor disagreement, or an upstream surge. This frontend does not implement the backend or claim live sponsor integrations.

## Controls

- Drag to orbit; scroll to zoom; click an asset to inspect it.
- Arrow keys rotate; + / − zoom; R resets; Space pauses flow animations.
- Equipment telemetry view and help asset buttons provide conventional selection alternatives.
- Enable gestures to opt into webcam tracking. Point selects; open palm pauses/resumes; pinch zooms; palm swipe rotates. Hold still briefly, then release before repeating. Camera capture stops when disabled.
- Plan approval and equipment actuation are intentionally absent from gesture controls.

## Backend handoff

See [INTEGRATION.md](INTEGRATION.md). Supply a `TwinSource` subscription to the App component to display the core app's simulator/SpacetimeDB state. No backend endpoints or SDK bindings are assumed.

## Known limits

The fixture topology and 95% reference marker are illustrative. Forecasts/history are fixtures until a source is supplied. Target-device webcam accuracy and latency need hands-on validation. WebGL is required for the 3D view; the equipment telemetry view remains available without it. Font loading uses Google Fonts with local fallbacks. MediaPipe WASM and the model are served locally. Live-source schema validation and authorization belong to the core application's adapter/server.
