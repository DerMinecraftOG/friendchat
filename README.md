# FriendChat — nur HTML, CSS und JavaScript

Diese Variante benötigt kein React, Vite, npm oder Build-System. Supabase JS wird per CDN eingebunden.

## 1. Supabase vorbereiten

1. Erstelle ein Projekt unter https://supabase.com/.
2. Öffne den **SQL Editor**.
3. Führe den Inhalt von `schema.sql` aus (die Datei liegt in diesem ZIP).
4. Unter **Authentication → URL Configuration** setze lokal `http://localhost:5500` als Site URL und Redirect URL.
5. In den Auth-Einstellungen kannst du E-Mail-Bestätigung eingeschaltet lassen.

## 2. Schlüssel eintragen

Öffne `script.js` und ändere diese beiden Zeilen:

```js
const SUPABASE_URL = 'https://DEIN-PROJEKT.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'DEIN_PUBLISHABLE_KEY';
```

Nutze nur den Publishable Key (oder legacy anon key), niemals einen `service_role`- oder Secret Key im Browser.

## 3. Starten

Am einfachsten mit VS Code:
- Installiere die Erweiterung **Live Server**.
- Öffne den Ordner.
- Rechtsklick auf `index.html` → **Open with Live Server**.
- Normalerweise öffnet sich `http://127.0.0.1:5500`.

Alternativ einen lokalen statischen Server verwenden. Für Supabase Auth sollten URL und Redirect-URLs genau übereinstimmen. Öffne die HTML-Datei nicht direkt als `file://`.

## 4. Testen

- Registriere zwei Testkonten.
- Bestätige ggf. beide E-Mail-Adressen.
- Konto A sendet eine Freundschaftsanfrage an den Benutzernamen von Konto B.
- Konto B nimmt die Anfrage an.
- Teste Live-Chat, Emojis, Bearbeiten/Löschen, Profilbild, Banner und Dark Mode.

## Sicherheit

- RLS muss aktiv sein. `schema.sql` erstellt Tabellen, Policies, RPC-Funktionen und den `profile-media` Storage-Bucket.
- Profilinformationen sind für angemeldete Nutzer lesbar. Bilder im Profil-Bucket sind öffentlich lesbar, Uploads sind aber auf den eigenen Benutzerordner begrenzt.
- Chat-Nachrichten können nur zwischen angenommenen Freunden gelesen/gesendet werden, solange die bereitgestellten RLS-Policies aktiv sind.
- Vor einem öffentlichen Launch ergänze Rate Limits, Spam-Schutz, Blockieren/Melden, Datenschutzhinweise und teste RLS mit mehreren Konten.
- Diese Starter-Version verwendet normale Datenbanknachrichten, keine Ende-zu-Ende-Verschlüsselung.
