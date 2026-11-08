"""Audio -> log-mel spectrogram windows (128 mel bands x 128 frames) for the CNN."""
import numpy as np, librosa
SR, N_MELS, FRAMES, HOP = 22050, 128, 128, 512

def mel_windows(path, max_windows=6):
    y, _ = librosa.load(path, sr=SR, mono=True, duration=60)
    m = librosa.power_to_db(librosa.feature.melspectrogram(y=y, sr=SR, n_mels=N_MELS, hop_length=HOP), ref=np.max)
    m = np.clip((m + 80) / 80, 0, 1)
    wins = [m[:, i:i + FRAMES] for i in range(0, max(1, m.shape[1] - FRAMES), FRAMES)][:max_windows]
    wins = [np.pad(w, ((0, 0), (0, FRAMES - w.shape[1]))) if w.shape[1] < FRAMES else w for w in wins]
    return np.stack(wins)[:, None].astype("float32")
