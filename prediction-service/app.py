import os
import tempfile
import time
from collections import defaultdict, deque
from typing import List

import numpy as np
import pandas as pd
from Bio import SeqIO
from Bio.SeqRecord import SeqRecord
from fastapi import Depends, FastAPI, Header, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sklearn import preprocessing

from prediction_model.AAindex.AAindex_sl import (
    AAindex_hm_encoding,
    AAindex_ms_encoding,
    col_delete,
)
from prediction_model.preload_model import createModel1, createModel3, createModel4
from prediction_model.word2vec.w2v_fea import w2v_fea_hm, w2v_fea_ms


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_DIR = os.environ.get("PREDICTION_MODEL_DIR", os.path.join(BASE_DIR, "prediction_model", "model"))
WORD2VEC_DIR = os.environ.get("PREDICTION_WORD2VEC_DIR", os.path.join(BASE_DIR, "prediction_model", "word2vec"))
API_KEYS = {key.strip() for key in os.environ.get("PREDICTION_API_KEYS", "").split(",") if key.strip()}
MAX_FASTA_CHARS = int(os.environ.get("PREDICTION_MAX_FASTA_CHARS", "200000"))
RATE_LIMIT_PER_MINUTE = int(os.environ.get("PREDICTION_RATE_LIMIT_PER_MINUTE", "12"))
CORS_ORIGINS = [
    origin.strip()
    for origin in os.environ.get(
        "PREDICTION_CORS_ORIGINS",
        "https://oglcnac.org,https://www.oglcnac.org",
    ).split(",")
    if origin.strip()
]

scale = preprocessing.StandardScaler()
models = {}
request_times = defaultdict(deque)

app = FastAPI(
    title="O-GlcNAcPRED-DL API",
    version="1.0",
    description="HTTP API for O-GlcNAcPRED-DL human/mouse O-GlcNAcylation site prediction.",
)

if CORS_ORIGINS:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=CORS_ORIGINS,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["*"],
    )


class PredictionRequest(BaseModel):
    species: str
    fasta: str


class PredictionRecord(BaseModel):
    id: str
    position: int
    residue: str
    score: str
    confidence: str


class PredictionResponse(BaseModel):
    results: List[PredictionRecord]


def require_api_key(x_api_key: str = Header(default="")):
    if API_KEYS and x_api_key not in API_KEYS:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="valid X-API-Key header is required",
        )


def rate_limit(request: Request, x_api_key: str = Header(default="")):
    client_id = x_api_key or request.client.host
    now = time.time()
    window = request_times[client_id]
    while window and now - window[0] > 60:
        window.popleft()
    if len(window) >= RATE_LIMIT_PER_MINUTE:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="rate limit exceeded",
        )
    window.append(now)


def load_models():
    if models:
        return models

    # The published model is an ensemble of five human and five mouse models.
    # Keep these filenames aligned with prediction_model/model/.
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


@app.on_event("startup")
def startup():
    load_models()


@app.get("/health")
def health():
    return {"status": "ok", "models_loaded": bool(models)}


@app.get("/api/v1")
def api_info():
    return {
        "name": "O-GlcNAcPRED-DL API",
        "version": "v1",
        "predict_endpoint": "/api/v1/predict",
        "species": ["human", "mouse"],
        "authentication": "X-API-Key header required when PREDICTION_API_KEYS is configured",
    }


@app.post(
    "/api/v1/predict",
    response_model=PredictionResponse,
    dependencies=[Depends(require_api_key), Depends(rate_limit)],
)
def predict(payload: PredictionRequest):
    species = payload.species.strip().lower()
    if species not in {"human", "mouse"}:
        raise HTTPException(status_code=400, detail="species must be 'human' or 'mouse'")
    if not payload.fasta.strip():
        raise HTTPException(status_code=400, detail="fasta input is required")
    if len(payload.fasta) > MAX_FASTA_CHARS:
        raise HTTPException(
            status_code=413,
            detail=f"fasta input exceeds {MAX_FASTA_CHARS} character limit",
        )

    with tempfile.TemporaryDirectory(prefix="oglcnac_prediction_") as tmpdir:
        input_path = os.path.join(tmpdir, "input.fasta")
        cut_path = os.path.join(tmpdir, "cut_input.fasta")
        with open(input_path, "w") as handle:
            handle.write(payload.fasta)

        cut_sequences(input_path, cut_path)
        pred_res = fasta_prediction(species == "human", cut_path)

    results = []
    for _, row in pred_res.reset_index().iterrows():
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


@app.post(
    "/predict",
    response_model=PredictionResponse,
    dependencies=[Depends(require_api_key), Depends(rate_limit)],
    include_in_schema=False,
)
def predict_legacy(payload: PredictionRequest):
    return predict(payload)


def cut_sequences(input_path, cut_path):
    cut_file_lines = []
    with open(input_path, "r") as original_f:
        for seq_record in SeqIO.parse(original_f, "fasta"):
            name = seq_record.id
            sequence = seq_record.seq
            for i in range(len(str(sequence))):
                if sequence[i] in {"S", "T"}:
                    # The model scores a 29-residue window centered on each S/T site.
                    if i >= 14 and i + 14 < len(sequence):
                        new_record = SeqRecord(sequence[i - 14 : i + 15], id=name + f"|position={i}")
                    elif i < 14:
                        new_record = SeqRecord(pad_sequence(sequence[: i + 15]), id=name + f"|position={i}")
                    else:
                        new_record = SeqRecord(pad_sequence(sequence[i - 14 :], False), id=name + f"|position={i}")
                    cut_file_lines.append(new_record)

    if not cut_file_lines:
        raise HTTPException(status_code=400, detail="no S/T residues were found in the FASTA input")

    with open(cut_path, "w") as cut_f:
        SeqIO.write(cut_file_lines, cut_f, "fasta")


def pad_sequence(seq, front=True, default_char="X", default_len=29):
    temp = default_char * (default_len - len(seq))
    if front:
        return temp + seq
    return seq + temp


def fasta_prediction(is_human, cut_path):
    with open(cut_path, "r") as read_f:
        cut_file_lines = read_f.readlines()
    loaded_models = load_models()

    if is_human:
        encodings = AAindex_hm_encoding(cut_path)
    else:
        encodings = AAindex_ms_encoding(cut_path)

    X = np.array(encodings).reshape(-1, 841)
    X = col_delete(X)
    X1 = scale.fit_transform(X).reshape(X.shape[0], 28, 29)

    if is_human:
        X2 = w2v_fea_hm(cut_path, loaded_models["hm_w2v"]).reshape(X.shape[0], 28, 30)
        m1, m2, m3, m4, m5 = loaded_models["hm"]
    else:
        X2 = w2v_fea_ms(cut_path, loaded_models["ms_w2v"]).reshape(X.shape[0], 28, 30)
        m1, m2, m3, m4, m5 = loaded_models["ms"]

    y_predict_test1 = m1.predict({"word_input": X1})
    y_predict_test2 = m2.predict({"word_input": X1})
    y_predict_test3 = m3.predict({"word_input": X1})
    y_predict_test4 = m4.predict({"word_input": X1})
    y_predict_test5 = m5.predict({"word_input": X2})
    sum_lst = []
    if is_human:
        for index, item in enumerate(y_predict_test1):
            sum_lst.append(
                (item * 0.05)
                + (y_predict_test2[index]) * 0.15
                + (y_predict_test3[index]) * 0.3
                + (y_predict_test4[index]) * 0.2
                + (y_predict_test5[index]) * 0.3
            )
    else:
        for index, item in enumerate(y_predict_test1):
            sum_lst.append(
                (item * 0.2)
                + (y_predict_test2[index]) * 0.05
                + (y_predict_test3[index]) * 0.15
                + (y_predict_test4[index]) * 0.3
                + (y_predict_test5[index]) * 0.3
            )
    y_predict = np.array(sum_lst).flatten()

    res = pd.DataFrame(columns=["ID", "Position", "Residue", "O-GlcNAc prediction score"])
    for i in range(0, len(cut_file_lines) - 1, 2):
        header = cut_file_lines[i]
        pipe_positions = (j for j, letter in enumerate(header) if letter == "|")
        split_idx = next(pipe_positions)
        next_idx = next(pipe_positions, False)
        while next_idx:
            split_idx = next_idx
            next_idx = next(pipe_positions, False)

        identifier = header[1:split_idx]
        whitespace_idx = header.index(" ")
        position = header[header.index("position=") + 9 : whitespace_idx]
        residue = cut_file_lines[i + 1][14]
        score = "{:.3f}".format(y_predict[int(i / 2)])
        res.loc[i / 2] = [identifier, position, residue, score]
    return res
