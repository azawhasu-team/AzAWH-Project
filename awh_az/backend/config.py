from pydantic_settings import BaseSettings
from typing import List
import os


class Settings(BaseSettings):
    # FastAPI Configuration
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    api_reload: bool = False
    cors_origins: List[str] = [
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:3002",
        "http://localhost:3003",
        "https://azawhdashboard.vercel.app",
    ]
    cors_extra_origins: str = ""  # comma-separated production origins
    
    # Redis Configuration
    redis_host: str = "localhost"
    redis_port: int = 6379
    redis_db: int = 0
    redis_password: str = ""
    cache_ttl: int = 300
    
    # Firebase Configuration
    firebase_credentials_path: str = os.path.join(
        os.path.dirname(__file__), "awh-project-460421-52cd6ebf2aa3.json"
    )
    firestore_collection: str = "stations"

    # PostgreSQL Configuration — serves /readings and /hourly (kept in sync
    # by ingestion_worker.py); Firestore remains the source of truth for
    # /stations, /stations-registry, and /impact.
    database_url: str = "postgresql://mounusha@localhost:5432/awh_db"

    # Admin panel — shared secret the dashboard's server-side admin API routes
    # attach to admin writes; never sent to the browser. Firebase Storage bucket
    # backs station image uploads. Both empty by default (fail closed).
    admin_api_key: str = ""

    # Read-access key for every data endpoint. The dashboard's server attaches it
    # (X-API-Key) when it proxies browser requests, so the API is not publicly
    # readable. While UNSET the API stays open (transitional: lets the key be set on
    # the dashboard first, then here) and a warning is logged at startup.
    api_key: str = ""
    firebase_storage_bucket: str = ""

    # Alert notifications (POST /admin/alerts/evaluate). With no channel
    # configured, alerts are only logged. public_base_url is this API's own
    # public address, used to build the one-click acknowledge/snooze links.
    public_base_url: str = ""
    alert_link_secret: str = ""  # signs those links; falls back to admin_api_key
    alert_slack_webhook_url: str = ""
    alert_smtp_host: str = ""
    alert_smtp_port: int = 587
    alert_smtp_user: str = ""
    alert_smtp_password: str = ""
    alert_email_from: str = ""
    alert_email_to: str = ""  # comma-separated
    alert_stale_minutes: float = 120
    alert_reminder_hours: float = 12
    alert_lookback_days: float = 7  # a station that reported this recently is expected to be live
    alert_quality_threshold: int = 60
    alert_expected_live: str = ""  # optional JSON {"station": max_silent_minutes}

    # Data Configuration
    max_query_limit: int = 10000
    default_page_size: int = 100
    
    class Config:
        env_file = ".env"
        case_sensitive = False

    @property
    def all_cors_origins(self) -> List[str]:
        origins = list(self.cors_origins)
        if self.cors_extra_origins:
            origins.extend(o.strip() for o in self.cors_extra_origins.split(",") if o.strip())
        return origins


settings = Settings()
