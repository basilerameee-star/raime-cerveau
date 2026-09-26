"""Transforme le maillage facial canonique de MediaPipe en particules pour le visage de Jarvis.

Source : google-ai-edge/mediapipe, mediapipe/modules/face_geometry/data/canonical_face_model.obj
(licence Apache 2.0). 468 sommets, 898 triangles ; z vers l'observateur.
    python3 tools/visage_particules.py canonical_face_model.obj > jarvis/interface/visage.js
Chaque particule : position (x, y, z) et normale (nx, ny, nz), plus son rôle : 0 peau, 1 iris,
2 lèvre du haut, 3 lèvre du bas et menton (s'ouvrent avec la voix), 4 paupière.
"""
import base64, math, random, struct, sys

random.seed(26092026)
V, F = [], []
for l in open(sys.argv[1]):
    p = l.split()
    if p and p[0] == 'v': V.append(tuple(map(float, p[1:4])))
    if p and p[0] == 'f': F.append(tuple(int(t.split('/')[0]) - 1 for t in p[1:4]))

sub = lambda a, b: (a[0] - b[0], a[1] - b[1], a[2] - b[2])
croix = lambda a, b: (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])
milieu = lambda *ids: tuple(sum(V[i][k] for i in ids) / len(ids) for k in range(3))

# Repères MediaPipe : lèvres intérieures 13 (haut) et 14 (bas) ; œil gauche 159/145, 33/133 ; œil droit 386/374, 362/263.
bouche = milieu(13, 14)
yeux = [milieu(159, 145, 33, 133), milieu(386, 374, 362, 263)]
larg_oeil = [abs(V[33][0] - V[133][0]) / 2, abs(V[362][0] - V[263][0]) / 2]

aires, normales = [], []
for a, b, c in F:
    n = croix(sub(V[b], V[a]), sub(V[c], V[a]))
    l = math.hypot(*n) or 1
    aires.append(l / 2)
    n = (n[0] / l, n[1] / l, n[2] / l)
    normales.append(n if n[2] >= 0 else (-n[0], -n[1], -n[2]))
total = sum(aires)

def role(p):
    for e, w in zip(yeux, larg_oeil):
        d = math.hypot((p[0] - e[0]) / w, (p[1] - e[1]) / (w * .75))
        if d < .45: return 1
        if d < 1.05: return 4
    dx, dy = abs(p[0] - bouche[0]), p[1] - bouche[1]
    if dx < 3.2 and 0 <= dy < 1.3: return 2
    if dx < 3.6 and -4.2 < dy < 0: return 3
    return 0

pts = []
N = 6000
for i in range(N):
    r = random.random() * total
    k = 0
    while r > aires[k]: r -= aires[k]; k += 1
    a, b, c = (V[j] for j in F[k])
    u, v = random.random(), random.random()
    if u + v > 1: u, v = 1 - u, 1 - v
    p = tuple(a[m] + u * (b[m] - a[m]) + v * (c[m] - a[m]) for m in range(3))
    pts.append((p, normales[k]))
# les iris : des particules en plus sur les triangles de l'œil, pour que le regard se voie
iris = [k for k, f in enumerate(F) if role(milieu(*f)) in (1, 4) and min(math.hypot(milieu(*f)[0] - e[0], milieu(*f)[1] - e[1]) / w for e, w in zip(yeux, larg_oeil)) < .55]
while sum(1 for _, _, r in [(0, 0, role(q)) for q, _ in pts] if r == 1) < 260 and iris:
    k = random.choice(iris); a, b, c = (V[j] for j in F[k]); u, v = random.random(), random.random()
    if u + v > 1: u, v = 1 - u, 1 - v
    q = tuple(a[m] + u * (b[m] - a[m]) + v * (c[m] - a[m]) for m in range(3))
    if role(q) == 1: pts.append((q, normales[k]))
for i, p in enumerate(V):  # les sommets eux-mêmes : les traits restent nets
    pts.append((p, normales[next(k for k, f in enumerate(F) if i in f)]))

cx = sum(p[0] for p, _ in pts) / len(pts); cy = sum(p[1] for p, _ in pts) / len(pts); cz = sum(p[2] for p, _ in pts) / len(pts)
ech = max(max(abs(p[0] - cx), abs(p[1] - cy)) for p, _ in pts)
buf = bytearray()
for p, n in pts:
    q = [round((p[0] - cx) / ech * 30000), round((p[1] - cy) / ech * 30000), round((p[2] - cz) / ech * 30000)]
    buf += struct.pack('<hhhbbbb', *q, *(round(x * 120) for x in n), role(p))
cen = lambda e: [round((e[0] - cx) / ech, 4), round((e[1] - cy) / ech, 4)]
print('// Généré par tools/visage_particules.py depuis le maillage canonique de MediaPipe (Apache 2.0). Ne pas modifier à la main.')
print('window.VISAGE = { n: %d, bouche: %s, yeux: [%s, %s], donnees: "%s" };'
      % (len(pts), cen(bouche), cen(yeux[0]), cen(yeux[1]), base64.b64encode(bytes(buf)).decode()))
