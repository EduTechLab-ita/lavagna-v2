const CACHE_NAME = 'eduboard-v2-099'; // v2-099 — cornice dell'area di stampa azzurrina e più spessa sulle righe scure · v2-098 (accorpa v2-097, mai uscita in produzione) — righe/quadretti agganciati al bordo del foglio, niente rosso, orientamento nelle Preferenze, cartelle che non cambiano più lo sfondo · v2-097 — collegamento Drive che scade: fascia gialla/rossa, Rinnova in un tocco, niente più «Salvato» falso, lavoro salvato al ricollegamento; sfondo e orientamento per pagina (anche immagini), sfondi immagine che non si rimpiccioliscono; Righe scure
// Testo mostrato sulla LIM e su EduConnect dopo ogni aggiornamento automatico
const CHANGELOG  = 'EduBoard V2-099 — Il collegamento a Google Drive non cade più in silenzio: qualche minuto prima della scadenza compare in alto una fascia gialla, e se scade diventa rossa, perché le modifiche non vengono più salvate. Con «Rinnova» ti ricolleghi con un tocco e la lezione resta a schermo; con «Col telefono» usi il QR. Appena ricollegato, quello che hai fatto nel frattempo viene salvato subito. Lo sfondo e l\'orientamento di ogni pagina ora si salvano davvero, anche con gli sfondi immagine e quelli dal Drive, e gli sfondi immagine non si rimpiccioliscono più a ogni riapertura. Nel pannello Sfondo c\'è la nuova sezione «Righe scure»: tutti gli sfondi di serie con le linee grigio scuro, pensati per la prima elementare. Niente più linee rosse: gli sfondi azzurri sono tutti azzurri. Righe e quadretti partono esattamente dal bordo dell\'area di stampa, e sulle righe scure la cornice tratteggiata è azzurrina, così si vede. Nelle Preferenze si sceglie anche l\'orientamento di ogni lavagna nuova, e aprire una cartella della libreria non cambia più lo sfondo della pagina.';

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
