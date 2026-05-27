from pydantic_settings import BaseSettings
from pydantic import Field
from typing import Optional

class Settings(BaseSettings):
    neo4j_uri: str = Field("bolt://localhost:7687", env="NEO4J_URI")
    neo4j_user: str = Field("neo4j", env="NEO4J_USER")
    neo4j_password: str = Field("datapilot-local", env="NEO4J_PASSWORD")
    datapilot_data_dir: str = Field("/data", env="DATAPILOT_DATA_DIR")
    datapilot_host_mount: str = Field("/host", env="DATAPILOT_HOST_MOUNT")
    openai_api_key: Optional[str] = Field(None, env="OPENAI_API_KEY")
    anthropic_api_key: Optional[str] = Field(None, env="ANTHROPIC_API_KEY")
    gemini_api_key: Optional[str] = Field(None, env="GEMINI_API_KEY")

    class Config:
        env_file = ".env"
        extra = "ignore"

settings = Settings()
