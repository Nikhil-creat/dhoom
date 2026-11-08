import torch.nn as nn

class GenreCNN(nn.Module):
    """4-block CNN over mel-spectrograms: (B,1,128,128) -> genre logits."""
    def __init__(self, n_classes: int):
        super().__init__()
        def block(i, o):
            return nn.Sequential(nn.Conv2d(i, o, 3, padding=1), nn.BatchNorm2d(o), nn.ReLU(), nn.MaxPool2d(2))
        self.features = nn.Sequential(block(1, 16), block(16, 32), block(32, 64), block(64, 128))
        self.pool = nn.AdaptiveAvgPool2d(1)
        self.head = nn.Sequential(nn.Dropout(0.3), nn.Linear(128, n_classes))

    def forward(self, x):
        return self.head(self.pool(self.features(x)).flatten(1))
