import os
import re
import time
import requests
import pandas as pd
from rapidfuzz import process, fuzz
from telegram import Update
from telegram.ext import Application, MessageHandler, filters, ContextTypes

TELEGRAM_BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
SHEETS_CSV_URL = os.environ.get("SHEETS_CSV_URL", "")

# cache simples para não baixar CSV a cada mensagem
CATALOG_CACHE = {"df": None, "ts": 0}
CACHE_TTL_SECONDS = 60  # 1 min


def normalize_text(s: str) -> str:
    s = (s or "").lower().strip()
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

    # Normaliza colunas (tolerante a variações de nome)
    df.columns = [normalize_text(c).replace(" ", "_") for c in df.columns]

    # Campos esperados
    expected = [
        "nome_popular", "preco", "estoque", "vaso", "luz", "rega", "pets", "observacoes", "apelidos"
    ]
    for col in expected:
        if col not in df.columns:
            df[col] = ""

    # cria campo de busca (nome + apelidos)
    df["__search"] = (
        df["nome_popular"].astype(str).fillna("") + " | " + df["apelidos"].astype(str).fillna("")
    ).apply(normalize_text)

    CATALOG_CACHE["df"] = df
    CATALOG_CACHE["ts"] = now
    return df


def detect_intent(msg: str) -> str:
    m = normalize_text(msg)

    # ordem importa
    if any(k in m for k in ["quanto", "preço", "preco", "valor", "custa"]):
        return "PRICE"
    if any(k in m for k in ["tem", "estoque", "disponivel", "disponível"]):
        return "STOCK"
    if any(k in m for k in ["como cuidar", "cuidados", "rega", "luz", "sol", "sombra", "adubo"]):
        return "CARE"
    if any(k in m for k in ["me indica", "me sugere", "sugere", "recomenda", "pra", "para"]):
        return "SUGGEST"
    return "GENERAL"


def extract_query(msg: str) -> str:
    # remove palavras comuns, fica com “o nome provável”
    m = normalize_text(msg)
    stop = [
        "quanto", "preco", "preço", "valor", "custa", "ta", "tá",
        "tem", "estoque", "disponivel", "disponível",
        "como", "cuidar", "cuidados", "me", "indica", "sugere", "recomenda",
        "uma", "um", "de", "da", "do", "pra", "para", "no", "na"
    ]
    tokens = [t for t in m.split() if t not in stop]
    return " ".join(tokens).strip()


def find_product(df: pd.DataFrame, query: str):
    q = normalize_text(query)
    if not q:
        return None, []

    # 1) prioridade: nome começa com query
    starts = df[df["nome_popular"].astype(str).apply(lambda x: normalize_text(x).startswith(q))]

    if len(starts) == 1:
        return starts.iloc[0], [(starts.iloc[0], 100)]

    if len(starts) > 1:
        return None, [(row, 90) for _, row in starts.iterrows()]

    # 2) fallback fuzzy (nome + apelido)
    choices = df["__search"].tolist()
    matches = process.extract(q, choices, scorer=fuzz.WRatio, limit=5)

    top = [(df.iloc[idx], score) for (_, score, idx) in matches if score >= 75]

    if len(top) == 1:
        return top[0][0], top

    if len(top) > 1:
        return None, top

    return None, []

def format_product_answer(prod: pd.Series, intent: str) -> str:
    nome = str(prod.get("nome_popular", "")).strip()
    preco = str(prod.get("preco", "")).strip()
    estoque = str(prod.get("estoque", "")).strip()
    vaso = str(prod.get("vaso", "")).strip()
    luz = str(prod.get("luz", "")).strip()
    rega = str(prod.get("rega", "")).strip()
    pets = str(prod.get("pets", "")).strip()
    obs = str(prod.get("observacoes", "")).strip()

    # humanizado, curto
    head = f"Beleza 🙂 Achei aqui no catálogo:\n\n🌿 **{nome}**"

    lines = []
    if intent in ("PRICE", "GENERAL"):
        if preco:
            lines.append(f"💰 **Preço:** {preco}")
        if vaso:
            lines.append(f"🪴 **Vaso:** {vaso}")
    if intent in ("STOCK", "GENERAL"):
        if estoque:
            lines.append(f"📦 **Estoque:** {estoque}")
    if intent in ("CARE", "GENERAL"):
        if luz:
            lines.append(f"☀️ **Luz:** {luz}")
        if rega:
            lines.append(f"💧 **Rega:** {rega}")
        if pets:
            lines.append(f"🐾 **Pets:** {pets}")

    # frase pronta pro cliente
    frase_cliente = ""
    if luz or rega:
        frase_cliente = f'🗣️ *Frase pro cliente:* "{nome} prefere {luz or "boa claridade"} e rega {rega or "moderada"}."'

    extra = ""
    if obs and intent != "PRICE":
        extra = f"\n📝 **Obs.:** {obs}"

    response = head + "\n" + "\n".join(lines)
    if frase_cliente:
        response += "\n\n" + frase_cliente
    response += extra
    response += "\n\nSe quiser, posso sugerir **parecidas** ou **pet friendly** 😉"
    return response


async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE):

    print("DEBUG QUERY:", query)
    print("DEBUG PRIMEIROS NOMES:")
    for i in range(min(5, len(df))):
        print(repr(df.iloc[i]["nome_popular"]))
        
    msg = update.message.text if update.message else ""
    if not msg:
        return

    intent = detect_intent(msg)
    query = extract_query(msg)

    df = load_catalog()

    # sugestão simples por ambiente/luz (MVP)
    if intent == "SUGGEST":
        m = normalize_text(msg)
        # filtros bem simples
        subset = df.copy()

        if "pouca luz" in m or "sombra" in m:
            subset = subset[subset["luz"].astype(str).str.contains("sombra|indireta|pouca", case=False, na=False)]
        if "sol" in m:
            subset = subset[subset["luz"].astype(str).str.contains("sol", case=False, na=False)]
        if "pet" in m:
            subset = subset[subset["pets"].astype(str).str.contains("ok|sim|não tóx", case=False, na=False)]

        subset = subset.head(3)
        if len(subset) == 0:
            await update.message.reply_text(
                "Entendi 🙂 Mas não encontrei sugestão certeira com esses filtros no catálogo.\n"
                "Me diga: é pra **sol**, **meia-sombra** ou **pouca luz**?"
            )
            return

        items = []
        for _, r in subset.iterrows():
            items.append(f"• 🌿 {r.get('nome_popular','')} — {r.get('preco','')}")
        await update.message.reply_text(
            "Pera aí que já te passo 3 boas opções 👀\n\n" + "\n".join(items) +
            "\n\nQuer que eu filtre por **pet friendly**?"
        )
        return

    # busca produto
    prod, top = find_product(df, query)

    if prod is None:
        await update.message.reply_text(
            "Não achei esse item no catálogo 😕\n"
            "Você pode tentar:\n"
            "• outro nome (apelido)\n"
            "• escrever só a 1ª palavra\n"
            "• ou me mandar uma foto/nome certinho"
        )
        return

    # se tiver empate/ambiguidade, pergunta
    if len(top) >= 2 and (top[0][1] - top[1][1]) < 5:
        options = [f"• {t[0].get('nome_popular','')}" for t in top[:3]]
        await update.message.reply_text(
            "Achei mais de uma parecida 👀 Qual delas você quis dizer?\n\n" + "\n".join(options)
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





