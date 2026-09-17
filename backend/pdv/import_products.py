"""Atomic initial product import: python -m pdv.import_products CSV --dry-run."""
import argparse
import csv
from dataclasses import dataclass, field
from decimal import Decimal
import json
import re

from sqlalchemy import func, insert, select, text
from sqlalchemy.exc import SQLAlchemyError

from .models import Product


@dataclass
class Report:
    total: int = 0
    rows: list = field(default_factory=list)
    errors: dict = field(default_factory=dict)
    problems: list = field(default_factory=list)
    inserted: int = 0
    existing: int | None = None

    def error(self, line, message):
        self.errors.setdefault(line, []).append(message)

    def summary(self):
        return dict(total_lido=self.total, validos=self.total - len(self.errors),
                    invalidos=len(self.errors), inseridos=self.inserted,
                    existentes=self.existing, erros=self.errors, problemas=self.problems)


def number(value, places, maximum, money=False):
    value = value.strip()
    if money and value.startswith('R$'):
        value = value[2:].strip()
    if len(value) > 64:
        raise ValueError('número muito longo')
    if ',' in value:
        pattern = r'[+-]?(?:[0-9]+|[0-9]{1,3}(?:\.[0-9]{3})+),[0-9]+'
        if not re.fullmatch(pattern, value):
            raise ValueError('formato decimal brasileiro inválido')
        value = value.replace('.', '').replace(',', '.')
    elif not re.fullmatch(r'[+-]?[0-9]+(?:\.[0-9]+)?', value):
        raise ValueError('formato decimal inválido')
    result = Decimal(value)
    if result.as_tuple().exponent < -places:
        raise ValueError(f'máximo de {places} casas decimais; não será arredondado')
    if abs(result) > maximum or (money and result < 0):
        raise ValueError('valor fora dos limites do banco')
    return result


def price(value):
    return int(number(value, 2, Decimal('90071992547409.91'), money=True) * 100)


def parse_csv(path):
    report = Report()
    seen = {'code': {}, 'barcode': {}}
    with open(path, encoding='utf-8-sig', newline='') as stream:
        sample = stream.read(8192)
        stream.seek(0)
        # Only supported delimiters; explicit header validation follows sniffing.
        try:
            dialect = csv.Sniffer().sniff(sample, delimiters=',;\t')
        except csv.Error:
            dialect = csv.excel
        reader = csv.reader(stream, dialect, strict=True)
        try:
            headers = [h.strip() for h in next(reader)]
        except StopIteration:
            report.problems.append('CSV vazio')
            return report
        required = {'CODIGO', 'PRODUTO', 'VALOR'}
        allowed = required | {'BARCODE', 'ESTOQUE', 'ATIVO'}
        if len(set(headers)) != len(headers) or not required.issubset(headers) or set(headers) - allowed:
            report.problems.append('Cabeçalho inválido: use CODIGO, PRODUTO, VALOR e opcionais BARCODE, ESTOQUE, ATIVO')
            return report
        for values in reader:
            line = reader.line_num
            report.total += 1
            if len(values) != len(headers):
                report.error(line, 'Quantidade de colunas diferente do cabeçalho')
                continue
            row = dict(zip(headers, (v.strip() for v in values)))
            product = {'code': row['CODIGO'], 'name': row['PRODUTO'],
                       'barcode': row.get('BARCODE') or None}
            for key, limit in [('code', 100), ('name', 300), ('barcode', 100)]:
                value = product[key]
                if key != 'barcode' and not value:
                    report.error(line, f'{key}: obrigatório')
                if value and (len(value) > limit or '\x00' in value):
                    report.error(line, f'{key}: texto inválido ou maior que {limit}')
            for key in seen:
                value = product[key]
                if value:
                    if value in seen[key]:
                        previous = seen[key][value]
                        report.error(line, f'{key}: duplicado na linha {previous}')
                        report.error(previous, f'{key}: duplicado na linha {line}')
                    else:
                        seen[key][value] = line
            for key, parse in [('price_cents', lambda: price(row['VALOR'])),
                               ('stock', lambda: number(row.get('ESTOQUE', '0'), 3, Decimal('9999999999999.999')))]:
                try:
                    product[key] = parse()
                except ValueError as exc:
                    report.error(line, f'{key}: {exc}')
            active = row.get('ATIVO', 'true').lower()
            states = {'true': True, '1': True, 'sim': True, 'ativo': True,
                      'false': False, '0': False, 'não': False, 'nao': False, 'inativo': False}
            if active not in states:
                report.error(line, 'active: use true/false, 1/0, sim/não ou ativo/inativo')
            else:
                product['active'] = states[active]
            report.rows.append((line, product))
    if not report.total:
        report.problems.append('CSV sem produtos')
    return report


def run_import(report, engine, *, apply=False):
    """No writes in dry-run. Apply serializes the empty-table check and insertion."""
    if engine.dialect.name != 'postgresql':
        report.problems.append('O destino deve ser PostgreSQL')
        return report
    try:
        with engine.begin() as conn:
            if apply:
                conn.execute(text("SET LOCAL lock_timeout = '5s'"))
                conn.execute(text('LOCK TABLE products IN SHARE ROW EXCLUSIVE MODE'))
            else:
                conn.execute(text('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY'))
            report.existing = conn.scalar(select(func.count()).select_from(Product))
            if report.existing:
                report.problems.append(f'Banco contém {report.existing} produtos; carga inicial interrompida')
                codes = {p['code'] for _, p in report.rows}
                barcodes = {p['barcode'] for _, p in report.rows if p['barcode']}
                # Chunk the lookup to avoid unbounded SQL parameter lists.
                for field, values in [('code', codes), ('barcode', barcodes)]:
                    values = sorted(values)
                    conflicts = set()
                    column = getattr(Product, field)
                    for offset in range(0, len(values), 1000):
                        conflicts.update(conn.scalars(select(column).where(column.in_(values[offset:offset + 1000]))))
                    for line, product in report.rows:
                        if product[field] in conflicts:
                            report.error(line, f'{field}: já existe no banco')
            if report.errors or report.problems:
                return report
            if apply:
                for _, product in report.rows:
                    conn.execute(insert(Product).values(**product))
        if apply:
            report.inserted = len(report.rows)
    except SQLAlchemyError:
        # Do not disclose credentials, SQL parameters or connection strings.
        report.problems.append('Falha no banco; transação revertida. Verifique conexão, permissões, restrições e locks.')
    return report


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('csv')
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--dry-run', action='store_true', help='validar sem gravar (padrão)')
    mode.add_argument('--apply', action='store_true', help='aplicar carga inicial em transação única')
    args = parser.parse_args(argv)
    try:
        report = parse_csv(args.csv)
    except (OSError, UnicodeError, csv.Error) as exc:
        report = Report(problems=[f'Não foi possível ler o CSV ({type(exc).__name__})'])
    if not report.problems:
        try:
            from .db import engine
            run_import(report, engine(), apply=args.apply)
        except (RuntimeError, OSError, ValueError):
            report.problems.append('Conexão não configurada: defina DATABASE_URL ou DATABASE_URL_FILE; banco não validado')
    print(json.dumps(report.summary(), ensure_ascii=False, indent=2))
    return 1 if report.errors or report.problems else 0


if __name__ == '__main__':
    raise SystemExit(main())
