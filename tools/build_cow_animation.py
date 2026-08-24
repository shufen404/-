from pathlib import Path
import math

import numpy as np
from PIL import Image
from rembg import new_session, remove
from scipy.ndimage import label, map_coordinates


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
SOURCE = Path(r"C:\Users\Mirro\Desktop\image_电影《牛来》_所有想不到最后都成..._0.png")
CUTOUT = ASSETS / "niulai-cutout.png"
ANIMATION = ASSETS / "niulai-character.webp"
PREVIEW = ASSETS / "niulai-walk-preview.png"


def trim_alpha(image: Image.Image, padding: int = 8) -> Image.Image:
    alpha = image.getchannel("A")
    bbox = alpha.getbbox()
    if not bbox:
        raise RuntimeError("Cow cutout has no visible pixels")
    left = max(0, bbox[0] - padding)
    top = max(0, bbox[1] - padding)
    right = min(image.width, bbox[2] + padding)
    bottom = min(image.height, bbox[3] + padding)
    return image.crop((left, top, right, bottom))


def keep_subject(image: Image.Image) -> Image.Image:
    data = np.asarray(image).copy()
    components, count = label(data[:, :, 3] > 12)
    if count < 2:
        return image
    sizes = np.bincount(components.ravel())
    sizes[0] = 0
    subject = components == sizes.argmax()
    data[~subject, 3] = 0
    return Image.fromarray(data, "RGBA")


def deform_legs(image: Image.Image, phase: float) -> Image.Image:
    data = np.asarray(image).astype(np.float32)
    height, width = data.shape[:2]
    yy, xx = np.mgrid[0:height, 0:width].astype(np.float32)

    leg_start = height * 0.64
    weight = np.clip((yy - leg_start) / max(1, height - leg_start), 0, 1)
    weight = weight * weight * (3 - 2 * weight)
    side = np.tanh((width * 0.52 - xx) / max(8, width * 0.055))
    stride = math.sin(phase) * width * 0.035
    lift = math.cos(phase) * height * 0.012

    source_x = xx - stride * weight * side
    source_y = yy - lift * weight * side
    channels = [
        map_coordinates(data[:, :, channel], [source_y, source_x], order=1, mode="constant", cval=0)
        for channel in range(4)
    ]
    return Image.fromarray(np.clip(np.stack(channels, axis=2), 0, 255).astype(np.uint8), "RGBA")


def build_animation(cow: Image.Image) -> list[Image.Image]:
    frames = []
    canvas_size = (360, 500)
    for index in range(24):
        phase = index / 24 * math.tau
        frame = deform_legs(cow, phase)
        angle = math.sin(phase) * 1.5
        frame = frame.rotate(angle, resample=Image.Resampling.BICUBIC, expand=True)
        frame.thumbnail((285, 430), Image.Resampling.LANCZOS)

        canvas = Image.new("RGBA", canvas_size, (0, 0, 0, 0))
        bob = int(abs(math.sin(phase * 2)) * 8)
        x = (canvas_size[0] - frame.width) // 2 + int(math.sin(phase) * 3)
        y = canvas_size[1] - frame.height - 8 - bob
        canvas.alpha_composite(frame, (x, y))
        frames.append(canvas)
    return frames


def main() -> None:
    source = Image.open(SOURCE).convert("RGBA")
    # The requested character is the short orange cow at the lower left.
    orange_cow = source.crop((28, 420, 260, 775))
    cutout = remove(
        orange_cow,
        session=new_session("u2net"),
        alpha_matting=False,
        post_process_mask=True,
    ).convert("RGBA")
    cutout = keep_subject(cutout)
    cutout = trim_alpha(cutout)
    cutout.thumbnail((320, 460), Image.Resampling.LANCZOS)
    cutout.save(CUTOUT)

    frames = build_animation(cutout)
    preview = Image.new("RGBA", (frames[0].width * 4, frames[0].height * 2), (0, 0, 0, 0))
    for slot, frame_index in enumerate((0, 3, 6, 9, 12, 18, 21, 23)):
        preview.alpha_composite(
            frames[frame_index],
            ((slot % 4) * frames[0].width, (slot // 4) * frames[0].height),
        )
    preview.save(PREVIEW)
    frames[0].save(
        ANIMATION,
        save_all=True,
        append_images=frames[1:],
        duration=70,
        loop=0,
        lossless=True,
        method=6,
    )
    print(CUTOUT)
    print(ANIMATION)
    print(PREVIEW)


if __name__ == "__main__":
    main()
