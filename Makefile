.PHONY: all dev test eval build lint help vision spacetime twin

help:
	@echo "Tidewatch Build and Development Automation"
	@echo "------------------------------------------"
	@echo "make dev       - Run FastAPI backend and Vite frontend concurrently"
	@echo "make twin      - Run 3D Digital Twin with MediaPipe gesture tracking"
	@echo "make test      - Run all 47 pytest tests across all subsystems"
	@echo "make eval      - Run 50-trial Monte Carlo strategy benchmark"
	@echo "make vision    - Test OpenCV optical level and LED segmentation"
	@echo "make build     - Build frontend assets and verify TypeScript"
	@echo "make spacetime - Build SpacetimeDB server module"

dev:
	@echo "Starting Tidewatch Backend and Frontend..."
	@trap 'kill 0' EXIT; \
	(PYTHONPATH=. python -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --reload) & \
	(cd frontend && npm run dev)

test:
	@echo "Running all 47 Pytest Unit and Scenario Tests..."
	PYTHONPATH=. pytest -v

eval:
	@echo "Running 50-Trial Monte Carlo Evaluation Benchmark (B0 vs B1 vs B2)..."
	PYTHONPATH=. python -m backend.app.engine.evaluation_benchmark

vision:
	@echo "Running OpenCV Computer Vision Self-Test..."
	PYTHONPATH=. python -m vision.camera_service

build:
	@echo "Building Vite Frontend for Production..."
	cd frontend && npm run build

spacetime:
	@echo "Building SpacetimeDB Server Module..."
	cd spacetimedb && /Users/sourish/.local/bin/spacetime build

twin:
	@echo "Starting 3D Digital Twin with MediaPipe..."
	cd frontend-cv && npm run dev
