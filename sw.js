const CACHE_NAME = 'eduboard-v2-070'; // v2-070 — Fix cambio account multi-LIM: lavagna vuota per account senza lezioni, reset isDirty al disconnetti
// Testo mostrato sulla LIM e su EduConnect dopo ogni aggiornamento automatico
const CHANGELOG  = 'EduBoard V2-070 — Corretto il cambio account: ora un account senza lezioni salvate vede subito una lavagna vuota invece del contenuto dell\'account precedente, e disconnettersi non blocca più l\'apertura automatica dell\'ultima lezione del prossimo account.';

const urlsToCache = [
  '.',
  './index.html',
  './app.js',
  './style.css',
  './drive.js',
  './geometry.js',
  './manifest.json',
  './icon-192x192.png',
  './icon-512x512.png',
  './connect.html',
  './connect-manifest.json',
  './jsqr.min.js',
  './qrcode.min.js'
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
        const results = await Promise.allSettled(
          urlsToCache.map((url) => cache.add(url))
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
});
