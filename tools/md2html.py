#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Markdown -> HTML de marque rAIme (prêt pour impression PDF, filigrane inclus).
Usage: python tools/md2html.py <fichier.md> <sortie.html> "<sous-titre entete>"
"""
import sys, re, html, os

LOGO = "file:///C:/Users/Lenovo/Projets/rAIme/site/public/logo-mark.png"
MARK = "file:///C:/Users/Lenovo/Projets/rAIme/site/public/butterfly-line.png"

CSS = """
:root{--ink:#111112;--ink2:#5b5854;--ink3:#918d86;--paper:#faf9f6;--line:rgba(0,0,0,.14);
--disp:"Space Grotesk",system-ui,sans-serif;--sans:"Instrument Sans",system-ui,sans-serif;--mono:"Space Mono",monospace}
*{box-sizing:border-box;margin:0;padding:0}
@page{size:A4;margin:15mm 14mm}
body{font-family:var(--sans);color:var(--ink);background:var(--paper);font-size:10.5px;line-height:1.55;
-webkit-print-color-adjust:exact;print-color-adjust:exact}
body::before{content:"";position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);
width:118mm;height:118mm;background:url('__MARK__') center/contain no-repeat;opacity:.038;z-index:0;pointer-events:none}
.wrap{max-width:182mm;margin:0 auto;position:relative;z-index:1}
header.top{display:flex;align-items:flex-end;justify-content:space-between;border-bottom:1.5px solid var(--ink);padding-bottom:11px;margin-bottom:18px}
header.top img{height:38px}
header.top .r{text-align:right;font-family:var(--mono);font-size:8.5px;letter-spacing:.13em;text-transform:uppercase;color:var(--ink2);line-height:1.7}
h1{font-family:var(--disp);font-weight:700;font-size:24px;letter-spacing:-.02em;line-height:1.08;margin:4px 0 10px}
h2{font-family:var(--disp);font-weight:700;font-size:15px;letter-spacing:-.01em;margin:20px 0 8px;padding-top:11px;border-top:1px solid var(--line);page-break-after:avoid}
h3{font-family:var(--disp);font-weight:600;font-size:12px;margin:13px 0 5px;page-break-after:avoid}
p{margin:6px 0}
blockquote{font-family:var(--disp);font-weight:600;font-size:11.5px;line-height:1.4;border-left:2.5px solid var(--ink);padding:5px 0 5px 13px;margin:10px 0;color:var(--ink)}
blockquote p{margin:3px 0}
table{width:100%;border-collapse:collapse;margin:9px 0;font-size:9.5px;page-break-inside:avoid}
th{text-align:left;font-family:var(--mono);font-size:8px;letter-spacing:.1em;text-transform:uppercase;color:var(--ink3);border-bottom:1px solid var(--ink);padding:5px 8px 5px 0;vertical-align:bottom}
td{border-bottom:1px solid var(--line);padding:6px 8px 6px 0;vertical-align:top}
pre{background:#f1efe9;border-radius:5px;padding:10px 12px;font-family:var(--mono);font-size:8px;line-height:1.45;margin:9px 0;white-space:pre;overflow:hidden;page-break-inside:avoid}
code{font-family:var(--mono);font-size:9px;background:#f1efe9;padding:1px 4px;border-radius:3px}
pre code{background:none;padding:0;font-size:8px}
ul,ol{margin:6px 0 6px 17px}li{margin:3px 0}
hr{border:0;border-top:1px solid var(--line);margin:16px 0}
strong{font-weight:600}
footer{margin-top:18px;padding-top:9px;border-top:1px solid var(--line);font-family:var(--mono);font-size:7.5px;letter-spacing:.1em;color:var(--ink3);text-transform:uppercase}
"""

def inline(t):
    t = html.escape(t)
    t = re.sub(r'`([^`]+)`', r'<code>\1</code>', t)
    t = re.sub(r'\*\*([^*]+)\*\*', r'<strong>\1</strong>', t)
    t = re.sub(r'(?<!\*)\*([^*]+)\*(?!\*)', r'<em>\1</em>', t)
    t = re.sub(r'\[\[([^\]]+)\]\]', r'<em>\1</em>', t)
    return t

def convert(md):
    lines = md.split("\n")
    out, i, n = [], 0, len(lines)
    # retirer le frontmatter
    if lines and lines[0].strip() == "---":
        j = 1
        while j < n and lines[j].strip() != "---": j += 1
        lines = lines[j+1:]; n = len(lines); i = 0
    while i < n:
        ln = lines[i]
        s = ln.strip()
        if not s:
            i += 1; continue
        if s.startswith("```"):
            i += 1; buf = []
            while i < n and not lines[i].strip().startswith("```"):
                buf.append(html.escape(lines[i])); i += 1
            i += 1
            out.append("<pre><code>" + "\n".join(buf) + "</code></pre>"); continue
        if re.match(r'^\|.*\|$', s) and i + 1 < n and re.match(r'^\|[\s:_|-]+\|$', lines[i+1].strip()):
            head = [c.strip() for c in s.strip('|').split('|')]
            i += 2; rows = []
            while i < n and re.match(r'^\|.*\|$', lines[i].strip()):
                rows.append([c.strip() for c in lines[i].strip().strip('|').split('|')]); i += 1
            t = "<table><tr>" + "".join(f"<th>{inline(h)}</th>" for h in head) + "</tr>"
            for r in rows:
                t += "<tr>" + "".join(f"<td>{inline(c)}</td>" for c in r) + "</tr>"
            out.append(t + "</table>"); continue
        if s.startswith("#"):
            lvl = len(s) - len(s.lstrip("#"))
            out.append(f"<h{min(lvl,3)}>{inline(s.lstrip('#').strip())}</h{min(lvl,3)}>")
            i += 1; continue
        if s.startswith(">"):
            buf = []
            while i < n and lines[i].strip().startswith(">"):
                buf.append(inline(lines[i].strip().lstrip(">").strip())); i += 1
            out.append("<blockquote>" + "".join(f"<p>{b}</p>" for b in buf if b) + "</blockquote>"); continue
        if re.match(r'^(-{3,}|\*{3,})$', s):
            out.append("<hr>"); i += 1; continue
        if re.match(r'^[-*+]\s+', s) or re.match(r'^\d+[.)]\s+', s):
            ordered = bool(re.match(r'^\d+[.)]\s+', s)); items = []
            while i < n and (re.match(r'^[-*+]\s+', lines[i].strip()) or re.match(r'^\d+[.)]\s+', lines[i].strip())):
                items.append(inline(re.sub(r'^([-*+]|\d+[.)])\s+', '', lines[i].strip()))); i += 1
            tag = "ol" if ordered else "ul"
            out.append(f"<{tag}>" + "".join(f"<li>{it}</li>" for it in items) + f"</{tag}>"); continue
        buf = []
        while i < n and lines[i].strip() and not re.match(r'^(#|>|\||```|[-*+]\s|\d+[.)]\s|-{3,}$)', lines[i].strip()):
            buf.append(lines[i].strip()); i += 1
        if buf: out.append("<p>" + inline(" ".join(buf)) + "</p>")
    return "\n".join(out)

def main():
    src, dst = sys.argv[1], sys.argv[2]
    sub = sys.argv[3] if len(sys.argv) > 3 else "Document interne"
    md = open(src, encoding="utf-8").read()
    body = convert(md)
    doc = f"""<!doctype html><html lang="fr"><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600&family=Space+Grotesk:wght@500;600;700&family=Space+Mono&display=swap" rel="stylesheet">
<style>{CSS.replace('__MARK__', MARK)}</style></head><body><div class="wrap">
<header class="top"><img src="{LOGO}" alt="rAIme"><div class="r">rAIme — conseil &amp; audit IA independant<br>{html.escape(sub)}</div></header>
{body}
<footer>rAIme &middot; document interne &middot; {html.escape(sub)}</footer>
</div></body></html>"""
    open(dst, "w", encoding="utf-8").write(doc)
    print("HTML ecrit:", os.path.basename(dst), len(doc), "octets")

if __name__ == "__main__":
    main()
