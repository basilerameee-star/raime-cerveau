# -*- coding: utf-8 -*-
"""Relais de sortie IPv6 de l'Envoyeur (07/10/2026), sur l'hôte, sans dépendance.

Pourquoi : le réseau Docker n'a que l'IPv4, et jobup.ch / jobs.ch (CloudFront) refusent l'IPv4 du serveur depuis le
06/10 au soir (403), alors que son IPv6 passe. Ce relais HTTP CONNECT écoute UNIQUEMENT sur la passerelle du réseau
Docker interne (172.18.0.1:3128, jamais sur Internet) et ouvre chaque connexion en IPv6 quand la destination en a une,
sinon en IPv4. L'Envoyeur s'en sert par HTTPS_PROXY (collecte) et par l'option proxy de Chromium (envois).
Il ne lit rien du contenu (tunnel TLS de bout en bout) et ne garde aucun journal des pages visitées.

Lancement : service systemd raime-proxy6 (voir installer_proxy6.sh).
"""
import asyncio
import os
import socket

ECOUTE = os.environ.get("PROXY6_ECOUTE", "172.18.0.1")
PORT = int(os.environ.get("PROXY6_PORT", "3128"))
RESEAUX_AUTORISES = ("172.16.", "172.17.", "172.18.", "172.19.", "172.20.", "127.")   # conteneurs Docker et l'hôte


async def ouvrir(hote, port):
    """IPv6 d'abord (c'est tout l'intérêt), IPv4 ensuite."""
    infos = await asyncio.get_running_loop().getaddrinfo(hote, port, type=socket.SOCK_STREAM)
    infos.sort(key=lambda i: 0 if i[0] == socket.AF_INET6 else 1)
    derniere = None
    for famille, _, _, _, adresse in infos:
        try:
            return await asyncio.wait_for(asyncio.open_connection(adresse[0], adresse[1], family=famille), 15)
        except Exception as e:
            derniere = e
    raise derniere or OSError("destination injoignable")


async def tuyau(lecteur, ecrivain):
    try:
        while True:
            bloc = await lecteur.read(65536)
            if not bloc:
                break
            ecrivain.write(bloc)
            await ecrivain.drain()
    except Exception:
        pass
    finally:
        try:
            ecrivain.close()
        except Exception:
            pass


async def client(lecteur, ecrivain):
    pair = (ecrivain.get_extra_info("peername") or ("?",))[0]
    try:
        if not pair.startswith(RESEAUX_AUTORISES):
            return
        tete = await asyncio.wait_for(lecteur.readuntil(b"\r\n\r\n"), 20)
        ligne = tete.split(b"\r\n", 1)[0].decode("latin-1").split()
        if len(ligne) < 2 or ligne[0] != "CONNECT":
            ecrivain.write(b"HTTP/1.1 405 Method Not Allowed\r\nContent-Length: 0\r\n\r\n")
            await ecrivain.drain()
            return
        hote, _, port = ligne[1].rpartition(":")
        if not hote or not port.isdigit() or int(port) not in (443, 80):
            ecrivain.write(b"HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\n\r\n")
            await ecrivain.drain()
            return
        try:
            l2, e2 = await ouvrir(hote.strip("[]"), int(port))
        except Exception:
            ecrivain.write(b"HTTP/1.1 502 Bad Gateway\r\nContent-Length: 0\r\n\r\n")
            await ecrivain.drain()
            return
        ecrivain.write(b"HTTP/1.1 200 Connection Established\r\n\r\n")
        await ecrivain.drain()
        await asyncio.gather(tuyau(lecteur, e2), tuyau(l2, ecrivain))
    except Exception:
        pass
    finally:
        try:
            ecrivain.close()
        except Exception:
            pass


async def main():
    serveur = await asyncio.start_server(client, ECOUTE, PORT, limit=1 << 16)
    print("relais IPv6 à l'écoute sur %s:%d" % (ECOUTE, PORT), flush=True)
    async with serveur:
        await serveur.serve_forever()


if __name__ == "__main__":
    asyncio.run(main())
