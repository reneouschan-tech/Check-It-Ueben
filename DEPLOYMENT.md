# Check It online machen

Das ist der einfache Weg:

## Was wir benutzen
- **Render** als kostenloser Server
- **Wix** nur zum Einbetten der fertigen App

## Schritt 1 - GitHub vorbereiten
1. Erstelle auf GitHub ein neues Repository.
2. Lade den gesamten Ordner `ett-trainer` hoch.
3. Achte darauf, dass diese Dateien im Repo liegen:
   - `server.py`
   - `requirements.txt`
   - `render.yaml`
   - `index.html`
   - `app.js`
   - `styles.css`
   - `data/questions.json`

## Schritt 2 - Render anlegen
1. Öffne [render.com](https://render.com).
2. Melde dich kostenlos an.
3. Klicke auf **New**.
4. Wähle **Web Service**.
5. Verbinde dein GitHub-Repository.
6. Nimm den kostenlosen Plan.

## Schritt 3 - Build und Start
Wenn Render nach Build- und Startbefehl fragt, nimm:

**Build Command**
```bash
python -m pip install -r requirements.txt
```

**Start Command**
```bash
python server.py
```

## Schritt 4 - Deploy
1. Klicke auf **Deploy**.
2. Warte, bis Render fertig ist.
3. Du bekommst eine URL wie `https://dein-name.onrender.com`.

## Schritt 5 - App testen
1. Öffne die Render-URL im Browser.
2. Prüfe, ob die Fragen laden.
3. Teste den PDF-Import über den Button **PDF/Fragensatz importieren**.
4. Gib den Code ein.
5. Wähle eine PDF-Datei aus.

## Schritt 6 - In Wix einbauen
1. Öffne deine Wix-Seite.
2. Gehe in den Editor.
3. Wähle **Add Elements**.
4. Wähle **Embed Code**.
5. Wähle **Embed a Site** oder **HTML iframe**.
6. Trage die Render-URL ein.
7. Veröffentliche die Wix-Seite.

## Wichtig
- Die App braucht **HTTPS**.
- Google Drive ist **kein Server** für diese App.
- Der PDF-Import braucht den Server, weil dort die PDF in JSON umgewandelt wird.
- Auf Free-Hosting kann der Server nach einer Weile schlafen.
- Der Build braucht **kein apt-get** mehr.

## Was du am Ende benutzt
- Wenn du einfach lernen willst: direkt die **Render-URL** am Handy öffnen.
- Wenn die Seite auf deiner Homepage sein soll: die **Render-URL in Wix einbetten**.
