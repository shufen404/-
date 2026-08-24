from pathlib import Path
from PIL import Image
import subprocess
import shutil

root = Path(__file__).resolve().parents[1]
assets = root / 'assets'
frames = root / '.fixed-mask-frames'
ffmpeg = root / 'node_modules' / '@ffmpeg-installer' / 'win32-x64' / 'ffmpeg.exe'
mask_source = assets / 'pet-cutout-refined.png'

if frames.exists():
    shutil.rmtree(frames)
frames.mkdir()

mask = Image.open(mask_source).convert('RGBA').getchannel('A')
target_size = mask.size
subprocess.run([
    str(ffmpeg), '-y', '-i', str(assets / 'pet-icon.mov'),
    '-vf', f'fps=15,crop=900:875:560:95,scale={target_size[0]}:{target_size[1]}:flags=lanczos',
    str(frames / 'raw-%04d.png')
], check=True)

output_frames = []
for source in sorted(frames.glob('raw-*.png')):
    image = Image.open(source).convert('RGBA')
    image.putalpha(mask)
    output_frames.append(image.copy())

target = assets / 'pet-character.webp'
output_frames[0].save(
    target,
    save_all=True,
    append_images=output_frames[1:],
    duration=67,
    loop=0,
    lossless=True,
    method=6,
)
print(target)
