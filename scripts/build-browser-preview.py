#!/usr/bin/env python3
"""Build a reproducible, dependency-free coaching preview ZIP from tracked sources."""
from pathlib import Path
import hashlib,json,zipfile,re
ROOT=Path(__file__).resolve().parents[1]
FILES=['index.html','manifest.webmanifest','service-worker.js','src/rules-v1.js','src/search-v1.js','src/zones-v1.js','src/hints-ui.js','src/hints-ui.css','icons/icon-192.png','icons/icon-512.png','apple-touch-icon.png']
entries={name:(ROOT/name).read_bytes() for name in FILES}
# Package-only presentation: avoid exposing optional tools whose models are not shipped.
html=entries['index.html'].decode()
html=html.replace('</head>','<style>#cameraCaptureBtn,#analyzePhotoBtn,#photoAnalyzerModal{display:none!important}</style>\n</head>',1)
html=html.replace("if ('serviceWorker' in navigator) {", "if ('serviceWorker' in navigator && location.protocol !== 'file:') {")
html=re.sub(r'\n  <div id="btFeedbackModal"[\s\S]*?(?=\n</body>)','',html)
html=re.sub(r'<link[^>]+href="\./beta[^"]*"[^>]*>','',html)
entries['index.html']=html.encode()
entries['START-HERE.html']=(ROOT/'preview/START-HERE.html').read_bytes()
entries['README.txt']=b'Hints Trainer V1 browser preview\n\nExtract all files, then open START-HERE.html in a desktop browser.\nKeep the folder together. No Python or Node installation is needed to use it.\nThis is not a native Android/Windows installer. Optional photo models are excluded.\n'
manifest={name:{'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()} for name,data in sorted(entries.items())}
entries['BUILD-CONTENTS.json']=(json.dumps({'format':1,'files':manifest},indent=2)+'\n').encode()
output=ROOT/'releases/Hints-Trainer-V1-Browser-Preview.zip';output.parent.mkdir(exist_ok=True)
with zipfile.ZipFile(output,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as archive:
 for name,data in sorted(entries.items()):
  info=zipfile.ZipInfo('Hints-Trainer-V1-Preview/'+name,date_time=(2026,1,1,0,0,0))
  info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=0o644<<16
  archive.writestr(info,data,compress_type=zipfile.ZIP_DEFLATED,compresslevel=9)
print(json.dumps({'archive':str(output.relative_to(ROOT)),'bytes':output.stat().st_size,'sha256':hashlib.sha256(output.read_bytes()).hexdigest(),'files':len(entries)},indent=2))
