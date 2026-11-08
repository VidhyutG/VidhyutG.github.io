"""Generate the portfolio's typography-led social share card from its own fonts."""
from pathlib import Path
from tempfile import TemporaryDirectory
import urllib.request, re
from PIL import Image, ImageDraw, ImageFont

root = Path(__file__).resolve().parents[1]
with TemporaryDirectory() as tmp:
    request = urllib.request.Request('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500', headers={'User-Agent':'Mozilla/5.0'})
    css = urllib.request.urlopen(request).read().decode()
    url = re.findall(r'url\((https://[^)]+)\)', css)[-1]
    (Path(tmp) / 'display.ttf').write_bytes(urllib.request.urlopen(url).read())
    def face(size): return ImageFont.truetype(str(Path(tmp) / 'display.ttf'), size)
    scale = 2
    image = Image.new('RGB', (1200 * scale, 630 * scale), '#eaf0f6')
    draw = ImageDraw.Draw(image)
    def text(x,y,s,size,color='#172a3c'): draw.text((x*scale,y*scale),s,font=face(size*scale),fill=color)
    draw.line((60*scale,95*scale,1140*scale,95*scale),fill='#becfdd',width=scale)
    text(60,28,'vg.',42)
    text(142,39,'Vidhyut Gopinath',21)
    text(810,43,'CISCO / SOFTWARE ENGINEER IV',14,'#526e86')
    text(60,143,'I bring',96)
    text(60,243,'firewalls',96)
    text(60,343,'to life.',96,'#638caf')
    for y,fill,stroke in [(333,'#234760','#17344e'),(278,'#b8d2e5','#7d9fb8'),(220,'#d9e8f3','#9ab5c9')]:
        points=[(710,y),(966,y-95),(1138,y+25),(881,y+126)]
        draw.polygon([(x*scale,z*scale) for x,z in points],fill=fill,outline=stroke,width=scale*2)
    draw.rounded_rectangle((855*scale,222*scale,1005*scale,319*scale),radius=5*scale,fill='#244760')
    text(882,235,'VG',56,'#c4e0f3')
    text(60,552,'FIREWALL PLATFORMS · HARDWARE BRING-UP · ENGINEERING LEADERSHIP',15,'#4c6c86')
    image.resize((1200,630),Image.Resampling.LANCZOS).save(root/'assets/img/social-preview.png',optimize=True)
