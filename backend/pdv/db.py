from functools import lru_cache
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from .config import database_url


@lru_cache
def engine():
    return create_engine(
        database_url(),
        pool_pre_ping=True,
        connect_args={"connect_timeout": 5},
        pool_size=10,
        max_overflow=10,
    )


def get_db():
    with Session(engine()) as db:
        yield db
