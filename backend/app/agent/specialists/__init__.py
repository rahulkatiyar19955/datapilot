"""Specialist subgraphs — 6 total, dispatched sequentially by the supervisor's plan."""
from app.agent.specialists.anomaly import AnomalyDetectorSpecialist
from app.agent.specialists.base import BaseSpecialist, SpecialistKind
from app.agent.specialists.defaults import SPECIALIST_REGISTRY, get_specialist
from app.agent.specialists.performance import PerformanceProfilerSpecialist
from app.agent.specialists.rca import RootCauseAnalystSpecialist
from app.agent.specialists.release_compare import ReleaseComparatorSpecialist
from app.agent.specialists.replay_narrator import ReplayNarratorSpecialist
from app.agent.specialists.safety import SafetyAuditorSpecialist

__all__ = [
    "BaseSpecialist",
    "SpecialistKind",
    "AnomalyDetectorSpecialist",
    "PerformanceProfilerSpecialist",
    "RootCauseAnalystSpecialist",
    "ReleaseComparatorSpecialist",
    "ReplayNarratorSpecialist",
    "SafetyAuditorSpecialist",
    "SPECIALIST_REGISTRY",
    "get_specialist",
]
