from __future__ import annotations

import json
import hashlib
import tempfile
import subprocess
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
V2 = ROOT / "prediction-v2"


class PredictionV2ProtocolTests(unittest.TestCase):
    def write_valid_release(self, root: Path) -> None:
        (root / "protocol.json").write_text((V2 / "protocol.json").read_text())
        checklist_text = (V2 / "release-checklist.json").read_text()
        (root / "release-checklist.json").write_text(checklist_text)
        files = {
            "corpus/records.csv": (
                "record_id,accession,position,residue,species,label,ambiguity_status,publication_date,pmid,source\n"
                "r1,P11111,10,S,human,positive,unambiguous,2023-12-31,1,study-a\n"
                "r2,Q22222,20,T,mouse,unlabeled,unambiguous,2024-06-01,2,study-b\n"
                "r3,O33333,30,S,human,ambiguous,ambiguous,2025-01-01,3,study-c\n"
            ),
            "splits/assignments.csv": (
                "record_id,split,pmid_group,protein_accession,sequence_cluster\n"
                "r1,train,1,P11111,c1\n"
                "r2,validation,2,Q22222,c2\n"
                "r3,temporal_test,3,O33333,c3\n"
            ),
            "models/model-card.md": "# Intended use\n" + "Validated research prioritization. " * 20 + "\n# Limitations\nExperimental confirmation is required.\n# Validation\nTemporal and species-stratified evaluation.\n",
            "models/browser/model.bin": "model-bytes",
        }
        for relative, content in files.items():
            path = root / relative
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content)
        records_hash = hashlib.sha256((root / "corpus/records.csv").read_bytes()).hexdigest()
        model_hash = hashlib.sha256((root / "models/browser/model.bin").read_bytes()).hexdigest()
        metric_names = ["macro_species_auprc", "auroc", "mcc", "f1", "sensitivity", "specificity", "brier", "ece"]
        aggregate_metrics = {name: 0.8 for name in metric_names}
        aggregate_metrics["mcc"] = -0.2
        species_metrics = {species: dict(aggregate_metrics) for species in ("human", "mouse")}
        interval_metrics = {name: {"lower": 0.7, "upper": 0.9} for name in metric_names}
        interval_metrics["mcc"] = {"lower": -0.4, "upper": 0.1}
        comparator_metrics = dict(aggregate_metrics)
        comparator = lambda name, version: {
            "name": name,
            "version": version,
            "status": "completed",
            "corpus_sha256": records_hash,
            "metrics": dict(comparator_metrics),
        }
        payloads = {
            "corpus/manifest.json": {"frozen": True, "freeze_date": "2027-01-31", "record_count": 3, "records_sha256": records_hash, "provenance": ["study-a", "study-b", "study-c"]},
            "benchmarks/metrics.json": {
                "selected_model": "compact_residual_multispecies",
                "selection_frozen": True,
                "metrics": aggregate_metrics,
                "per_species": species_metrics,
                "candidates": [
                    {"name": "published_v1", "macro_species_auprc": 0.80, "size_bytes": 2000},
                    {"name": "retrained_legacy", "macro_species_auprc": 0.79, "size_bytes": 1500},
                    {"name": "compact_residual_multispecies", "macro_species_auprc": 0.795, "size_bytes": 1000},
                ],
            },
            "benchmarks/bootstrap-confidence-intervals.json": {"method": "stratified_bootstrap", "confidence_level": 0.95, "metrics": interval_metrics},
            "benchmarks/comparators.json": {"frozen": True, "comparators": [comparator("DeepO-GlcNAc", "frozen-release"), comparator("AdditionalTool", "1.0")]},
            "calibration/report.json": {"brier": 0.1, "ece": 0.05, "method": "held-out temporal calibration", "frozen": True},
            "models/browser/manifest.json": {"version": "2.0.0", "artifacts": {"model.bin": model_hash}},
            "parity/browser-python.json": {"passed": True, "max_abs_difference": 0.000001, "tolerance": 0.00001, "corpus_sha256": records_hash},
        }
        for relative, payload in payloads.items():
            path = root / relative
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps(payload))

    def run_gate(self, root: Path) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [sys.executable, str(V2 / "tools" / "check_release.py"), "--root", str(root), "--today", "2028-01-01"],
            cwd=ROOT,
            text=True,
            capture_output=True,
        )

    def test_protocol_encodes_temporal_and_leakage_boundaries(self) -> None:
        protocol = json.loads((V2 / "protocol.json").read_text())
        self.assertEqual(protocol["corpus_freeze"], "2027-01-31")
        self.assertEqual(protocol["splits"]["train"]["publication_end"], "2023-12-31")
        self.assertEqual(protocol["splits"]["validation"]["publication_start"], "2024-01-01")
        self.assertEqual(protocol["splits"]["temporal_test"]["publication_start"], "2025-01-01")
        self.assertEqual(protocol["splits"]["temporal_test"]["publication_end"], "2027-01-31")
        self.assertEqual(protocol["positives"], "unambiguous_only")
        self.assertEqual(protocol["learning_assumption"], "positive_unlabeled")
        self.assertEqual(protocol["sequence_clustering"]["identity_max"], 0.30)
        self.assertEqual(protocol["sequence_clustering"]["coverage_min"], 0.80)
        self.assertEqual(protocol["primary_metric"], "macro_species_auprc")
        self.assertEqual(protocol["smaller_model_tolerance"], 0.01)
        self.assertEqual(protocol["required_external_comparators"], ["DeepO-GlcNAc"])
        self.assertEqual(protocol["additional_functioning_comparators_minimum"], 1)

    def test_release_gate_rejects_an_incomplete_or_future_release(self) -> None:
        result = subprocess.run(
            [sys.executable, str(V2 / "tools" / "check_release.py"), "--today", "2026-08-30"],
            cwd=ROOT,
            text=True,
            capture_output=True,
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("corpus freeze", result.stderr.casefold())
        self.assertIn("not release-ready", result.stderr.casefold())

    def test_release_checklist_requires_scientific_and_browser_artifacts(self) -> None:
        checklist = json.loads((V2 / "release-checklist.json").read_text())
        required = set(checklist["required_artifacts"])
        self.assertTrue({
            "corpus/manifest.json",
            "benchmarks/metrics.json",
            "benchmarks/bootstrap-confidence-intervals.json",
            "calibration/report.json",
            "models/model-card.md",
            "parity/browser-python.json",
        }.issubset(required))

    def test_release_gate_rejects_nonempty_placeholder_artifacts(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            release_root = Path(directory)
            (release_root / "protocol.json").write_text((V2 / "protocol.json").read_text())
            checklist_text = (V2 / "release-checklist.json").read_text()
            (release_root / "release-checklist.json").write_text(checklist_text)
            checklist = json.loads(checklist_text)
            for relative in checklist["required_artifacts"]:
                path = release_root / relative
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text("placeholder\n")
            result = subprocess.run(
                [sys.executable, str(V2 / "tools" / "check_release.py"), "--root", str(release_root), "--today", "2028-01-01"],
                cwd=ROOT,
                text=True,
                capture_output=True,
            )
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("invalid", result.stderr.casefold())
        self.assertNotIn("release gates passed", result.stdout.casefold())

    def test_release_gate_validates_scientific_values_and_cross_artifact_invariants(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            release_root = Path(directory)
            self.write_valid_release(release_root)
            valid = self.run_gate(release_root)
            self.assertEqual(valid.returncode, 0, valid.stderr)

        mutations = {
            "non-numeric metric": ("benchmarks/metrics.json", lambda value: value["metrics"].update({"macro_species_auprc": None})),
            "empty per-species results": ("benchmarks/metrics.json", lambda value: value.update({"per_species": {}})),
            "invalid confidence level": ("benchmarks/bootstrap-confidence-intervals.json", lambda value: value.update({"confidence_level": 1.5})),
            "missing named comparator": ("benchmarks/comparators.json", lambda value: value.update({"comparators": [{"name": "unplanned-tool", "status": "completed"}]})),
            "status-only comparator": ("benchmarks/comparators.json", lambda value: value["comparators"][0].pop("metrics")),
            "comparator corpus mismatch": ("benchmarks/comparators.json", lambda value: value["comparators"][0].update({"corpus_sha256": "0" * 64})),
            "MCC outside scientific domain": ("benchmarks/metrics.json", lambda value: value["metrics"].update({"mcc": -1.1})),
            "invalid calibration": ("calibration/report.json", lambda value: value.update({"ece": None})),
            "corpus/group disagreement": ("splits/assignments.csv", None),
            "parity corpus mismatch": ("parity/browser-python.json", lambda value: value.update({"corpus_sha256": "0" * 64})),
            "wrong tolerance-based selection": ("benchmarks/metrics.json", lambda value: value.update({"selected_model": "published_v1"})),
        }
        for label, (relative, mutate) in mutations.items():
            with self.subTest(label=label), tempfile.TemporaryDirectory() as directory:
                release_root = Path(directory)
                self.write_valid_release(release_root)
                path = release_root / relative
                if mutate is None:
                    path.write_text(path.read_text().replace("r1,train,1,P11111,c1", "r1,train,999,P11111,c1"))
                else:
                    value = json.loads(path.read_text())
                    mutate(value)
                    path.write_text(json.dumps(value))
                result = self.run_gate(release_root)
                self.assertNotEqual(result.returncode, 0, f"{label} passed unexpectedly")
                self.assertIn("invalid", result.stderr.casefold())


if __name__ == "__main__":
    unittest.main()
