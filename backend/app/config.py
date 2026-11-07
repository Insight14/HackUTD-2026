"""Application Configuration Module."""
import os
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent.parent

class Settings(BaseSettings):
    app_name: str = "Tidewatch API"
    environment: str = "development"
    debug: bool = True
    seed: int = 42

    # SpacetimeDB
    spacetimedb_uri: str = "http://localhost:3000"
    spacetimedb_ws_uri: str = "ws://localhost:3000"
    spacetimedb_database: str = "tidewatch"
    spacetimedb_auth_token: str = ""

    # Tiger Data
    tiger_data_url: str = "postgresql://postgres:password@localhost:5432/tigerdata"
    tiger_data_enabled: bool = False

    # NVIDIA Nemotron
    nvidia_api_key: str = ""
    nvidia_base_url: str = "https://integrate.api.nvidia.com/v1"
    nvidia_model: str = "nvidia/nemotron-4-34b-instruct"
    nvidia_enabled: bool = False

    # MongoDB
    mongodb_uri: str = "mongodb://localhost:27017/tidewatch"
    mongodb_enabled: bool = False

    # Configuration Path
    topology_config_path: Path = BASE_DIR / "config" / "avon_system.json"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()

