import json
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "prediction-reference"))

from tools.export_browser_predictor import (  # noqa: E402
    export_aaindex,
    export_bundle,
    export_models,
    export_word2vec,
    model_specs,
)
from tools.generate_browser_golden import predict_case  # noqa: E402


class BrowserExportTests(unittest.TestCase):
    def test_golden_generator_uses_the_current_python_prediction_contract(self):
        case = predict_case(
            "human",
            ">SEQ1\nAAAAAAAAAAAAAASAAAAAAAAAAAAAA",
        )

        self.assertEqual(
            case["results"],
            [
                {
                    "id": "SEQ1",
                    "position": 15,
                    "residue": "S",
                    "score": "0.796",
                    "confidence": "+",
                }
            ],
        )

    def test_model_specs_preserve_topology_input_and_ensemble_order(self):
        self.assertEqual(
            [
                (spec.name, spec.builder, spec.input_source, spec.input_shape, spec.weight)
                for spec in model_specs("human")
            ],
            [
                ("hm_M1", "model3", "aaindex", (28, 29), 0.05),
                ("hm_M2", "model3", "aaindex", (28, 29), 0.15),
                ("hm_M3", "model3", "aaindex", (28, 29), 0.30),
                ("hm_M4", "model3", "aaindex", (28, 29), 0.20),
                ("hm_M5", "model1", "word2vec", (28, 30), 0.30),
            ],
        )
        self.assertEqual(
            [
                (spec.name, spec.builder, spec.input_source, spec.input_shape, spec.weight)
                for spec in model_specs("mouse")
            ],
            [
                ("ms_M1", "model4", "aaindex", (28, 29), 0.20),
                ("ms_M2", "model1", "aaindex", (28, 29), 0.05),
                ("ms_M3", "model4", "aaindex", (28, 29), 0.15),
                ("ms_M4", "model4", "aaindex", (28, 29), 0.30),
                ("ms_M5", "model3", "word2vec", (28, 30), 0.30),
            ],
        )

    def test_word2vec_export_preserves_vocab_order_and_zero_fallback(self):
        cases = [
            ("human", "w2v_hm_w4_v30.model", 426, "XN"),
            ("mouse", "w2v_ms_w4_v30.model", 425, "XD"),
        ]
        for species, filename, fallback, last_token in cases:
            source = (
                ROOT
                / "prediction-reference/prediction_model/word2vec"
                / filename
            )
            with self.subTest(species=species), tempfile.TemporaryDirectory() as directory:
                metadata = export_word2vec(source, Path(directory), species)
                manifest = json.loads(
                    (Path(directory) / "word2vec.json").read_text()
                )
                binary_size = (Path(directory) / "word2vec.bin").stat().st_size

            self.assertEqual(metadata, manifest)
            self.assertEqual(manifest["dimensions"], 30)
            self.assertEqual(manifest["unknown_index"], fallback)
            self.assertEqual(len(manifest["tokens"]), fallback)
            self.assertEqual(manifest["tokens"][-1], last_token)
            self.assertEqual(binary_size, (fallback + 1) * 30 * 4)

    def test_aaindex_export_contains_the_species_specific_29_properties(self):
        source = (
            ROOT
            / "prediction-reference/prediction_model/AAindex/AAindex_normalized.txt"
        )
        with tempfile.TemporaryDirectory() as directory:
            metadata = export_aaindex(source, Path(directory))
            saved = json.loads((Path(directory) / "aaindex.json").read_text())

        self.assertEqual(metadata, saved)
        self.assertEqual(saved["alphabet"], "ARNDCQEGHILKMFPSTWYVX")
        self.assertEqual(len(saved["species"]["human"]["properties"]), 29)
        self.assertEqual(len(saved["species"]["mouse"]["properties"]), 29)
        self.assertTrue(
            all(len(values) == 20 for values in saved["values"].values())
        )

    def test_model_export_writes_a_loadable_static_manifest_and_weight_shards(self):
        source = ROOT / "prediction-reference/prediction_model/model"
        with tempfile.TemporaryDirectory() as directory:
            stale_path = Path(directory) / "hm_M1/stale.bin"
            stale_path.parent.mkdir(parents=True)
            stale_path.write_bytes(b"obsolete")
            service_path = str(ROOT / "prediction-reference")
            sys.path.remove(service_path)
            try:
                exported = export_models(
                    source,
                    Path(directory),
                    "human",
                    selected_names={"hm_M1"},
                )
            finally:
                sys.path.insert(0, service_path)
            model_directory = Path(directory) / "hm_M1"
            model_manifest = json.loads(
                (model_directory / "model.json").read_text()
            )
            shards = list(model_directory.glob("*.bin"))
            shard_sizes = [shard.stat().st_size for shard in shards]
            stale_exists_after_export = stale_path.exists()

        self.assertFalse(stale_exists_after_export)
        self.assertEqual(len(exported), 1)
        self.assertEqual(exported[0]["name"], "hm_M1")
        self.assertEqual(exported[0]["input_source"], "aaindex")
        self.assertEqual(exported[0]["input_shape"], [28, 29])
        self.assertEqual(exported[0]["ensemble_weight"], 0.05)
        self.assertEqual(len(exported[0]["source_sha256"]), 64)
        self.assertEqual(
            set(exported[0]["asset_sha256"]),
            {"model.json", shards[0].name},
        )
        self.assertTrue(
            all(len(value) == 64 for value in exported[0]["asset_sha256"].values())
        )
        self.assertIn("modelTopology", model_manifest)
        self.assertTrue(shards)
        self.assertTrue(all(size > 0 for size in shard_sizes))

    def test_bundle_manifest_uses_versioned_relative_static_asset_paths(self):
        model_root = ROOT / "prediction-reference/prediction_model"
        with tempfile.TemporaryDirectory() as directory:
            destination = Path(directory) / "bundle"
            destination.mkdir()
            stale_path = destination / "obsolete-model.bin"
            stale_path.write_bytes(b"obsolete")
            manifest = export_bundle(
                model_root,
                destination,
                selected_models={"human": {"hm_M1"}, "mouse": set()},
            )
            saved = json.loads((destination / "manifest.json").read_text())
            model_path = (
                destination
                / saved["species"]["human"]["models"][0]["model"]
            )
            stale_exists_after_export = stale_path.exists()

        self.assertEqual(manifest, saved)
        self.assertFalse(stale_exists_after_export)
        self.assertEqual(saved["version"], "1.0.0")
        self.assertEqual(saved["batch_size"], 128)
        self.assertEqual(saved["runtime"], "tensorflowjs-wasm-2.8.5")
        self.assertEqual(saved["features"]["aaindex"], "aaindex.json")
        self.assertEqual(len(saved["features"]["aaindex_sha256"]), 64)
        self.assertEqual(
            saved["species"]["human"]["word2vec"]["metadata"],
            "human/word2vec/word2vec.json",
        )
        self.assertEqual(
            len(saved["species"]["human"]["word2vec"]["metadata_sha256"]),
            64,
        )
        self.assertEqual(
            len(saved["species"]["human"]["word2vec"]["vectors_sha256"]),
            64,
        )
        self.assertEqual(saved["species"]["human"]["models"][0]["name"], "hm_M1")
        self.assertTrue(model_path.name == "model.json")


if __name__ == "__main__":
    unittest.main()
