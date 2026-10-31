# FriendChat – Vanilla HTML, CSS & JavaScript

Responsives Discord-inspiriertes Starterprojekt ohne React oder Frontend-Framework.

## Funktionen
- Supabase Registrierung und Login
- Freundesuche, Freundschaftsanfragen annehmen/ablehnen
- Direktnachrichten sowie Nachrichten bearbeiten und löschen
- Server erstellen, per Code beitreten und Textkanäle erstellen
- Statusauswahl: Online, Abwesend, Bitte nicht stören, Offline
- Profilname, Bio, Profilbild und Banner bearbeiten
- Bilder vor dem Upload verschieben, zoomen und zuschneiden
- Hell-/Dunkelmodus und mobile Ansicht

## Einrichtung
1. Projekt auf https://supabase.com erstellen.
2. `script.js` öffnen und `SUPABASE_URL` sowie `SUPABASE_ANON_KEY` eintragen.
3. `schema.sql` vollständig im Supabase SQL Editor ausführen.
4. E-Mail-Authentifizierung aktivieren und Redirect-URLs für deine Website eintragen.
5. `index.html` über einen lokalen Webserver starten (z. B. VS Code Live Server), nicht per `file://`.

## Sicherheit und Grenzen
Dies ist ein Entwicklungsstarter, kein fertig gehärteter öffentlicher Chatdienst. Prüfe und härte alle RLS-Policies vor Veröffentlichung. Insbesondere Serverbeitritt und Mitgliedschaftsverwaltung benötigen ein richtiges Rollen- und Einladungssystem. Der Profilmedien-Bucket ist öffentlich; hochgeladene Bild-URLs sind daher öffentlich abrufbar. Es gibt keine Ende-zu-Ende-Verschlüsselung, keine zuverlässige automatische Online-Erkennung, keine Melde-/Blockierfunktion und keine Moderation. Status wird manuell gesetzt. Nachrichten werden beim Öffnen und nach dem Senden neu geladen; Supabase-Realtime-Abos sind noch nicht eingebaut. Nutze Testkonten, um RLS zu prüfen, und veröffentliche keine privaten Daten.
