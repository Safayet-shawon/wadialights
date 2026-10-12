"""Download a batch of generated images listed in a JSON file: [[out, max_width, quality, url], ...]
   python scripts/img_batch.py scripts/_urls1.json"""
import io
import json
import os
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from PIL import Image


def fetch(item):
    out, width, quality, url = item
    try:
        data = urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'}), timeout=60).read()
        im = Image.open(io.BytesIO(data)).convert('RGB')
        if im.width > width:
            im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
        os.makedirs(os.path.dirname(out), exist_ok=True)
        im.save(out, 'WEBP', quality=quality, method=6)
        return f'{out}: {im.width}x{im.height} {os.path.getsize(out) // 1024} KB'
    except Exception as e:  # noqa: BLE001
        return f'{out}: FAILED {e}'


items = json.load(open(sys.argv[1], encoding='utf8'))
with ThreadPoolExecutor(6) as ex:
    for line in ex.map(fetch, items):
        print(line)
