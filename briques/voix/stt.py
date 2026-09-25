# -*- coding: utf-8 -*-
"""LA VOIX DE BASILE -> TEXTE, sur le serveur de rAIme (souverain : rien ne part ailleurs).

faster-whisper (modele « small », quantifie int8, processeur) : une phrase dite en francais devient
du texte en une a deux secondes. Service interne au reseau Docker, jamais expose.

    POST /transcrire   corps = l'audio brut (webm/opus du navigateur, wav, mp3…), 8 Mo au plus
                       -> {"texte": "...", "duree": 3.2, "langue": "fr"}
    POST /parler       corps = {"texte": "..."} (1 500 caractères au plus) -> audio/wav, voix française Piper
    GET  /sante        -> ok
"""
import io
import json
import os
import tempfile
import time
import wave
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from faster_whisper import WhisperModel

MODELE = os.environ.get("VOIX_MODELE", "small")
TAILLE_MAX = 8 * 1024 * 1024
modele = WhisperModel(MODELE, device="cpu", compute_type="int8", cpu_threads=int(os.environ.get("VOIX_FILS", "4")),
                      download_root="/modeles")

# La voix qui répond : Piper (libre), modèle français « siwis » ; tout reste sur le serveur.
try:
    from piper import PiperVoice
    VOIX = PiperVoice.load(os.environ.get("VOIX_TTS", "/voix/fr_FR-siwis-medium.onnx"))
except Exception:  # sans voix, la transcription continue de servir
    VOIX = None


class Voix(BaseHTTPRequestHandler):
    def repondre(self, code, donnees):
        corps = json.dumps(donnees, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(corps)))
        self.end_headers()
        self.wfile.write(corps)

    def do_GET(self):
        if self.path == "/sante":
            return self.repondre(200, {"etat": "ok", "modele": MODELE, "voix": VOIX is not None})
        self.repondre(404, {"erreur": "inconnu"})

    def parler(self):
        n = int(self.headers.get("Content-Length") or 0)
        try:
            texte = str(json.loads(self.rfile.read(min(n, 20000)) or b"{}").get("texte", "")).strip()[:1500]
        except ValueError:
            texte = ""
        if not texte or VOIX is None:
            return self.repondre(422, {"erreur": "texte vide ou voix absente"})
        tampon = io.BytesIO()
        with wave.open(tampon, "wb") as w:
            VOIX.synthesize_wav(texte, w)
        corps = tampon.getvalue()
        self.send_response(200)
        self.send_header("Content-Type", "audio/wav")
        self.send_header("Content-Length", str(len(corps)))
        self.end_headers()
        self.wfile.write(corps)

    def do_POST(self):
        if self.path == "/parler":
            return self.parler()
        if self.path != "/transcrire":
            return self.repondre(404, {"erreur": "inconnu"})
        n = int(self.headers.get("Content-Length") or 0)
        if n <= 0 or n > TAILLE_MAX:
            return self.repondre(413, {"erreur": "audio vide ou trop long"})
        audio = self.rfile.read(n)
        debut = time.time()
        with tempfile.NamedTemporaryFile(suffix=".audio") as f:
            f.write(audio)
            f.flush()
            try:
                segments, info = modele.transcribe(f.name, language="fr", beam_size=1, vad_filter=True)
                texte = " ".join(s.text.strip() for s in segments).strip()
            except Exception as e:  # un audio illisible ne fait pas tomber le service
                return self.repondre(422, {"erreur": "audio illisible : %s" % str(e)[:200]})
        self.repondre(200, {"texte": texte, "duree": round(time.time() - debut, 2), "langue": "fr"})

    def log_message(self, *args):
        pass  # aucune trace de ce que Basile dit dans les journaux


if __name__ == "__main__":
    ThreadingHTTPServer(("0.0.0.0", 9000), Voix).serve_forever()
