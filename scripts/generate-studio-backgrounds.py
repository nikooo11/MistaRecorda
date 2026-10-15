"""Original MistaRecorda studio backdrops; no third-party imagery or fonts.
Regenerate with Python + Pillow and the project's ffmpeg-static binary.
"""
from pathlib import Path
from PIL import Image, ImageDraw
import math, subprocess

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'public/wallpapers'
W, H = 1920, 1080

def backdrop(name, base, line, kind, phase=0, save=True):
    im = Image.new('RGB', (W, H), base)
    d = ImageDraw.Draw(im)
    if kind == 'grid':
        for x in range(0,W,80): d.line((x,0,x,H), fill=line, width=1)
        for y in range(0,H,80): d.line((0,y,W,y), fill=line, width=1)
        # Long, quiet reference arcs and edge registration marks.
        for r in (560,720,880,1040): d.ellipse((W-r,-r,W+r,r), outline=(38,60,82), width=2)
        for x in range(40,W,160):
            d.line((x,25,x,35),fill=(72,102,126),width=2)
            d.line((x,H-35,x,H-25),fill=(72,102,126),width=2)
        d.rectangle((40,40,W-40,H-40),outline=(51,76,97),width=1)
    elif kind == 'contour':
        for n in range(32):
            points=[]
            for x in range(-20,W+21,8):
                y=H*0.5 + (n-15.5)*47 + 130*math.sin(x/390+n*.045+phase) + 30*math.sin(x/160+n*.15-phase)
                points.append((x,y))
            d.line(points,fill=line if n%4 else (65,86,82),width=1 if n%4 else 2)
    elif kind == 'graphite':
        for x in range(-H,W,96): d.line((x,0,x+H,H),fill=line,width=1)
        for x in (40,W-40): d.line((x,40,x,H-40),fill=(69,71,75),width=1)
        for y in (40,H-40): d.line((40,y,W-40,y),fill=(69,71,75),width=1)
        for x in (40,W-40):
            for y in (40,H-40):
                d.line((x-8,y,x+8,y),fill=(131,133,139),width=1)
                d.line((x,y-8,x,y+8),fill=(131,133,139),width=1)
    else:
        for x in range(24,W,32):
            for y in range(24,H,32): d.ellipse((x,y,x+1,y+1),fill=line)
        d.rectangle((42,42,W-42,H-42),outline=(200,197,188),width=1)
        d.line((42,74,290,74),fill=(130,127,118),width=2)
        d.line((W-290,H-74,W-42,H-74),fill=(130,127,118),width=2)
    if phase or not save:
        # Periodic, independent glints; every frame at 12 seconds joins frame zero.
        for j in range(38):
            x = 54 + ((j * 397 + 59) % (W-108))
            y = 54 + ((j * 181 + 17) % (H-108))
            intensity = max(0, math.sin(phase + j * 2.399)) ** 8
            if intensity > .03:
                bright = (138, 177, 199) if kind == 'grid' else (133, 153, 151)
                c = tuple(round(base[k] + (bright[k]-base[k]) * intensity * .7) for k in range(3))
                r = 2 + round(3 * intensity)
                d.line((x-r,y,x+r,y), fill=c, width=1)
                d.line((x,y-r,x,y+r), fill=c, width=1)
                d.ellipse((x-1,y-1,x+1,y+1), fill=c)
        if kind == 'grid':
            for n in range(5):
                points=[(x, H*.5 + (n-2)*140 + 50*math.sin(x/420+phase+n*.2)) for x in range(-8,W+9,8)]
                d.line(points,fill=(34,61,83),width=2)
    if not save: return im
    dest=OUT/f'studio-{name}.png'
    im.save(dest,optimize=True)
    return dest

for name, base, line, kind, motion in [
 ('blueprint',(17,29,43),(28,44,61),'grid',True),
 ('contour',(24,39,37),(40,60,56),'contour',True),
 ('graphite',(32,33,36),(41,42,46),'graphite',True),
 ('paper',(236,234,227),(199,197,190),'paper',False),
]:
    source=backdrop(name,base,line,kind)
    if motion:
        # Encode real animation as silent 1080p MP4; existing preview/export paths decode it.
        cmd=[str(ROOT/'node_modules/ffmpeg-static/ffmpeg'), '-hide_banner','-loglevel','error','-y',
             '-f','rawvideo','-pixel_format','rgb24','-video_size',f'{W}x{H}', '-framerate','30','-i','-',
             '-an','-c:v','libx264','-preset','fast','-crf','21','-pix_fmt','yuv420p','-movflags','+faststart',str(OUT/f'studio-{name}.mp4')]
        process=subprocess.Popen(cmd,stdin=subprocess.PIPE)
        try:
            for frame in range(360):
                image=backdrop(name,base,line,kind,2*math.pi*frame/360,False)
                process.stdin.write(image.tobytes())
        finally:
            process.stdin.close()
        if process.wait(): raise RuntimeError(f'Encoding failed: {name}')
        print(f'Generated {name}: 12-second seamless motion',flush=True)
