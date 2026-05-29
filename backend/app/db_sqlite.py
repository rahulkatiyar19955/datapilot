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
        
        # SQLite migrations for chat_messages table to support restoring full findings/causal/plan
        from sqlalchemy import text
        result = await conn.execute(text("PRAGMA table_info(chat_messages)"))
        columns = [row[1] for row in result.fetchall()]
        if "findings_json" not in columns:
            await conn.execute(text("ALTER TABLE chat_messages ADD COLUMN findings_json TEXT"))
        if "causal_json" not in columns:
            await conn.execute(text("ALTER TABLE chat_messages ADD COLUMN causal_json TEXT"))
        if "plan_json" not in columns:
            await conn.execute(text("ALTER TABLE chat_messages ADD COLUMN plan_json TEXT"))

async def get_db():
    async with AsyncSessionLocal() as session:
        yield session
