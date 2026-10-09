"""Contact sheet: python3 tools/sheet.py out.png a.png b.png ... [--cols 2] [--width 900]"""
import sys
from PIL import Image

args = sys.argv[1:]
cols = 2
width = 900
if '--cols' in args:
    i = args.index('--cols'); cols = int(args[i + 1]); del args[i:i + 2]
if '--width' in args:
    i = args.index('--width'); width = int(args[i + 1]); del args[i:i + 2]
out, files = args[0], args[1:]
ims = [Image.open(f).convert('RGB') for f in files]
ims = [im.resize((width, int(im.height * width / im.width))) for im in ims]
rows = (len(ims) + cols - 1) // cols
hmax = max(im.height for im in ims)
sheet = Image.new('RGB', (cols * width + (cols - 1) * 6, rows * hmax + (rows - 1) * 6), (30, 30, 30))
for k, im in enumerate(ims):
    sheet.paste(im, ((k % cols) * (width + 6), (k // cols) * (hmax + 6)))
sheet.save(out)
