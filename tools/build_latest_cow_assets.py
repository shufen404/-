from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter
from scipy.ndimage import binary_dilation, binary_fill_holes


ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path(r"C:\Users\Mirro\Desktop\20260819-181256.png")
ASSETS = ROOT / "assets"
STATIC = ASSETS / "niulai-static.png"
MOUTH = ASSETS / "niulai-speaking.png"


def remove_green(image: Image.Image) -> Image.Image:
    rgba = np.asarray(image.convert("RGBA")).copy()
    rgb = rgba[:, :, :3].astype(np.int16)
    green = (rgb[:, :, 1] > rgb[:, :, 0] * 1.16) & (rgb[:, :, 1] > rgb[:, :, 2] * 1.08) & (rgb[:, :, 1] > 65)
    alpha = np.where(green, 0, 255).astype(np.uint8)
    alpha = binary_fill_holes(alpha > 0)
    alpha = binary_dilation(alpha, iterations=1)
    rgba[:, :, 3] = (alpha * 255).astype(np.uint8)
    result = Image.fromarray(rgba, "RGBA")
    bbox = result.getchannel("A").getbbox()
    if not bbox:
        raise RuntimeError("No cow subject detected")
    pad = 12
    bbox = (max(0, bbox[0] - pad), max(0, bbox[1] - pad), min(result.width, bbox[2] + pad), min(result.height, bbox[3] + pad))
    return result.crop(bbox)


def add_outline(image: Image.Image, width: int = 14) -> Image.Image:
    alpha = np.asarray(image.getchannel("A")) > 8
    expanded = binary_dilation(alpha, iterations=width)
    outline = Image.new("RGBA", image.size, (255, 255, 255, 0))
    outline.putalpha(Image.fromarray((expanded * 255).astype(np.uint8)))
    output = Image.alpha_composite(outline, image)
    return output


def deepen_color(image: Image.Image) -> Image.Image:
    """Increase separation from the transparent desktop and deepen the orange coat."""
    alpha = image.getchannel("A")
    rgb = image.convert("RGB")
    rgb = ImageEnhance.Contrast(rgb).enhance(1.18)
    rgb = ImageEnhance.Color(rgb).enhance(1.02)
    rgb = ImageEnhance.Brightness(rgb).enhance(0.97)
    pixels = np.asarray(rgb).copy()
    orange = (pixels[:, :, 0] > pixels[:, :, 1] * 1.08) & (pixels[:, :, 1] > pixels[:, :, 2] * 1.08)
    pixels[orange, 0] = np.clip(pixels[orange, 0].astype(np.int16) * 1.01, 0, 255)
    pixels[orange, 1] = np.clip(pixels[orange, 1].astype(np.int16) * 0.96, 0, 255)
    pixels[orange, 2] = np.clip(pixels[orange, 2].astype(np.int16) * 0.92, 0, 255)
    result = Image.fromarray(pixels.astype(np.uint8), "RGB").convert("RGBA")
    result.putalpha(alpha)
    return result


def make_mouth_open(image: Image.Image) -> Image.Image:
    output = image.copy()
    draw = ImageDraw.Draw(output)
    # Open the existing horizontal mouth seam without changing the rest of the face.
    x0, y0 = output.width * 0.36, output.height * 0.625
    x1, y1 = output.width * 0.64, output.height * 0.695
    draw.ellipse((x0, y0, x1, y1), fill=(35, 18, 16, 255), outline=(0, 0, 0, 255), width=max(2, int(output.width * 0.008)))
    draw.ellipse((x0 + (x1-x0)*0.22, y0 + (y1-y0)*0.43, x1 - (x1-x0)*0.22, y1 - (y1-y0)*0.08), fill=(208, 96, 87, 255))
    return output


def main() -> None:
    subject = remove_green(Image.open(SOURCE))
    subject.thumbnail((420, 520), Image.Resampling.LANCZOS)
    subject = deepen_color(subject)
    subject = add_outline(subject, width=14)
    subject.save(STATIC)
    make_mouth_open(subject).save(MOUTH)
    print(STATIC)
    print(MOUTH)


if __name__ == "__main__":
    main()
