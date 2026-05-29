from __future__ import annotations
import os
from typing import List, TYPE_CHECKING
from app.config import settings

if TYPE_CHECKING:
    import openai
    from sentence_transformers import SentenceTransformer

class EmbeddingService:
    def __init__(self):
        self._local_model: SentenceTransformer | None = None
        self._openai_client: openai.OpenAI | None = None

    @property
    def local_model(self) -> SentenceTransformer:
        if self._local_model is None:
            from sentence_transformers import SentenceTransformer
            # Cache the models inside our persistent data directory
            cache_folder = os.path.join(settings.datapilot_data_dir, "models")
            os.makedirs(cache_folder, exist_ok=True)
            # Suppress downloads warnings or customize local caching
            self._local_model = SentenceTransformer("all-MiniLM-L6-v2", cache_folder=cache_folder)
        return self._local_model

    @property
    def openai_client(self) -> openai.OpenAI | None:
        if self._openai_client is None and settings.openai_api_key:
            import openai
            self._openai_client = openai.OpenAI(api_key=settings.openai_api_key)
        return self._openai_client

    def get_embedding_dimension(self) -> int:
        if self.openai_client:
            return 1536
        return 384

    def embed_texts(self, texts: List[str], batch_size: int = 128) -> List[List[float]]:
        """
        Embed `texts` and return a parallel list of vectors. Batches internally
        so callers can pass an arbitrarily long list.

        Provider selection is **sticky for the run**: if an OpenAI client is
        configured, errors propagate to the caller rather than silently falling
        back to the local MiniLM model. The two models produce vectors of
        different dimensions (1536 vs 384), and the Neo4j vector index is
        created from `get_embedding_dimension()` at ingestion start — a
        mid-run fallback would corrupt the graph by mixing dimensions.
        """
        if not texts:
            return []

        # Prefer OpenAI when configured; batch through it.
        if self.openai_client:
            out: List[List[float]] = []
            for i in range(0, len(texts), batch_size):
                chunk = texts[i:i + batch_size]
                response = self.openai_client.embeddings.create(
                    input=chunk,
                    model="text-embedding-3-small",
                )
                out.extend(data.embedding for data in response.data)
            return out

        # Local model (SentenceTransformer) handles batching internally.
        embeddings = self.local_model.encode(texts, batch_size=batch_size)
        return [emb.tolist() for emb in embeddings]

    def format_log_text(self, log_entry: dict) -> str:
        severity = log_entry.get("sev", "INFO").upper()
        node = log_entry.get("node", "unknown")
        text = log_entry.get("text", "")
        return f"[{severity}] {node}: {text}"

embedding_service = EmbeddingService()
