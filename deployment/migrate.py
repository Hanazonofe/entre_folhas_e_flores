from pathlib import Path
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text
from pdv.config import secret

url = secret("OWNER_DATABASE_URL")
if not url:
    raise RuntimeError("Migração exige credencial separada do proprietário.")
command.upgrade(Config("/app/backend/alembic.ini"), "head")
with create_engine(url).begin() as db:
    db.execute(text(Path("/app/deployment/grants.sql").read_text()))
print(
    "Migrações e permissões aplicadas. Nenhum usuário/produto/venda criado automaticamente."
)
