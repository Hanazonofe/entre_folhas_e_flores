import os
import re
import time
import unicodedata
import requests
import pandas as pd
from rapidfuzz import process, fuzz
from telegram import Update
from telegram.ext import Application, MessageHandler, filters, ContextTypes

TELEGRAM_BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
SHEETS_CSV_URL = os.environ.get("SHEETS_CSV_URL", "")

CATALOG_CACHE = {"df": None, "ts": 0}
CACHE_TTL_SECONDS = 60


def normalize_text(s: str) -> str:
    s = (s or "").lower().strip()
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    s = re.sub(r"[^\w\s|]", " ", s)
    s = re.sub(r"\s+", " ", s)
    return s


def load_catalog() -> pd.DataFrame:
    now = time.time()
    if CATALOG_CACHE["df"] is not None and (now - CATALOG_CACHE["ts"] < CACHE_TTL_SECONDS):
        return CATALOG_CACHE["df"]

    if not SHEETS_CSV_URL:
        raise ValueError("SHEETS_CSV_URL não configurado.")

    resp = requests.get(SHEETS_CSV_URL, timeout=20)
    resp.raise_for_status()

    from io import StringIO
    df = pd.read_csv(StringIO(resp.text))

    df.columns = [normalize_text(c).replace(" ", "_") for c in df.columns]

    expected = ["nome_popular", "preco", "estoque", "vaso", "luz", "rega", "pets", "observacoes", "apelido"]
    for col in expected:
        if col not in df.columns:
            df[col] = ""

    df["__search"] = (
        df["nome_popular"].astype(str).fillna("") + " | " + df["apelido"].astype(str).fillna("")
    ).apply(normalize_text)

    CATALOG_CACHE["df"] = df
    CATALOG_CACHE["ts"] = now
    return df


def detect_intent(msg: str) -> str:
    m = normalize_text(msg)

    if any(k in m for k in ["quanto", "preco", "valor", "custa"]):
        return "PRICE"
    if any(k in m for k in ["tem", "estoque", "disponivel"]):
        return "STOCK"
    if any(k in m for k in ["rega", "luz", "sol", "sombra", "cuidar"]):
        return "CARE"
    if any(k in m for k in ["indica", "sugere", "recomenda"]):
        return "SUGGEST"
    return "GENERAL"


def find_product(df: pd.DataFrame, query: str):
    q = normalize_text(query)
    if not q:
        return None, []

    tokens = q.split()

    def match_tokens(name):
        name = normalize_text(name)
        return all(t.rstrip("s") in name for t in tokens)

    filtered = df[df["nome_popular"].astype(str).apply(match_tokens)]

    if len(filtered) == 1:
        return filtered.iloc[0], [(filtered.iloc[0], 100)]

    if len(filtered) > 1:
        return None, [(row, 90) for _, row in filtered.iterrows()]

    matches = process.extract(q, df["__search"].tolist(), scorer=fuzz.WRatio, limit=5)
    top = [(df.iloc[idx], score) for (_, score, idx) in matches if score >= 75]

    if len(top) == 1:
        return top[0][0], top

    if len(top) > 1:
        return None, top

    return None, []


def format_product_answer(prod: pd.Series, intent: str) -> str:
    nome = str(prod.get("nome_popular", "")).strip()
    preco = str(prod.get("preco", "")).strip()

    preco_formatado = ""

    try:
        # troca vírgula por ponto se vier assim
        valor = float(preco.replace(",", "."))
        preco_formatado = f"R$ {valor:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    except:
        preco_formatado = ""

    if preco and preco.lower() != "nan":
        return f"🌿 **{nome}**\n💰 **Preço:** {preco_formatado}"
    else:
        return f"🌿 **{nome}**\n💰 Preço não cadastrado"

async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE):
    msg = update.message.text if update.message else ""
    if not msg:
        return

    intent = detect_intent(msg)

    query = normalize_text(msg)
    for w in ["preco", "valor", "quanto", "custa"]:
        query = query.replace(w, "")
    query = query.strip()
    query = " ".join(w for w in query.split() if w not in ["da", "de", "do", "das", "dos"])

    df = load_catalog()

    prod, top = find_product(df, query)

    if prod is None:
        if len(top) >= 2:
            options = [f"• {t[0].get('nome_popular','')}" for t in top[:3]]
            await update.message.reply_text(
                "Achei mais de uma parecida 👀 Qual delas você quis dizer?\n\n" + "\n".join(options)
            )
            return

        await update.message.reply_text(
            "Não achei esse item no catálogo 😕\n"
            "Você pode tentar:\n"
            "• outro nome\n"
            "• escrever só a 1ª palavra\n"
            "• ou me mandar o nome certinho"
        )
        return

    answer = format_product_answer(prod, intent)
    await update.message.reply_text(answer, parse_mode="Markdown")


def main():
    if not TELEGRAM_BOT_TOKEN:
        raise ValueError("Defina TELEGRAM_BOT_TOKEN nas variáveis de ambiente.")

    app = Application.builder().token(TELEGRAM_BOT_TOKEN).build()
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))
    app.run_polling(close_loop=False)


if __name__ == "__main__":
    main()



