from pathlib import Path
from PIL import Image
from rembg import remove, new_session
import subprocess
import shutil

root = Path(__file__).resolve().parents[1]
assets = root / 'assets'
frames = root / '.cutout-frames'
ffmpeg = root / 'node_modules' / '@ffmpeg-installer' / 'win32-x64' / 'ffmpeg.exe'
if not ffmpeg.exists():
    raise FileNotFoundError(ffmpeg)
if frames.exists():
    shutil.rmtree(frames)
frames.mkdir()

# Crop around the full cat, then downsample before segmentation for stable edges.
subprocess.run([
    str(ffmpeg), '-y', '-i', str(assets / 'pet-icon.mov'),
    '-vf', 'fps=15,crop=900:875:560:95,scale=450:438:flags=lanczos',
    str(frames / 'raw-%04d.png')
], check=True)

session = new_session('u2net')
raw = sorted(frames.glob('raw-*.png'))
for index, source in enumerate(raw, 1):
    image = Image.open(source).convert('RGBA')
    cutout = remove(image, session=session, alpha_matting=False, post_process_mask=True)
    cutout.save(frames / f'cutout-{index:04d}.png')
    source.unlink()
    print(f'{index}/{len(raw)}')

subprocess.run([
    str(ffmpeg), '-y', '-framerate', '15', '-i', str(frames / 'cutout-%04d.png'),
    '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '25', '-pix_fmt', 'yuva420p',
    '-auto-alt-ref', '0', '-an', str(assets / 'pet-character.webm')
], check=True)
print(assets / 'pet-character.webm')
