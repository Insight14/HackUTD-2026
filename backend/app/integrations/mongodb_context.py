"""MongoDB Context and Document Retrieval Adapter.

Stores and retrieves standard operating procedures (SOPs), EOG runbooks,
and synthetic historical incident precedent cases.
Supports live MongoDB Atlas connections and local embedded JSON fallback.
"""
from datetime import datetime, timezone
import json
import logging
from pathlib import Path
from typing import Dict, List, Optional, Any
from pydantic import BaseModel, Field

from backend.app.config import settings

logger = logging.getLogger("mongodb_context")

class RunbookDoc(BaseModel):
    id: str
    title: str
    category: str
    tags: List[str]
    facility: str
    steps: List[str]
    safety_warnings: List[str]

class HistoricalIncidentDoc(BaseModel):
    id: str
    date: str
    time: str
    facility: str
    summary: str
    root_cause: str
    observed_symptoms: Dict[str, Any]
    action_taken: str
    outcome: str
    lessons_learned: str
    is_synthetic: bool = True
    synthetic_label: str = "SYNTHETIC_DATA_LABELED"

class MongoDBContextAdapter:
    """Manages runbooks, SOP procedures, and historical incident retrieval."""

    def __init__(self, uri: str = settings.mongodb_uri, enabled: bool = settings.mongodb_enabled):
        self.uri = uri
        self.enabled = enabled
        self._connected: bool = False
        self._client: Optional[Any] = None

        self.runbooks: List[RunbookDoc] = []
        self.incidents: List[HistoricalIncidentDoc] = []

        # Load local catalog from config
        self._load_local_catalog()

    def _load_local_catalog(self):
        """Load embedded SOPs and historical incidents from config JSON."""
        catalog_path = Path(__file__).resolve().parent.parent.parent.parent / "config" / "runbooks_and_procedures.json"
        if not catalog_path.exists():
            logger.warning(f"Runbooks catalog not found at: {catalog_path}")
            return

        with open(catalog_path, "r") as f:
            data = json.load(f)

        self.runbooks = [RunbookDoc(**r) for r in data.get("runbooks", [])]
        self.incidents = [HistoricalIncidentDoc(**i) for i in data.get("historical_incidents", [])]

    async def connect(self) -> bool:
        """Attempt connection to external MongoDB instance."""
        if not self.enabled:
            self._connected = False
            return False
        try:
            from motor.motor_asyncio import AsyncIOMotorClient
            self._client = AsyncIOMotorClient(self.uri, serverSelectionTimeoutMS=2000)
            # Ping database
            await self._client.admin.command("ping")
            self._connected = True
            logger.info("Connected to MongoDB instance.")
            return True
        except Exception as e:
            self._connected = False
            logger.warning(f"MongoDB offline, using local embedded catalog: {e}")
            return False

    def search_runbooks(self, query: str, limit: int = 3) -> List[RunbookDoc]:
        """Search standard operating procedures by keyword/tag relevance."""
        query_terms = query.lower().split()
        scored: List[tuple[int, RunbookDoc]] = []

        for rb in self.runbooks:
            score = 0
            text_blob = f"{rb.title} {rb.category} {' '.join(rb.tags)} {' '.join(rb.steps)}".lower()
            for term in query_terms:
                if term in text_blob:
                    score += 1
            if score > 0 or not query_terms:
                scored.append((score, rb))

        scored.sort(key=lambda x: x[0], reverse=True)
        return [rb for _, rb in scored[:limit]] or self.runbooks[:limit]

    def similar_incidents(self, query: str, limit: int = 3) -> List[HistoricalIncidentDoc]:
        """Search historical incident precedent cases by matching symptoms and equipment tags."""
        query_terms = query.lower().split()
        scored: List[tuple[int, HistoricalIncidentDoc]] = []

        for inc in self.incidents:
            score = 0
            symptoms_str = json.dumps(inc.observed_symptoms).lower()
            text_blob = f"{inc.summary} {inc.root_cause} {inc.action_taken} {symptoms_str}".lower()
            for term in query_terms:
                if term in text_blob:
                    score += 1
            if score > 0 or not query_terms:
                scored.append((score, inc))

        scored.sort(key=lambda x: x[0], reverse=True)
        return [inc for _, inc in scored[:limit]] or self.incidents[:limit]

    def record_incident_resolution(self, incident_data: Dict[str, Any]) -> HistoricalIncidentDoc:
        """Record completed incident resolution into historical memory."""
        now = datetime.now(timezone.utc)
        doc = HistoricalIncidentDoc(
            id=f"inc_{int(now.timestamp())}",
            date=now.strftime("%Y-%m-%d"),
            time=now.strftime("%H:%M:%S"),
            facility=incident_data.get("facility", "Avon Station"),
            summary=incident_data.get("summary", "Resolved Operational Incident"),
            root_cause=incident_data.get("root_cause", "Operational event mitigated by operator"),
            observed_symptoms=incident_data.get("observed_symptoms", {}),
            action_taken=incident_data.get("action_taken", "Executed approved plan via Tidewatch Console"),
            outcome=incident_data.get("outcome", "Station stabilized"),
            lessons_learned=incident_data.get("lessons_learned", "Response within decision deadline avoided shutdown."),
            is_synthetic=True,
        )
        self.incidents.append(doc)
        return doc

    def get_status(self) -> Dict[str, Any]:
        """Return MongoDB connection status, document counts, and synthetic labels."""
        return {
            "service": "MongoDB Document Memory Store",
            "connected_to_cloud": self._connected,
            "enabled_in_config": self.enabled,
            "total_runbooks_available": len(self.runbooks),
            "total_historical_incidents_available": len(self.incidents),
            "fallback_catalog_active": not self._connected,
            "synthetic_data_label": "SYNTHETIC_DATA_LABELED",
            "is_synthetic": True,
        }

mongodb_adapter = MongoDBContextAdapter()

