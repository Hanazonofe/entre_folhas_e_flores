import os
from decimal import Decimal

import pytest
from sqlalchemy import event, func, select
from sqlalchemy.exc import IntegrityError

from pdv.import_products import main, parse_csv, price, run_import
from pdv.models import Product
from test_support import guarded_engine


def csv_file(tmp_path, content):
    path = tmp_path / 'products.csv'
    path.write_text(content, encoding='utf-8-sig')
    return path


# @principle:P-005
def test_parse(tmp_path):
    report = parse_csv(csv_file(tmp_path, 'CODIGO,PRODUTO, VALOR,BARCODE,ESTOQUE,ATIVO\n001,Vaso," 62,00 ",0000123,"1,234",não\n002,Outro,4.50,,,sim\n'))
    assert report.rows[0][1] == dict(code='001', name='Vaso', price_cents=6200,
                                   barcode='0000123', stock=Decimal('1.234'), active=False)
    assert report.rows[1][1]['barcode'] is None
    assert report.errors  # Explicit blank stock must not silently become zero.


def test_defaults(tmp_path):
    report = parse_csv(csv_file(tmp_path, 'CODIGO;PRODUTO;VALOR\n001;Vaso;4,50\n'))
    assert not report.errors
    assert report.rows[0][1]['stock'] == Decimal('0')
    assert report.rows[0][1]['active'] is True
    assert report.rows[0][1]['barcode'] is None


@pytest.mark.parametrize('value,expected', [('62,00', 6200), ('R$ 1.234,56', 123456), ('0.01', 1), ('90071992547409,91', 9007199254740991)])
# @principle:P-005
def test_price(value, expected):
    assert price(value) == expected


@pytest.mark.parametrize('value', ['NaN', 'Infinity', '1e3', '-1', '1.234', '12.34,56', '90071992547409,92', '', '0,001'])
# @principle:P-005
def test_bad_price(value):
    with pytest.raises(ValueError):
        price(value)


def test_duplicates_even_invalid_rows(tmp_path):
    report = parse_csv(csv_file(tmp_path, 'CODIGO,PRODUTO,VALOR,BARCODE\nA,Vaso,1,001\nA,Vaso,erro,002\nB,Vaso,1,001\n'))
    assert set(report.errors) == {2, 3, 4}
    assert report.summary()['invalidos'] == 3


@pytest.mark.parametrize('content', [
    'CODIGO,PRODUTO,VALOR\n,Vaso,1\n',
    'CODIGO,PRODUTO,VALOR\nA,,1\n',
    'CODIGO,PRODUTO,VALOR,ESTOQUE\nA,Vaso,1,0.0001\n',
    'CODIGO,PRODUTO,VALOR,ATIVO\nA,Vaso,1,talvez\n',
    'CODIGO,PRODUTO,VALOR\nA,Vaso,1,extra\n',
])
def test_invalid_rows(tmp_path, content):
    report = parse_csv(csv_file(tmp_path, content))
    assert report.summary()['invalidos'] == 1


def test_unknown_header(tmp_path):
    assert parse_csv(csv_file(tmp_path, 'CODIGO,PRODUTO,VALOR,UNKNOWN\n')).problems


@pytest.fixture
def db():
    url = os.getenv('IMPORT_TEST_DATABASE_URL')
    if not url:
        pytest.skip('Set IMPORT_TEST_DATABASE_URL to a disposable PostgreSQL database')
    engine = guarded_engine(url)
    assert engine.url.database == 'pdv_import_test'
    Product.__table__.create(engine, checkfirst=True)
    with engine.begin() as conn:
        conn.execute(Product.__table__.delete())
    yield engine
    engine.dispose()


def count(db):
    with db.connect() as conn:
        return conn.scalar(select(func.count()).select_from(Product))


def source(tmp_path):
    return csv_file(tmp_path, 'CODIGO,PRODUTO,VALOR\n001,Vaso,1\n002,Outro,2\n')


def test_dry_run_and_apply_and_existing(db, tmp_path):
    path = source(tmp_path)
    result = run_import(parse_csv(path), db)
    assert not result.problems and result.inserted == 0 and count(db) == 0
    result = run_import(parse_csv(path), db, apply=True)
    assert result.inserted == 2 and count(db) == 2
    result = run_import(parse_csv(path), db, apply=True)
    assert result.existing == 2 and result.problems and result.inserted == 0
    assert result.summary()['invalidos'] == 2 and count(db) == 2


def test_rollback(db, tmp_path):
    calls = []
    def fail_second(conn, cursor, statement, parameters, context, executemany):
        if statement.startswith('INSERT INTO products'):
            calls.append(statement)
            if len(calls) == 2:
                raise IntegrityError(statement, parameters, Exception('injected failure'))
    event.listen(db, 'before_cursor_execute', fail_second)
    try:
        result = run_import(parse_csv(source(tmp_path)), db, apply=True)
    finally:
        event.remove(db, 'before_cursor_execute', fail_second)
    assert len(calls) == 2
    assert result.problems and result.inserted == 0 and count(db) == 0


def test_invalid_no_partial_import(db, tmp_path):
    path = csv_file(tmp_path, 'CODIGO,PRODUTO,VALOR\n001,Vaso,1\n002,Outro,invalid\n')
    result = run_import(parse_csv(path), db, apply=True)
    assert result.errors and count(db) == 0


@pytest.mark.parametrize("_spec", ["@spec:AC-043 Importador CSV começa em simulação"])
def test_cli_defaults_to_dry_run(_spec, db, tmp_path, monkeypatch, capsys):
    monkeypatch.setattr('pdv.db.engine', lambda: db)
    assert main([str(source(tmp_path))]) == 0
    assert count(db) == 0
    assert '"inseridos": 0' in capsys.readouterr().out
