#!/usr/bin/env python3
import argparse
import csv
import gzip
import hashlib
import json
import re
import sqlite3
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path


SEQUENCE_SNAPSHOT_NAME = "atlas-sequences-v1.json"
UNIPROT_ACCESSION = re.compile(
    r"^(?:[OPQ][0-9][A-Z0-9]{3}[0-9]|"
    r"[A-NR-Z][0-9](?:[A-Z][A-Z0-9]{2}[0-9]){1,2})(?:-[0-9]+)?$"
)
UNIPROT_STREAM_URL = "https://rest.uniprot.org/uniprotkb/stream"


def bounded_integer(minimum, maximum):
    def parse(value):
        try:
            parsed = int(value)
        except ValueError as error:
            raise argparse.ArgumentTypeError(f"{value!r} is not an integer") from error
        if not minimum <= parsed <= maximum:
            raise argparse.ArgumentTypeError(
                f"must be between {minimum} and {maximum}"
            )
        return parsed

    return parse


def rows(connection, table):
    connection.row_factory = sqlite3.Row
    return [dict(row) for row in connection.execute(f"SELECT * FROM {table} ORDER BY id ASC")]


def annotate_atlas(record):
    annotated = dict(record)
    # Existing Atlas IDs encode whether the site is ambiguous.
    annotated["ambiguous"] = "ambiguous" if annotated["id"] < 10000000 else "unambiguous"
    return annotated


def scalar(value, key=None):
    if value is None:
        return None
    value = value.strip()
    if value == "":
        return ""
    if key == "id":
        try:
            return int(value)
        except ValueError:
            return value
    return value


def csv_rows(path):
    for encoding in ("utf-8-sig", "latin-1"):
        try:
            with path.open(newline="", encoding=encoding) as handle:
                reader = csv.DictReader(handle)
                return [{key: scalar(value, key) for key, value in row.items()} for row in reader]
        except UnicodeDecodeError:
            continue
    raise UnicodeDecodeError("csv", b"", 0, 1, f"Could not decode {path}")


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
    with Path(f"{path}.gz").open("wb") as compressed:
        with gzip.GzipFile(
            filename="",
            mode="wb",
            fileobj=compressed,
            compresslevel=9,
            mtime=0,
        ) as handle:
            handle.write(data)


def normalized_text(value):
    return str(value or "").strip()


def accession_categories(records):
    sources_by_accession = {}
    blank_records = 0
    blank_record_ids = []
    for record in records:
        accession = normalized_text(record.get("accession"))
        source = normalized_text(record.get("accession_source")).lower()
        if not accession:
            blank_records += 1
            blank_record_ids.append(record.get("id"))
            continue
        sources_by_accession.setdefault(accession, set()).add(source)

    candidates = set()
    non_uniprot = set()
    unresolved = set()
    for accession, sources in sources_by_accession.items():
        if "uniprot" in sources and UNIPROT_ACCESSION.fullmatch(accession):
            candidates.add(accession)
        elif sources.difference({"", "uniprot"}):
            non_uniprot.add(accession)
        else:
            unresolved.add(accession)
    return {
        "blank_records": blank_records,
        "blank_record_ids": blank_record_ids,
        "candidates": candidates,
        "non_uniprot": non_uniprot,
        "unresolved": unresolved,
        "all": set(sources_by_accession),
    }


def release_identity(args):
    names = " ".join(
        path.name
        for path in (args.atlas_unambiguous_csv, args.atlas_ambiguous_csv)
        if path
    )
    version_match = re.search(r"Atlas\s+([0-9]+(?:\.[0-9]+)?)", names)
    dates = set(re.findall(r"20[0-9]{6}", names))
    release_date = None
    if len(dates) == 1:
        raw = dates.pop()
        release_date = f"{raw[:4]}-{raw[4:6]}-{raw[6:]}"
    return {
        "name": (
            f"O-GlcNAcAtlas {version_match.group(1)}"
            if version_match
            else args.atlas_release
        ),
        "date": release_date,
    }


def source_metadata(path, dataset):
    return {
        "dataset": dataset,
        "file": path.name,
        "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
    }


def build_release_metadata(args, atlas, categories, sequence_coverage=None):
    dataset_i = sum(record.get("ambiguous") == "unambiguous" for record in atlas)
    dataset_ii = sum(record.get("ambiguous") == "ambiguous" for record in atlas)
    proteins = {
        normalized_text(record.get("accession"))
        for record in atlas
        if normalized_text(record.get("accession"))
    }
    sites = {
        (
            normalized_text(record.get("accession")),
            normalized_text(record.get("position_in_protein")),
            normalized_text(record.get("site_residue")).upper(),
        )
        for record in atlas
        if normalized_text(record.get("accession"))
        and normalized_text(record.get("position_in_protein"))
        and normalized_text(record.get("site_residue"))
    }
    metadata = {
        "schema_version": 1,
        "release": release_identity(args),
        "records": {
            "total": len(atlas),
            "dataset_i_unambiguous": dataset_i,
            "dataset_ii_ambiguous": dataset_ii,
        },
        "unique_counts": {
            "proteins": len(proteins),
            "sites": len(sites),
            "protein_rule": "distinct trimmed nonblank accession values",
            "site_rule": (
                "distinct complete (accession, position_in_protein, "
                "site_residue) triples"
            ),
        },
        "identifiers": {
            "blank_accession_records": categories["blank_records"],
            "unique_nonblank_accessions": len(categories["all"]),
            "unique_uniprot_candidates": len(categories["candidates"]),
            "unique_non_uniprot_identifiers": len(categories["non_uniprot"]),
            "unique_unresolved_identifiers": len(categories["unresolved"]),
        },
    }
    if args.atlas_unambiguous_csv and args.atlas_ambiguous_csv:
        metadata["sources"] = [
            source_metadata(args.atlas_unambiguous_csv, "dataset-I/unambiguous"),
            source_metadata(args.atlas_ambiguous_csv, "dataset-II/ambiguous"),
        ]
    if sequence_coverage is not None:
        metadata["sequence_snapshot"] = {
            "file": SEQUENCE_SNAPSHOT_NAME,
            "coverage": sequence_coverage,
        }
    return metadata


def fasta_entries(text):
    header = None
    sequence_parts = []
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        if line.startswith(">"):
            if header is not None:
                yield header, "".join(sequence_parts)
            header = line[1:]
            sequence_parts = []
        elif header is not None:
            sequence_parts.append(re.sub(r"\s+", "", line).upper())
    if header is not None:
        yield header, "".join(sequence_parts)


def fasta_accession(header):
    token = header.split(None, 1)[0]
    fields = token.split("|")
    if len(fields) >= 3 and fields[0].lower() in {"sp", "tr"}:
        return fields[1]
    return token


def add_fasta_sequences(sequences, fasta_text, candidates):
    for header, sequence in fasta_entries(fasta_text):
        accession = fasta_accession(header)
        if accession not in candidates or not sequence:
            continue
        previous = sequences.get(accession)
        if previous is not None and previous != sequence:
            raise ValueError(f"Conflicting FASTA sequences for {accession}")
        sequences[accession] = sequence


def uniprot_cache_key(accessions):
    return hashlib.sha256("\n".join(accessions).encode("ascii")).hexdigest()


def fetch_uniprot_batch(accessions, cache_directory, retries):
    cache_directory.mkdir(parents=True, exist_ok=True)
    cache_path = cache_directory / f"{uniprot_cache_key(accessions)}.fasta"
    headers_path = cache_directory / f"{uniprot_cache_key(accessions)}.headers.json"
    if cache_path.is_file():
        headers = json.loads(headers_path.read_text()) if headers_path.is_file() else {}
        return cache_path.read_text(encoding="utf-8"), headers, True

    query = " OR ".join(f"accession:{accession}" for accession in accessions)
    url = UNIPROT_STREAM_URL + "?" + urllib.parse.urlencode(
        {"format": "fasta", "query": f"({query})"}
    )
    last_error = None
    for attempt in range(retries):
        try:
            request = urllib.request.Request(
                url, headers={"User-Agent": "O-GlcNAcAtlas-static-generator/1"}
            )
            with urllib.request.urlopen(request, timeout=120) as response:
                fasta = response.read().decode("utf-8")
                headers = {
                    "uniprot_release": response.headers.get("X-UniProt-Release"),
                    "uniprot_release_date": response.headers.get(
                        "X-UniProt-Release-Date"
                    ),
                    "api_deployment_date": response.headers.get(
                        "X-API-Deployment-Date"
                    ),
                }
            cache_path.write_text(fasta, encoding="utf-8")
            headers_path.write_text(
                json.dumps(headers, indent=2, sort_keys=True) + "\n",
                encoding="utf-8",
            )
            return fasta, headers, False
        except (OSError, urllib.error.URLError) as error:
            last_error = error
            if attempt + 1 < retries:
                time.sleep(2**attempt)
    raise RuntimeError(
        f"UniProt batch failed after {retries} attempts: {last_error}"
    )


def fetch_uniprot_sequences(
    sequences,
    candidates,
    cache_directory,
    batch_size,
    retries,
    delay,
):
    missing = sorted(candidates.difference(sequences))
    provenance_values = {
        "uniprot_release": set(),
        "uniprot_release_date": set(),
        "api_deployment_date": set(),
    }
    missing_provenance_batches = {
        key: [] for key in provenance_values
    }
    for offset in range(0, len(missing), batch_size):
        batch_number = offset // batch_size + 1
        batch = missing[offset : offset + batch_size]
        fasta, headers, cached = fetch_uniprot_batch(batch, cache_directory, retries)
        add_fasta_sequences(sequences, fasta, candidates)
        for key, values in provenance_values.items():
            value = headers.get(key)
            if value:
                values.add(value)
            else:
                missing_provenance_batches[key].append(batch_number)
            missing_batches = missing_provenance_batches[key]
            if values and missing_batches:
                raise RuntimeError(
                    "Incomplete UniProt batch provenance for "
                    f"{key}: missing batch "
                    f"{', '.join(str(number) for number in missing_batches)}"
                )
            if len(values) > 1:
                raise RuntimeError(
                    "Inconsistent UniProt batch provenance for "
                    f"{key}: {', '.join(sorted(values))}"
                )
        print(
            f"uniprot_batch={batch_number} "
            f"requested={len(batch)} resolved_total={len(sequences)} "
            f"cached={'yes' if cached else 'no'}"
        )
        if not cached and offset + batch_size < len(missing):
            time.sleep(delay)
    return {
        key: next(iter(values))
        for key, values in provenance_values.items()
        if values
    }


def snapshot_coverage(categories, sequences):
    return {
        "candidate_accessions": len(categories["candidates"]),
        "resolved_accessions": len(sequences),
        "missing_accessions": len(categories["candidates"].difference(sequences)),
        "non_uniprot_identifiers": len(categories["non_uniprot"]),
        "unresolved_identifiers": len(categories["unresolved"]),
        "blank_accession_records": categories["blank_records"],
    }


def reconcile_sequence_snapshot(snapshot, categories):
    eligible_sequences = {
        accession: sequence
        for accession, sequence in snapshot.get("sequences", {}).items()
        if accession in categories["candidates"]
    }
    reconciled = dict(snapshot)
    reconciled.update(
        {
            "coverage": snapshot_coverage(categories, eligible_sequences),
            "missing_accessions": sorted(
                categories["candidates"].difference(eligible_sequences)
            ),
            "excluded_identifiers": {
                "non_uniprot": sorted(categories["non_uniprot"]),
                "unresolved": sorted(categories["unresolved"]),
                "blank_accession_record_ids": categories["blank_record_ids"],
            },
            "sequences": dict(sorted(eligible_sequences.items())),
        }
    )
    return reconciled


def build_sequence_snapshot(args, categories):
    sequences = {}
    for path in args.atlas_sequence_fasta:
        add_fasta_sequences(
            sequences,
            path.read_text(encoding="utf-8"),
            categories["candidates"],
        )
    fetched_provenance = {}
    if args.fetch_uniprot_sequences:
        fetched_provenance = fetch_uniprot_sequences(
            sequences,
            categories["candidates"],
            args.uniprot_cache_dir,
            args.uniprot_batch_size,
            args.uniprot_retries,
            args.uniprot_delay,
        )
    retrieved_date = args.sequence_retrieved_date
    if args.fetch_uniprot_sequences and not retrieved_date:
        retrieved_date = date.today().isoformat()
    provenance = {
        "source": "UniProt REST API and/or curator-supplied local FASTA",
        "retrieved_date": retrieved_date,
        "uniprot_release": (
            args.sequence_source_release
            or fetched_provenance.get("uniprot_release")
        ),
        "uniprot_release_date": fetched_provenance.get("uniprot_release_date"),
        "api_deployment_date": fetched_provenance.get("api_deployment_date"),
        "input_fastas": [
            {
                "file": path.name,
                "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
            }
            for path in args.atlas_sequence_fasta
        ],
    }
    return {
        "schema_version": 1,
        "provenance": provenance,
        "coverage": snapshot_coverage(categories, sequences),
        "missing_accessions": sorted(categories["candidates"].difference(sequences)),
        "excluded_identifiers": {
            "non_uniprot": sorted(categories["non_uniprot"]),
            "unresolved": sorted(categories["unresolved"]),
            "blank_accession_record_ids": categories["blank_record_ids"],
        },
        "sequences": dict(sorted(sequences.items())),
    }


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
        "--atlas-release",
        default="O-GlcNAcAtlas",
        help="Release name used when it cannot be inferred from CSV filenames.",
    )
    parser.add_argument(
        "--atlas-sequence-fasta",
        action="append",
        default=[],
        type=Path,
        help="Local UniProt FASTA input; may be supplied more than once.",
    )
    parser.add_argument(
        "--fetch-uniprot-sequences",
        action="store_true",
        help="Fetch missing eligible accessions with bounded UniProt query batches.",
    )
    parser.add_argument(
        "--uniprot-cache-dir",
        default=Path(".cache") / "uniprot-atlas",
        type=Path,
        help="Persistent cache for UniProt batch responses.",
    )
    parser.add_argument(
        "--uniprot-batch-size",
        default=100,
        type=bounded_integer(1, 100),
    )
    parser.add_argument(
        "--uniprot-retries",
        default=3,
        type=bounded_integer(1, 5),
    )
    parser.add_argument("--uniprot-delay", default=0.25, type=float)
    parser.add_argument(
        "--sequence-retrieved-date",
        help="ISO retrieval date for curator-supplied FASTA provenance.",
    )
    parser.add_argument(
        "--sequence-source-release",
        help="UniProt release for curator-supplied FASTA provenance.",
    )
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

    categories = accession_categories(atlas)
    sequence_snapshot = None
    if args.atlas_sequence_fasta or args.fetch_uniprot_sequences:
        sequence_snapshot = build_sequence_snapshot(args, categories)
        write_json(args.output_dir / SEQUENCE_SNAPSHOT_NAME, sequence_snapshot)
    else:
        snapshot_path = args.output_dir / SEQUENCE_SNAPSHOT_NAME
        if snapshot_path.is_file():
            sequence_snapshot = reconcile_sequence_snapshot(
                json.loads(snapshot_path.read_text(encoding="utf-8")),
                categories,
            )
            write_json(snapshot_path, sequence_snapshot)

    release_metadata = build_release_metadata(
        args,
        atlas,
        categories,
        sequence_snapshot["coverage"] if sequence_snapshot else None,
    )
    write_json(args.output_dir / "atlas-records.json", atlas)
    write_json(args.output_dir / "ogt-pin-records.json", ogt_pin)
    write_json(args.output_dir / "atlas-release-v1.json", release_metadata)
    print(f"atlas_records={len(atlas)}")
    print(f"ogt_pin_records={len(ogt_pin)}")
    print(f"atlas_unique_proteins={release_metadata['unique_counts']['proteins']}")
    print(f"atlas_unique_sites={release_metadata['unique_counts']['sites']}")
    if sequence_snapshot:
        coverage = sequence_snapshot["coverage"]
        print(
            f"atlas_sequences={coverage['resolved_accessions']}/"
            f"{coverage['candidate_accessions']}"
        )


if __name__ == "__main__":
    main()
