from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageChops

root = Path(__file__).resolve().parents[1]
assets = root / 'assets'
source = Image.open(assets / 'video-frame-cutout.png').convert('RGBA')
alpha = source.getchannel('A')

guard = Image.new('L', source.size, 0)
draw = ImageDraw.Draw(guard)
draw.polygon([
    (118,45),(185,50),(245,83),(350,80),(405,45),(448,52),(463,110),
    (470,170),(486,216),(526,264),(477,318),(507,344),(461,380),
    (415,392),(383,414),(335,416),(301,405),(263,416),(213,415),
    (168,404),(120,381),(91,344),(78,284),(88,220),(104,156)
], fill=255)
draw.polygon([
    (145,350),(438,348),(468,397),(475,485),(456,531),(414,555),
    (143,555),(112,520),(108,452),(122,397)
], fill=255)
guard = guard.filter(ImageFilter.GaussianBlur(1.5))
refined = ImageChops.multiply(alpha, guard)
source.putalpha(refined)
source.save(assets / 'pet-cutout-refined.png')
refined.save(assets / 'pet-alpha-refined.png')
print(assets / 'pet-cutout-refined.png')
