#!/usr/bin/env python3
import argparse
import csv
import gzip
import json
import sqlite3
from pathlib import Path


def rows(connection, table):
    connection.row_factory = sqlite3.Row
    return [dict(row) for row in connection.execute(f"SELECT * FROM {table} ORDER BY id ASC")]


def annotate_atlas(record):
    annotated = dict(record)
    # Existing Atlas IDs encode whether the site is ambiguous.
    annotated["ambiguous"] = "ambiguous" if annotated["id"] < 10000000 else "unambiguous"
    return annotated


def scalar(value):
    if value is None:
        return None
    value = value.strip()
    if value == "":
        return None
    try:
        number = int(value)
        if str(number) == value:
            return number
    except ValueError:
        pass
    try:
        return float(value)
    except ValueError:
        return value


def csv_rows(path):
    with path.open(newline="", encoding="utf-8-sig") as handle:
        reader = csv.DictReader(handle)
        return [{key: scalar(value) for key, value in row.items()} for row in reader]


def normalize_atlas_csv_row(row, dataset=None):
    normalized = dict(row)
    if "log2Ratio" in normalized and "log2FC" not in normalized:
        normalized["log2FC"] = normalized.pop("log2Ratio")
    if dataset:
        normalized["ambiguous"] = dataset
    elif "ambiguous" not in normalized or normalized["ambiguous"] is None:
        normalized = annotate_atlas(normalized)
    return normalized


def atlas_from_csv(args):
    records = []
    if args.atlas_csv:
        records.extend(normalize_atlas_csv_row(row) for row in csv_rows(args.atlas_csv))
    if args.atlas_unambiguous_csv:
        records.extend(
            normalize_atlas_csv_row(row, "unambiguous")
            for row in csv_rows(args.atlas_unambiguous_csv)
        )
    if args.atlas_ambiguous_csv:
        records.extend(
            normalize_atlas_csv_row(row, "ambiguous")
            for row in csv_rows(args.atlas_ambiguous_csv)
        )
    return sorted(records, key=lambda record: int(record["id"]))


def write_json(path, payload):
    path.parent.mkdir(parents=True, exist_ok=True)
    data = json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    path.write_bytes(data)
    with gzip.open(f"{path}.gz", "wb", compresslevel=9) as handle:
        handle.write(data)


def main():
    parser = argparse.ArgumentParser(description="Generate static Atlas and OGT-PIN data bundles.")
    parser.add_argument(
        "--database",
        required=False,
        help="Path to the source SQLite database.",
    )
    parser.add_argument("--atlas-csv", type=Path, help="Combined Atlas CSV with an ambiguous column.")
    parser.add_argument("--atlas-unambiguous-csv", type=Path, help="Atlas dataset-I unambiguous CSV.")
    parser.add_argument("--atlas-ambiguous-csv", type=Path, help="Atlas dataset-II ambiguous CSV.")
    parser.add_argument("--ogt-pin-csv", type=Path, help="OGT-PIN CSV.")
    parser.add_argument(
        "--output-dir",
        default=Path(__file__).resolve().parents[1] / "static" / "data",
        type=Path,
        help="Directory where static JSON bundles should be written.",
    )
    args = parser.parse_args()

    csv_mode = args.atlas_csv or args.atlas_unambiguous_csv or args.atlas_ambiguous_csv or args.ogt_pin_csv
    if args.database and csv_mode:
        parser.error("Use either --database or CSV inputs, not both.")
    if not args.database and not csv_mode:
        parser.error("Provide --database or CSV inputs.")

    if args.database:
        with sqlite3.connect(args.database) as connection:
            atlas = [annotate_atlas(record) for record in rows(connection, "atlas_records")]
            ogt_pin = rows(connection, "interactome_records")
    else:
        if not (args.atlas_csv or (args.atlas_unambiguous_csv and args.atlas_ambiguous_csv)):
            parser.error("CSV mode requires --atlas-csv or both Atlas dataset CSV files.")
        if not args.ogt_pin_csv:
            parser.error("CSV mode requires --ogt-pin-csv.")
        atlas = atlas_from_csv(args)
        ogt_pin = sorted(csv_rows(args.ogt_pin_csv), key=lambda record: int(record["id"]))

    write_json(args.output_dir / "atlas-records.json", atlas)
    write_json(args.output_dir / "ogt-pin-records.json", ogt_pin)
    print(f"atlas_records={len(atlas)}")
    print(f"ogt_pin_records={len(ogt_pin)}")


if __name__ == "__main__":
    main()
