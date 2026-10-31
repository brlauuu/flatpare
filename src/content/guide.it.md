# Guida di Flatpare

Flatpare aiuta un gruppo a confrontare appartamenti insieme. Carica gli annunci in PDF, valutali e vedi tutto fianco a fianco — con i tuoi dati cifrati nel tuo browser prima di essere salvati.

---

## Primi passi

### 1. Accedi

Accedi con Google o con un link inviato alla tua e-mail, oppure con la password condivisa del tuo gruppo, se il tuo Flatpare è configurato così. Imposta il tuo nome nella pagina Impostazioni, così tutti sanno chi ha detto cosa; finché non lo fai, il tuo gruppo vede il tuo indirizzo e-mail sulle tue valutazioni.

### 2. Scegli una passphrase

La prima volta che accedi, Flatpare ti chiede di **scegliere una passphrase** (almeno 12 caratteri). Non è un secondo accesso — è la chiave che cifra nel tuo browser gli appartamenti, le valutazioni e le note del tuo gruppo.

**Flatpare non vede mai questa passphrase e non può reimpostarla per te.** È proprio questo il punto: è ciò che impedisce a chiunque gestisca il server, noi compresi, di leggere la tua ricerca.

Ti verrà chiesta di nuovo su ogni nuovo dispositivo o browser che usi, e dopo che hai bloccato Flatpare.

### 3. Conserva il tuo kit di recupero

Subito dopo aver scelto la passphrase, ti viene mostrato **un codice di recupero di 25 caratteri, una sola volta**. Scrivilo o stampalo, e conservalo in un posto sicuro.

> **Questa è la schermata più importante di tutto Flatpare.** Il codice di recupero è l'unico modo per rientrare se dimentichi la passphrase. Se perdi entrambi, i dati del tuo gruppo sono persi per sempre — nessuno può recuperarli, perché nessun altro ha mai avuto la chiave.

Trattalo come la chiave di casa, non come un promemoria della password. Una stampa in un cassetto va benissimo. Una nota nello stesso gestore di password in cui tieni tutto il resto serve a poco se perdi l'accesso a quello.

### 4. Entrare in un gruppo creato da qualcun altro

Se sei stato invitato in un gruppo esistente, scegli la tua passphrase allo stesso modo, poi vedi **«Ci siamo quasi»**.

Flatpare aspetta che qualcuno già nel gruppo apra l'app — a quel punto il suo browser consegna automaticamente al tuo una copia della chiave del gruppo. **Non deve fare nulla**, ma deve aprire Flatpare almeno una volta. La schermata ricontrolla ogni pochi secondi e prosegue da sola.

### 5. Aggiungi un appartamento

Vai su **Carica** nella barra di navigazione e trascina (o seleziona) un annuncio in PDF. Se l'estrazione con l'IA è configurata, Flatpare ricava:

- Nome/titolo dell'appartamento
- Indirizzo
- Superficie (m²), locali, bagni, balconi
- Affitto mensile, nella valuta dell'annuncio

Se l'IA non è configurata, compila i campi a mano. In entrambi i casi arrivi alla pagina dell'appartamento per controllare e correggere quello che è uscito sbagliato — l'estrazione è un punto di partenza, non un oracolo.

Puoi anche aggiungere un appartamento a mano, senza PDF né indirizzo. Finché non ha né l'uno né l'altro è **non elaborato**: valutalo e inserisci quello che sai. Appena riceve un indirizzo o un PDF, Flatpare lo mette sulla mappa e ne misura le distanze.

### 6. Valuta gli appartamenti

Nella pagina di ogni appartamento, valutalo in cinque categorie:

| Categoria | Cosa considerare |
|----------|-----------------|
| **Cucina** | Dimensioni, elettrodomestici, disposizione, luce naturale |
| **Balconi** | Dimensioni, vista, privacy, esposizione al sole |
| **Posizione** | Quartiere, rumore, negozi, parchi |
| **Planimetria** | Disposizione delle stanze, percorsi, spazio per riporre, praticità |
| **Impressione generale** | La tua sensazione a pelle dopo la visita |

Clicca una stella per dare un voto (1-5); clicca di nuovo la stessa stella per toglierlo. Valuti per conto tuo — ognuno nel gruppo valuta separatamente, e il confronto mostra i voti fianco a fianco invece di nascondere un disaccordo dietro una media.

### 7. Confronta

Vai su **Confronta** per vedere tutti gli appartamenti in un'unica tabella. Evidenzia il valore migliore in ogni riga (affitto più basso, valutazione più alta, tragitto più breve). Scorri in orizzontale se ci sono più appartamenti di quanti ne stanno sullo schermo. Gli affitti in valute diverse non vengono convertiti: il più basso è evidenziato all'interno di ogni valuta, e l'ordinamento per prezzo mostra prima i franchi, poi ogni altra valuta.

---

## Funzioni

### Luoghi di interesse

Nella pagina **Gruppo**, salva fino a **cinque** luoghi dove vai davvero — il lavoro, la palestra, tua sorella. Ogni appartamento mostra poi quanto ci vuole per raggiungerli in bici e coi mezzi pubblici.

Sei tu a sceglierli; Flatpare non dà per scontato dove vai ogni giorno.

### Distanze

I tempi di percorrenza sono misurati da ogni appartamento verso ciascuno dei tuoi luoghi salvati:

- **In bici** — tramite Google Maps o OpenRouteService
- **Coi mezzi** — tramite Google Maps (non disponibile con OpenRouteService)

Se nessun servizio di distanze è configurato, puoi inserire i tempi a mano.

Cambiare più tardi l'indirizzo di un appartamento non rimisura nulla da solo: le sue distanze restano nascoste finché non premi **Rielabora** sulla sua pagina. Nella versione ospitata una rielaborazione usa un credito appartamento, e così anche **Ricalcola tutto** nella pagina Gruppo, una volta per l'intero calcolo. Aggiungere o modificare un luogo è gratuito.

### Gestione dei PDF

- Caricamento singolo o multiplo
- **I PDF vengono cifrati nel tuo browser prima di essere caricati.** Quello che viene salvato è testo cifrato; aprirne uno lo decifra di nuovo sul tuo dispositivo
- L'estrazione usa Gemini 2.5 Flash. Su flatpare.com passa solo da fornitori di modelli che garantiscono zero conservazione dei dati: la richiesta non viene conservata dopo la risposta

### Cosa può vedere il server

Niente di ciò che contiene la tua ricerca: i tuoi appartamenti, le valutazioni, le note e i PDF vengono cifrati prima di lasciare il tuo browser. Ciò che vede è ciò che gli serve per tenere separate le economie domestiche e per addebitare l’elaborazione: il tuo account (indirizzo email e nome che hai scelto), chi fa parte della tua economia domestica, quanti appartamenti, valutazioni e luoghi hai e quando sono cambiati, e **quanti PDF, indirizzi e link agli annunci la tua economia domestica ha fatto elaborare, e cosa ha pagato ogni credito**. Questi conteggi sono tenuti per economia domestica, mai per persona, e non dicono mai cosa è stato elaborato. Su flatpare.com li esaminiamo per confrontare l’uso con quanto è stato pagato.

C'è un'eccezione voluta, ed è bene conoscerla: **geolocalizzare un indirizzo, misurare un tempo di percorrenza, controllare se un annuncio è ancora online e leggere un PDF** non si possono fare nel tuo browser. Per queste operazioni, quel singolo elemento viene inviato in forma leggibile: un indirizzo a Google Maps (o a OpenRouteService su alcune installazioni in proprio) per la sua posizione e i tempi di percorrenza, l'URL di un annuncio, che il nostro server scarica dal sito dell'annuncio stesso, e un PDF al modello di IA che lo legge. Il nostro server lo usa per quella sola richiesta, non lo scrive mai nel database e non lo registra mai nei log. Quando un PDF non ha un link funzionante al suo annuncio, il modello di IA lo cerca anche sul web, con il titolo, l'indirizzo, il sito e la lingua dell'annuncio; su flatpare.com questa ricerca non conserva nulla della richiesta. Un link trovato così è segnalato come risultato di una ricerca, così puoi controllarlo prima di salvare.

### Gestire la tua chiave

In **Impostazioni** puoi:

- **Blocca questo dispositivo** — cancella la chiave da questo browser senza farti uscire. Utile su un computer condiviso o prestato; per sbloccare ti servirà di nuovo la passphrase.
- **Cambia passphrase** — mantiene i tuoi dati e protegge di nuovo la chiave con una nuova passphrase.
- **Rigenera il kit di recupero** (solo per i proprietari del gruppo) — emette un nuovo codice di recupero e rende non valido quello vecchio. Fallo se pensi che qualcun altro abbia visto la copia stampata. Gli altri proprietari vengono avvisati nella pagina Gruppo, perché anche la loro copia smette di funzionare.

### Fare un backup dei tuoi dati

Poiché i tuoi dati sono cifrati, nessuno può ripristinarli per te, nemmeno noi. Nella pagina **Gruppo**, sotto **I tuoi dati**, ogni membro può **esportare** l'intero gruppo come file ZIP: appartamenti, valutazioni, luoghi e i PDF originali, più un file per fogli di calcolo. **Il file non è cifrato**, quindi conservalo in un posto privato.

Per ripristinare un export, apri la pagina Gruppo di un gruppo che non ha ancora appartamenti né luoghi e scegli **Importa**. Le valutazioni delle altre persone vengono aggiunte ai tuoi commenti, con il loro nome. Un'importazione non chiama alcun servizio esterno e non usa crediti appartamento.

---

## Sul telefono

Flatpare funziona nel browser del telefono. Puoi anche installarlo: si apre allora come un'app, dalla sua icona.

### Installare Flatpare

- **Android:** apri il menu sotto il tuo nome e scegli **Installa l'app**, oppure tocca **Installa** nel suggerimento in cima alla pagina Appartamenti.
- **iPhone e iPad:** tocca il pulsante Condividi, scegli **Aggiungi alla schermata Home**, poi **Aggiungi**. **Installa l'app** nel menu sotto il tuo nome mostra gli stessi passaggi.

### Condividere annunci con Flatpare (Android)

Una volta installato su Android, Flatpare compare nel menu di condivisione del telefono. Condividi un PDF dai tuoi file o da un'e-mail: Flatpare chiede se aggiungerlo, poi lo legge come qualsiasi caricamento. Condividi un link dal browser o da un'app di annunci: Flatpare lo aggiunge come appartamento non ancora elaborato e lo apre.

Se al momento della condivisione non hai effettuato l'accesso, o Flatpare è bloccato, l'elemento aspetta un giorno sul telefono. Accedi o sblocca, e Flatpare chiede se aggiungerlo.

### Incolla link (iPhone e ovunque altrove)

Un iPhone non può condividere nulla con Flatpare. Copia invece il link dell'annuncio, apri Flatpare e tocca **Incolla link** nella pagina Appartamenti. Flatpare aggiunge un appartamento per il link e lo apre.

### Appartamenti da un link

Un appartamento aggiunto da un link tiene il link ed è segnato **Non elaborato** nell'elenco. Aggiungerlo è gratuito, e tutto il gruppo può subito valutarlo e descriverlo. Nella sua pagina, **Allega PDF** aggiunge il PDF dell'annuncio e lo legge; con un indirizzo viene trovato sulla mappa. Nella versione ospitata da noi, la prima delle due cose usa un credito appartamento, e l'altra è poi gratuita. **Sostituisci PDF** cambia il PDF con uno più recente senza leggerlo, quindi i dati restano come sono; tocca **Rielabora** se vuoi che venga letto. I link salvati in **Da aggiungere** prima di questa modifica sono diventati appartamenti di questo tipo.

---

## Se usi la versione ospitata da noi

**Durante la beta privata è gratuito.** Ciò che ottiene un account beta resta tuo: né i tuoi dati né i tuoi crediti ti vengono tolti quando la beta finisce.

Flatpare costa **CHF 5, una sola volta** — non è un abbonamento. Copre fino a 10 persone e 40 appartamenti in un gruppo.

Il 40 conta gli appartamenti **elaborati**, non quelli che tieni: si usa un credito la prima volta che il PDF di un appartamento viene letto o il suo indirizzo trovato sulla mappa. Aggiungere un appartamento a mano, descriverlo e valutarlo è gratuito. Eliminarne uno libera spazio nel confronto, ma non ti restituisce il credito. Quando hai usato i tuoi 40, altri CHF 5 aggiungono altri 40 appartamenti.

Esaurire i crediti impedisce solo di elaborare nuovi appartamenti: puoi comunque aggiungerli, descriverli e valutarli, ed elaborarli dopo averne comprati altri. Non ti blocca mai l'accesso a quelli che hai già.

Gestire Flatpare in proprio è gratuito e non ha alcun limite.

---

## Consigli

- **Hai dimenticato la passphrase?** La schermata di sblocco offre **«Usa il mio kit di recupero»** — inserisci il codice di 25 caratteri e imposta una nuova passphrase. Se non hai né la passphrase né il codice, nessuno può recuperare i dati.
- **«Reimposta le mie chiavi»** è offerto anche lì, e *non* è una reimpostazione della password: abbandona la vecchia chiave e aspetta che qualcun altro del gruppo ti consegni una copia nuova. Serve solo se qualcun altro ha ancora accesso.
- **Confronta i codici delle chiavi.** La pagina Gruppo mostra accanto a ogni membro un codice di otto piccole immagini. Confrontali di persona o durante una chiamata: il codice che una persona vede per sé sul proprio dispositivo deve corrispondere a quello che vedi tu per lei. Se non è così, non fidarti di quella chiave.
- **Più di un proprietario.** Nella pagina Gruppo un proprietario può usare **Rendi proprietario** su qualsiasi membro. Ogni proprietario può invitare e rimuovere persone e rinnovare la chiave del gruppo, così il gruppo continua a funzionare se uno di voi non c'è più. Un proprietario può scegliere **Smetti di essere proprietario** o lasciare il gruppo, purché resti un altro proprietario.
- **Nuovo dispositivo:** accedi e inserisci la passphrase; non c'è nulla da trasferire a mano.
- **Caricamento multiplo:** nella pagina Carica puoi selezionare più PDF in una volta.
- **Rivaluta quando vuoi:** le valutazioni sono personali e puoi cambiarle quando vuoi.
- **Adatto al telefono:** usa la barra di navigazione in basso sul telefono.
