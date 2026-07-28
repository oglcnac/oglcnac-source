#!/usr/bin/env python3
import argparse
import json
import sys
from pathlib import Path


SERVICE_ROOT = Path(__file__).resolve().parents[1]
REPOSITORY_ROOT = SERVICE_ROOT.parent
if str(SERVICE_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVICE_ROOT))


def predict_case(species: str, fasta: str):
    from app import PredictionRequest, predict

    return predict(PredictionRequest(species=species, fasta=fasta))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Generate browser parity fixtures from the Python predictor."
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=REPOSITORY_ROOT
        / "scripts/tests/fixtures/prediction-golden.json",
    )
    arguments = parser.parse_args()
    fixture_directory = REPOSITORY_ROOT / "frontend/static/fasta"
    case_specs = [
        ("individual-human", "human", "individual_protein_human.fasta"),
        ("individual-mouse", "mouse", "individual_protein_mouse.fasta"),
        ("multiple-human", "human", "multiple_proteins_human.fasta"),
        ("multiple-mouse", "mouse", "multiple_proteins_mouse.fasta"),
    ]
    cases = []
    for name, species, filename in case_specs:
        fasta = (fixture_directory / filename).read_text(encoding="utf-8")
        cases.append(
            {
                "name": name,
                "species": species,
                "fasta_path": f"/static/fasta/{filename}",
                "results": predict_case(species, fasta)["results"],
            }
        )
    arguments.output.parent.mkdir(parents=True, exist_ok=True)
    arguments.output.write_text(
        json.dumps({"version": 1, "cases": cases}, indent=2) + "\n",
        encoding="utf-8",
    )
