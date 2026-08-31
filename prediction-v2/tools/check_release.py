#!/usr/bin/env python3
"""Fail closed until every prospective PRED-DL 2.0 release condition is met."""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import hashlib
import json
import math
import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SHA256 = re.compile(r"^[0-9a-f]{64}$")


def finite_number(value: object) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def unit_interval(value: object) -> bool:
    return finite_number(value) and 0 <= value <= 1


def metric_in_domain(name: str, value: object) -> bool:
    if name == "mcc":
        return finite_number(value) and -1 <= value <= 1
    return unit_interval(value)


def load_json(path: Path, problems: list[str]) -> dict:
    try:
        value = json.loads(path.read_text())
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        problems.append(f"invalid JSON artifact {path.relative_to(path.parents[1])}: {error}")
        return {}
    if not isinstance(value, dict):
        problems.append(f"invalid JSON artifact {path.name}: expected an object")
        return {}
    return value


def require_fields(value: dict, fields: set[str], label: str, problems: list[str]) -> None:
    missing = sorted(fields - value.keys())
    if missing:
        problems.append(f"invalid {label}: missing fields {', '.join(missing)}")


def read_csv(path: Path, required: set[str], label: str, problems: list[str]) -> list[dict[str, str]]:
    try:
        with path.open(newline="") as handle:
            reader = csv.DictReader(handle)
            missing = sorted(required - set(reader.fieldnames or []))
            if missing:
                problems.append(f"invalid {label}: missing columns {', '.join(missing)}")
                return []
            rows = list(reader)
    except (OSError, UnicodeError, csv.Error) as error:
        problems.append(f"invalid {label}: {error}")
        return []
    if not rows:
        problems.append(f"invalid {label}: no data rows")
    return rows


def validate_scientific_artifacts(root: Path, protocol: dict, problems: list[str]) -> None:
    records_path = root / "corpus/records.csv"
    assignments_path = root / "splits/assignments.csv"
    records = read_csv(records_path, {"record_id", "accession", "position", "residue", "species", "label", "ambiguity_status", "publication_date", "pmid", "source"}, "corpus records", problems)
    assignments = read_csv(assignments_path, {"record_id", "split", "pmid_group", "protein_accession", "sequence_cluster"}, "split assignments", problems)

    manifest = load_json(root / "corpus/manifest.json", problems)
    require_fields(manifest, {"frozen", "freeze_date", "record_count", "records_sha256", "provenance"}, "corpus manifest", problems)
    if manifest:
        digest = hashlib.sha256(records_path.read_bytes()).hexdigest()
        if manifest.get("frozen") is not True or manifest.get("freeze_date") != protocol.get("corpus_freeze"):
            problems.append("invalid corpus manifest: corpus is not frozen at the protocol date")
        if manifest.get("records_sha256") != digest or not SHA256.fullmatch(str(manifest.get("records_sha256", ""))):
            problems.append("invalid corpus manifest: records SHA-256 does not match")
        if manifest.get("record_count") != len(records) or not manifest.get("provenance"):
            problems.append("invalid corpus manifest: record count or provenance is incomplete")

    record_by_id = {row.get("record_id", ""): row for row in records}
    if len(record_by_id) != len(records) or "" in record_by_id:
        problems.append("invalid corpus records: record_id values must be unique and nonempty")
    assignment_by_id = {row.get("record_id", ""): row for row in assignments}
    if len(assignment_by_id) != len(assignments) or set(assignment_by_id) != set(record_by_id):
        problems.append("invalid split assignments: every corpus record must be assigned exactly once")

    group_splits = {field: {} for field in ("pmid_group", "protein_accession", "sequence_cluster")}
    bounds = protocol.get("splits", {})
    for record_id, assignment in assignment_by_id.items():
        split = assignment.get("split", "")
        record = record_by_id.get(record_id, {})
        if split not in bounds:
            problems.append(f"invalid split assignment for {record_id}: unknown split {split}")
            continue
        try:
            published = dt.date.fromisoformat(record.get("publication_date", ""))
        except ValueError:
            problems.append(f"invalid publication date for {record_id}")
            continue
        start = bounds[split].get("publication_start")
        end = bounds[split].get("publication_end")
        if (start and published < dt.date.fromisoformat(start)) or (end and published > dt.date.fromisoformat(end)):
            problems.append(f"invalid temporal split for {record_id}")
        if record.get("label") == "positive" and record.get("ambiguity_status") != "unambiguous":
            problems.append(f"invalid positive label for {record_id}: only unambiguous sites are positives")
        if record.get("label") not in {"positive", "unlabeled", "ambiguous"}:
            problems.append(f"invalid label for {record_id}")
        if assignment.get("pmid_group") != record.get("pmid"):
            problems.append(f"invalid split assignment for {record_id}: PMID group disagrees with corpus")
        if assignment.get("protein_accession") != record.get("accession"):
            problems.append(f"invalid split assignment for {record_id}: protein accession disagrees with corpus")
        for field, groups in group_splits.items():
            group = assignment.get(field, "")
            if not group:
                problems.append(f"invalid split assignment for {record_id}: empty {field}")
            groups.setdefault(group, set()).add(split)
    for field, groups in group_splits.items():
        leaked = sorted(group for group, splits in groups.items() if group and len(splits) > 1)
        if leaked:
            problems.append(f"invalid split leakage: {field} spans splits")

    required_metrics = {protocol.get("primary_metric"), *protocol.get("secondary_metrics", [])}
    metrics = load_json(root / "benchmarks/metrics.json", problems)
    require_fields(metrics, {"selected_model", "selection_frozen", "metrics", "per_species"}, "benchmark metrics", problems)
    metric_values = metrics.get("metrics", {})
    if metrics and (metrics.get("selection_frozen") is not True or not required_metrics.issubset(metric_values)):
        problems.append("invalid benchmark metrics: selection is unfrozen or required metrics are missing")
    elif metrics and any(not metric_in_domain(name, metric_values[name]) for name in required_metrics):
        problems.append("invalid benchmark metrics: required values fall outside their scientific domains")
    per_species = metrics.get("per_species", {})
    if metrics and (not isinstance(per_species, dict) or not {"human", "mouse"}.issubset(per_species)):
        problems.append("invalid benchmark metrics: human and mouse stratified results are required")
    elif metrics and any(
        not isinstance(species_metrics, dict)
        or not required_metrics.issubset(species_metrics)
        or any(not metric_in_domain(name, species_metrics[name]) for name in required_metrics)
        for species_metrics in per_species.values()
    ):
        problems.append("invalid benchmark metrics: species-stratified values are incomplete or nonnumeric")
    candidates = metrics.get("candidates", [])
    candidate_names = protocol.get("candidate_models", [])
    if metrics and (
        not isinstance(candidates, list)
        or not candidates
        or not set(candidate_names).issubset({item.get("name") for item in candidates if isinstance(item, dict)})
        or any(
            not isinstance(item, dict)
            or not isinstance(item.get("name"), str)
            or not unit_interval(item.get("macro_species_auprc"))
            or not isinstance(item.get("size_bytes"), int)
            or isinstance(item.get("size_bytes"), bool)
            or item.get("size_bytes", 0) <= 0
            for item in candidates
        )
    ):
        problems.append("invalid benchmark metrics: candidate measurements are incomplete")
    elif candidates:
        best_score = max(item["macro_species_auprc"] for item in candidates)
        tolerance = protocol.get("smaller_model_tolerance")
        eligible = [
            item for item in candidates
            if finite_number(tolerance) and item["macro_species_auprc"] >= best_score - tolerance
        ]
        expected_model = min(eligible, key=lambda item: (item["size_bytes"], item["name"]))["name"] if eligible else None
        if metrics.get("selected_model") != expected_model:
            problems.append("invalid benchmark metrics: selected model does not follow the frozen tolerance and size rule")
    intervals = load_json(root / "benchmarks/bootstrap-confidence-intervals.json", problems)
    require_fields(intervals, {"method", "confidence_level", "metrics"}, "confidence intervals", problems)
    if intervals and (intervals.get("method") != "stratified_bootstrap" or not required_metrics.issubset(intervals.get("metrics", {}))):
        problems.append("invalid confidence intervals: method or required metrics do not match protocol")
    elif intervals and not (finite_number(intervals.get("confidence_level")) and 0 < intervals["confidence_level"] < 1):
        problems.append("invalid confidence intervals: confidence level must be between zero and one")
    elif intervals and any(
        not isinstance(intervals["metrics"].get(name), dict)
        or not metric_in_domain(name, intervals["metrics"][name].get("lower"))
        or not metric_in_domain(name, intervals["metrics"][name].get("upper"))
        or intervals["metrics"][name]["lower"] > intervals["metrics"][name]["upper"]
        for name in required_metrics
    ):
        problems.append("invalid confidence intervals: metric bounds are incomplete, nonnumeric, or reversed")
    comparators = load_json(root / "benchmarks/comparators.json", problems)
    require_fields(comparators, {"frozen", "comparators"}, "comparator benchmark", problems)
    comparator_items = comparators.get("comparators", [])
    required_comparators = set(protocol.get("required_external_comparators", []))
    comparator_names = [item.get("name") for item in comparator_items if isinstance(item, dict)] if isinstance(comparator_items, list) else []
    additional_minimum = protocol.get("additional_functioning_comparators_minimum")
    comparator_results_invalid = not isinstance(comparator_items, list) or any(
        not isinstance(item, dict)
        or not isinstance(item.get("name"), str)
        or not item.get("name", "").strip()
        or not isinstance(item.get("version"), str)
        or not item.get("version", "").strip()
        or item.get("status") != "completed"
        or item.get("corpus_sha256") != manifest.get("records_sha256")
        or not SHA256.fullmatch(str(item.get("corpus_sha256", "")))
        or not isinstance(item.get("metrics"), dict)
        or not required_metrics.issubset(item.get("metrics", {}))
        or any(not metric_in_domain(name, item.get("metrics", {}).get(name)) for name in required_metrics)
        for item in comparator_items
    )
    if comparators and (
        comparators.get("frozen") is not True
        or not comparator_items
        or len(comparator_names) != len(set(comparator_names))
        or not required_comparators.issubset(comparator_names)
        or not isinstance(additional_minimum, int)
        or isinstance(additional_minimum, bool)
        or additional_minimum < 0
        or len(set(comparator_names) - required_comparators) < additional_minimum
        or comparator_results_invalid
    ):
        problems.append("invalid comparator benchmark: versioned results on the frozen corpus are incomplete")
    calibration = load_json(root / "calibration/report.json", problems)
    require_fields(calibration, {"brier", "ece", "method", "frozen"}, "calibration report", problems)
    if calibration and (
        calibration.get("frozen") is not True
        or not unit_interval(calibration.get("brier"))
        or not unit_interval(calibration.get("ece"))
        or not isinstance(calibration.get("method"), str)
        or not calibration.get("method", "").strip()
    ):
        problems.append("invalid calibration report: values, method, or frozen state are invalid")

    model_card = (root / "models/model-card.md").read_text(errors="replace").casefold()
    if len(model_card) < 500 or any(section not in model_card for section in ("intended use", "limitations", "validation")):
        problems.append("invalid model card: required substantive sections are missing")
    browser = load_json(root / "models/browser/manifest.json", problems)
    require_fields(browser, {"version", "artifacts"}, "browser model manifest", problems)
    for relative, expected in browser.get("artifacts", {}).items():
        artifact = root / "models/browser" / relative
        if not artifact.is_file() or not SHA256.fullmatch(str(expected)) or hashlib.sha256(artifact.read_bytes()).hexdigest() != expected:
            problems.append(f"invalid browser model artifact hash: {relative}")
    if browser and not browser.get("artifacts"):
        problems.append("invalid browser model manifest: no hashed artifacts")
    parity = load_json(root / "parity/browser-python.json", problems)
    require_fields(parity, {"passed", "max_abs_difference", "tolerance", "corpus_sha256"}, "browser/Python parity", problems)
    if parity and (
        parity.get("passed") is not True
        or not finite_number(parity.get("max_abs_difference"))
        or not finite_number(parity.get("tolerance"))
        or parity.get("max_abs_difference", -1) < 0
        or parity.get("tolerance", -1) < 0
        or parity.get("max_abs_difference", 1) > parity.get("tolerance", 0)
        or not SHA256.fullmatch(str(parity.get("corpus_sha256", "")))
        or parity.get("corpus_sha256") != manifest.get("records_sha256")
    ):
        problems.append("invalid browser/Python parity: tolerance or corpus hash check failed")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--today", type=dt.date.fromisoformat, default=dt.date.today())
    parser.add_argument("--root", type=Path, default=ROOT)
    args = parser.parse_args()
    root = args.root.resolve()
    protocol = json.loads((root / "protocol.json").read_text())
    checklist = json.loads((root / "release-checklist.json").read_text())
    freeze = dt.date.fromisoformat(protocol["corpus_freeze"])
    problems: list[str] = []
    if args.today < freeze:
        problems.append(f"corpus freeze {freeze.isoformat()} has not occurred")
    for relative in checklist["required_artifacts"]:
        path = root / relative
        if not path.is_file() or path.stat().st_size == 0:
            problems.append(f"missing required artifact: {relative}")
    if not any(problem.startswith("missing required artifact") for problem in problems):
        validate_scientific_artifacts(root, protocol, problems)
    if problems:
        print("O-GlcNAcPRED-DL 2.0 is not release-ready:", file=sys.stderr)
        for problem in problems:
            print(f"- {problem}", file=sys.stderr)
        return 1
    print("O-GlcNAcPRED-DL 2.0 release gates passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
