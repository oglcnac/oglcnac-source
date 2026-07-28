from __future__ import annotations

import gzip
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
GENERATOR = REPOSITORY_ROOT / "frontend" / "scripts" / "generate_static_data.py"
DATASET_ROOT = REPOSITORY_ROOT / "frontend" / "static" / "dataset"


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


if __name__ == "__main__":
    unittest.main()
