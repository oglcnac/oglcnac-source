#!/usr/bin/env python3
import argparse
import hashlib
import json
import shutil
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import List, Tuple

import numpy as np
from gensim.models import Word2Vec


SERVICE_ROOT = Path(__file__).resolve().parents[1]
if str(SERVICE_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVICE_ROOT))


HUMAN_AAINDEX_PROPERTIES = (
    "HUTJ700101",
    "VHEG790101",
    "ISOY800106",
    "ROBB760113",
    "CIDH920101",
    "OOBM770102",
    "TANS770102",
    "ROSM880101",
    "QIAN880113",
    "SNEP660104",
    "OOBM850103",
    "MAXF760106",
    "BAEK050101",
    "RADA880101",
    "HOPA770101",
    "FAUJ880112",
    "GEIM800101",
    "WOLR810101",
    "CHOP780207",
    "FASG760105",
    "FAUJ830101",
    "CHAM810101",
    "QIAN880124",
    "BASU050102",
    "GRAR740101",
    "AURR980116",
    "AURR980117",
    "WOLS870101",
    "ZIMJ680104",
)

MOUSE_AAINDEX_PROPERTIES = (
    "BAEK050101",
    "FAUJ830101",
    "LEVM760105",
    "LAWE840101",
    "QIAN880134",
    "FAUJ880104",
    "WERD780101",
    "GEIM800102",
    "TANS770102",
    "BEGF750103",
    "KRIW790101",
    "HOPA770101",
    "CHAM830104",
    "PONP800108",
    "EISD860102",
    "BASU050102",
    "LEVM760103",
    "QIAN880124",
    "GEOR030107",
    "ZIMJ680104",
    "AURR980117",
    "CHAM810101",
    "MITS020101",
    "KARP850102",
    "CHOP780207",
    "HUTJ700101",
    "LEVM760106",
    "JOND750102",
    "RICJ880110",
)


@dataclass(frozen=True)
class ModelSpec:
    name: str
    builder: str
    input_source: str
    input_shape: Tuple[int, int]
    weight: float


def model_specs(species: str) -> List[ModelSpec]:
    if species == "human":
        return [
            ModelSpec("hm_M1", "model3", "aaindex", (28, 29), 0.05),
            ModelSpec("hm_M2", "model3", "aaindex", (28, 29), 0.15),
            ModelSpec("hm_M3", "model3", "aaindex", (28, 29), 0.30),
            ModelSpec("hm_M4", "model3", "aaindex", (28, 29), 0.20),
            ModelSpec("hm_M5", "model1", "word2vec", (28, 30), 0.30),
        ]
    if species == "mouse":
        return [
            ModelSpec("ms_M1", "model4", "aaindex", (28, 29), 0.20),
            ModelSpec("ms_M2", "model1", "aaindex", (28, 29), 0.05),
            ModelSpec("ms_M3", "model4", "aaindex", (28, 29), 0.15),
            ModelSpec("ms_M4", "model4", "aaindex", (28, 29), 0.30),
            ModelSpec("ms_M5", "model3", "word2vec", (28, 30), 0.30),
        ]
    raise ValueError("species must be 'human' or 'mouse'")


def export_word2vec(source: Path, destination: Path, species: str):
    destination.mkdir(parents=True, exist_ok=True)
    model = Word2Vec.load(str(source))
    tokens = list(model.wv.key_to_index.keys())
    expected_unknown_index = 426 if species == "human" else 425
    if len(tokens) != expected_unknown_index:
        raise ValueError(
            f"{species} word2vec vocabulary has {len(tokens)} tokens; "
            f"expected {expected_unknown_index}"
        )
    vectors = np.asarray(model.wv.vectors, dtype="<f4")
    vectors = np.vstack((vectors, np.zeros((1, vectors.shape[1]), dtype="<f4")))
    metadata = {
        "dimensions": int(vectors.shape[1]),
        "tokens": tokens,
        "unknown_index": expected_unknown_index,
    }
    (destination / "word2vec.json").write_text(
        json.dumps(metadata, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )
    (destination / "word2vec.bin").write_bytes(vectors.astype("<f4").tobytes())
    return metadata


def export_aaindex(source: Path, destination: Path):
    destination.mkdir(parents=True, exist_ok=True)
    rows = {}
    for line in source.read_text(encoding="utf-8").splitlines()[1:]:
        fields = line.split()
        if fields:
            rows[fields[0]] = [float(value) for value in fields[1:]]
    selected = set(HUMAN_AAINDEX_PROPERTIES) | set(MOUSE_AAINDEX_PROPERTIES)
    metadata = {
        "alphabet": "ARNDCQEGHILKMFPSTWYVX",
        "species": {
            "human": {"properties": list(HUMAN_AAINDEX_PROPERTIES)},
            "mouse": {"properties": list(MOUSE_AAINDEX_PROPERTIES)},
        },
        "values": {name: rows[name] for name in sorted(selected)},
    }
    (destination / "aaindex.json").write_text(
        json.dumps(metadata, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )
    return metadata


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def export_models(
    source: Path,
    destination: Path,
    species: str,
    selected_names=None,
):
    import tensorflowjs as tfjs
    from keras import backend

    if str(SERVICE_ROOT) not in sys.path:
        sys.path.insert(0, str(SERVICE_ROOT))
    from prediction_model.preload_model import createModel1, createModel3, createModel4

    destination.mkdir(parents=True, exist_ok=True)
    species_directory = "HM" if species == "human" else "MS"
    exported = []
    for spec in model_specs(species):
        if selected_names is not None and spec.name not in selected_names:
            continue
        backend.clear_session()
        if spec.builder == "model1":
            model = createModel1(spec.input_shape)
        elif spec.builder == "model3":
            model = createModel3(spec.input_shape)
        else:
            model = createModel4()
        weight_path = source / species_directory / f"{spec.name}.h5"
        model.load_weights(str(weight_path))
        model_destination = destination / spec.name
        if model_destination.exists():
            shutil.rmtree(model_destination)
        tfjs.converters.save_keras_model(model, str(model_destination))
        asset_sha256 = {
            path.name: _sha256(path)
            for path in sorted(model_destination.iterdir())
            if path.is_file()
        }
        exported.append(
            {
                "name": spec.name,
                "input_source": spec.input_source,
                "input_shape": list(spec.input_shape),
                "ensemble_weight": spec.weight,
                "model": f"{spec.name}/model.json",
                "source_sha256": _sha256(weight_path),
                "asset_sha256": asset_sha256,
            }
        )
    backend.clear_session()
    return exported


def _build_bundle(
    model_root: Path,
    destination: Path,
    selected_models=None,
):
    destination.mkdir(parents=True, exist_ok=True)
    aaindex_source = model_root / "AAindex/AAindex_normalized.txt"
    export_aaindex(aaindex_source, destination)
    manifest = {
        "version": "1.0.0",
        "runtime": "tensorflowjs-wasm-2.8.5",
        "batch_size": 128,
        "features": {
            "aaindex": "aaindex.json",
            "aaindex_source_sha256": _sha256(aaindex_source),
            "aaindex_sha256": _sha256(destination / "aaindex.json"),
        },
        "species": {},
    }
    word2vec_sources = {
        "human": model_root / "word2vec/w2v_hm_w4_v30.model",
        "mouse": model_root / "word2vec/w2v_ms_w4_v30.model",
    }
    for species in ("human", "mouse"):
        species_destination = destination / species
        word2vec_destination = species_destination / "word2vec"
        source = word2vec_sources[species]
        export_word2vec(source, word2vec_destination, species)
        selected = None
        if selected_models is not None:
            selected = selected_models.get(species, set())
        models = export_models(
            model_root / "model",
            species_destination / "models",
            species,
            selected_names=selected,
        )
        for model in models:
            model["model"] = f"{species}/models/{model['model']}"
        manifest["species"][species] = {
            "word2vec": {
                "metadata": f"{species}/word2vec/word2vec.json",
                "vectors": f"{species}/word2vec/word2vec.bin",
                "source_sha256": _sha256(source),
                "metadata_sha256": _sha256(
                    word2vec_destination / "word2vec.json"
                ),
                "vectors_sha256": _sha256(
                    word2vec_destination / "word2vec.bin"
                ),
            },
            "models": models,
        }
    (destination / "manifest.json").write_text(
        json.dumps(manifest, indent=2) + "\n",
        encoding="utf-8",
    )
    return manifest


def export_bundle(
    model_root: Path,
    destination: Path,
    selected_models=None,
):
    destination = destination.resolve()
    destination.parent.mkdir(parents=True, exist_ok=True)
    staging = Path(
        tempfile.mkdtemp(
            prefix=f".{destination.name}-staging-",
            dir=str(destination.parent),
        )
    )
    backup = None
    try:
        manifest = _build_bundle(model_root, staging, selected_models)
        if destination.exists():
            backup = Path(
                tempfile.mkdtemp(
                    prefix=f".{destination.name}-backup-",
                    dir=str(destination.parent),
                )
            )
            backup.rmdir()
            destination.rename(backup)
        staging.rename(destination)
        if backup:
            shutil.rmtree(backup)
        return manifest
    except Exception:
        if backup and backup.exists() and not destination.exists():
            backup.rename(destination)
        raise
    finally:
        if staging.exists():
            shutil.rmtree(staging)


if __name__ == "__main__":
    repository_root = Path(__file__).resolve().parents[2]
    parser = argparse.ArgumentParser(
        description="Export O-GlcNAcPRED-DL models for static browser inference."
    )
    parser.add_argument(
        "--model-root",
        type=Path,
        default=repository_root / "prediction-service/prediction_model",
    )
    parser.add_argument(
        "--destination",
        type=Path,
        default=repository_root / "frontend/static/prediction/v1",
    )
    arguments = parser.parse_args()
    export_bundle(arguments.model_root, arguments.destination)
