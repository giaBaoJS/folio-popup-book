"""Rotate an inner-panel Duo screenshot to landscape: python3 tools/rot.py in.png out.png [width]"""
import sys
from PIL import Image
im = Image.open(sys.argv[1]).convert('RGB').rotate(-90, expand=True)
w = int(sys.argv[3]) if len(sys.argv) > 3 else im.width
im = im.resize((w, int(im.height * w / im.width)))
im.save(sys.argv[2])
