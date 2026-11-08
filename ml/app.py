"""CNN genre-suggestion microservice.  uvicorn app:app --port 8000"""
import json, os, pathlib, tempfile
import numpy as np, torch
from fastapi import FastAPI, File, HTTPException, UploadFile
from model import GenreCNN
from features import mel_windows

app = FastAPI(title="Dhoom CNN genre service")
HERE = pathlib.Path(__file__).parent
net, labels = None, []
if (HERE / "model.pt").exists() and (HERE / "labels.json").exists():
    labels = json.loads((HERE / "labels.json").read_text())
    net = GenreCNN(len(labels)); net.load_state_dict(torch.load(HERE / "model.pt", map_location="cpu")); net.eval()

@app.get("/health")
def health(): return {"ok": True, "model_loaded": net is not None, "labels": labels}

@app.post("/classify")
async def classify(file: UploadFile = File(...)):
    if net is None: raise HTTPException(503, "Model not trained yet. Run: python train.py dataset")
    data = await file.read()
    if len(data) > 40 * 1024 * 1024: raise HTTPException(413, "File too large")
    suffix = (pathlib.Path(file.filename or "a.mp3").suffix or ".mp3")[:6]
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as f: f.write(data); path = f.name
    try: w = torch.from_numpy(mel_windows(path))
    except Exception: raise HTTPException(400, "Could not decode audio")
    finally: os.unlink(path)
    with torch.no_grad(): p = torch.softmax(net(w), 1).mean(0).numpy()
    top = np.argsort(-p)[:3]
    return {"top": [{"label": labels[i], "score": round(float(p[i]), 4)} for i in top]}
