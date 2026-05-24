#!/usr/bin/env python3
import argparse
import gzip
import json
import sqlite3
from pathlib import Path


def rows(connection, table):
    connection.row_factory = sqlite3.Row
    return [dict(row) for row in connection.execute(f"SELECT * FROM {table} ORDER BY id ASC")]


def annotate_atlas(record):
    annotated = dict(record)
    annotated["ambiguous"] = "ambiguous" if annotated["id"] < 10000000 else "unambiguous"
    return annotated


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
        default="/home/bach/O-GlcNAcDB1/db.sqlite3",
        help="Path to the source SQLite database.",
    )
    parser.add_argument(
        "--output-dir",
        default="/home/bach/oglcnac-static-site/static/data",
        help="Directory where static JSON bundles should be written.",
    )
    args = parser.parse_args()

    output_dir = Path(args.output_dir)
    with sqlite3.connect(args.database) as connection:
        atlas = [annotate_atlas(record) for record in rows(connection, "atlas_records")]
        ogt_pin = rows(connection, "interactome_records")

    write_json(output_dir / "atlas-records.json", atlas)
    write_json(output_dir / "ogt-pin-records.json", ogt_pin)
    print(f"atlas_records={len(atlas)}")
    print(f"ogt_pin_records={len(ogt_pin)}")


if __name__ == "__main__":
    main()
