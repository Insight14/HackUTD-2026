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
- Enable gestures to opt into webcam tracking. Show the control hand first. Hold a pinch for one second to enter zoom mode; spread or close thumb and index to zoom. Open all fingers to return to rotation. Swipe an open palm sideways to orbit horizontally, or vertically to tilt between side and top views. The other hand’s open palm, Shift, or the Freeze button pauses hand control while repositioning. Camera capture stops when disabled.
- Zoom has closed/full-stretch calibration, a visible slider, and buttons. After a freeze or tracking loss, match finger spread to the current zoom marker to resume without a jump. The scene uses fixed double-sided equipment boards with readable text from either face.
- Plan approval and equipment actuation are intentionally absent from gesture controls.

## Backend handoff

See [INTEGRATION.md](INTEGRATION.md). Supply a `TwinSource` subscription to the App component to display the core app's simulator/SpacetimeDB state. No backend endpoints or SDK bindings are assumed.

## Known limits

The fixture topology and 95% reference marker are illustrative. Forecasts/history are fixtures until a source is supplied. Target-device webcam accuracy and latency need hands-on validation. WebGL is required for the 3D view; the equipment telemetry view remains available without it. Font loading uses Google Fonts with local fallbacks. MediaPipe WASM and the model are served locally. Live-source schema validation and authorization belong to the core application's adapter/server.
