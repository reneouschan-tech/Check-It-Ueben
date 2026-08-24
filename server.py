import cgi
import json
import os
import shutil
import subprocess
import sys
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


ROOT = Path(__file__).resolve().parent
IMPORTS = ROOT / "work" / "uploads"


class CheckItHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_POST(self):
        if self.path != "/api/import-pdf":
            self.send_error(HTTPStatus.NOT_FOUND, "Unknown endpoint")
            return
        try:
            dataset = self.handle_pdf_import()
            self.send_json(
                {
                    "ok": True,
                    "count": dataset.get("count", len(dataset.get("questions", []))),
                    "dataset": dataset,
                }
            )
        except Exception as exc:
            self.send_json({"ok": False, "error": str(exc)}, status=HTTPStatus.BAD_REQUEST)

    def handle_pdf_import(self):
        content_type = self.headers.get("Content-Type", "")
        if "multipart/form-data" not in content_type:
            raise ValueError("Bitte eine PDF-Datei hochladen.")

        form = cgi.FieldStorage(
            fp=self.rfile,
            headers=self.headers,
            environ={
                "REQUEST_METHOD": "POST",
                "CONTENT_TYPE": content_type,
            },
        )
        field = form["pdf"] if "pdf" in form else None
        if field is None or not getattr(field, "filename", ""):
            raise ValueError("Keine PDF-Datei gefunden.")
        if not field.filename.lower().endswith(".pdf"):
            raise ValueError("Nur PDF-Dateien koennen automatisch umgewandelt werden.")

        IMPORTS.mkdir(parents=True, exist_ok=True)
        pdf_path = IMPORTS / Path(field.filename).name
        with pdf_path.open("wb") as stream:
            shutil.copyfileobj(field.file, stream)

        command = [
            sys.executable,
            str(ROOT / "tools" / "import_pdf.py"),
            str(pdf_path),
            "--out",
            str(ROOT),
        ]
        result = subprocess.run(command, cwd=str(ROOT), text=True, capture_output=True)
        if result.returncode != 0:
            detail = result.stderr.strip() or result.stdout.strip()
            raise RuntimeError(f"Import fehlgeschlagen: {detail}")

        data_path = ROOT / "data" / "questions.json"
        return json.loads(data_path.read_text(encoding="utf-8"))

    def send_json(self, payload, status=HTTPStatus.OK):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else int(os.environ.get("PORT", "8765"))
    host = os.environ.get("HOST", "0.0.0.0")
    server = ThreadingHTTPServer((host, port), CheckItHandler)
    print(f"Check It server running at http://{host}:{port}/")
    server.serve_forever()


if __name__ == "__main__":
    main()
