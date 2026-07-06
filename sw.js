const CACHE_NAME = 'eduboard-v2-043'; // v2-043 — Fix lentezza reale nel trascinare/ridimensionare selezioni su pagine con molti tratti/forme
// Testo mostrato sulla LIM e su EduConnect dopo ogni aggiornamento automatico
const CHANGELOG  = 'EduBoard V2-043 — Risolto un rallentamento importante nel trascinare o ridimensionare una selezione quando la pagina contiene molti tratti/forme: prima veniva ridisegnata tutta la pagina ad ogni movimento, ora si ridisegna solo ciò che stai effettivamente spostando. Dovrebbe essere di nuovo fluido anche sui PC meno potenti.';

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
      .then((cache) => {
        console.log('[SW] Cache opened successfully');
        return cache.addAll(urlsToCache);
      })
      .then(() => {
        console.log('[SW] All resources cached');
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
