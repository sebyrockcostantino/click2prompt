# Click2Prompt

**Click destro su qualsiasi immagine e ottieni il prompt per ricrearla con l'IA.** Estensione per Chrome, gratuita, senza account e senza server.

*di SebyRock*

---

https://github.com/user-attachments/assets/28752efd-1f90-4c79-9f5e-1926b4a36dab

<sup>Dal click destro al risultato: il prompt copiato negli appunti, incollato in un generatore, e il confronto con l’originale.</sup>

## Cosa fa

- **Click destro su un'immagine** → *Click2Prompt: prompt di questa immagine*
- **`Alt` + `Shift` + `S`** → selezioni un'area qualsiasi dello schermo: funziona anche su sfondi CSS, canvas, video e PDF, cioè su tutto quello che vedi e che non è una normale immagine
- Il prompt viene copiato negli appunti da solo

Due formati, si cambiano dal pannello:

| Formato | Per cosa |
|---|---|
| **Linguaggio naturale** | il prompt già pronto, da incollare in qualsiasi generatore di immagini |
| **JSON strutturato** | lo stesso prompt scritto in linguaggio JSON, con ogni elemento in un campo suo. Conviene quando vuoi cambiare un solo dettaglio senza riscrivere tutto, o quando ti serve una serie di immagini coerenti fra loro |

Il prompt può uscire in inglese (consigliato) o in italiano.

### Come punta alla copia fedele

Non è una descrizione generica: le istruzioni impongono una ricognizione in nove passaggi, e ogni analisi passa due volte davanti al modello.

- **Il rapporto d'aspetto lo calcola il codice**, non il modello: le dimensioni reali le conosciamo già, farle stimare a occhio era la ragione per cui l'immagine rigenerata usciva con un formato diverso.
- **Posizioni in frazioni di inquadratura** ("centrato al 40% della larghezza"), mai un vago "sullo sfondo".
- **Conteggi espliciti** di figure, pannelli, colonne, oggetti: i generatori perdono i numeri se non glieli dici.
- **Testi virgolettati alla lettera**, con posizione, tipo di lettering e colore.
- **Colori con l'esadecimale** e la quota di inquadratura che occupano.
- **Prospettiva, altezza dell'occhio, carattere dell'obiettivo, luce e ombre**, ognuno esplicito.
- **Secondo passaggio di verifica**: il modello rilegge l'immagine con la propria bozza davanti e corregge omissioni, posizioni sbagliate e dettagli inventati.

Resta un limite del mezzo, non dell'estensione: un prompt testuale trasferisce una descrizione, non delle coordinate. Per la copia identica serve passare l'immagine originale come riferimento al generatore.

## Installazione

1. Scarica lo ZIP dalla sezione [Releases](../../releases) e scompattalo. Tieni la cartella dove non la cancellerai: Chrome la legge da lì a ogni avvio.
2. Apri `chrome://extensions`
3. Attiva **Modalità sviluppatore** (in alto a destra)
4. **Carica estensione non pacchettizzata** → seleziona la cartella

Si apre da sola una pagina di benvenuto che ti guida a creare la chiave gratuita di Google. Incolli, premi *Salva e verifica*, hai finito.

Funziona anche su Edge, Brave e Opera.

## Quanto costa

Zero. L'estensione usa il piano gratuito di **Google AI Studio** e ognuno usa la propria chiave: nessuna carta di credito, circa **1.500 analisi al giorno**. Non c'è un server intermedio, il browser parla direttamente con Google.

## Privacy

- La chiave resta in `chrome.storage.local`, cioè nel profilo di Chrome dell'utente. Non viene trasmessa a nessuno.
- L'estensione non ha backend, non registra cosa analizzi, non invia statistiche.
- **Sul piano gratuito Google dichiara che i contenuti inviati possono essere usati per migliorare i suoi modelli.** Per immagini pubbliche è irrilevante; per materiale riservato scegli un'altra strada.

## Motore

L'interfaccia espone solo Google, di proposito: ogni scelta in più in apertura è un utente che si ferma. **Ollama** (locale, offline) e **Anthropic** restano implementati in `background.js` e si riattivano scrivendo `provider` in `chrome.storage.local` (`"ollama"` o `"anthropic"`) insieme ai relativi campi.

### Scelta del modello

Il modello non è scritto nel codice, perché Google ritira i vecchi per i nuovi account (`gemini-2.5-flash` è già negato a chi crea una chiave oggi). `models.js` interroga la lista dei modelli disponibili per la chiave dell'utente e prende il Flash con la versione più alta, scartando le varianti `image`, `preview` e `lite`. Se i server rispondono "high demand", riprova due volte e poi ripiega su un modello meno affollato.

## Struttura

| File | Ruolo |
|---|---|
| `manifest.json` | permessi, menu contestuale, scorciatoia |
| `background.js` | service worker: menu, screenshot, ridimensionamento, chiamate ai provider |
| `models.js` | scelta automatica del modello, gestione errori e sovraccarichi |
| `prompts.js` | istruzioni di sistema dei due formati |
| `content.js` / `content.css` | pannello e selezione area, isolati in shadow DOM |
| `options.*` / `popup.*` / `welcome.*` | impostazioni, popup, onboarding |

Le immagini vengono ridotte a 2048px di lato lungo e convertite in JPEG prima dell'invio: meno banda, meno token, nessun errore di dimensione.

## Licenza

[MIT](LICENSE). Puoi usarla, modificarla e ridistribuirla, anche commercialmente, a patto di mantenere la nota di copyright.
