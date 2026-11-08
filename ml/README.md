# CNN genre service
Suggests genres for uploaded tracks from a mel-spectrogram CNN. **No trained weights are included** — train on audio you have rights to:
```bash
pip install -r requirements.txt torch
python train.py dataset 20      # dataset/<Genre Name>/*.mp3
uvicorn app:app --port 8000      # then set ML_SERVICE_URL=http://localhost:8000 on the API
```
Needs roughly 50+ clips per genre for useful results. Too heavy for Render free (512 MB) — run via Docker on your PC/VPS, or a bigger instance.
