#!/usr/bin/env python3
"""Derive compact browser indexes and bounded accession buckets from tracked Atlas data.

The original corpus and sequence snapshot remain authoritative and unchanged.
Bucket records retain every source field and source row order; search projections
retain searchable identity fields plus dictionary-encoded experimental context.
"""

from __future__ import annotations

import argparse
import gzip
import hashlib
import io
import json
from pathlib import Path


DIRECTORY = "atlas-v2"
METADATA_FIELDS = ("accession", "entry_name", "protein_name", "gene_name", "species")
CONTEXT_FIELDS = ("method", "sample_type", "ambiguous", "pmid")
ROW_CHUNK_SIZE = 1024


def accession_bucket(accession: str) -> str:
    """FNV-1a over Unicode code points, matching static-data.js exactly."""
    value = 2166136261
    for character in accession:
        value = ((value ^ ord(character)) * 16777619) & 0xFFFFFFFF
    return f"{value & 255:02x}"


def encoded(payload: object) -> bytes:
    return json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def compressed(body: bytes) -> bytes:
    # GzipFile fixes the portable OS header as well as the timestamp; the
    # gzip.compress(mtime=0) header differs across supported Python releases.
    output = io.BytesIO()
    with gzip.GzipFile(filename="", mode="wb", fileobj=output, compresslevel=9, mtime=0) as handle:
        handle.write(body)
    return output.getvalue()


def compact_projection(records: list[dict]) -> dict:
    metadata = []
    lookup = {}
    rows = []
    ids = []
    for record in records:
        values = tuple(record.get(field) for field in METADATA_FIELDS)
        if values not in lookup:
            lookup[values] = len(metadata)
            metadata.append(values)
        rows.append(lookup[values])
        ids.append(record.get("id"))
    index = {
        "schema_version": 1,
        "record_count": len(records),
        "fields": METADATA_FIELDS,
        "metadata": metadata,
        "metadata_rows": rows,
        "positions": [record.get("position_in_protein") for record in records],
    }
    if all(type(value) is int for value in ids):
        previous = 0
        deltas = []
        for value in ids:
            deltas.append(value - previous)
            previous = value
        index["id_deltas"] = deltas
    else:
        index["ids"] = ids
    # Independent dictionaries avoid repeating experimental context in each
    # protein metadata tuple. The source row order remains the join key.
    index["context"] = {}
    for field in CONTEXT_FIELDS:
        values = list(dict.fromkeys(record.get(field) for record in records))
        lookup = {value: number for number, value in enumerate(values)}
        index["context"][field] = {"values": values, "rows": [lookup[record.get(field)] for record in records]}
    return index


def build_delivery(records: list[dict], snapshot: dict | None) -> dict[str, object]:
    peptides: list[object] = []
    peptide_index: dict[object, int] = {}
    peptide_rows: list[int] = []
    peptide_accessions: list[set[str]] = []
    buckets = {
        f"{number:02x}": {
            "schema_version": 1,
            "records": {},
            "snapshot": {
                "schema_version": (snapshot or {}).get("schema_version", 1),
                "provenance": (snapshot or {}).get("provenance", {}),
                "coverage": (snapshot or {}).get("coverage", {}),
                "sequences": {},
                "missing_accessions": [],
                "excluded_identifiers": {
                    "non_uniprot": [],
                    "unresolved": [],
                    "blank_accession_record_ids": [],
                },
            },
        }
        for number in range(256)
    }
    for row_index, record in enumerate(records):
        peptide = record.get("peptide_seq")
        if peptide not in peptide_index:
            peptide_index[peptide] = len(peptides)
            peptides.append(peptide)
            peptide_accessions.append(set())
        peptide_rows.append(peptide_index[peptide])
        accession = record.get("accession") or ""
        peptide_accessions[peptide_index[peptide]].add(accession)
        bucket = buckets[accession_bucket(accession)]
        bucket["records"].setdefault(accession, []).append([row_index, record])

    for accession, sequence in (snapshot or {}).get("sequences", {}).items():
        buckets[accession_bucket(accession)]["snapshot"]["sequences"][accession] = sequence
    for accession in (snapshot or {}).get("missing_accessions", []):
        buckets[accession_bucket(accession)]["snapshot"]["missing_accessions"].append(accession)
    for category, accessions in (snapshot or {}).get("excluded_identifiers", {}).items():
        if category == "blank_accession_record_ids":
            buckets[accession_bucket("")]["snapshot"]["excluded_identifiers"][category] = accessions
        else:
            for accession in accessions:
                buckets[accession_bucket(accession)]["snapshot"]["excluded_identifiers"][category].append(accession)

    source_hash = hashlib.sha256(b"atlas-delivery-context-v2\n" + encoded(records))
    source_hash.update(encoded(snapshot))
    return {
        "manifest.json": {"schema_version": 1, "revision": source_hash.hexdigest()[:16], "record_count": len(records)},
        "index.json": compact_projection(records),
        "accessions.json": sorted({record.get("accession") for record in records if record.get("accession")}),
        "peptides.json": {"schema_version": 1, "chunk_size": ROW_CHUNK_SIZE, "values": peptides, "rows": peptide_rows, "accessions": [sorted(values) for values in peptide_accessions]},
        **{
            f"rows/{start // ROW_CHUNK_SIZE:02x}.json": compact_projection(records[start:start + ROW_CHUNK_SIZE])
            for start in range(0, len(records), ROW_CHUNK_SIZE)
        },
        **{f"records/{name}.json": payload for name, payload in buckets.items()},
    }


def write_delivery(data_root: Path, records: list[dict], snapshot: dict | None, *, check: bool = False) -> list[str]:
    root = data_root / DIRECTORY
    findings = []
    expected = set()
    for relative, payload in build_delivery(records, snapshot).items():
        body = encoded(payload)
        for suffix, content in (("", body), (".gz", compressed(body))):
            path = root / (relative + suffix)
            expected.add(path)
            if check:
                if not path.is_file() or path.read_bytes() != content:
                    findings.append(f"stale or missing derived Atlas asset: {path}")
            else:
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(content)
    if root.exists():
        for path in root.rglob("*"):
            if path.is_file() and path not in expected:
                findings.append(f"unexpected derived Atlas asset: {path}")
    return findings


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-root", type=Path, default=Path(__file__).resolve().parents[1] / "public/static/data")
    parser.add_argument("--check", action="store_true", help="Check deterministic artifacts without changing files.")
    args = parser.parse_args()
    records = json.loads((args.data_root / "atlas-records.json").read_text())
    snapshot_path = args.data_root / "atlas-sequences-v1.json"
    snapshot = json.loads(snapshot_path.read_text()) if snapshot_path.is_file() else None
    findings = write_delivery(args.data_root, records, snapshot, check=args.check)
    for finding in findings:
        print(finding)
    if findings:
        return 1
    index_path = args.data_root / DIRECTORY / "index.json.gz"
    print(f"Atlas delivery {'verified' if args.check else 'generated'}: {len(records)} records; index gzip {index_path.stat().st_size:,} bytes")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
