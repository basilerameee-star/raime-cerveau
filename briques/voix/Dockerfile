# La voix de Basile -> texte (faster-whisper) et le texte -> une voix française (Piper), sur le processeur.
# Image officielle Python, paquets PyPI officiels ; la voix Piper vient du dépôt officiel rhasspy/piper-voices.
FROM python:3.12-slim
RUN pip install --no-cache-dir faster-whisper==1.1.1 requests piper-tts==1.8.0 \
 && useradd -u 1000 -m voix && mkdir /modeles /voix \
 && python -m piper.download_voices --data-dir /voix fr_FR-siwis-medium \
 && chown -R voix /modeles /voix
COPY stt.py /app/stt.py
USER voix
WORKDIR /app
EXPOSE 9000
CMD ["python", "stt.py"]
