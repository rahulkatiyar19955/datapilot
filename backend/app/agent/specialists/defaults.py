"""
Registry mapping specialist name → instance.

Phase 11's Settings → Agents drawer writes per-specialist model overrides into
SQLite; the router consults those at run time. The registry below maps names
to the *implementation class* — model selection happens inside `LLMRouter.for_specialist`.
"""
from __future__ import annotations

from app.agent.specialists.anomaly import AnomalyDetectorSpecialist
from app.agent.specialists.base import BaseSpecialist
from app.agent.specialists.performance import PerformanceProfilerSpecialist
from app.agent.specialists.rca import RootCauseAnalystSpecialist
from app.agent.specialists.release_compare import ReleaseComparatorSpecialist
from app.agent.specialists.replay_narrator import ReplayNarratorSpecialist
from app.agent.specialists.safety import SafetyAuditorSpecialist

SPECIALIST_REGISTRY: dict[str, BaseSpecialist] = {
    "RootCauseAnalyst":   RootCauseAnalystSpecialist(),
    "AnomalyDetector":    AnomalyDetectorSpecialist(),
    "PerformanceProfiler": PerformanceProfilerSpecialist(),
    "ReplayNarrator":     ReplayNarratorSpecialist(),
    "SafetyAuditor":      SafetyAuditorSpecialist(),
    "ReleaseComparator":  ReleaseComparatorSpecialist(),
}


def get_specialist(name: str) -> BaseSpecialist | None:
    return SPECIALIST_REGISTRY.get(name)
