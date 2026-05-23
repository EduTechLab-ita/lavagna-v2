// ============================================================
// EDUBOARD CONNECT — Cloudflare Worker v2
// Copia questo codice nel dashboard Cloudflare:
// Workers & Pages → eduboard-connect → Modifica codice → Salva e deploya
// ============================================================

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

    const url   = new URL(request.url);
    const parts = url.pathname.split('/').filter(Boolean);
    const resource = parts[0];
    const id       = parts[1];

    // ── POST /session/:limId — telefono invia token ──────────────────────────
    if (request.method === 'POST' && resource === 'session' && id) {
      const { token, email, expiry } = await request.json();

      // Se c'è un'altra LIM connessa con questo account, notificala del trasferimento
      const existingLimId = await env.SESSIONS.get(`account:${email}`);
      if (existingLimId && existingLimId !== id) {
        await env.SESSIONS.put(
          `session:${existingLimId}`,
          JSON.stringify({ status: 'transferred', email }),
          { expirationTtl: 60 }
        );
      }

      await env.SESSIONS.put(
        `session:${id}`,
        JSON.stringify({ status: 'connected', token, email, expiry: expiry || Date.now() + 3600000 }),
        { expirationTtl: 300 }
      );
      await env.SESSIONS.put(`account:${email}`, id, { expirationTtl: 3600 });

      return json({ ok: true });
    }

    // ── GET /session/:limId — LIM fa polling ─────────────────────────────────
    if (request.method === 'GET' && resource === 'session' && id) {
      const data = await env.SESSIONS.get(`session:${id}`);
      if (!data) return json({ status: 'waiting' });

      const session = JSON.parse(data);
      await env.SESSIONS.delete(`session:${id}`);

      if (session.status === 'transferred') {
        return json({ status: 'transferred', email: session.email });
      }
      return json({
        status: 'connected',
        token:  session.token,
        email:  session.email,
        expiry: session.expiry,
      });
    }

    // ── POST /photo/:limId — telefono invia foto ─────────────────────────────
    if (request.method === 'POST' && resource === 'photo' && id) {
      const body = await request.json();
      const { dataUrl, name } = body;

      if (!dataUrl) return json({ ok: false, error: 'missing dataUrl' }, 400);

      // Leggi la lista foto esistente
      const raw    = await env.SESSIONS.get(`photos:${id}`);
      const photos = raw ? JSON.parse(raw) : [];

      photos.push({ dataUrl, name: name || 'foto.jpg', ts: Date.now() });

      // Mantieni massimo 10 foto
      if (photos.length > 10) photos.splice(0, photos.length - 10);

      await env.SESSIONS.put(`photos:${id}`, JSON.stringify(photos), { expirationTtl: 3600 });

      return json({ ok: true });
    }

    // ── GET /photos/:limId — LIM fa polling foto ─────────────────────────────
    if (request.method === 'GET' && resource === 'photos' && id) {
      const raw = await env.SESSIONS.get(`photos:${id}`);
      if (!raw) return json({ photos: [] });

      const photos = JSON.parse(raw);
      // Cancella dopo la consegna (LIM le tiene in memoria locale)
      await env.SESSIONS.delete(`photos:${id}`);

      return json({ photos });
    }

    // ── PUT /laser/:limId — telefono invia posizione laser ───────────────────
    if (request.method === 'PUT' && resource === 'laser' && id) {
      const body = await request.json();
      if (body.active === false) {
        await env.SESSIONS.delete(`laser:${id}`);
      } else {
        await env.SESSIONS.put(
          `laser:${id}`,
          JSON.stringify({ x: body.x, y: body.y, active: true, ts: Date.now() }),
          { expirationTtl: 10 }
        );
      }
      return json({ ok: true });
    }

    // ── GET /laser/:limId — LIM fa polling laser ─────────────────────────────
    if (request.method === 'GET' && resource === 'laser' && id) {
      const raw = await env.SESSIONS.get(`laser:${id}`);
      if (!raw) return json({ active: false });

      const data = JSON.parse(raw);
      // Stale check: se più vecchio di 3 secondi, considera inattivo
      if (Date.now() - data.ts > 3000) {
        await env.SESSIONS.delete(`laser:${id}`);
        return json({ active: false });
      }

      return json({ active: true, x: data.x, y: data.y });
    }

    // ── POST /timer/:limId — telefono avvia/ferma timer ──────────────────────
    if (request.method === 'POST' && resource === 'timer' && id) {
      const body = await request.json();
      if (body.action === 'stop') {
        await env.SESSIONS.delete(`timer:${id}`);
      } else {
        await env.SESSIONS.put(
          `timer:${id}`,
          JSON.stringify({ active: true, seconds: body.seconds, startedAt: Date.now() }),
          { expirationTtl: body.seconds + 60 }
        );
      }
      return json({ ok: true });
    }

    // ── GET /timer/:limId — LIM fa polling timer ──────────────────────────────
    if (request.method === 'GET' && resource === 'timer' && id) {
      const raw = await env.SESSIONS.get(`timer:${id}`);
      if (!raw) return json({ active: false });
      const data = JSON.parse(raw);
      // Già scaduto: ritorna expired finché non viene fermato con STOP
      if (data.expired) {
        return json({ active: false, expired: true });
      }
      // Auto-scade se tempo esaurito: marca expired con TTL 5 minuti
      const elapsed = Math.floor((Date.now() - data.startedAt) / 1000);
      if (elapsed >= data.seconds) {
        await env.SESSIONS.put(
          `timer:${id}`,
          JSON.stringify({ active: false, expired: true }),
          { expirationTtl: 300 }
        );
        return json({ active: false, expired: true });
      }
      return json({ active: true, seconds: data.seconds, startedAt: data.startedAt });
    }

    // ── POST /buzz/:limId — telefono invia buzz ───────────────────────────────
    if (request.method === 'POST' && resource === 'buzz' && id) {
      await env.SESSIONS.put(`buzz:${id}`, '1', { expirationTtl: 5 });
      return json({ ok: true });
    }

    // ── GET /buzz/:limId — LIM fa polling buzz ────────────────────────────────
    if (request.method === 'GET' && resource === 'buzz' && id) {
      const raw = await env.SESSIONS.get(`buzz:${id}`);
      if (!raw) return json({ buzz: false });
      await env.SESSIONS.delete(`buzz:${id}`);
      return json({ buzz: true });
    }

    return json({ error: 'not found' }, 404);
  },
};
