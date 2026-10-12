"""Download a generated image and save it as an optimised WebP.   python scripts/img.py <url> <out.webp> [max_width] [quality]"""
import io
import sys
import urllib.request
from PIL import Image

url, out = sys.argv[1], sys.argv[2]
width = int(sys.argv[3]) if len(sys.argv) > 3 else 1920
quality = int(sys.argv[4]) if len(sys.argv) > 4 else 80
data = urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'}), timeout=60).read()
im = Image.open(io.BytesIO(data)).convert('RGB')
if im.width > width:
    im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
im.save(out, 'WEBP', quality=quality, method=6)
import os
print(f'{out}: {im.width}x{im.height} {os.path.getsize(out) // 1024} KB')
