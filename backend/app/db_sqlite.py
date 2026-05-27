import os
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import declarative_base
from app.config import settings

Base = declarative_base()

# Ensure datapilot data directory exists
os.makedirs(settings.datapilot_data_dir, exist_ok=True)
db_path = os.path.abspath(os.path.join(settings.datapilot_data_dir, "db.sqlite"))

DATABASE_URL = f"sqlite+aiosqlite:///{db_path}"

engine = create_async_engine(DATABASE_URL, echo=False)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)

async def init_db():
    # Import models here to register them with Base.metadata
    from app.models import SessionRecord, ChatMessageRecord, AgentModelRecord, SessionCostRecord
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

async def get_db():
    async with AsyncSessionLocal() as session:
        yield session
