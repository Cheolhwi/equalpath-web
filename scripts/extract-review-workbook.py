"""Read the supplied Numbers review table without changing the workbook.

Run in an isolated environment with numbers-parser==4.19.0 installed.
The output contains source text; keep it under the ignored .build directory.
"""
import argparse
import datetime
import json
from pathlib import Path
from numbers_parser import Document

parser = argparse.ArgumentParser()
parser.add_argument('workbook', type=Path)
parser.add_argument('output', type=Path)
args = parser.parse_args()
tables = []
for sheet in Document(args.workbook).sheets:
    for table in sheet.tables:
        rows = table.rows(values_only=True)
        headers = [str(value).strip() if value is not None else '' for value in rows[0]]
        if {'provider_id', 'review_id', 'review_text'}.issubset(headers):
            tables.append((headers, rows[1:]))
if len(tables) != 1:
    raise SystemExit('Expected exactly one review table with provider_id, review_id and review_text.')
headers, rows = tables[0]
records = []
for row in rows:
    if not any(value is not None for value in row):
        continue
    record = {}
    for name, value in zip(headers, row):
        if not name:
            continue
        record[name] = value.isoformat()[:10] if isinstance(value, (datetime.date, datetime.datetime)) else value
    records.append(record)
args.output.parent.mkdir(parents=True, exist_ok=True)
args.output.write_text(json.dumps(records, ensure_ascii=False), encoding='utf-8')
print(f'Read {len(records)} reviews. Original workbook unchanged.')
