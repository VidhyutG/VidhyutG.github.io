"""Render the share card using the site's fonts and conceptual board; no network calls."""
from pathlib import Path
import json, math, os, subprocess
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
S = 2
W, H = 1200, 630
board = json.loads(subprocess.check_output([
    os.environ.get("NODE_BINARY", "node"), "--input-type=module", "-e",
    "import {generateBoard} from './assets/js/exhibit/generate.js';"
    "console.log(JSON.stringify(generateBoard(0x3FA2)));",
], cwd=ROOT, text=True))

def font(size, weight=600):
    face = ImageFont.truetype(str(ROOT / "assets/fonts/sofia-sans-latin.woff2"), round(size*S))
    face.set_variation_by_axes([weight if a["name"] == b"Weight" else a["default"] for a in face.get_variation_axes()])
    return face

im = Image.new("RGB", (W*S, H*S))
px = im.load()
for y in range(H*S):
    for x in range(W*S):
        blue = math.exp(-(((x/S-1080)/560)**2 + ((y/S-120)/450)**2)) * 0.65
        px[x,y] = tuple(round(a+(b-a)*blue) for a,b in zip((246,241,231),(166,210,245)))
d = ImageDraw.Draw(im)

def line(points, color, width=1):
    d.line([(round(x*S),round(y*S)) for x,y in points], fill=color, width=max(1,round(width*S)), joint="curve")

def text(x,y,value,size,color="#13263a",weight=600):
    d.text((round(x*S),round(y*S)), value, font=font(size,weight), fill=color)

def poly(points, color, outline=None):
    d.polygon([(round(x*S),round(y*S)) for x,y in points], fill=color, outline=outline, width=2*S)

def project(x,y,k):
    x,y=(x-30)*10,(y-20)*10
    a=math.radians(-28)
    return 880+0.65*(x*math.cos(a)-y*math.sin(a)), 353+0.65*0.57*(x*math.sin(a)+y*math.cos(a))-k*72

for k,color in enumerate(["#173954","#cfdfed","#e8f2f9"]):
    corners=[project(x,y,k) for x,y in [(0,0),(60,0),(60,40),(0,40)]]
    poly([(x,y+6) for x,y in corners], "#7ca5c8" if k else "#091f34")
    poly(corners,color,"#fcfeff" if k else "#80aecf")
    for net in board["layers"][k]["nets"]:
        points=zip(net["points"][::2],net["points"][1::2])
        line([project(x,y,k) for x,y in points], "#9ccbec" if k==0 else "#609ac8",0.9)
    for part in board["layers"][k]["parts"]:
        a,b,c,e=part["x0"],part["y0"],part["x1"],part["y1"]
        poly([project(x,y,k) for x,y in [(a,b),(c,b),(c,e),(a,e)]], "#173954" if part["kind"]!="block" else "#eaf4fc","#96bad5")
    for via in board["vias"]:
        if via["lower"]!=k or k==2: continue
        p0,p1=project(via["x"],via["y"],k),project(via["x"],via["y"],k+1)
        line([p0,p1],"#c1932f",1)
        x,y=p0
        d.ellipse(((x-2.5)*S,(y-2.5)*S,(x+2.5)*S,(y+2.5)*S),fill="#e7c46c")

# The monogram is projected as dots, like its live counterpart.
mask=Image.new("L",(320,180))
ImageDraw.Draw(mask).text((12,-10),"VG",font=font(90,760),fill=255)
for y in range(0,180,5):
    for x in range(0,320,5):
        if mask.getpixel((x,y))>150:
            a,b=project(30+(x-160)/18,20+(y-90)/18,2)
            d.ellipse(((a-.8)*S,(b-.8)*S,(a+.8)*S,(b+.8)*S),fill="#f2faff")

d.ellipse((58*S,37*S,96*S,75*S),outline="#b7c8d8",width=2*S)
line([(64,56),(72,56),(78,65),(84,44),(89,56),(94,56)],"#13263a",2.3)
d.ellipse((91*S,53*S,97*S,59*S),fill="#c1932f")
text(111,37,"Vidhyut Gopinath",28,weight=680)
text(60,122,"I bring",110,weight=740)
text(60,229,"firewalls",110,weight=740)
text(60,336,"to life.",110,"#1763ad",740)
line([(60,516),(1140,516)],"#b6cadb")
text(60,544,"Software Engineer IV / Cisco Secure Firewall",25,weight=650)
text(60,584,"Hardware bring-up. Platform software. Engineering leadership.",20,"#41526a",450)
text(983,549,"vidhyutg.github.io",18,"#1763ad",600)
im.resize((W,H),Image.Resampling.LANCZOS).save(ROOT/"assets/img/social-preview.png",optimize=True)
print("Built social-preview.png (1200 x 630)")
