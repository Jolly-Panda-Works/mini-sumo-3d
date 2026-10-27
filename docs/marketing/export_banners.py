"""Export the approved ImageGen artwork without cropping its composition."""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SOURCE = Path('C:/Users/Ania/.codex/generated_images/01a1785a-c33e-70d2-9291-76226bcc715a')
OUTPUT = ROOT / 'apps/client/public/social'
OUTPUT.mkdir(parents=True, exist_ok=True)
assets = [
    ('exec-1da2a835-e351-468b-9bd1-37a5117461f0.png', 'mini-sumo-intro-v1', (1920, 1080)),
    ('exec-be81b921-eb10-48bf-a2c9-5663c5e34d4c.png', 'mini-sumo-social-v1', (1200, 630)),
]
for source, name, size in assets:
    with Image.open(SOURCE / source) as image:
        image = image.convert('RGB').resize(size, Image.Resampling.LANCZOS)
        image.save(OUTPUT / (name + '.png'), optimize=True)
        image.save(OUTPUT / (name + '.jpg'), quality=91, optimize=True, progressive=True)
        image.save(OUTPUT / (name + '.webp'), quality=90, method=6)
    print(name, size, (OUTPUT / (name + '.jpg')).stat().st_size, 'bytes JPEG')
