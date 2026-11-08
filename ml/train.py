"""Train the genre CNN.   python train.py dataset 20
dataset/<genre_name>/*.mp3|wav|ogg|m4a|flac   (folder name = label, e.g. 'Telugu Folk DJ').
Use only audio you have the rights to. Splits are made PER FILE to avoid leakage."""
import sys, json, pathlib, random
import numpy as np, torch, torch.nn as nn
from model import GenreCNN
from features import mel_windows

root = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "dataset")
EPOCHS = int(sys.argv[2]) if len(sys.argv) > 2 else 15
labels = sorted(d.name for d in root.iterdir() if d.is_dir())
assert len(labels) >= 2, "Need at least 2 genre folders"
items = []
for li, l in enumerate(labels):
    for f in (root / l).glob("*"):
        if f.suffix.lower() in {".mp3", ".wav", ".ogg", ".m4a", ".flac"}:
            try: items.append((mel_windows(str(f)), li))
            except Exception as e: print("skip", f, e)
random.shuffle(items); cut = int(len(items) * 0.85)
def cat(sub): return (np.concatenate([w for w, _ in sub]), np.concatenate([[y] * len(w) for w, y in sub]))
Xtr, Ytr = cat(items[:cut]); Xva, Yva = cat(items[cut:])
dev = "cuda" if torch.cuda.is_available() else "cpu"
net = GenreCNN(len(labels)).to(dev); opt = torch.optim.AdamW(net.parameters(), 1e-3); lossf = nn.CrossEntropyLoss()
Xva_t, Yva_t = torch.tensor(Xva).to(dev), torch.tensor(Yva).to(dev); best = 0
for ep in range(EPOCHS):
    net.train(); perm = np.random.permutation(len(Xtr))
    for i in range(0, len(perm), 32):
        b = perm[i:i + 32]; x = torch.tensor(Xtr[b]).to(dev); y = torch.tensor(Ytr[b]).to(dev)
        opt.zero_grad(); lossf(net(x), y).backward(); opt.step()
    net.eval()
    with torch.no_grad(): acc = (net(Xva_t).argmax(1) == Yva_t).float().mean().item()
    print(f"epoch {ep + 1}/{EPOCHS}  val_acc={acc:.3f}")
    if acc >= best: best = acc; torch.save(net.state_dict(), "model.pt"); json.dump(labels, open("labels.json", "w"))
print("saved model.pt  best val_acc", round(best, 3))
