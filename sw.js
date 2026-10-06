const CACHE_NAME = 'eduboard-v2-125'; // v2-125 — Focus a rettangolo: larghezza e altezza libere per illuminare anche una sola riga di testo — due dita separate per asse (orizzontale allunga, verticale alza, diagonale entrambe) e quattro maniglie sui lati che spostano solo il proprio lato (anche col mouse). Il cerchio resta com'era. Guida aggiornata · v2-124 — Compasso, richieste delle colleghe: colonna dei comandi centrata a metà del braccio; la ✏️ per disegnare sta accanto alla punta della matita (sulla linea ago-matita, così l'arco parte esattamente dalla mina); il compasso si sposta prendendolo dalla cerniera, non più dall'ago. Guida aggiornata · v2-123 — Guida illustrata: con la scheda Guida la finestra si allarga, capitoli a sinistra e testo con le schermate dell'app a destra, pulsanti capitolo precedente/successivo; stessi 16 capitoli e stessa ricerca. Corretto dove sta «Cattura» (Magic Box, non Gestione File) e aggiunto il compasso nel capitolo Forme e geometria · v2-122 — Gomma-lazo: non fa più ricomparire scritte fantasma (tratti rimasti nell'elenco senza pixel: lezioni salvate prima della v2-108 dopo averne aperta una vecchia, oppure scritte cancellate con la gomma normale). All'apertura della pagina e a fine passata di gomma si tolgono i tratti che sulla tela non si vedono · v2-121 — Magic Box: il compasso (o l'ultimo strumento geo cliccato) restava evidenziato di azzurro anche da chiuso — causa: un selettore troppo largo nel pannello Forme intercettava anche i pulsanti del Magic Box, che condividono la stessa classe CSS solo per lo stile. Ristretto al solo pannello Forme · v2-120 — Compasso: corretta per davvero l'inversione (nella v2-119 a certe aperture ribaltava ancora sopra/sotto invece di specchiare solo destra/sinistra — ora la cerniera resta sempre dalla stessa parte, verificato matematicamente a più angoli, non solo a riposo) · v2-119 — Compasso, ritocchi chiesti da Fabio dopo il primo giro: l'inversione ora specchia la matita a destra/sinistra (non più sopra/sotto); icona apri/chiudi diversa da quella d'inversione; pulsanti tutti della stessa misura, un po' più piccoli, inclinati come il braccio destro e disposti FUORI dal compasso (prima coprivano l'interno); ago sottile e aguzzo distinto dalla matita (corpo in legno, mina nel colore di disegno corrente); dimensione di riposo molto più grande (metà della scala, resettata ogni volta che si riapre insieme all'angolo); misura cliccabile per scriverla a tastiera, e se il valore scritto richiede più apertura la dimensione si allarga da sola invece di tagliarlo in silenzio; angolo di riposo quasi chiuso (non più spalancato); compasso e righello ora si aprono al centro della pagina visibile, non più in un punto fisso che poteva finire fuori schermo; icona del goniometro nel Magic Box più classica (semicerchio con tacche) · Libreria: una lezione nuova ora compare alla prossima apertura della libreria anche se era chiusa al momento del salvataggio (prima serviva ricaricare la pagina) · v2-118 — Compasso vero nel Magic Box, su modello di Fabio: due bracci rigidi incernierati, l'ago fisso nel punto 0, si apre sempre dritto. Colonna comandi: chiudi, impostazioni (angolo numerico, dimensione, unità mm/cm/in sempre in scala vera), occhio (misura persistente fra le punte), apri/chiudi trascinando, inverti, disegna — tenendo premuto sulla matita e girando il dito intorno all'ago traccia l'arco col colore/spessore/tipo dello strumento di disegno a mano libera scelto · v2-117 — Forme → Solide: aggiunta la sfera (cerchio + equatore, metà tratteggiata) · v2-116 — Forme: aggiunti quadrato, parallelogramma, trapezio rettangolo/isoscele/scaleno nella sezione «Piane»; nuova sezione «Solide» con cubo, parallelepipedo, piramide a base quadrata, cono, cilindro (spigoli nascosti tratteggiati) · v2-115 (accorpa v2-109..114, mai uscite in produzione) — niente finestra «lampo» della pagina vecchia prima del ricaricamento; una sola finestra delle novità (prima due sovrapposte); scritte del Testo selezionate: si spostano, si ingrandiscono e un tocco breve le apre in modifica; versione vera nel menu del telefono; scritte dello strumento Testo che si riaprono in modifica toccandole; foto dalla galleria dal telefono; il telefono non si ricarica più a metà di QR/accesso/timer dopo un aggiornamento; lezione nuova: ripiego sull'ultima lezione in localStorage e messaggio con la cartella; icone del pannello ingranaggio colorate con la scritta sotto, pannello che resta dentro lo schermo, pulsanti delle scritte non più accesi su immagini/aree; finestra delle novità larga, senza chiusura a tempo, con X e scorrimento; ritaglio immagini con maniglie (non distruttivo, obj.crop), immagini nitide ingrandendo (tela HD sulla parte visibile) e PDF a 2,5×, lazo di Seleziona che parte sopra un'immagine, contagocce, lezione nuova salvata sotto quella in uso · v2-108 (accorpa v2-106/107, mai uscite in produzione) — lezioni e cartelle con l'apostrofo nel nome di nuovo salvabili (errore Drive 400), errori di Drive spiegati in una finestra; Annulla azzerato a ogni cambio pagina/lezione/lavagna nuova; lezioni vecchie (senza pagine) che non ereditano più tratti e pagine della precedente; gomma-lazo/gomma-tratto/selezione che non cancellano più il disegno salvato come immagine · v2-105 — pulsanti degli strumenti geometrici evidenziati solo a strumento aperto · v2-104 — squadre 45° e 30°/60° nel Magic Box, penna al bordo più vicino con più strumenti aperti · v2-103 — sfondi a righe e quadretti con le misure vere (5, 7, 9, 12, 15 mm e quadretti 5 mm) · v2-102 — icone del righello più distanziate, icona sposta a 9 puntini anche sul goniometro · v2-101 — righello più alto (non più lungo) con i comandi sotto i numeri · v2-100 — righello un po’ più grande con la scala dei quadretti veri (segue lo zoom), goniometro che disegna l’arco appoggiando lo stilo al bordo · v2-099 — cornice dell'area di stampa azzurrina e più spessa sulle righe scure · v2-098 (accorpa v2-097, mai uscita in produzione) — righe/quadretti agganciati al bordo del foglio, niente rosso, orientamento nelle Preferenze, cartelle che non cambiano più lo sfondo · v2-097 — collegamento Drive che scade: fascia gialla/rossa, Rinnova in un tocco, niente più «Salvato» falso, lavoro salvato al ricollegamento; sfondo e orientamento per pagina (anche immagini), sfondi immagine che non si rimpiccioliscono; Righe scure
// Testo mostrato sulla LIM e su EduConnect dopo ogni aggiornamento automatico.
// SOLO la versione nuova, una voce per riga: la storia completa sta in Impostazioni → Novità.
const CHANGELOG  = `🧰 Magic Box: i pulsanti degli strumenti (righello, goniometro, squadre, compasso) ora restano evidenziati di azzurro solo quando lo strumento è davvero aperto — prima il compasso restava acceso anche da chiuso, pur non essendo mai stato usato.`;

const urlsToCache = [
  '.',
  './index.html',
  './app.js',
  './style.css',
  './drive.js',
  // Barra nuova (restyling 20/09/2026): reggono TUTTO l'aspetto della barra
  // strumenti. Senza precaricarli, la prima apertura su rete scolastica lenta o
  // offline mostrerebbe l'app senza la barra nuova.
  './barra-nuova.css',
  './barra-nuova.js',
  './geometry.js',
  './manifest.json',
  './icon-192x192.png',
  './icon-512x512.png',
  './connect.html',
  './connect-manifest.json',
  './jsqr.min.js',
  './qrcode.min.js',
  // PDF.js in locale: caricata su richiesta da _ensurePdfJs(), ma messa in cache subito,
  // così l'import PDF funziona anche offline e dove il firewall blocca i CDN esterni.
  './pdf.min.js',
  './pdf.worker.min.js',
  // Font Inter, solo il subset "latin": copre l'italiano per intero (~47 KB a peso).
  // I file "latin-ext" sono nel repo ma NON qui: servono solo per caratteri di altre
  // lingue e sarebbero 400 KB di cache in più scaricati da tutti per niente.
  './fonts/inter-400-latin.woff2',
  './fonts/inter-500-latin.woff2',
  './fonts/inter-600-latin.woff2',
  './fonts/inter-700-latin.woff2',
  './fonts/inter-800-latin.woff2'
];

// Installazione del Service Worker
self.addEventListener('install', (event) => {
  console.log('[SW] Installing Service Worker...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(async (cache) => {
        console.log('[SW] Cache opened successfully');
        // cache.addAll() è tutto-o-niente: su connessione instabile basta UN file che
        // fallisce a scaricarsi per bloccare l'intera installazione — l'app resta con
        // JS/CSS vecchi in cache mentre index.html (mai cachato) mostra già il nuovo
        // numero di versione, un disallineamento confuso (visto dal vivo l'11/07/2026,
        // hotspot in montagna). Con Promise.allSettled i singoli file che falliscono
        // vengono solo saltati (verranno ritentati al prossimo aggiornamento del SW),
        // invece di far fallire in blocco tutti gli altri che erano andati a buon fine.
        // cache: 'reload' forza un fetch pieno (bypassa la cache HTTP del browser)
        // invece di rischiare una risposta già in cache locale — non risolve un edge
        // CDN indietro nel momento esatto dell'installazione, ma è l'unica parte del
        // problema che dipende da noi. Vedi episodio 20/09/2026 in lavagna-eduboard.md.
        const results = await Promise.allSettled(
          urlsToCache.map((url) => cache.add(new Request(url, { cache: 'reload' })))
        );
        const failed = results
          .map((r, i) => (r.status === 'rejected' ? urlsToCache[i] : null))
          .filter(Boolean);
        if (failed.length) console.warn('[SW] File non cacheati (rete instabile?):', failed);
        else console.log('[SW] All resources cached');
      })
      .then(() => {
        // Forza l'attivazione immediata del nuovo SW
        return self.skipWaiting();
      })
  );
});

// Aggiornamento del Service Worker e notifica ai client
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating new Service Worker...');

  const cacheWhitelist = [CACHE_NAME];

  event.waitUntil(
    self.clients.claim().then(() => {
      console.log('[SW] Service Worker now controls all clients');

      return Promise.all([
        // Pulisci le vecchie cache
        caches.keys().then((cacheNames) => {
          return Promise.all(
            cacheNames.map((cacheName) => {
              if (cacheWhitelist.indexOf(cacheName) === -1) {
                console.log('[SW] Deleting old cache:', cacheName);
                return caches.delete(cacheName);
              }
            })
          );
        }),

        // Notifica tutti i client che una nuova versione è disponibile
        self.clients.matchAll().then((clients) => {
          clients.forEach((client) => {
            console.log('[SW] Notifying client about update');
            client.postMessage({
              type: 'UPDATE_AVAILABLE',
              version: CACHE_NAME,
              changelog: CHANGELOG
            });
          });
        })
      ]);
    })
  );
});

// Intercettazione delle richieste con strategia stale-while-revalidate
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = request.url;

  // CRITICO: bypass completo per Google OAuth, Drive API, Cloudflare Workers e servizi esterni.
  // Non chiamare event.respondWith() — lascia passare tutto al network senza intercettare.
  if (
    url.includes('googleapis.com') ||
    url.includes('gstatic.com') ||
    url.includes('accounts.google.com') ||
    url.includes('drive.google.com') ||
    url.includes('script.google.com') ||
    url.includes('workers.dev') ||
    url.includes('firebasedatabase.app')
  ) {
    return;
  }

  // CRITICO: mai intercettare sw.js e index.html — devono sempre arrivare dal network
  // così il browser può rilevare nuove versioni del SW e dell'app senza rimanere bloccato.
  if (url.includes('sw.js') || url.includes('index.html') || url.includes('connect.html') || url.endsWith('/')) {
    return;
  }

  // Strategia stale-while-revalidate per tutto il resto
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) {
        // Risposta in cache disponibile: ritornala subito e aggiorna in background
        fetch(request).then((r) => {
          if (r.ok) {
            const rClone = r.clone(); // clona PRIMA che il body venga consumato
            caches.open(CACHE_NAME).then((c) => c.put(request, rClone));
          }
        }).catch(() => {
          // Silenzioso: l'aggiornamento in background fallisce se offline, non è un problema
        });
        return cached;
      }

      // Nessuna cache: fetch dalla rete e metti in cache la risposta
      return fetch(request).then((r) => {
        if (r.ok) {
          const rClone = r.clone(); // clona PRIMA di return r
          caches.open(CACHE_NAME).then((c) => c.put(request, rClone));
        }
        return r;
      });
    })
  );
});

// Gestione dei messaggi dai client
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('[SW] Received SKIP_WAITING message');
    self.skipWaiting();
  }
  // La pagina può CHIEDERE che versione sto servendo, invece di aspettare che sia io
  // ad annunciarla durante l'activate: quell'annuncio parte mentre la pagina sta
  // ancora caricando e, se nessuno è ancora in ascolto, l'avviso delle novità non
  // compare più (21/09/2026: app aggiornata sotto gli occhi di Fabio, nessun avviso).
  if (event.data && event.data.type === 'GET_VERSION') {
    const porta = event.ports && event.ports[0];
    if (porta) porta.postMessage({ version: CACHE_NAME, changelog: CHANGELOG });
  }
});
