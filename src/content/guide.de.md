# Flatpare Anleitung

Mit Flatpare vergleicht ein Haushalt Wohnungen gemeinsam. Lade Inserate als PDF hoch, bewerte sie und sieh alles nebeneinander — deine Daten werden in deinem Browser verschlüsselt, bevor sie gespeichert werden.

---

## Erste Schritte

### 1. Anmelden

Melde dich mit Google an oder mit einem Link, der dir per E-Mail geschickt wird, oder mit dem gemeinsamen Passwort deines Haushalts, falls dein Flatpare so eingerichtet ist. Trag auf der Seite Einstellungen deinen Namen ein, damit alle wissen, wer was gesagt hat; bis dahin sieht dein Haushalt bei deinen Bewertungen deine E-Mail-Adresse.

### 2. Wähle eine Passphrase

Bei der ersten Anmeldung bittet dich Flatpare, **eine Passphrase zu wählen** (mindestens 12 Zeichen). Das ist kein zweites Login — es ist der Schlüssel, mit dem die Wohnungen, Bewertungen und Notizen deines Haushalts in deinem Browser verschlüsselt werden.

**Flatpare sieht diese Passphrase nie und kann sie dir nicht zurücksetzen.** Genau darum geht es: So kann niemand, der den Server betreibt, auch wir nicht, deine Suche lesen.

Du wirst auf jedem neuen Gerät oder Browser erneut danach gefragt, und nachdem du Flatpare gesperrt hast.

### 3. Speichere dein Wiederherstellungs-Kit

Gleich nachdem du eine Passphrase gewählt hast, wird dir **ein 25-stelliger Wiederherstellungscode angezeigt, ein einziges Mal**. Schreib ihn auf oder druck ihn aus und bewahre ihn an einem sicheren Ort auf.

> **Das ist der wichtigste Bildschirm in Flatpare.** Der Wiederherstellungscode ist der einzige Weg zurück, wenn du deine Passphrase vergisst. Wenn du beides verlierst, sind die Daten deines Haushalts für immer weg — niemand kann sie wiederherstellen, weil sonst nie jemand den Schlüssel hatte.

Behandle ihn wie einen Hausschlüssel, nicht wie eine Passwort-Gedächtnisstütze. Ein Ausdruck in einer Schublade ist in Ordnung. Eine Notiz im selben Passwort-Manager wie alles andere nützt weniger, wenn du den Zugriff darauf verlierst.

### 4. Einem Haushalt beitreten, den jemand anderes eingerichtet hat

Wenn du in einen bestehenden Haushalt eingeladen wurdest, wählst du deine eigene Passphrase genauso und siehst dann **«Fast geschafft»**.

Flatpare wartet darauf, dass jemand, der schon im Haushalt ist, die App öffnet — dann übergibt dessen Browser deinem Browser automatisch eine Kopie des Haushaltsschlüssels. **Die Person muss nichts tun**, aber sie muss Flatpare mindestens einmal öffnen. Der Bildschirm prüft alle paar Sekunden erneut und geht von selbst weiter.

### 5. Eine Wohnung hinzufügen

Geh in der Navigationsleiste auf **Hochladen** und zieh ein Inserat als PDF hinein (oder wähle es aus). Wenn die KI-Auswertung eingerichtet ist, liest Flatpare Folgendes heraus:

- Name/Titel der Wohnung
- Adresse
- Fläche (m²), Zimmer, Badezimmer, Balkone
- Monatsmiete (CHF)

Ist keine KI eingerichtet, füllst du die Felder von Hand aus. So oder so landest du auf der Seite der Wohnung, wo du prüfen und korrigieren kannst, was falsch herausgekommen ist — die Auswertung ist ein Ausgangspunkt, kein Orakel.

Du kannst eine Wohnung auch von Hand hinzufügen, ohne PDF und ohne Adresse. Solange sie keins von beiden hat, ist sie **nicht verarbeitet**: Bewerte sie und trag ein, was du weisst. Sobald sie eine Adresse oder ein PDF bekommt, setzt Flatpare sie auf die Karte und misst ihre Distanzen.

### 6. Wohnungen bewerten

Auf der Seite jeder Wohnung bewertest du sie in fünf Kategorien:

| Kategorie | Worauf achten |
|----------|-----------------|
| **Küche** | Grösse, Geräte, Aufteilung, Tageslicht |
| **Balkone** | Grösse, Aussicht, Privatsphäre, Sonne |
| **Lage** | Quartier, Lärm, Läden, Parks |
| **Grundriss** | Raumaufteilung, Durchgang, Stauraum, Alltagstauglichkeit |
| **Gesamteindruck** | Dein Bauchgefühl nach der Besichtigung |

Klick auf einen Stern, um eine Bewertung zu setzen (1–5); klick nochmals auf denselben Stern, um sie zu entfernen. Du bewertest für dich — alle im Haushalt bewerten separat, und der Vergleich zeigt die Punkte nebeneinander, statt eine Meinungsverschiedenheit wegzumitteln.

### 7. Vergleichen

Geh auf **Vergleichen**, um alle Wohnungen in einer Tabelle zu sehen. Sie hebt in jeder Zeile den besten Wert hervor (tiefste Miete, höchste Bewertung, kürzester Arbeitsweg). Scroll seitwärts, wenn mehr Wohnungen da sind, als Platz haben.

---

## Funktionen

### Wichtige Orte

Auf der Seite **Haushalt** speicherst du bis zu **fünf** Orte, an die du tatsächlich gehst — die Arbeit, das Fitnesscenter, deine Schwester. Jede Wohnung zeigt dann, wie lange du mit dem Velo und mit dem ÖV zu jedem davon brauchst.

Die wählst du selbst; Flatpare geht nicht davon aus, wohin du pendelst.

### Distanzen

Die Reisezeiten werden von jeder Wohnung zu jedem deiner gespeicherten Orte gemessen:

- **Velo** — über Google Maps oder OpenRouteService
- **ÖV** — über Google Maps (mit OpenRouteService nicht verfügbar)

Ist keine Distanz-API eingerichtet, kannst du die Zeiten von Hand eintragen.

Änderst du später die Adresse einer Wohnung, wird nicht von selbst neu gemessen: Ihre Distanzen sind ausgeblendet, bis du auf ihrer Seite **Neu verarbeiten** drückst. In der gehosteten Version verbraucht das ein Wohnungsguthaben, und **Alle neu berechnen** auf der Haushaltsseite ebenso, einmal für den ganzen Durchgang. Einen Ort hinzuzufügen oder zu ändern kostet nichts.

### PDFs

- Einzeln oder mehrere auf einmal hochladen
- **PDFs werden in deinem Browser verschlüsselt, bevor sie hochgeladen werden.** Gespeichert wird nur verschlüsselter Text; beim Öffnen wird das PDF auf deinem Gerät wieder entschlüsselt
- Die Auswertung verwendet Gemini 2.5 Flash. Auf flatpare.com läuft sie nur über Modellanbieter, die Zero Data Retention garantieren: Die Anfrage wird nicht aufbewahrt, sobald sie beantwortet ist

### Was der Server sehen kann

Fast nichts. Deine Wohnungen, Bewertungen, Notizen und PDFs werden verschlüsselt, bevor sie deinen Browser verlassen.

Es gibt eine bewusste Ausnahme, und es lohnt sich, sie zu kennen: **eine Adresse geokodieren, eine Reisezeit messen, prüfen, ob ein Inserat noch online ist, und ein PDF lesen** geht nicht in deinem Browser. Dafür wird genau dieses eine Element lesbar gesendet: eine Adresse an Google Maps (oder bei manchen selbst betriebenen Installationen an OpenRouteService) für ihre Lage und die Reisezeiten, der Link eines Inserats, den unser Server direkt von der Inserate-Website abruft, und ein PDF an das KI-Modell, das es liest. Unser Server verwendet es für diesen einen Aufruf, schreibt es nie in die Datenbank und protokolliert es nie. Hat ein PDF keinen funktionierenden Link zu seinem Inserat, sucht das KI-Modell ausserdem im Web danach, mit Titel, Adresse, Website und Sprache des Inserats; auf flatpare.com bewahrt diese Suche nichts von der Anfrage auf. Ein so gefundener Link ist als Suchergebnis markiert, damit du ihn vor dem Speichern prüfen kannst.

### Deinen Schlüssel verwalten

Unter **Einstellungen** kannst du:

- **Dieses Gerät sperren** — entfernt den Schlüssel aus diesem Browser, ohne dich abzumelden. Praktisch an einem geteilten oder geliehenen Computer; zum Entsperren brauchst du deine Passphrase wieder.
- **Passphrase ändern** — deine Daten bleiben, der Schlüssel wird mit einer neuen Passphrase geschützt.
- **Wiederherstellungs-Kit neu erstellen** (nur Inhaber:innen des Haushalts) — erstellt einen neuen Wiederherstellungscode und macht den alten ungültig. Mach das, wenn du denkst, dass jemand anderes den Ausdruck gesehen hat. Weitere Inhaber:innen erfahren es auf der Seite Haushalt, denn ihre Kopie funktioniert dann ebenfalls nicht mehr.

### Deine Daten sichern

Weil deine Daten verschlüsselt sind, kann sie niemand für dich wiederherstellen, auch wir nicht. Auf der Seite **Haushalt** kann unter **Deine Daten** jedes Mitglied den ganzen Haushalt als ZIP-Datei **exportieren**: Wohnungen, Bewertungen, Orte und die originalen PDFs, dazu eine Tabellendatei. **Die Datei ist nicht verschlüsselt**, bewahre sie also an einem privaten Ort auf.

Um einen Export zurückzuholen, öffne die Haushaltsseite eines Haushalts, der noch keine Wohnungen und keine Orte hat, und wähle **Importieren**. Bewertungen anderer Personen werden mit ihrem Namen zu deinen eigenen Kommentaren hinzugefügt. Ein Import ruft keinen externen Dienst auf und verbraucht kein Wohnungsguthaben.

---

## Auf dem Handy

Flatpare läuft im Browser deines Handys. Du kannst es auch installieren, dann öffnet es sich wie eine App über ein eigenes Symbol.

### Flatpare installieren

- **Android:** Öffne das Menü unter deinem Namen und wähle **App installieren**, oder tippe im Hinweis oben auf der Seite Wohnungen auf **Installieren**.
- **iPhone und iPad:** Tippe auf die Teilen-Taste, wähle **Zum Home-Bildschirm** und dann **Hinzufügen**. **App installieren** im Menü unter deinem Namen zeigt dieselben Schritte.

### Inserate an Flatpare teilen (Android)

Sobald Flatpare auf Android installiert ist, erscheint es im Teilen-Menü deines Handys. Teile ein PDF aus deinen Dateien oder einer E-Mail, und Flatpare fragt, ob es hinzugefügt werden soll, und liest es dann wie jeden Upload. Teile einen Link aus deinem Browser oder einer Inserate-App, und Flatpare speichert ihn unter **Zum Hinzufügen**.

Bist du beim Teilen abgemeldet oder ist Flatpare gesperrt, wartet das Geteilte einen Tag lang auf deinem Handy. Melde dich an oder entsperre, und Flatpare fragt, ob es hinzugefügt werden soll.

### Link einfügen (iPhone und überall sonst)

Ein iPhone kann nichts an Flatpare teilen. Kopiere stattdessen den Link des Inserats, öffne Flatpare und tippe auf der Seite Wohnungen auf **Link einfügen**. Der Link wird unter **Zum Hinzufügen** gespeichert.

### Links für später

**Zum Hinzufügen**, oben auf der Seite Wohnungen, ist die Liste deines Haushalts mit Links, die noch keine Wohnungen sind. Alle im Haushalt sehen sie, mit dem Namen, wer welchen Link gespeichert hat. Einen Link zu speichern kostet nichts. Tippe auf **Hinzufügen**, um daraus eine Wohnung zu machen, mit oder ohne PDF; in der gehosteten Version wird ein Wohnungsguthaben verbraucht, sobald ihr PDF gelesen oder ihre Adresse auf der Karte gefunden wird. Bis zu 20 Links können gleichzeitig warten.

---

## Wenn du die gehostete Version nutzt

**Während der privaten Beta ist es gratis.** Was ein Beta-Konto bekommt, gehört dir: Weder deine Daten noch dein Guthaben werden dir weggenommen, wenn die Beta endet.

Flatpare kostet **CHF 5, einmalig** — kein Abo. Das deckt bis zu 10 Personen und 40 Wohnungen in einem Haushalt ab.

Die 40 zählen **verarbeitete** Wohnungen, nicht Wohnungen, die du behältst: Ein Guthaben wird verbraucht, wenn das PDF einer Wohnung zum ersten Mal gelesen oder ihre Adresse zum ersten Mal auf der Karte gefunden wird. Eine Wohnung von Hand hinzufügen, beschreiben und bewerten kostet nichts. Wenn du eine löschst, wird in deinem Vergleich Platz frei, das Guthaben bekommst du aber nicht zurück. Wenn du deine 40 aufgebraucht hast, fügen weitere CHF 5 weitere 40 hinzu.

Ist das Guthaben aufgebraucht, werden nur keine neuen Wohnungen mehr verarbeitet: Du kannst sie weiterhin hinzufügen, beschreiben und bewerten und sie verarbeiten, nachdem du mehr gekauft hast. Von den Wohnungen, die du schon hast, wirst du nie ausgesperrt.

Flatpare selbst zu betreiben ist kostenlos und hat überhaupt keine Grenzen.

---

## Tipps

- **Passphrase vergessen?** Der Entsperren-Bildschirm bietet **«Mein Wiederherstellungs-Kit verwenden»** an — gib den 25-stelligen Code ein und setz eine neue Passphrase. Wenn du weder die Passphrase noch den Code hast, kann niemand die Daten wiederherstellen.
- **«Meine Schlüssel zurücksetzen»** wird dort auch angeboten, und das ist *kein* Zurücksetzen des Passworts: Der alte Schlüssel wird aufgegeben, und du wartest, bis dir jemand anderes im Haushalt eine neue Kopie übergibt. Nur sinnvoll, wenn noch jemand anderes Zugriff hat.
- **Vergleiche die Schlüsselcodes.** Die Seite Haushalt zeigt neben jedem Mitglied einen Code aus acht kleinen Bildern. Vergleiche sie persönlich oder in einem Anruf: Der Code, den jemand auf dem eigenen Gerät für sich sieht, muss mit dem übereinstimmen, den du für diese Person siehst. Wenn nicht, vertraue diesem Schlüssel nicht.
- **Mehr als eine Inhaber:in.** Auf der Seite Haushalt kann eine Inhaber:in jedes Mitglied **Zur Inhaber:in machen**. Alle Inhaber:innen können Leute einladen und entfernen und den Haushaltsschlüssel erneuern, so läuft der Haushalt weiter, wenn eine von euch ausfällt. Eine Inhaber:in kann **Als Inhaber:in zurücktreten** oder den Haushalt verlassen, solange eine andere Inhaber:in bleibt.
- **Neues Gerät:** Melde dich einfach an und gib deine Passphrase ein; von Hand muss nichts übertragen werden.
- **Mehrere hochladen:** Auf der Seite Hochladen kannst du mehrere PDFs auf einmal auswählen.
- **Jederzeit neu bewerten:** Bewertungen gehören jeder Person einzeln und lassen sich jederzeit ändern.
- **Fürs Handy gemacht:** Nutze auf dem Handy die Navigationsleiste unten.
