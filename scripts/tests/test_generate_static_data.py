from __future__ import annotations

import gzip
import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock
from urllib.error import URLError


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
GENERATOR = REPOSITORY_ROOT / "frontend" / "scripts" / "generate_static_data.py"
DATASET_ROOT = REPOSITORY_ROOT / "frontend" / "static" / "dataset"
GENERATOR_SPEC = importlib.util.spec_from_file_location("static_data_generator", GENERATOR)
GENERATOR_MODULE = importlib.util.module_from_spec(GENERATOR_SPEC)
assert GENERATOR_SPEC.loader is not None
GENERATOR_SPEC.loader.exec_module(GENERATOR_MODULE)


def run_generator(
    output_directory: Path,
    unambiguous: Path,
    ambiguous: Path,
    ogt_pin: Path,
    *arguments: str,
) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [
            sys.executable,
            str(GENERATOR),
            "--atlas-unambiguous-csv",
            str(unambiguous),
            "--atlas-ambiguous-csv",
            str(ambiguous),
            "--ogt-pin-csv",
            str(ogt_pin),
            "--output-dir",
            str(output_directory),
            *arguments,
        ],
        cwd=REPOSITORY_ROOT,
        text=True,
        capture_output=True,
        check=False,
    )


class StaticDataGeneratorTests(unittest.TestCase):
    def test_release_metadata_documents_dataset_and_unique_count_rules(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            unambiguous = root / "unambiguous.csv"
            ambiguous = root / "ambiguous.csv"
            ogt_pin = root / "ogt-pin.csv"
            unambiguous.write_text(
                "id,accession,accession_source,position_in_protein,site_residue\n"
                "10000001,P11111,UniProt,10,S\n"
                "10000002,P11111,Uniprot,10,S\n"
                "10000003,,uniprot,11,T\n"
                "10000004,AT1G01030,TAIR,12,S\n",
                encoding="utf-8",
            )
            ambiguous.write_text(
                "id,accession,accession_source,position_in_protein,site_residue\n"
                "1,Q22222,UniProt,20,T\n"
                "2,Q22222,UniProt,,T\n"
                "3,unknown1,UniProt,21,S\n",
                encoding="utf-8",
            )
            ogt_pin.write_text("id,uuid_b\n1,Q9TEST\n", encoding="utf-8")

            result = run_generator(root / "output", unambiguous, ambiguous, ogt_pin)

            self.assertEqual(result.returncode, 0, result.stderr)
            metadata = json.loads(
                (root / "output" / "atlas-release-v1.json").read_text()
            )
            self.assertEqual(
                metadata["records"],
                {
                    "total": 7,
                    "dataset_i_unambiguous": 4,
                    "dataset_ii_ambiguous": 3,
                },
            )
            self.assertEqual(
                metadata["unique_counts"],
                {
                    "proteins": 4,
                    "sites": 4,
                    "protein_rule": "distinct trimmed nonblank accession values",
                    "site_rule": (
                        "distinct complete (accession, position_in_protein, "
                        "site_residue) triples"
                    ),
                },
            )
            self.assertEqual(
                metadata["identifiers"],
                {
                    "blank_accession_records": 1,
                    "unique_nonblank_accessions": 4,
                    "unique_uniprot_candidates": 2,
                    "unique_non_uniprot_identifiers": 1,
                    "unique_unresolved_identifiers": 1,
                },
            )
            compressed = root / "output" / "atlas-release-v1.json.gz"
            self.assertEqual(compressed.read_bytes()[4:8], b"\0\0\0\0")
            self.assertEqual(gzip.decompress(compressed.read_bytes()), (
                root / "output" / "atlas-release-v1.json"
            ).read_bytes())

    def test_local_fasta_builds_versioned_snapshot_without_inventing_sequences(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            unambiguous = root / "unambiguous.csv"
            ambiguous = root / "ambiguous.csv"
            ogt_pin = root / "ogt-pin.csv"
            fasta = root / "sequences.fasta"
            unambiguous.write_text(
                "id,accession,accession_source,position_in_protein,site_residue\n"
                "10000001,P11111,UniProt,10,S\n"
                "10000002,AT1G01030,TAIR,12,S\n",
                encoding="utf-8",
            )
            ambiguous.write_text(
                "id,accession,accession_source,position_in_protein,site_residue\n"
                "1,Q22222,UniProt,20,T\n"
                "2,Q33333,UniProt,30,S\n",
                encoding="utf-8",
            )
            ogt_pin.write_text("id,uuid_b\n1,Q9TEST\n", encoding="utf-8")
            fasta.write_text(
                ">sp|P11111|FIRST_PROTEIN\nMST\nAA\n"
                ">tr|Q22222|SECOND_PROTEIN\nQQQ\n"
                ">sp|AT1G01030|NON_UNIPROT_IDENTIFIER\nSHOULDNOTMAP\n",
                encoding="utf-8",
            )

            result = run_generator(
                root / "output",
                unambiguous,
                ambiguous,
                ogt_pin,
                "--atlas-sequence-fasta",
                str(fasta),
                "--sequence-retrieved-date",
                "2026-07-28",
                "--sequence-source-release",
                "2026_02",
            )

            self.assertEqual(result.returncode, 0, result.stderr)
            snapshot = json.loads(
                (root / "output" / "atlas-sequences-v1.json").read_text()
            )
            self.assertEqual(snapshot["sequences"], {"P11111": "MSTAA", "Q22222": "QQQ"})
            self.assertEqual(
                snapshot["coverage"],
                {
                    "candidate_accessions": 3,
                    "resolved_accessions": 2,
                    "missing_accessions": 1,
                    "non_uniprot_identifiers": 1,
                    "unresolved_identifiers": 0,
                    "blank_accession_records": 0,
                },
            )
            self.assertEqual(snapshot["provenance"]["retrieved_date"], "2026-07-28")
            self.assertEqual(snapshot["provenance"]["uniprot_release"], "2026_02")
            self.assertEqual(snapshot["missing_accessions"], ["Q33333"])
            self.assertEqual(
                snapshot["excluded_identifiers"],
                {
                    "non_uniprot": ["AT1G01030"],
                    "unresolved": [],
                    "blank_accession_record_ids": [],
                },
            )

    def test_canonical_atlas_release_has_exact_current_counts(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory)
            result = run_generator(
                output,
                DATASET_ROOT / "Atlas 5.0_unambiguous sites_20251208.csv",
                DATASET_ROOT / "Atlas 5.0_ambiguous sites_20251208.csv",
                DATASET_ROOT / "ogt-pin-records.csv",
            )

            self.assertEqual(result.returncode, 0, result.stderr)
            metadata = json.loads((output / "atlas-release-v1.json").read_text())
            self.assertEqual(metadata["records"]["total"], 61035)
            self.assertEqual(metadata["records"]["dataset_i_unambiguous"], 46517)
            self.assertEqual(metadata["records"]["dataset_ii_ambiguous"], 14518)
            self.assertEqual(metadata["unique_counts"]["proteins"], 8880)
            self.assertEqual(metadata["unique_counts"]["sites"], 33047)
            self.assertEqual(metadata["identifiers"]["blank_accession_records"], 4)
            self.assertEqual(metadata["identifiers"]["unique_uniprot_candidates"], 7550)
            self.assertEqual(
                metadata["identifiers"]["unique_non_uniprot_identifiers"], 1327
            )
            self.assertEqual(metadata["identifiers"]["unique_unresolved_identifiers"], 3)

    def test_normal_regeneration_reconciles_snapshot_to_new_release_accessions(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            output = root / "output"
            ogt_pin = root / "ogt-pin.csv"
            empty_ambiguous = root / "ambiguous.csv"
            first_unambiguous = root / "first-unambiguous.csv"
            second_unambiguous = root / "second-unambiguous.csv"
            fasta = root / "first.fasta"
            ogt_pin.write_text("id,uuid_b\n1,Q9TEST\n", encoding="utf-8")
            empty_ambiguous.write_text(
                "id,accession,accession_source,position_in_protein,site_residue\n",
                encoding="utf-8",
            )
            first_unambiguous.write_text(
                "id,accession,accession_source,position_in_protein,site_residue\n"
                "10000001,P11111,UniProt,10,S\n",
                encoding="utf-8",
            )
            second_unambiguous.write_text(
                "id,accession,accession_source,position_in_protein,site_residue\n"
                "10000002,P22222,UniProt,20,T\n",
                encoding="utf-8",
            )
            fasta.write_text(">sp|P11111|OLD\nMSTAA\n", encoding="utf-8")
            first = run_generator(
                output,
                first_unambiguous,
                empty_ambiguous,
                ogt_pin,
                "--atlas-sequence-fasta",
                str(fasta),
                "--sequence-retrieved-date",
                "2026-07-28",
            )
            self.assertEqual(first.returncode, 0, first.stderr)

            second = run_generator(
                output,
                second_unambiguous,
                empty_ambiguous,
                ogt_pin,
            )

            self.assertEqual(second.returncode, 0, second.stderr)
            snapshot = json.loads((output / "atlas-sequences-v1.json").read_text())
            release = json.loads((output / "atlas-release-v1.json").read_text())
            self.assertEqual(snapshot["sequences"], {})
            self.assertEqual(snapshot["missing_accessions"], ["P22222"])
            self.assertEqual(
                snapshot["coverage"],
                {
                    "candidate_accessions": 1,
                    "resolved_accessions": 0,
                    "missing_accessions": 1,
                    "non_uniprot_identifiers": 0,
                    "unresolved_identifiers": 0,
                    "blank_accession_records": 0,
                },
            )
            self.assertEqual(
                release["sequence_snapshot"]["coverage"],
                snapshot["coverage"],
            )

    def test_network_option_bounds_are_rejected_by_argument_parser(self) -> None:
        for option, value, expected in (
            ("--uniprot-batch-size", "101", "between 1 and 100"),
            ("--uniprot-retries", "0", "between 1 and 5"),
        ):
            with self.subTest(option=option):
                result = subprocess.run(
                    [sys.executable, str(GENERATOR), option, value],
                    cwd=REPOSITORY_ROOT,
                    text=True,
                    capture_output=True,
                    check=False,
                )
                self.assertEqual(result.returncode, 2)
                self.assertIn(expected, result.stderr)

    def test_uniprot_batches_are_bounded_to_100_accessions(self) -> None:
        requested_batches = []

        def fake_batch(accessions, cache_directory, retries):
            requested_batches.append(tuple(accessions))
            return (
                "",
                {
                    "uniprot_release": "2026_02",
                    "uniprot_release_date": "10-June-2026",
                    "api_deployment_date": "10-July-2026",
                },
                True,
            )

        with mock.patch.object(
            GENERATOR_MODULE, "fetch_uniprot_batch", side_effect=fake_batch
        ):
            GENERATOR_MODULE.fetch_uniprot_sequences(
                {},
                {f"ACCESSION-{index:03d}" for index in range(205)},
                Path("/unused-cache"),
                100,
                3,
                0.25,
            )

        self.assertEqual([len(batch) for batch in requested_batches], [100, 100, 5])

    def test_uniprot_batch_retries_then_uses_its_cache(self) -> None:
        class Response:
            headers = {
                "X-UniProt-Release": "2026_02",
                "X-UniProt-Release-Date": "10-June-2026",
                "X-API-Deployment-Date": "10-July-2026",
            }

            def __enter__(self):
                return self

            def __exit__(self, *arguments):
                return False

            def read(self):
                return b">sp|P11111|PROTEIN\nMSTAA\n"

        with tempfile.TemporaryDirectory() as directory:
            cache = Path(directory)
            with mock.patch.object(
                GENERATOR_MODULE.urllib.request,
                "urlopen",
                side_effect=[URLError("temporary"), Response()],
            ) as urlopen, mock.patch.object(
                GENERATOR_MODULE.time, "sleep"
            ) as sleep:
                first = GENERATOR_MODULE.fetch_uniprot_batch(
                    ["P11111"], cache, retries=3
                )
                second = GENERATOR_MODULE.fetch_uniprot_batch(
                    ["P11111"], cache, retries=3
                )

            self.assertEqual(first[0], ">sp|P11111|PROTEIN\nMSTAA\n")
            self.assertFalse(first[2])
            self.assertTrue(second[2])
            self.assertEqual(urlopen.call_count, 2)
            sleep.assert_called_once_with(1)

    def test_mixed_uniprot_batch_provenance_is_rejected(self) -> None:
        batch_responses = [
            (
                "",
                {
                    "uniprot_release": "2026_01",
                    "uniprot_release_date": "15-April-2026",
                    "api_deployment_date": "01-May-2026",
                },
                True,
            ),
            (
                "",
                {
                    "uniprot_release": "2026_02",
                    "uniprot_release_date": "10-June-2026",
                    "api_deployment_date": "10-July-2026",
                },
                True,
            ),
        ]
        with mock.patch.object(
            GENERATOR_MODULE,
            "fetch_uniprot_batch",
            side_effect=batch_responses,
        ):
            with self.assertRaisesRegex(
                RuntimeError,
                "Inconsistent UniProt batch provenance.*2026_01.*2026_02",
            ):
                GENERATOR_MODULE.fetch_uniprot_sequences(
                    {},
                    {f"ACCESSION-{index:03d}" for index in range(101)},
                    Path("/unused-cache"),
                    100,
                    3,
                    0.25,
                )


if __name__ == "__main__":
    unittest.main()
