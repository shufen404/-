from pathlib import Path
from PIL import Image, ImageOps

SOURCE = Path(__file__).resolve().parents[1] / 'assets' / 'niulai-character.webp'
OUT_DIR = Path(r'C:\Users\Mirro\.codex\pets\niulai')
CELL_W, CELL_H = 192, 208
COLS, ROWS = 8, 11


def load_frames():
    image = Image.open(SOURCE)
    frames = []
    for index in range(getattr(image, 'n_frames', 1)):
        image.seek(index)
        frame = image.convert('RGBA')
        alpha = frame.getchannel('A')
        bbox = alpha.getbbox()
        if bbox:
            frame = frame.crop(bbox)
        frames.append(frame)
    return frames


def fit_cell(frame, mirror=False):
    if mirror:
        frame = ImageOps.mirror(frame)
    scale = min((CELL_W - 16) / frame.width, (CELL_H - 12) / frame.height)
    frame = frame.resize((max(1, round(frame.width * scale)), max(1, round(frame.height * scale))), Image.Resampling.LANCZOS)
    cell = Image.new('RGBA', (CELL_W, CELL_H), (0, 0, 0, 0))
    cell.alpha_composite(frame, ((CELL_W - frame.width) // 2, (CELL_H - frame.height) // 2))
    return cell


def frame_for(frames, index, mirror=False):
    return fit_cell(frames[index % len(frames)], mirror=mirror)


def main():
    frames = load_frames()
    atlas = Image.new('RGBA', (COLS * CELL_W, ROWS * CELL_H), (0, 0, 0, 0))

    rows = {
        0: ([0, 1, 2, 3, 4, 5], False),
        1: (list(range(8)), False),
        2: (list(range(8)), True),
        3: ([4, 6, 8, 10], False),
        4: ([5, 8, 11, 14, 17], False),
        5: (list(range(8, 16)), False),
        6: (list(range(12, 18)), False),
        7: (list(range(16, 22)), False),
        8: ([18, 19, 20, 21, 22, 23], False),
        9: ([0, 3, 6, 9, 12, 15, 18, 21], False),
        10: ([0, 3, 6, 9, 12, 15, 18, 21], True),
    }
    for row, (indices, mirror) in rows.items():
        for col, index in enumerate(indices):
            atlas.alpha_composite(frame_for(frames, index, mirror), (col * CELL_W, row * CELL_H))

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    atlas.save(OUT_DIR / 'spritesheet.webp', 'WEBP', lossless=True, method=6)
    (OUT_DIR / 'pet.json').write_text(
        '{\n'
        '  "id": "niulai",\n'
        '  "displayName": "牛来",\n'
        '  "description": "来自薪宠项目的橙色牛来桌宠。",\n'
        '  "spriteVersionNumber": 2,\n'
        '  "spritesheetPath": "spritesheet.webp"\n'
        '}\n',
        encoding='utf-8',
    )
    print(f'created {OUT_DIR / "spritesheet.webp"}')
    print(f'frames={len(frames)} atlas={atlas.size}')


if __name__ == '__main__':
    main()
