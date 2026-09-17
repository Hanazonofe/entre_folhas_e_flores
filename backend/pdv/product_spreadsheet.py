"""XLSX catalogue exchange. All changes remain in the caller's transaction."""

import hashlib
import io
import json
import re
import zipfile
from decimal import Decimal
from xml.etree import ElementTree as ET

from fastapi import HTTPException
from openpyxl import Workbook, load_workbook
from sqlalchemy import select, text

from .import_products import number, price
from .models import Product, now

HEADERS = ["CODIGO", "PRODUTO", "VALOR", "BARCODE", "ESTOQUE", "ATIVO"]
MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
NS = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
MAX_ROWS = 20000


def export_xlsx(products):
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Produtos"
    sheet.append(HEADERS)
    for product in products:
        amount = Decimal(product.price_cents) / 100
        stock = product.stock
        # Excel has only 15 significant digits; retain exceptional amounts as text.
        sheet.append(
            [
                product.code,
                product.name,
                amount if product.price_cents < 10**15 else format(amount, ".2f"),
                product.barcode or "",
                stock if abs(stock) < Decimal("1e12") else format(stock, ".3f"),
                "sim" if product.active else "não",
            ]
        )
        for column in (1, 2, 4, 6):
            cell = sheet.cell(sheet.max_row, column)
            cell.data_type = "s"  # Names starting with '=' must never become formulas.
            cell.number_format = "@"
        sheet.cell(sheet.max_row, 3).number_format = "0.00"
        sheet.cell(sheet.max_row, 5).number_format = "0.000"
    sheet.freeze_panes = "A2"
    sheet.auto_filter.ref = sheet.dimensions
    for col, width in [
        ("A", 22),
        ("B", 55),
        ("C", 18),
        ("D", 24),
        ("E", 18),
        ("F", 12),
    ]:
        sheet.column_dimensions[col].width = width
    output = io.BytesIO()
    workbook.save(output)
    return output.getvalue()


def read_xlsx(data):
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            infos = archive.infolist()
            if len(infos) > 1000 or sum(i.file_size for i in infos) > 30_000_000:
                raise ValueError("Arquivo descompactado muito grande.")
            # Read raw numeric XML; never route monetary parsing through float.
            numerics = {}
            for info in infos:
                if re.fullmatch(r"xl/worksheets/sheet\d+\.xml", info.filename):
                    xml = archive.read(info)
                    if b"<!DOCTYPE" in xml or b"<!ENTITY" in xml:
                        raise ValueError("XML não permitido.")
                    numerics[info.filename] = {
                        c.attrib["r"]: c.find("s:v", NS).text
                        for c in ET.fromstring(xml).findall(".//s:c", NS)
                        if c.attrib.get("t", "n") == "n"
                        and c.find("s:v", NS) is not None
                    }
            for info in infos:
                if info.filename.endswith(".xml"):
                    xml = archive.read(info)
                    if b"<!DOCTYPE" in xml or b"<!ENTITY" in xml:
                        raise ValueError("XML não permitido.")
        workbook = load_workbook(
            io.BytesIO(data), read_only=True, data_only=False, keep_links=False
        )
        rows, errors, seen = [], [], {"code": {}, "barcode": {}}
        for sheet in workbook:
            if sheet.max_row and sheet.max_row > MAX_ROWS + 1:
                raise ValueError("Limite de 20.000 linhas por arquivo.")
            if sheet.max_column and sheet.max_column > 20:
                raise ValueError("Há colunas fora do formato esperado.")
            raw = numerics.get(sheet._worksheet_path, {})
            headers = None
            for cells in sheet:
                if all(c.value is None for c in cells):
                    continue
                if headers is None:
                    headers = [str(c.value or "").strip() for c in cells]
                    while headers and not headers[-1]:
                        headers.pop()
                    if (
                        not {"CODIGO", "PRODUTO", "VALOR"}.issubset(headers)
                        or len(headers) != len(set(headers))
                        or set(headers) - set(HEADERS)
                    ):
                        raise ValueError(
                            f"Aba {sheet.title}: cabeçalhos esperados: {', '.join(HEADERS)}."
                        )
                    continue
                if len(rows) >= MAX_ROWS:
                    raise ValueError("Limite de 20.000 produtos por arquivo.")
                index = len(rows)
                location = {
                    "aba": sheet.title,
                    "linha": next(c.row for c in cells if c.value is not None),
                }
                entry = {"location": location, "values": {}, "invalid": False}
                rows.append(entry)

                def error(message, idx=index):
                    rows[idx]["invalid"] = True
                    errors.append({**rows[idx]["location"], "erro": message})

                values = {}
                for key, cell in zip(headers, cells):
                    if cell.data_type in ("f", "e"):
                        error(
                            f"{key}: fórmulas e erros de Excel não são aceitos; cole somente valores."
                        )
                    value = (
                        raw.get(cell.coordinate)
                        if cell.data_type == "n"
                        else cell.value
                    )
                    values[key] = "" if value is None else str(value).strip()
                    if (
                        key in ("CODIGO", "BARCODE")
                        and cell.value is not None
                        and cell.data_type != "s"
                    ):
                        error(
                            f"{key}: formate como Texto no Excel para preservar zeros."
                        )
                if any(c.value is not None for c in cells[len(headers) :]):
                    error("Dados fora das colunas do cabeçalho.")
                p = entry["values"]
                p.update(code=values.get("CODIGO", ""), name=values.get("PRODUTO", ""))
                if "BARCODE" in values:
                    p["barcode"] = values["BARCODE"] or None
                for key, maximum in [("code", 100), ("name", 300), ("barcode", 100)]:
                    value = p.get(key)
                    if key != "barcode" and not value:
                        error(f"{key}: obrigatório.")
                    if value and (len(value) > maximum or "\x00" in value):
                        error(
                            f"{key}: texto inválido ou maior que {maximum} caracteres."
                        )
                for key in seen:
                    value = p.get(key)
                    if value:
                        if value in seen[key]:
                            error(f"{key}: duplicado no arquivo.")
                            error(f"{key}: duplicado no arquivo.", seen[key][value])
                        else:
                            seen[key][value] = index
                try:
                    p["price_cents"] = price(values.get("VALOR", ""))
                except ValueError as exc:
                    error(f"VALOR: {exc}")
                if "ESTOQUE" in values:
                    try:
                        p["stock"] = number(
                            values["ESTOQUE"], 3, Decimal("9999999999999.999")
                        )
                    except ValueError as exc:
                        error(f"ESTOQUE: {exc}")
                if "ATIVO" in values:
                    states = {
                        "sim": True,
                        "true": True,
                        "1": True,
                        "ativo": True,
                        "não": False,
                        "nao": False,
                        "false": False,
                        "0": False,
                        "inativo": False,
                    }
                    if values["ATIVO"].lower() not in states:
                        error("ATIVO: use sim/não.")
                    else:
                        p["active"] = states[values["ATIVO"].lower()]
        workbook.close()
        if not rows:
            raise ValueError("Arquivo sem produtos.")
        return rows, errors
    except HTTPException:
        raise
    except Exception as exc:
        message = (
            str(exc)
            if isinstance(exc, ValueError)
            else "Arquivo XLSX inválido ou corrompido."
        )
        raise HTTPException(422, message) from exc


def process(db, data, *, apply=False, preview="", skip_invalid=False):
    rows, errors = read_xlsx(data)
    if apply:
        db.execute(text("SET LOCAL lock_timeout = '5s'"))
        db.execute(text("LOCK TABLE products IN SHARE ROW EXCLUSIVE MODE"))
    products = list(db.scalars(select(Product).order_by(Product.code)))
    existing = {p.code: p for p in products}
    barcode_owner = {p.barcode: p.code for p in products if p.barcode}
    # Include the whole catalogue and the file in the preview fingerprint.
    state = [
        (p.code, p.name, p.barcode, p.price_cents, str(p.stock), p.active, p.version)
        for p in products
    ]
    fingerprint = hashlib.sha256(
        data
        + json.dumps(state, ensure_ascii=False).encode()
        + str(skip_invalid).encode()
    ).hexdigest()
    if apply and preview != fingerprint:
        raise HTTPException(
            409, "O arquivo ou cadastro mudou. Valide novamente antes de importar."
        )
    for row in rows:
        p = row["values"]
        barcode = p.get("barcode")
        if barcode and barcode_owner.get(barcode, p["code"]) != p["code"]:
            row["invalid"] = True
            errors.append(
                {
                    **row["location"],
                    "erro": "BARCODE pertence a outro produto; ajuste antes de importar.",
                }
            )
    valid = [r for r in rows if not r["invalid"]]
    invalid = len(rows) - len(valid)
    created = sum(r["values"]["code"] not in existing for r in valid)
    updated = len(valid) - created
    result = dict(
        total=len(rows),
        validos=len(valid),
        invalidos=invalid,
        criar=created,
        atualizar=updated,
        inseridos=0,
        atualizados=0,
        erros=errors,
        preview=fingerprint,
    )
    if apply:
        if invalid and not skip_invalid:
            raise HTTPException(
                422,
                "Há produtos inválidos. Corrija ou selecione ignorar inválidos e valide novamente.",
            )
        if not valid:
            raise HTTPException(422, "Nenhum produto válido para importar.")
        for item in valid:
            values = item["values"]
            product = existing.get(values["code"])
            if product is None:
                db.add(Product(**values))
            else:
                for key, value in values.items():
                    setattr(product, key, value)
                product.version += 1
                product.updated_at = now()
        db.flush()
        db.commit()
        result.update(inseridos=created, atualizados=updated)
    return result
