"""FastAPI Endpoints for Incident Scenarios and Strategy Evaluation Benchmark."""
from typing import Optional
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from backend.app.api.simulator import simulator
from backend.app.simulator.scenarios import ScenarioRunner, SCENARIO_CATALOG
from backend.app.engine.evaluation_benchmark import EvaluationBenchmark

router = APIRouter(prefix="/api/scenarios", tags=["Scenarios & Evaluation"])
scenario_runner = ScenarioRunner(simulator)

class BenchmarkRequest(BaseModel):
    n_trials: int = 50
    seed: int = 42

@router.get("/list")
async def list_scenarios():
    """List all 5 standard operational scenarios."""
    return {
        "scenarios": scenario_runner.list_scenarios(),
        "total": len(SCENARIO_CATALOG),
    }

@router.get("/active")
async def get_active_scenario():
    """Get the currently loaded scenario, if any."""
    active_id = scenario_runner.active_scenario_id
    if not active_id:
        return {"active_scenario": None}
    defn = scenario_runner.get_scenario(active_id)
    return {"active_scenario": defn.model_dump() if defn else None}

@router.post("/activate/{scenario_id}")
async def activate_scenario(scenario_id: str):
    """Activate a scripted scenario on the physical simulator and execute a decision cycle."""
    try:
        result = scenario_runner.activate_scenario(scenario_id)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to activate scenario: {str(e)}")

@router.post("/benchmark")
async def run_evaluation_benchmark(req: BenchmarkRequest = BenchmarkRequest()):
    """Execute seeded comparative evaluation benchmark (B0 vs B1 vs B2)."""
    try:
        benchmark = EvaluationBenchmark(simulator, n_trials=req.n_trials, seed=req.seed)
        report = benchmark.run_benchmark()
        return report.model_dump()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Benchmark execution failed: {str(e)}")
