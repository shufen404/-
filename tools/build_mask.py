from pathlib import Path
from PIL import Image, ImageFilter
from rembg import remove, new_session
import json

root = Path(__file__).resolve().parents[1]
source = root / 'assets' / 'video-frame.png'
crop_box = (560, 95, 1460, 970)
image = Image.open(source).convert('RGBA').crop(crop_box)
result = remove(image, session=new_session('u2netp'), alpha_matting=False, post_process_mask=True)
alpha = result.getchannel('A')
bbox = alpha.getbbox()
if not bbox:
    raise RuntimeError('No foreground detected')
pad = 34
x0=max(0,bbox[0]-pad); y0=max(0,bbox[1]-pad); x1=min(image.width,bbox[2]+pad); y1=min(image.height,bbox[3]+pad)
alpha = alpha.filter(ImageFilter.GaussianBlur(1.2)).crop((x0,y0,x1,y1))
alpha.save(root / 'assets' / 'pet-alpha-mask.png')
preview = image.crop((x0,y0,x1,y1)); preview.putalpha(alpha); preview.save(root / 'assets' / 'pet-cutout-preview.png')
info={'x':crop_box[0]+x0,'y':crop_box[1]+y0,'w':x1-x0,'h':y1-y0}
(root/'assets'/'pet-mask.json').write_text(json.dumps(info),encoding='utf-8')
print(json.dumps(info))
