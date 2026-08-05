"""Pure Python reference implementation for O-GlcNAcPRED-DL parity tests."""

from __future__ import annotations

import os
import tempfile

import numpy as np
import pandas as pd
from Bio import SeqIO
from Bio.SeqRecord import SeqRecord
from sklearn import preprocessing

from prediction_model.AAindex.AAindex_sl import (
    AAindex_hm_encoding,
    AAindex_ms_encoding,
    col_delete,
)
from prediction_model.preload_model import createModel1, createModel3, createModel4
from prediction_model.word2vec.w2v_fea import w2v_fea_hm, w2v_fea_ms


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_DIR = os.path.join(BASE_DIR, "prediction_model", "model")
WORD2VEC_DIR = os.path.join(BASE_DIR, "prediction_model", "word2vec")
MAX_FASTA_CHARS = 200_000

scale = preprocessing.StandardScaler()
models = {}


class PredictionInputError(ValueError):
    """Raised when reference predictor input violates the public contract."""


def load_models():
    if models:
        return models

    hm1 = createModel3((28, 29))
    hm1.load_weights(os.path.join(MODEL_DIR, "HM", "hm_M1.h5"))
    hm2 = createModel3((28, 29))
    hm2.load_weights(os.path.join(MODEL_DIR, "HM", "hm_M2.h5"))
    hm3 = createModel3((28, 29))
    hm3.load_weights(os.path.join(MODEL_DIR, "HM", "hm_M3.h5"))
    hm4 = createModel3((28, 29))
    hm4.load_weights(os.path.join(MODEL_DIR, "HM", "hm_M4.h5"))
    hm5 = createModel1((28, 30))
    hm5.load_weights(os.path.join(MODEL_DIR, "HM", "hm_M5.h5"))

    mm1 = createModel4()
    mm1.load_weights(os.path.join(MODEL_DIR, "MS", "ms_M1.h5"))
    mm2 = createModel1((28, 29))
    mm2.load_weights(os.path.join(MODEL_DIR, "MS", "ms_M2.h5"))
    mm3 = createModel4()
    mm3.load_weights(os.path.join(MODEL_DIR, "MS", "ms_M3.h5"))
    mm4 = createModel4()
    mm4.load_weights(os.path.join(MODEL_DIR, "MS", "ms_M4.h5"))
    mm5 = createModel3((28, 30))
    mm5.load_weights(os.path.join(MODEL_DIR, "MS", "ms_M5.h5"))

    models.update(
        {
            "hm": [hm1, hm2, hm3, hm4, hm5],
            "ms": [mm1, mm2, mm3, mm4, mm5],
            "hm_w2v": os.path.join(WORD2VEC_DIR, "w2v_hm_w4_v30.model"),
            "ms_w2v": os.path.join(WORD2VEC_DIR, "w2v_ms_w4_v30.model"),
        }
    )
    return models


def predict(species: str, fasta: str):
    normalized_species = species.strip().lower()
    if normalized_species not in {"human", "mouse"}:
        raise PredictionInputError("species must be 'human' or 'mouse'")
    if not fasta.strip():
        raise PredictionInputError("fasta input is required")
    if len(fasta) > MAX_FASTA_CHARS:
        raise PredictionInputError(
            f"fasta input exceeds {MAX_FASTA_CHARS} character limit"
        )

    with tempfile.TemporaryDirectory(prefix="oglcnac_prediction_") as tmpdir:
        input_path = os.path.join(tmpdir, "input.fasta")
        cut_path = os.path.join(tmpdir, "cut_input.fasta")
        with open(input_path, "w", encoding="utf-8") as handle:
            handle.write(fasta)
        cut_sequences(input_path, cut_path)
        predicted = fasta_prediction(normalized_species == "human", cut_path)

    results = []
    for _, row in predicted.reset_index().iterrows():
        score = row["O-GlcNAc prediction score"]
        confidence = ""
        if float(score) > 0.99:
            confidence = "+++"
        elif float(score) > 0.95:
            confidence = "++"
        elif float(score) > 0.5:
            confidence = "+"
        results.append(
            {
                "id": row["ID"],
                "position": int(row["Position"]) + 1,
                "residue": row["Residue"],
                "score": score,
                "confidence": confidence,
            }
        )
    return {"results": results}


def cut_sequences(input_path, cut_path):
    cut_file_lines = []
    with open(input_path, "r", encoding="utf-8") as original_f:
        for seq_record in SeqIO.parse(original_f, "fasta"):
            name = seq_record.id
            sequence = seq_record.seq
            for index in range(len(str(sequence))):
                if sequence[index] in {"S", "T"}:
                    if index >= 14 and index + 14 < len(sequence):
                        new_record = SeqRecord(
                            sequence[index - 14 : index + 15],
                            id=name + f"|position={index}",
                        )
                    elif index < 14:
                        new_record = SeqRecord(
                            pad_sequence(sequence[: index + 15]),
                            id=name + f"|position={index}",
                        )
                    else:
                        new_record = SeqRecord(
                            pad_sequence(sequence[index - 14 :], False),
                            id=name + f"|position={index}",
                        )
                    cut_file_lines.append(new_record)

    if not cut_file_lines:
        raise PredictionInputError("no S/T residues were found in the FASTA input")

    with open(cut_path, "w", encoding="utf-8") as cut_f:
        SeqIO.write(cut_file_lines, cut_f, "fasta")


def pad_sequence(sequence, front=True, default_char="X", default_len=29):
    padding = default_char * (default_len - len(sequence))
    return padding + sequence if front else sequence + padding


def fasta_prediction(is_human, cut_path):
    with open(cut_path, "r", encoding="utf-8") as read_f:
        cut_file_lines = read_f.readlines()
    loaded_models = load_models()

    encodings = AAindex_hm_encoding(cut_path) if is_human else AAindex_ms_encoding(cut_path)
    features = np.array(encodings).reshape(-1, 841)
    features = col_delete(features)
    aaindex_features = scale.fit_transform(features).reshape(features.shape[0], 28, 29)

    if is_human:
        word2vec_features = w2v_fea_hm(
            cut_path, loaded_models["hm_w2v"]
        ).reshape(features.shape[0], 28, 30)
        model1, model2, model3, model4, model5 = loaded_models["hm"]
        weights = (0.05, 0.15, 0.30, 0.20, 0.30)
    else:
        word2vec_features = w2v_fea_ms(
            cut_path, loaded_models["ms_w2v"]
        ).reshape(features.shape[0], 28, 30)
        model1, model2, model3, model4, model5 = loaded_models["ms"]
        weights = (0.20, 0.05, 0.15, 0.30, 0.30)

    outputs = [
        model1.predict({"word_input": aaindex_features}),
        model2.predict({"word_input": aaindex_features}),
        model3.predict({"word_input": aaindex_features}),
        model4.predict({"word_input": aaindex_features}),
        model5.predict({"word_input": word2vec_features}),
    ]
    combined = np.array(
        [
            sum(output[index] * weight for output, weight in zip(outputs, weights))
            for index in range(len(outputs[0]))
        ]
    ).flatten()

    result = pd.DataFrame(
        columns=["ID", "Position", "Residue", "O-GlcNAc prediction score"]
    )
    for index in range(0, len(cut_file_lines) - 1, 2):
        header = cut_file_lines[index]
        pipe_positions = (position for position, character in enumerate(header) if character == "|")
        split_index = next(pipe_positions)
        next_index = next(pipe_positions, False)
        while next_index:
            split_index = next_index
            next_index = next(pipe_positions, False)
        identifier = header[1:split_index]
        whitespace_index = header.index(" ")
        position = header[header.index("position=") + 9 : whitespace_index]
        residue = cut_file_lines[index + 1][14]
        score = "{:.3f}".format(combined[int(index / 2)])
        result.loc[index / 2] = [identifier, position, residue, score]
    return result
