#!/usr/bin/env python3
"""mdurl markdown rendering server.

Serves markdown files from MARKDOWN_ROOT (default /srv/markdown) over HTTP
with a dark GitHub-style theme and client-side mermaid rendering.

URL pattern:
    GET /                  -> index of all available <user>/<slug>
    GET /<user>/<slug>     -> renders /srv/markdown/<user>/<slug>.md

Configuration via environment:
    MARKDOWN_ROOT          (default /srv/markdown)
    MARKDOWN_LISTEN_HOST   (default 0.0.0.0)
    MARKDOWN_PORT          (default 6420)

Designed to run as a systemd service under a low-priv user (mdview).
"""

import html as html_lib
import http.server
import os
import re
import urllib.parse
from pathlib import Path

import markdown

ROOT = Path(os.environ.get("MARKDOWN_ROOT", "/srv/markdown")).resolve()
HOST = os.environ.get("MARKDOWN_LISTEN_HOST", "0.0.0.0")
PORT = int(os.environ.get("MARKDOWN_PORT", "6420"))

CSS = r"""
html, body { margin: 0 !important; padding: 0 !important; }
.container, .container-md, .container-lg, .container-xl,
main, article, .Box, .Box-body, #readme, #content, #grip-content,
.repository-content, .page, .preview-page {
  max-width: 100% !important;
  width: 100% !important;
  box-sizing: border-box;
}

/* centred reading column with fixed outer gap */
html body #grip-content,
html body article#grip-content,
html body article#grip-content.markdown-body,
html body article.markdown-body,
html body .markdown-body {
  max-width: 1400px !important;
  width: calc(100% - 48px) !important;
  margin: 20px auto !important;
  padding: 32px 48px 40px !important;
  box-sizing: border-box !important;
  border: none !important;
  border-radius: 0 !important;
  display: block !important;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans",
               Helvetica, Arial, sans-serif;
  font-size: 16px;
  line-height: 1.55;
}

/* heading sizes that don't blow up on narrow viewports */
.markdown-body h1 { font-size: clamp(1.5em, 3.6vw, 2em) !important; line-height: 1.2 !important; }
.markdown-body h2 { font-size: clamp(1.3em, 2.8vw, 1.5em) !important; line-height: 1.25 !important; }
.markdown-body h3 { font-size: clamp(1.15em, 2.2vw, 1.25em) !important; line-height: 1.3 !important; }
.markdown-body h1, .markdown-body h2 {
  border-bottom: 1px solid #30363d;
  padding-bottom: 0.3em;
  margin-top: 1.5em;
}
.markdown-body code { word-break: break-word; }

/* tables */
.markdown-body table {
  display: block;
  overflow-x: auto;
  width: 100%;
  max-width: 100%;
  border-collapse: collapse;
  margin: 1em 0;
}
.markdown-body table th, .markdown-body table td {
  border: 1px solid #30363d;
  padding: 8px 14px;
  word-break: normal;
  overflow-wrap: anywhere;
  vertical-align: top;
}
.markdown-body table tr { background: #0d1117; }
.markdown-body table tr:nth-child(2n) { background: #161b22; }
.markdown-body table th { background: #161b22; font-weight: 600; }

/* phones */
@media (max-width: 640px) {
  .markdown-body {
    width: calc(100% - 16px) !important;
    margin: 8px auto !important;
    padding: 16px !important;
    font-size: 15px !important;
  }
  .markdown-body table { font-size: 13px !important; }
}

/* dark theme */
html, body { background: #0d1117 !important; color: #c9d1d9 !important; }
body, .markdown-body, article, main {
  background: #0d1117 !important; color: #c9d1d9 !important;
}
.markdown-body h1, .markdown-body h2, .markdown-body h3,
.markdown-body h4, .markdown-body h5, .markdown-body h6 {
  color: #f0f6fc !important;
}
.markdown-body hr { background: #30363d !important; border-color: #30363d !important; height: 1px; border: 0; }
.markdown-body a { color: #58a6ff !important; text-decoration: none; }
.markdown-body a:hover { text-decoration: underline; }
.markdown-body code, .markdown-body kbd, .markdown-body samp {
  background: #161b22 !important;
  color: #c9d1d9 !important;
  border: 1px solid #30363d;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 0.9em;
}
.markdown-body pre {
  background: #161b22 !important;
  color: #c9d1d9 !important;
  border: 1px solid #30363d;
  padding: 12px 16px;
  border-radius: 6px;
  overflow-x: auto;
}
.markdown-body pre code {
  background: transparent !important;
  border: none;
  padding: 0;
  font-size: 0.85em;
}
.markdown-body blockquote {
  color: #8b949e !important;
  border-left: 4px solid #30363d !important;
  padding: 0 1em;
  margin: 1em 0;
}
.markdown-body img { background: transparent !important; max-width: 100%; }
.markdown-body ul, .markdown-body ol { padding-left: 1.6em; }
.markdown-body li + li { margin-top: 0.25em; }

/* code highlighting from markdown.codehilite (Pygments-like) */
.codehilite { background: transparent; }
.codehilite .k, .codehilite .kd, .codehilite .kn { color: #ff7b72; }
.codehilite .s, .codehilite .s1, .codehilite .s2 { color: #a5d6ff; }
.codehilite .c, .codehilite .c1, .codehilite .cm { color: #8b949e; font-style: italic; }
.codehilite .n, .codehilite .nv { color: #c9d1d9; }
.codehilite .nf, .codehilite .nc { color: #d2a8ff; }
.codehilite .mi, .codehilite .mf, .codehilite .m { color: #79c0ff; }
.codehilite .o { color: #ff7b72; }

/* mermaid box */
.mermaid {
  background: #0d1117;
  color: #c9d1d9;
  padding: 12px;
  margin: 16px 0;
  border: 1px solid #30363d;
  border-radius: 6px;
  text-align: center;
}
.mermaid svg { max-width: 100%; height: auto; }
.mermaid svg text { font-size: 18px !important; }

/* index page styling */
.mdurl-index ul { list-style: none; padding: 0; }
.mdurl-index li { padding: 6px 0; border-bottom: 1px solid #21262d; }
.mdurl-index .user { color: #8b949e; font-size: 0.85em; }
"""

PAGE = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<style>{css}</style>
<script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
</head>
<body>
<article id="grip-content" class="markdown-body">
{body}
</article>
<script>
(function () {{
  function run() {{
    if (!window.mermaid) return;
    try {{
      window.mermaid.initialize({{
        startOnLoad: false,
        theme: 'dark',
        securityLevel: 'loose',
        themeVariables: {{
          fontSize: '20px',
          fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
          background: '#0d1117',
          primaryColor: '#161b22',
          primaryTextColor: '#c9d1d9',
          primaryBorderColor: '#30363d',
          lineColor: '#8b949e',
          secondaryColor: '#21262d',
          tertiaryColor: '#161b22'
        }},
        flowchart: {{ htmlLabels: true, curve: 'basis', nodeSpacing: 60, rankSpacing: 80, padding: 12 }},
        sequence: {{
          actorFontSize: 20, actorFontWeight: 'bold',
          messageFontSize: 18, noteFontSize: 16,
          boxMargin: 14, boxTextMargin: 6, noteMargin: 12, messageMargin: 40,
          width: 200, height: 56
        }},
        classDiagram: {{ fontSize: 18 }}
      }});
      var p = window.mermaid.run({{ querySelector: '.mermaid' }});
      if (p && typeof p.catch === 'function') p.catch(function (e) {{ console.error('mermaid.run failed:', e); }});
    }} catch (e) {{ console.error('mermaid init/run threw:', e); }}
  }}
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  else run();
}})();
</script>
</body>
</html>
"""

# Match fenced ```mermaid blocks before letting the markdown lib touch them.
MERMAID_RE = re.compile(r"```mermaid\s*\n(.*?)\n```", re.DOTALL)


def render_markdown(md_text: str) -> str:
    """Convert markdown to HTML, preserving mermaid blocks as <div class=mermaid>."""
    placeholders: list[str] = []

    def stash(m: re.Match) -> str:
        placeholders.append(m.group(1))
        return f"MERMAID{len(placeholders) - 1}"

    pre = MERMAID_RE.sub(stash, md_text)
    body = markdown.markdown(
        pre,
        extensions=[
            "fenced_code",
            "tables",
            "codehilite",
            "toc",
            "sane_lists",
            "attr_list",
        ],
        extension_configs={"codehilite": {"guess_lang": False, "css_class": "codehilite"}},
    )

    def restore(m: re.Match) -> str:
        idx = int(m.group(1))
        return f'<div class="mermaid">{html_lib.escape(placeholders[idx])}</div>'

    return re.sub(r"MERMAID(\d+)", restore, body)


def index_html() -> str:
    """List every <user>/<slug>.md found under ROOT, grouped by user."""
    by_user: dict[str, list[str]] = {}
    if ROOT.is_dir():
        for f in sorted(ROOT.glob("*/*.md")):
            user = f.parent.name
            slug = f.stem
            by_user.setdefault(user, []).append(slug)

    if not by_user:
        return (
            '<h1>mdurl index</h1>'
            '<p>No documents published yet. Use '
            '<code>mdurl &lt;file.md&gt;</code> to share one.</p>'
        )

    parts = ['<h1>mdurl index</h1>', '<div class="mdurl-index">']
    for user in sorted(by_user):
        parts.append(f'<h2>{html_lib.escape(user)}</h2><ul>')
        for slug in by_user[user]:
            parts.append(
                f'<li><a href="/{html_lib.escape(user)}/{html_lib.escape(slug)}">'
                f'{html_lib.escape(slug)}</a></li>'
            )
        parts.append("</ul>")
    parts.append("</div>")
    return "".join(parts)


def document_title(md_text: str, file_name: str) -> str:
    """The tab carries the document's own title: its first H1; a document without one is named by its file."""
    for line in md_text.splitlines():
        if line.startswith("# "):
            return line[2:].strip()
    return file_name


def render_page(body_html: str, title: str) -> bytes:
    return PAGE.format(title=html_lib.escape(title), css=CSS, body=body_html).encode("utf-8")


class Handler(http.server.BaseHTTPRequestHandler):
    server_version = "mdurl/1.0"

    def do_GET(self) -> None:
        path = urllib.parse.urlparse(self.path).path
        try:
            if path in ("", "/"):
                self._send(render_page(index_html(), "mdurl"))
                return

            slug = path.strip("/")
            target = (ROOT / f"{slug}.md").resolve()
            try:
                target.relative_to(ROOT)
            except ValueError:
                self._error(403, "forbidden")
                return
            if not target.is_file():
                self._error(404, f"no such doc: /{slug}")
                return

            md_text = target.read_text(encoding="utf-8", errors="replace")
            self._send(render_page(render_markdown(md_text), document_title(md_text, target.name)))
        except PermissionError as e:
            self._error(500, f"cannot read file: {e}")
        except Exception as e:  # noqa: BLE001 -- server should not crash
            self._error(500, f"render error: {e}")

    def _send(self, body: bytes) -> None:
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.end_headers()
        self.wfile.write(body)

    def _error(self, code: int, msg: str) -> None:
        body = render_page(
            f'<h1>HTTP {code}</h1><p>{html_lib.escape(msg)}</p>',
            f"mdurl {code}",
        )
        self.send_response(code)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt: str, *args) -> None:
        # quiet by default; systemd journal otherwise drowns
        return


def main() -> None:
    if not ROOT.is_dir():
        raise SystemExit(f"MARKDOWN_ROOT does not exist: {ROOT}")
    print(f"[mdurl] serving {ROOT} at http://{HOST}:{PORT}/", flush=True)
    http.server.HTTPServer((HOST, PORT), Handler).serve_forever()


if __name__ == "__main__":
    main()
