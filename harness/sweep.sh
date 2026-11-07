#!/bin/bash
# Usage: ./sweep.sh <name> [NOSKIN]   -> shots/<name>/*.png + contact sheets shots/<name>-sheet-N.png
cd "$(dirname "$0")"
NAME=$1
M='00:0B:6C:AA:BB:CC'
ROUTES=(
 '#/tabs/favorites' '#/tabs/controls' '#/tabs/controls-home/1' "#/tabs/favorites-device-detail/1/$M" '#/tabs/settings/false'
 '#/tabs/settings-home/1' "#/tabs/settings-device-setup/1/$M" "#/tabs/settings-about/1/$M" '#/tabs/settings-all-logs/1' '#/tabs/settings-connection-mode'
 '#/tabs/settings-add-device/1' '#/tabs/settings-add-new-device/1' '#/tabs/settings-user-pairing-request/1' "#/tabs/settings-triggers/1/$M" "#/tabs/device-users/1/$M"
 '#/start' '#/start-home' '#/start-email' '#/benvenuto/1' '#/connetti-IT4WIFI' '#/rete-wifi' '#/ricerca-dispositivo' '#/accendi-dispositivo' '#/scelta-accessorio' '#/start-add-device-setup-name'
)
if [ -n "$2" ]; then export NOSKIN=1; fi
export DSF=1 WAIT=${WAIT:-1100}
node screens.cjs "$NAME" "${ROUTES[@]}" 2>&1 | grep -E "problems|pageerror|console:|HARNESS|  console|  pageerror"
python3 - "$NAME" <<'PY'
import sys, glob, os
from PIL import Image, ImageDraw
name=sys.argv[1]
d=os.path.join('shots',name)
fs=sorted(glob.glob(d+'/*.png'))
# keep the order of the routes: by modification time
fs.sort(key=os.path.getmtime)
per=8
for b in range(0,len(fs),per):
    group=fs[b:b+per]
    ims=[Image.open(f).convert('RGB') for f in group]
    w,h=ims[0].size
    sc=0.5
    tw,th=int(w*sc),int(h*sc)
    sheet=Image.new('RGB',(tw*4+5*8,(th+22)*2+3*8),(60,60,60))
    dr=ImageDraw.Draw(sheet)
    for i,(f,im) in enumerate(zip(group,ims)):
        x=8+(i%4)*(tw+8); y=8+(i//4)*(th+22+8)
        sheet.paste(im.resize((tw,th)),(x,y+18))
        dr.text((x,y+2),os.path.basename(f)[:34],fill=(255,255,0))
    out=os.path.join('shots',f'{name}-sheet-{b//per+1}.png')
    sheet.save(out); print(out)
PY
