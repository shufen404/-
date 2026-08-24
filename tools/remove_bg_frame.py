from pathlib import Path
from PIL import Image
from rembg import remove, new_session

root = Path(__file__).resolve().parents[1]
source = root / 'assets' / 'video-frame.png'
target = root / 'assets' / 'video-frame-cutout.png'
image = Image.open(source).convert('RGBA')
image = image.crop((560, 95, 1460, 970))
session = new_session('u2net')
result = remove(image, session=session, alpha_matting=False, post_process_mask=True)
result.thumbnail((600, 600), Image.Resampling.LANCZOS)
result.save(target)
print(target)
