"""FastAPI Endpoints for NVIDIA Nemotron Agent & Tool Execution."""
from typing import Optional, Dict, Any
from fastapi import APIRouter
from pydantic import BaseModel

from backend.app.agent.nemotron import nemotron_agent, AgentResponse
from backend.app.agent.tools import TOOL_REGISTRY, execute_tool

router = APIRouter(prefix="/api/agent", tags=["Nemotron Agent"])

class ChatRequest(BaseModel):
    message: str = "Explain the current situation"

class ToolCallRequest(BaseModel):
    tool_name: str
    arguments: Optional[Dict[str, Any]] = None

@router.post("/explain", response_model=AgentResponse)
async def explain_incident():
    """Generate plain-language explanation of the current incident citing verified tool output chips."""
    return nemotron_agent.explain_incident()

@router.post("/chat", response_model=AgentResponse)
async def agent_chat(request: ChatRequest):
    """Chat with the Nemotron operator assistant."""
    return nemotron_agent.handle_operator_chat(request.message)

@router.get("/tools")
async def list_tools():
    """List the 10 approved deterministic tools available to the AI agent."""
    return {
        "count": len(TOOL_REGISTRY),
        "tools": [
            {"name": name, "docstring": fn.__doc__.strip() if fn.__doc__ else ""}
            for name, fn in TOOL_REGISTRY.items()
        ],
    }

@router.post("/execute-tool")
async def run_individual_tool(request: ToolCallRequest):
    """Execute a single approved tool directly."""
    args = request.arguments or {}
    return execute_tool(request.tool_name, **args)

