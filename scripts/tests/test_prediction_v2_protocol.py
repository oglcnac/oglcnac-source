from __future__ import annotations

import json
import tempfile
import subprocess
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
V2 = ROOT / "prediction-v2"


class PredictionV2ProtocolTests(unittest.TestCase):
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


if __name__ == "__main__":
    unittest.main()
