/**
 * EduBoard — drive.js
 * Integrazione Google Drive: salvataggio lezioni, sfondi personalizzati,
 * libreria lezioni con struttura ad albero.
 *
 * Dipende dai globali di app.js: canvasMgr, bgMgr, CONFIG, toast
 * Usa Google Identity Services (GIS) — script caricato in index.html
 *
 * TOKEN: salvato in sessionStorage (si perde alla chiusura del browser)
 * AUTORE: generato da Claude Code — EduTechLab Italia
 */

'use strict';

// =============================================================================
// COLORI CARTELLE — 8 opzioni predefinite
// =============================================================================

const FOLDER_COLORS = [
    // Riga 1 — caldi
    '#ef4444', // rosso
    '#f97316', // arancione
    '#f59e0b', // ambra
    '#eab308', // giallo
    '#84cc16', // lime
    // Riga 2 — freddi
    '#22c55e', // verde
    '#14b8a6', // teal
    '#06b6d4', // ciano
    '#3b82f6', // blu
    '#6366f1', // indaco
    // Riga 3 — altri
    '#8b5cf6', // viola
    '#a855f7', // porpora
    '#ec4899', // rosa
    '#f43f5e', // rosa-rosso
    '#64748b', // grigio
    '#94a3b8', // grigio chiaro
    '#78716c', // marrone-grigio
    '#92400e', // marrone
    '#1e293b', // quasi-nero
    '#0f766e', // verde scuro
];

/**
 * Converte un colore esadecimale (#rrggbb) in rgba(r,g,b,alpha).
 * @param {string} hex   - es. '#ef4444'
 * @param {number} alpha - es. 0.15
 * @returns {string}
 */
function _hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
}

// =============================================================================
// SEZIONE 1 — DriveManager
// Gestisce autenticazione OAuth2 e tutte le operazioni su Drive API v3
// =============================================================================

class DriveManager {
    constructor() {
        // OAuth2 — stesso CLIENT_ID usato da CAArtella, ValPrimaria, ComportamentoScuola
        this.CLIENT_ID  = '374342529488-c123a5j5v8hnfs241udbl55fos5thfq6.apps.googleusercontent.com';
        this.SCOPE      = 'https://www.googleapis.com/auth/drive.file email profile';

        // Token OAuth2 — letto da sessionStorage all'avvio
        this.accessToken = null;
        this.tokenExpiry = 0;

        // Stato connessione
        this.connected    = false;
        this.userEmail    = '';
        this.userName     = '';   // nome visualizzato (da userinfo API)
        this.userPhotoUrl = null; // URL foto profilo Google

        // ID cartelle Drive (cache in sessionStorage)
        this.rootFolderId    = null;   // "EduBoard"
        this.lessonsFolderId = null;   // "EduBoard/Lezioni"
        this.bgFolderId      = null;   // "EduBoard/Sfondi"
        this._folderColorsId = null;   // "_folder_colors.json" in EduBoard
    }

    // ──────────────────────────────────────────────────────────────────────────
    // AUTENTICAZIONE
    // ──────────────────────────────────────────────────────────────────────────

    /** Apre il popup OAuth2 e acquisisce il token. */
    async connect() {
        if (typeof google === 'undefined' || !google.accounts) {
            toast('Librerie Google non ancora caricate. Riprova tra un secondo.', 'error');
            return;
        }

        return new Promise((resolve, reject) => {
            const client = google.accounts.oauth2.initTokenClient({
                client_id: this.CLIENT_ID,
                scope:     this.SCOPE,
                callback:  async (tokenResponse) => {
                    if (tokenResponse.error) {
                        toast('Autorizzazione negata: ' + tokenResponse.error, 'error');
                        reject(new Error(tokenResponse.error));
                        return;
                    }
                    // Salva token in sessionStorage
                    this.accessToken = tokenResponse.access_token;
                    this.tokenExpiry = Date.now() + (tokenResponse.expires_in * 1000);
                    this._saveSession();

                    try {
                        // Recupera email utente + foto profilo
                        const info = await this._apiFetch('https://www.googleapis.com/oauth2/v2/userinfo');
                        this.userEmail    = info.email || '';
                        this.userName     = info.given_name || info.name || '';
                        this.userPhotoUrl = info.picture || null;

                        // Inizializza struttura cartelle
                        await this._ensureRootFolder();
                        await this._ensureLessonsFolder();
                        await this._ensureBgFolder();
                        await this._loadFolderColors();

                        this.connected = true;
                        this._saveSession();
                        resolve();
                    } catch (err) {
                        toast('Errore connessione Drive: ' + err.message, 'error');
                        reject(err);
                    }
                }
            });
            client.requestAccessToken({ prompt: 'consent' });
        });
    }

    /**
     * Prova rinnovo silenzioso del token (senza popup).
     * Utile al caricamento della pagina se si era già connessi.
     */
    async trySilentConnect(retries = 6) {
        if (typeof google === 'undefined' || !google.accounts) {
            if (retries > 0) {
                await new Promise(r => setTimeout(r, 1500));
                return this.trySilentConnect(retries - 1);
            }
            return false;
        }

        // Recupera l'email dall'ultima sessione per evitare il popup di selezione account
        const hintEmail = this.userEmail || localStorage.getItem('eduboard_user_email') || '';

        return new Promise((resolve) => {
            const clientConfig = {
                client_id: this.CLIENT_ID,
                scope:     this.SCOPE,
                prompt:    '',
                callback:  async (tokenResponse) => {
                    if (tokenResponse.access_token) {
                        this.accessToken = tokenResponse.access_token;
                        this.tokenExpiry = Date.now() + (tokenResponse.expires_in * 1000);
                        this.connected   = true;

                        // Recupera info utente se non le abbiamo (nuova sessione browser)
                        if (!this.userEmail) {
                            try {
                                const info = await this._apiFetch('https://www.googleapis.com/oauth2/v2/userinfo');
                                this.userEmail    = info.email || '';
                                this.userName     = info.given_name || info.name || '';
                                this.userPhotoUrl = info.picture || null;
                            } catch (_) {}
                        }

                        this._saveSession();

                        // Assicura che le cartelle esistano ancora
                        try {
                            await this._ensureRootFolder();
                            await this._ensureLessonsFolder();
                            await this._ensureBgFolder();
                            await this._loadFolderColors();
                        } catch (_) {}

                        resolve(true);
                    } else {
                        this.connected = false;
                        resolve(false);
                    }
                }
            };
            if (hintEmail) clientConfig.hint = hintEmail;
            const client = google.accounts.oauth2.initTokenClient(clientConfig);
            client.requestAccessToken({ prompt: '' });
        });
    }

    /** Revoca il token e pulisce lo stato. */
    async disconnect() {
        if (this.accessToken && typeof google !== 'undefined' && google.accounts) {
            google.accounts.oauth2.revoke(this.accessToken);
        }
        this.accessToken     = null;
        this.tokenExpiry     = 0;
        this.connected       = false;
        this.userEmail       = '';
        this.rootFolderId    = null;
        this.lessonsFolderId = null;
        this.bgFolderId      = null;
        this._folderColorsId = null;
        sessionStorage.removeItem('eduboard_drive_session');
        localStorage.removeItem('eduboard_drive_session');
        localStorage.removeItem('eduboard_user_email');
    }

    // Chiamato da EduBoardConnect quando il telefono invia il token
    async _onExternalToken(token, email, expiry) {
        // Controllo token mancante (CF Worker non aggiornato o vecchia versione)
        if (!token) {
            if (typeof toast === 'function') toast('⚠️ Token mancante — aggiorna il Worker Cloudflare e riprova', 'error');
            console.error('[EduBoard] _onExternalToken: token mancante', { email, expiry });
            return;
        }
        // 1. Connetti subito — la UI si aggiorna immediatamente (senza aspettare le cartelle)
        this.accessToken = token;
        this.userEmail   = email;
        this.connected   = true;
        this.tokenExpiry = expiry || Date.now() + 3600 * 1000;
        this._saveSession();
        if (window.driveConnectBtn) window.driveConnectBtn.update();
        if (window.eduBoardConnect) window.eduBoardConnect._updateBell();
        if (typeof toast === 'function') toast(`✓ Drive connesso come ${email}`);

        // 2. Fetch nome+foto con fetch diretto (bypass _apiFetch — più robusto con token esterno)
        fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { Authorization: 'Bearer ' + token }
        })
        .then(r => r.ok ? r.json() : Promise.reject(r.status))
        .then(info => {
            this.userName     = info.given_name || info.name || '';
            this.userPhotoUrl = info.picture    || null;
            this._saveSession();
            if (window.driveConnectBtn) window.driveConnectBtn.update();
            if (window.eduBoardConnect) window.eduBoardConnect._updateBell();
        })
        .catch(err => console.warn('[EduBoardConnect] userinfo:', err));

        // 3. Cartelle Drive in background, poi libreria e ultima lezione
        (async () => {
            try {
                await this._ensureRootFolder();
                await this._ensureLessonsFolder();
                await this._ensureBgFolder();
                await this._loadFolderColors();
                this._saveSession();
            } catch (err) {
                const errMsg = err.message || 'errore sconosciuto';
                console.error('[EduBoardConnect] folder setup error:', errMsg);
                if (errMsg.includes('401')) {
                    // Token davvero scaduto/revocato — disconnetti
                    this.disconnect();
                    if (window.driveConnectBtn) window.driveConnectBtn.update();
                    if (window.eduBoardConnect) window.eduBoardConnect.show();
                    if (typeof toast === 'function') toast('Drive: token non valido (401) — riconnetti.', 'error');
                    return;
                }
                // Errore temporaneo (403, rete, ecc.) — NON disconnettere, la connessione è ok
                if (typeof toast === 'function') toast('Drive connesso, ma cartelle non accessibili: ' + errMsg, 'warning');
            }
            if (window.libraryMgr) window.libraryMgr.refresh();
            setTimeout(() => _autoOpenLastLesson(), 800);
        })();
    }

    /** Restituisce true se il token è valido. */
    isConnected() {
        return this.connected && !!this.accessToken && Date.now() < this.tokenExpiry;
    }

    /** Controlla se il token sta per scadere (< 5 min) e avvisa. */
    async _refreshIfNeeded() {
        if (!this.connected) return;
        // Se mancano meno di 5 minuti alla scadenza, avvisa l'utente
        if (Date.now() > this.tokenExpiry - 5 * 60 * 1000) {
            toast('Sessione Drive in scadenza — riconnetti per continuare a salvare.', 'info');
        }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // PERSISTENZA SESSIONE (sessionStorage + localStorage)
    // Il token viene salvato in entrambi: sessionStorage (più sicuro, si cancella alla chiusura
    // del tab) e localStorage (persiste tra sessioni, consente auto-login senza modal GIS).
    // Il token dura 1 ora — se l'utente usa l'app regolarmente, è sempre valido.
    // ──────────────────────────────────────────────────────────────────────────

    _saveSession() {
        const data = JSON.stringify({
            accessToken:     this.accessToken,
            tokenExpiry:     this.tokenExpiry,
            userEmail:       this.userEmail,
            userName:        this.userName,
            userPhotoUrl:    this.userPhotoUrl,
            rootFolderId:    this.rootFolderId,
            lessonsFolderId: this.lessonsFolderId,
            bgFolderId:      this.bgFolderId,
            connected:       this.connected
        });
        try { sessionStorage.setItem('eduboard_drive_session', data); } catch (_) {}
        try { localStorage.setItem('eduboard_drive_session', data); } catch (_) {}
    }

    _loadSession() {
        // Prova prima sessionStorage (stessa sessione browser), poi localStorage (sessione precedente)
        for (const store of [sessionStorage, localStorage]) {
            try {
                const raw = store.getItem('eduboard_drive_session');
                if (!raw) continue;
                const s = JSON.parse(raw);
                if (!s.accessToken || Date.now() >= s.tokenExpiry) continue;
                Object.assign(this, s);
                return true;
            } catch (_) {}
        }
        return false;
    }

    // ──────────────────────────────────────────────────────────────────────────
    // CARTELLE
    // ──────────────────────────────────────────────────────────────────────────

    /** Crea "EduBoard" nella root Drive se non esiste. */
    async _ensureRootFolder() {
        if (this.rootFolderId) return this.rootFolderId;
        this.rootFolderId = await this._findOrCreateFolder('EduBoard', null);
        this._saveSession();
        return this.rootFolderId;
    }

    /** Crea "EduBoard/Lezioni" se non esiste. */
    async _ensureLessonsFolder() {
        await this._ensureRootFolder();
        if (this.lessonsFolderId) return this.lessonsFolderId;
        this.lessonsFolderId = await this._findOrCreateFolder('Lezioni', this.rootFolderId);
        this._saveSession();
        return this.lessonsFolderId;
    }

    /** Crea "EduBoard/Sfondi" se non esiste. */
    async _ensureBgFolder() {
        await this._ensureRootFolder();
        if (this.bgFolderId) return this.bgFolderId;
        this.bgFolderId = await this._findOrCreateFolder('Sfondi', this.rootFolderId);
        this._saveSession();
        return this.bgFolderId;
    }

    /** Carica i colori cartelle da Drive (_folder_colors.json) e li applica a localStorage. */
    async _loadFolderColors() {
        if (!this.rootFolderId) return;
        try {
            const fileId = await this._findFileInFolder('_folder_colors.json', this.rootFolderId);
            if (!fileId) return;
            this._folderColorsId = fileId;
            const data = await this._apiFetch(
                `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`
            );
            if (data && typeof data === 'object') {
                for (const [id, color] of Object.entries(data)) {
                    if (color) localStorage.setItem('folder-color-' + id, color);
                    else localStorage.removeItem('folder-color-' + id);
                }
            }
        } catch (_) {}
    }

    /** Salva i colori cartelle (da localStorage) su Drive come _folder_colors.json. */
    async _saveFolderColors() {
        if (!this.rootFolderId) return;
        const colors = {};
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('folder-color-')) {
                colors[key.replace('folder-color-', '')] = localStorage.getItem(key);
            }
        }
        try {
            const newId = await this._uploadMultipart(
                '_folder_colors.json', colors, this._folderColorsId || null, this.rootFolderId
            );
            if (newId) this._folderColorsId = newId;
        } catch (_) {}
    }

    /**
     * Trova o crea una cartella in Drive.
     * @param {string} name       - nome cartella
     * @param {string|null} parentId - ID cartella padre (null = root Drive)
     * @returns {string} ID cartella
     */
    async createFolder(name, parentId) {
        return this._findOrCreateFolder(name, parentId);
    }

    /** Lista sottocartelle in un folder. */
    async listFolders(parentId) {
        this._checkConnected();
        const q = encodeURIComponent(
            `'${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`
        );
        const resp = await this._apiFetch(
            `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)&orderBy=name`
        );
        return resp.files || [];
    }

    /** Lista file JSON in un folder. */
    async listFiles(folderId) {
        this._checkConnected();
        const q = encodeURIComponent(
            `'${folderId}' in parents and mimeType='application/json' and trashed=false`
        );
        const resp = await this._apiFetch(
            `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,modifiedTime)&orderBy=createdTime`
        );
        return resp.files || [];
    }

    /** Elimina un file o una cartella. */
    async deleteItem(fileId) {
        this._checkConnected();
        await this._apiFetch(
            `https://www.googleapis.com/drive/v3/files/${fileId}`,
            'DELETE'
        );
    }

    /** Rinomina un file o una cartella. */
    async renameItem(fileId, newName) {
        this._checkConnected();
        return this._apiFetch(
            `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name`,
            'PATCH',
            { name: newName }
        );
    }

    /**
     * Sposta un file o cartella in una nuova cartella padre.
     * @param {string} fileId        - ID elemento da spostare
     * @param {string} newParentId   - ID nuova cartella destinazione
     * @param {string} oldParentId   - ID vecchia cartella origine
     * @returns {Object} risposta API con id e parents
     */
    async moveItem(fileId, newParentId, oldParentId) {
        this._checkConnected();
        const url = `https://www.googleapis.com/drive/v3/files/${fileId}` +
            `?addParents=${encodeURIComponent(newParentId)}` +
            `&removeParents=${encodeURIComponent(oldParentId)}` +
            `&fields=id,parents`;
        return this._apiFetch(url, 'PATCH');
    }

    // ──────────────────────────────────────────────────────────────────────────
    // LEZIONI
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * Salva una lezione su Drive.
     * Se esiste già un file con lo stesso nome nella stessa cartella, sovrascrive.
     *
     * @param {Object} lesson
     *   lesson.name         {string}  - nome lezione
     *   lesson.folderId     {string}  - ID cartella Drive destinazione
     *   lesson.drawingDataURL {string} - canvas.toDataURL()
     *   lesson.bgKey        {string}  - chiave sfondo preset (es. 'lines-5')
     *   lesson.bgImageBase64 {string} - base64 immagine sfondo custom (opzionale)
     *   lesson.metadata     {Object}  - dati extra opzionali
     * @returns {string} ID file creato/aggiornato
     */
    async saveLesson(lesson) {
        this._checkConnected();
        await this._refreshIfNeeded();

        const now = new Date().toISOString();
        const payload = {
            version:    2,
            name:       lesson.name,
            createdAt:  now,   // verrà sovrascritto se il file esiste già
            modifiedAt: now,
            background: {
                type:        lesson.bgImageBase64 ? 'image' : 'preset',
                key:         lesson.bgKey || 'white',
                imageBase64: lesson.bgImageBase64 || ''
            },
            drawing:     lesson.drawingDataURL || '',
            canvasWidth: lesson.canvasWidth || 0,
            pagePx:      lesson.pagePx ?? null,
            pagePy:      lesson.pagePy ?? null,
            ...(lesson.metadata || {})
        };

        const fileName = lesson.name.endsWith('.json')
            ? lesson.name
            : lesson.name + '.json';
        const targetFolderId = lesson.folderId || this.lessonsFolderId;

        // Cerca file esistente con lo stesso nome nella stessa cartella
        const existingId = await this._findFileInFolder(fileName, targetFolderId);

        if (existingId) {
            // Carica il createdAt originale per preservarlo
            try {
                const old = await this.loadLesson(existingId);
                payload.createdAt = old.createdAt || now;
            } catch (_) {}
            return this._uploadMultipart(fileName, payload, existingId);
        } else {
            return this._uploadMultipart(fileName, payload, null, targetFolderId);
        }
    }

    /**
     * Carica una lezione da Drive.
     * @param {string} fileId
     * @returns {Object} il JSON della lezione
     */
    async loadLesson(fileId) {
        this._checkConnected();
        const resp = await fetch(
            `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
            { headers: { Authorization: 'Bearer ' + this.accessToken } }
        );
        if (!resp.ok) throw new Error('Errore lettura lezione (' + resp.status + ')');
        return resp.json();
    }

    /**
     * Lista tutti i file .json in una cartella.
     * @param {string} folderId
     * @returns {Array<{id, name, modifiedTime}>}
     */
    async listLessons(folderId) {
        return this.listFiles(folderId);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // SFONDI
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * Lista immagini in TUTTE le cartelle chiamate "Sfondi" nel Drive dell'utente.
     * Se non trova nessuna cartella "Sfondi", usa la cartella EduBoard/Sfondi.
     * @returns {Array<{id, name, mimeType, thumbnailLink, webContentLink}>}
     */
    async listBackgrounds() {
        this._checkConnected();
        // Con drive.file possiamo leggere solo file creati dall'app: usa sempre EduBoard/Sfondi
        await this._ensureBgFolder();
        if (!this.bgFolderId) return [];

        const q = encodeURIComponent(
            `'${this.bgFolderId}' in parents and (mimeType contains 'image/' or mimeType='application/pdf') and trashed=false`
        );
        try {
            const resp = await this._apiFetch(
                `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,mimeType,thumbnailLink,webContentLink)&orderBy=name&pageSize=50`
            );
            return resp.files || [];
        } catch (_) {
            return [];
        }
    }

    /**
     * Carica un file immagine nella cartella "Sfondi".
     * @param {File} file - oggetto File dal <input type="file">
     * @returns {{id, name, webContentLink}}
     */
    async uploadBackground(file) {
        this._checkConnected();
        await this._ensureBgFolder();

        const boundary = 'eduboard_bg_' + Date.now();
        const mimeType = file.type || 'image/jpeg';

        // Legge il file come ArrayBuffer
        const buffer = await file.arrayBuffer();
        const bytes  = new Uint8Array(buffer);

        // Costruisce body multipart (metadata + binario)
        const metaJson = JSON.stringify({ name: file.name, parents: [this.bgFolderId] });
        const metaPart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metaJson}\r\n`;
        const dataPart = `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`;
        const ending   = `\r\n--${boundary}--`;

        // Assembla come Uint8Array per preservare i byte binari
        const enc       = new TextEncoder();
        const metaBytes = enc.encode(metaPart);
        const dataBytes = enc.encode(dataPart);
        const endBytes  = enc.encode(ending);

        const combined = new Uint8Array(
            metaBytes.length + dataBytes.length + bytes.length + endBytes.length
        );
        let offset = 0;
        combined.set(metaBytes, offset); offset += metaBytes.length;
        combined.set(dataBytes, offset); offset += dataBytes.length;
        combined.set(bytes,     offset); offset += bytes.length;
        combined.set(endBytes,  offset);

        const resp = await fetch(
            'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webContentLink',
            {
                method:  'POST',
                headers: {
                    Authorization:  'Bearer ' + this.accessToken,
                    'Content-Type': `multipart/related; boundary=${boundary}`
                },
                body: combined
            }
        );
        if (!resp.ok) throw new Error('Caricamento sfondo fallito (' + resp.status + ')');
        return resp.json();
    }

    /**
     * Scarica un'immagine da Drive e la converte in dataURL.
     * @param {string} fileId
     * @returns {string} dataURL (es. "data:image/jpeg;base64,...")
     */
    async loadBackgroundAsDataURL(fileId) {
        this._checkConnected();
        const resp = await fetch(
            `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
            { headers: { Authorization: 'Bearer ' + this.accessToken } }
        );
        if (!resp.ok) throw new Error('Errore download sfondo (' + resp.status + ')');
        const blob   = await resp.blob();
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload  = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }

    // ──────────────────────────────────────────────────────────────────────────
    // HELPER INTERNI
    // ──────────────────────────────────────────────────────────────────────────

    /** Trova o crea una cartella Drive per nome. */
    async _findOrCreateFolder(name, parentId) {
        let q = `name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
        if (parentId) q += ` and '${parentId}' in parents`;
        const resp = await this._apiFetch(
            `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)`
        );
        if (resp.files && resp.files.length > 0) return resp.files[0].id;

        // Crea cartella
        const body = { name, mimeType: 'application/vnd.google-apps.folder' };
        if (parentId) body.parents = [parentId];
        const created = await this._apiFetch(
            'https://www.googleapis.com/drive/v3/files?fields=id',
            'POST',
            body
        );
        return created.id;
    }

    /** Cerca un file per nome in una cartella specifica. Restituisce fileId o null. */
    async _findFileInFolder(name, folderId) {
        const q = encodeURIComponent(
            `name='${name}' and '${folderId}' in parents and trashed=false`
        );
        const resp = await this._apiFetch(
            `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)`
        );
        return (resp.files && resp.files.length > 0) ? resp.files[0].id : null;
    }

    /**
     * Upload multipart su Drive API v3 (per file JSON).
     * @param {string}      name      - nome file
     * @param {Object}      data      - oggetto JS da serializzare come JSON
     * @param {string|null} fileId    - se non null: PATCH (aggiornamento)
     * @param {string|null} parentId  - solo per nuovi file: cartella destinazione
     * @returns {string} ID file
     */
    async _uploadMultipart(name, data, fileId, parentId) {
        const boundary  = 'eduboard_' + Date.now();
        const payload   = JSON.stringify(data, null, 2);
        const metaObj   = fileId ? {} : { name, parents: parentId ? [parentId] : undefined };
        const metaJson  = JSON.stringify(metaObj);

        const body =
            `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metaJson}\r\n` +
            `--${boundary}\r\nContent-Type: application/json\r\n\r\n${payload}\r\n` +
            `--${boundary}--`;

        const url    = fileId
            ? `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart&fields=id`
            : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id';
        const method = fileId ? 'PATCH' : 'POST';

        const resp = await fetch(url, {
            method,
            headers: {
                Authorization:  'Bearer ' + this.accessToken,
                'Content-Type': `multipart/related; boundary=${boundary}`
            },
            body
        });
        if (!resp.ok) throw new Error('Salvataggio Drive fallito (' + resp.status + ')');
        const result = await resp.json();
        return result.id;
    }

    /** Helper fetch per Drive/Google API (JSON). Non per download binari. */
    async _apiFetch(url, method = 'GET', body) {
        const opts = {
            method,
            headers: { Authorization: 'Bearer ' + this.accessToken }
        };
        if (body !== undefined) {
            opts.body                    = JSON.stringify(body);
            opts.headers['Content-Type'] = 'application/json';
        }
        const resp = await fetch(url, opts);
        if (method === 'DELETE' && resp.status === 204) return null;
        if (!resp.ok) throw new Error(`Drive API error ${resp.status} — ${url}`);
        return resp.json();
    }

    /** Lancia un errore se non connessi. */
    _checkConnected() {
        if (!this.isConnected()) throw new Error('Non connesso a Google Drive.');
    }
}


// =============================================================================
// SEZIONE 1b — AutoSaveManager
// Gestisce il salvataggio automatico in tempo reale con debounce.
// Si attiva solo quando Drive è connesso E c'è un file aperto (currentFileId).
// =============================================================================

class AutoSaveManager {
    constructor() {
        this._timer   = null;
        this._saving  = false;
        this._loading = false; // true durante il caricamento lezione (blocca onDirty)
        this.DEBOUNCE_MS = 3000; // 3 secondi dopo l'ultima modifica
    }

    /**
     * Chiamato ad ogni modifica sulla lavagna (dopo isDirty = true).
     * Avvia il timer di debounce per il salvataggio automatico.
     */
    onDirty() {
        // Non avviare auto-save durante il caricamento di una lezione
        if (this._loading) return;
        // Auto-save solo se connesso Drive E c'è un file aperto
        if (!window.libraryMgr?.currentFileId) return;
        if (!window.driveMgr?.isConnected()) return;

        clearTimeout(this._timer);
        this._setPending();
        this._timer = setTimeout(() => this._doSave(), this.DEBOUNCE_MS);
    }

    /** Blocca onDirty durante il caricamento lezione. */
    beginLoading() { this._loading = true; }
    endLoading()   { this._loading = false; }

    async _doSave() {
        if (this._saving) return;
        this._saving = true;
        this._timer  = null;
        this._setSaving();
        try {
            await window.libraryMgr.overwriteCurrentLesson(true); // silent = true
            this._setSaved();
        } catch (e) {
            console.warn('Auto-save fallito:', e);
            this._setError();
        } finally {
            this._saving = false;
        }
    }

    /** True se un salvataggio è in corso (blocca la chiusura). */
    isSaving() { return this._saving; }

    /** True se ci sono modifiche in attesa di salvataggio. */
    hasPending() { return this._timer !== null; }

    /** Cancella il timer e resetta lo stato (usato dopo caricamento lezione). */
    reset() {
        clearTimeout(this._timer);
        this._timer  = null;
        this._saving = false;
        this._setError(); // rimuove tutti i badge
    }

    _getWrapper() {
        return document.getElementById('bottom-right-bar') ||
               document.getElementById('drive-fab-wrapper') ||
               document.getElementById('drive-fab')?.parentElement;
    }

    _setPending() {
        const w = this._getWrapper();
        if (!w) return;
        w.classList.remove('autosave-saving', 'autosave-saved');
        w.classList.add('autosave-pending');
    }
    _setSaving() {
        const w = this._getWrapper();
        if (!w) return;
        w.classList.remove('autosave-pending', 'autosave-saved');
        w.classList.add('autosave-saving');
    }
    _setSaved() {
        const w = this._getWrapper();
        if (!w) return;
        w.classList.remove('autosave-saving', 'autosave-pending');
        w.classList.add('autosave-saved');
        // Rimuovi il checkmark dopo 4 secondi
        clearTimeout(this._savedTimer);
        this._savedTimer = setTimeout(() => w.classList.remove('autosave-saved'), 4000);
    }
    _setError() {
        const w = this._getWrapper();
        if (!w) return;
        w.classList.remove('autosave-saving', 'autosave-pending', 'autosave-saved');
    }
}

// Istanza globale (disponibile anche in app.js)
window.autoSaveMgr = new AutoSaveManager();


// =============================================================================
// SEZIONE 2 — LibraryManager
// Gestisce il pannello UI della libreria lezioni (struttura ad albero)
// =============================================================================

class LibraryManager {
    constructor(driveManager) {
        this.drive  = driveManager;
        this.panel  = document.getElementById('library-panel');
        this.treeEl = document.getElementById('library-tree');

        // Cartella correntemente selezionata per il salvataggio
        this.currentFolderId = null;

        // FileId dell'ultima lezione aperta/salvata (per ripristino posizione)
        this.currentFileId = null;

        // Cartelle espanse dall'utente: sopravvive al refresh (localStorage).
        // Default: CHIUSE — solo quelle che l'utente apre esplicitamente (o che
        // contengono la lezione corrente) vengono espanse.
        const _saved = JSON.parse(localStorage.getItem('eduboard-expanded-folders') || '[]');
        this._expandedFolders = new Set(_saved);

        // Cache ordini per cartella: { [folderId]: { orderId: string|null } }
        this._orderCache = {};

        // Cache indentazioni lezioni: { [folderId]: { fileId: 1 } }
        this._indentCache = {};
    }

    // ──────────────────────────────────────────────────────────────────────────
    // APERTURA / CHIUSURA
    // ──────────────────────────────────────────────────────────────────────────

    /** Persiste _expandedFolders in localStorage. */
    _saveExpandedFolders() {
        localStorage.setItem('eduboard-expanded-folders', JSON.stringify([...this._expandedFolders]));
    }

    toggle() {
        const isOpen = this.panel.classList.contains('open');
        if (isOpen) {
            this.panel.classList.remove('open');
        } else {
            this.panel.classList.add('open');
            this.refresh();
            // Evidenzia la lezione corrente ogni volta che il pannello si apre.
            // _highlightCurrentLesson ha già i retry interni per gestire il tree ancora in caricamento.
            if (this.currentFileId) {
                setTimeout(() => this._highlightCurrentLesson(), 400);
            }
        }
    }

    close() {
        this.panel.classList.remove('open');
    }

    // ──────────────────────────────────────────────────────────────────────────
    // RENDER LOCK — previene rendering concorrenti che causano duplicazione
    // ──────────────────────────────────────────────────────────────────────────

    /** Annulla il background refresh in corso (se presente). */
    _cancelBackgroundRefresh() {
        this._bgRefreshToken = (this._bgRefreshToken || 0) + 1;
    }

    // ──────────────────────────────────────────────────────────────────────────
    // REFRESH — ricarica albero dal Drive
    // ──────────────────────────────────────────────────────────────────────────

    async refresh() {
        // Annulla qualsiasi background refresh in corso e acquisisci il lock
        this._cancelBackgroundRefresh();
        if (this._refreshLock) return; // già in corso: ignora chiamata doppia
        this._refreshLock = true;

        this._updateDriveStatus();
        const savedScroll = this.treeEl.scrollTop;

        // Se l'albero è già stato caricato almeno una volta, NON mostrare "Caricamento..."
        // — aggiorna in background senza disturbare l'utente.
        if (this._treeLoaded && this.treeEl.hasChildNodes()) {
            this._refreshLock = false;
            this._backgroundRefresh('eduboard-lib-cache', savedScroll);
            return;
        }

        this.treeEl.innerHTML = '<div class="tree-loading">Caricamento...</div>';

        if (!this.drive.isConnected()) {
            this.treeEl.innerHTML = `
                <div class="tree-empty">
                    <p>Connetti Google Drive per usare la libreria.</p>
                    <button class="tree-connect-btn" id="tree-connect-btn">Connetti Drive</button>
                </div>`;
            document.getElementById('tree-connect-btn')?.addEventListener('click', () => this._connectAndRefresh());
            this._refreshLock = false; // rilascia lock — permette nuovo refresh dopo connessione
            return;
        }

        const CACHE_KEY = 'eduboard-lib-cache';
        const CACHE_TTL = 600000; // 10 minuti

        // Controlla cache localStorage
        const _renderFromData = async () => {
            await this.drive._ensureLessonsFolder();
            this.treeEl.innerHTML = '';
            await this.renderTree(this.drive.lessonsFolderId, this.treeEl, 0);
            if (!this.treeEl.hasChildNodes()) {
                this.treeEl.innerHTML = '<div class="tree-empty">Nessuna lezione salvata.</div>';
            }
            if (this.currentFileId) {
                // Espansione cartelle di primo livello è asincrona — attendi il DOM
                setTimeout(() => this._highlightCurrentLesson(), 300);
            } else {
                this.treeEl.scrollTop = savedScroll;
            }
        };

        // Leggi cache
        let cached = null;
        try {
            const raw = localStorage.getItem(CACHE_KEY);
            if (raw) cached = JSON.parse(raw);
        } catch (_) {}

        const cacheValid = cached && (Date.now() - cached.ts < CACHE_TTL);

        if (cacheValid) {
            // Renderizza subito da cache, poi aggiorna da Drive in background
            try {
                await _renderFromData();
                this._treeLoaded = true;
            } catch (err) {
                this.treeEl.innerHTML = `<div class="tree-empty tree-error">Errore: ${err.message}</div>`;
            }
            // Rilascia lock PRIMA del background refresh (così se refresh() è richiamata
            // durante il background refresh, partirà una nuova sequenza da capo)
            this._refreshLock = false;
            // Aggiornamento background silenzioso — aggiorna cache e re-render
            this._backgroundRefresh(CACHE_KEY, savedScroll);
        } else {
            // Cache mancante o scaduta: fetch Drive normalmente
            try {
                await _renderFromData();
                this._treeLoaded = true;
                // Salva in cache dopo render riuscito
                try {
                    localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now() }));
                } catch (_) {}
            } catch (err) {
                this.treeEl.innerHTML = `<div class="tree-empty tree-error">Errore: ${err.message}</div>`;
            }
            this._refreshLock = false;
        }
    }

    /** Forza refresh dopo salva/elimina/rinomina/sposta.
     *  Se il pannello è aperto con contenuto, aggiorna silenziosamente senza "Caricamento...".
     *  Se il pannello è chiuso, invalida lo stato così il prossimo open caricherà dati freschi. */
    _forceRefresh() {
        this._lastBgRefresh = 0; // azzera il cooldown background refresh
        if (this.panel.classList.contains('open') && this.treeEl.hasChildNodes()) {
            // Pannello aperto: aggiornamento silenzioso senza spinner
            const savedScroll = this.treeEl.scrollTop || 0;
            this._backgroundRefresh('eduboard-lib-cache', savedScroll);
        }
        // NON resettare _treeLoaded quando il pannello è chiuso:
        // il DOM dell'albero persiste ed è riutilizzabile — alla riapertura
        // mostra l'albero esistente immediatamente (zero flash) e fa bg refresh.
    }

    /** Aggiornamento silenzioso da Drive in background dopo render da cache. */
    async _backgroundRefresh(cacheKey, savedScroll) {
        // Non fare background refresh se è già stato fatto da meno di 3 minuti
        // (evita flash visivo ad ogni apertura del pannello)
        const lastBg = this._lastBgRefresh || 0;
        if (Date.now() - lastBg < 3 * 60 * 1000) return;
        this._lastBgRefresh = Date.now();

        // Cattura il token corrente: se refresh() viene chiamata di nuovo, il token cambia
        // e questo background refresh si fermerà prima di sovrascrivere il nuovo render.
        const myToken = this._bgRefreshToken || 0;
        try {
            await this.drive._ensureLessonsFolder();
            // Controlla se siamo stati annullati (nuovo refresh partito)
            if ((this._bgRefreshToken || 0) !== myToken) return;
            // Render in container temporaneo: l'albero corrente rimane visibile
            // mentre si scaricano i dati da Drive — zero flash/collasso.
            const tmpContainer = document.createElement('div');
            await this.renderTree(this.drive.lessonsFolderId, tmpContainer, 0);
            if ((this._bgRefreshToken || 0) !== myToken) return; // annullato durante renderTree
            const scrollPos = this.treeEl.scrollTop;
            if (!tmpContainer.hasChildNodes()) {
                this.treeEl.innerHTML = '<div class="tree-empty">Nessuna lezione salvata.</div>';
            } else {
                this.treeEl.innerHTML = '';
                while (tmpContainer.firstChild) this.treeEl.appendChild(tmpContainer.firstChild);
                this.treeEl.scrollTop = scrollPos;
            }
            this._treeLoaded = true;
            // Aggiorna timestamp cache dopo fetch riuscito
            try {
                localStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now() }));
            } catch (_) {}
            if (this.currentFileId) {
                setTimeout(() => this._highlightCurrentLesson(), 200);
            } else {
                this.treeEl.scrollTop = savedScroll;
            }
        } catch (_) {
            // Background refresh fallito: nessun messaggio (la cache è già mostrata)
        }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // EVIDENZIA LEZIONE CORRENTE
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * Dopo il render dell'albero, cerca il file con currentFileId,
     * lo evidenzia con la classe lesson-item--active, espande le cartelle
     * genitrici e fa scroll fino all'elemento.
     * Se il file non è ancora nel DOM (cartella non caricata), espande tutto l'albero e riprova.
     */
    async _highlightCurrentLesson(retries = 6) {
        if (!this.currentFileId) return;
        const panel = this.treeEl;
        if (!panel) return;
        panel.querySelectorAll('.lesson-item--active').forEach(el => el.classList.remove('lesson-item--active'));
        // Prima prova: cerca nel DOM già caricato
        if (this._applyHighlight(panel)) return;
        // Non trovato: le cartelle async potrebbero non essere ancora nel DOM.
        // Riprova ogni 400ms fino a retries volte prima di forzare l'espansione.
        if (retries > 0) {
            setTimeout(() => this._highlightCurrentLesson(retries - 1), 400);
            return;
        }
        // Ultimo tentativo → espandi forzatamente tutti i nodi non ancora caricati e riprova
        await this._forceExpandAll(panel);
        this._applyHighlight(panel);
    }

    /** Cerca currentFileId nel DOM, applica l'highlight e apre i folder genitori. Ritorna true se trovato. */
    _applyHighlight(panel) {
        let found = false;
        panel.querySelectorAll('[data-file-id]').forEach(item => {
            if (item.dataset.fileId !== this.currentFileId) return;
            item.classList.add('lesson-item--active');
            // Rendi visibili tutti i tree-subtree antenati
            let p = item.parentElement;
            while (p && p !== panel) {
                if (p.classList.contains('tree-subtree')) {
                    p.style.display = 'block';
                    const folderRow = p.previousElementSibling;
                    if (folderRow) {
                        const icon = folderRow.querySelector('.tree-icon');
                        if (icon) icon.textContent = '📂';
                    }
                    // Assicura che la cartella genitore risulti espansa
                    const fid = p.dataset.folderId;
                    if (fid) { this._expandedFolders.add(fid); this._saveExpandedFolders(); }
                }
                p = p.parentElement;
            }
            setTimeout(() => item.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 150);
            found = true;
        });
        return found;
    }

    /** Espande forzatamente tutti i tree-subtree non ancora caricati (data-loaded="false") in tutto l'albero. */
    async _forceExpandAll(panel) {
        // Itera finché ci sono nodi da caricare (le cartelle appena caricate possono avere altri nodi figli)
        let safety = 0;
        while (safety++ < 10) {
            const unloaded = [...panel.querySelectorAll('.tree-subtree[data-loaded="false"]')];
            if (!unloaded.length) break;
            for (const sub of unloaded) {
                const folderId = sub.dataset.folderId;
                if (!folderId) continue;
                sub.dataset.loaded = 'true';
                sub.style.display = 'block';
                sub.innerHTML = '';
                try {
                    await this.renderTree(folderId, sub, 1);
                } catch (_) {}
            }
        }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // RENDER ALBERO RICORSIVO
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * Renderizza la struttura ad albero (cartelle + file) in modo ricorsivo.
     * @param {string}      parentId  - ID cartella Drive da cui partire
     * @param {HTMLElement} container - elemento DOM in cui appendere
     * @param {number}      depth     - profondità corrente (per indentazione)
     */
    async renderTree(parentId, container, depth = 0) {
        // Token anti-duplicazione: se una renderTree più recente parte sullo stesso
        // container prima che questa finisca l'await Drive, questa si annulla.
        const token = (container._rt = (container._rt || 0) + 1);

        const [folders, rawFiles, orderData] = await Promise.all([
            this.drive.listFolders(parentId),
            this.drive.listLessons(parentId),
            this._loadOrder(parentId)
        ]);

        // Render annullato da una chiamata più recente sullo stesso container
        if (container._rt !== token) return;

        // Filtra il file di controllo ordine e applica ordine personalizzato
        this._orderCache[parentId] = { orderId: orderData.orderId };
        const files = this._applyOrder(
            rawFiles.filter(f => f.name !== '_order.json'),
            orderData.order
        );

        // --- Cartelle ---
        for (const folder of folders) {
            const item = this._createTreeItem('folder', '📁', folder.name, 0, depth);
            container.appendChild(item);

            // Stile linguetta colorata
            const folderColor = localStorage.getItem('folder-color-' + folder.id) || null;
            this._applyFolderTabStyle(item, folderColor);
            item.dataset.folderId = folder.id;

            // Cerchietto colore cartella
            const colorDot = this._createColorDot(folder.id, item);
            // Inserisci il dot prima dell'icona cartella
            item.insertBefore(colorDot, item.firstChild);

            // Sottocartella collassabile
            const subContainer = document.createElement('div');
            subContainer.className = 'tree-subtree';
            subContainer.style.display = 'none';
            subContainer.dataset.loaded = 'false';
            subContainer.dataset.folderId = folder.id; // usato da _forceExpandAll per highlight lezione
            container.appendChild(subContainer);

            // Helper per espandere la cartella (usato sia dal click che dall'auto-restore)
            const expandFolder = async () => {
                const iconEl = item.querySelector('.tree-icon');
                subContainer.style.display = 'block';
                if (iconEl) iconEl.textContent = '📂';
                if (subContainer.dataset.loaded === 'false') {
                    subContainer.dataset.loaded = 'true';
                    subContainer.innerHTML = `<div class="tree-loading">⏳ Caricamento...</div>`;
                    try {
                        subContainer.innerHTML = '';
                        await this.renderTree(folder.id, subContainer, depth + 1);
                        if (!subContainer.children.length) {
                            subContainer.innerHTML = `<div class="tree-empty" style="font-size:0.78rem;color:var(--text-muted)">Cartella vuota</div>`;
                        }
                    } catch (err) {
                        subContainer.innerHTML = `<div class="tree-empty" style="color:#ef4444">Errore: ${err.message}</div>`;
                    }
                }
            };

            // Click su TUTTA la riga cartella → espandi/collassa + seleziona
            item.addEventListener('click', async (e) => {
                e.stopPropagation();
                this._selectFolder(folder.id, item);

                const isOpen = subContainer.style.display !== 'none';
                if (isOpen) {
                    subContainer.style.display = 'none';
                    const iconEl = item.querySelector('.tree-icon');
                    if (iconEl) iconEl.textContent = '📁';
                    this._expandedFolders.delete(folder.id); // utente ha chiuso
                    this._saveExpandedFolders();
                } else {
                    this._expandedFolders.add(folder.id); // utente ha aperto
                    this._saveExpandedFolders();
                    await expandFolder();
                }
            });

            // Espandi solo le cartelle che l'utente ha aperto esplicitamente.
            if (this._expandedFolders.has(folder.id)) {
                expandFolder(); // non awaita per non bloccare il render iniziale
            }

            // Pulsanti contestuali cartella (rinomina/elimina) — stopPropagation interno
            this._addContextButtons(item, folder, 'folder');

            // Drag-and-drop — questa cartella è sia draggable che drop target
            this._makeDraggable(item, folder.id, parentId, folder.name, 'folder');
            this._makeDropTarget(item, subContainer, folder.id);
        }

        // Cache indentazioni per questa cartella
        if (!this._indentCache) this._indentCache = {};
        this._indentCache[parentId] = orderData.indents || {};

        // --- File lezioni ---
        for (const file of files) {
            const name   = file.name.replace(/\.json$/, '');
            const indent = orderData.indents?.[file.id] || 0;
            const item   = this._createTreeItem('lesson', '📄', name, indent, depth + 1);
            item.dataset.fileId   = file.id;
            item.dataset.folderId = parentId;
            item.dataset.indent   = indent;
            if (indent > 0) item.classList.add('lesson-indented');
            container.appendChild(item);

            // Click su file: apre la lezione
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                this.openLesson(file.id, file.name);
            });

            this._addContextButtons(item, { id: file.id, name }, 'lesson');

            // Pulsante indent/dedent: ↳ = rendi sotto-lezione, ↑ = riporta al livello
            const _actEl = item.querySelector('.tree-actions');
            const _indBtn = document.createElement('button');
            _indBtn.className = 'tree-btn';
            _indBtn.dataset.action = 'indent';
            _indBtn.title  = indent > 0 ? 'Riporta al livello principale' : 'Rendi sotto-lezione';
            _indBtn.textContent = indent > 0 ? '↑' : '↳';
            _actEl.insertBefore(_indBtn, _actEl.firstChild);
            _indBtn.addEventListener('click', async e => {
                e.stopPropagation();
                const cur  = parseInt(item.dataset.indent || '0');
                const next = cur === 0 ? 1 : 0;
                item.dataset.indent = next;
                if (next > 0) { item.classList.add('lesson-indented');    _indBtn.textContent = '↑'; _indBtn.title = 'Riporta al livello principale'; }
                else          { item.classList.remove('lesson-indented'); _indBtn.textContent = '↳'; _indBtn.title = 'Rendi sotto-lezione'; }
                if (!this._indentCache[parentId]) this._indentCache[parentId] = {};
                this._indentCache[parentId][file.id] = next;
                const order = [...container.querySelectorAll(`.tree-item.lesson[data-folder-id="${parentId}"]`)]
                    .map(el => el.dataset.fileId);
                await this._saveOrder(parentId, order, this._indentCache[parentId]);
            });

            // Drag-and-drop spostamento cartella
            this._makeDraggable(item, file.id, parentId, file.name, 'lesson');

            // Drag handle per riordino nella stessa cartella
            this._attachReorderHandle(item, file.id, parentId, container);

            // Swipe orizzontale → indent/dedent visivo (stile OneNote)
            let _swX = 0, _swY = 0, _swOk = false, _swPid = -1;
            item.addEventListener('pointerdown', e => {
                if (e.target.classList.contains('drag-handle')) return;
                if (e.target.closest('.tree-actions')) return;
                _swX = e.clientX; _swY = e.clientY; _swOk = true; _swPid = e.pointerId;
                // Pointer capture: garantisce pointerup anche se il dito esce dall'elemento
                try { item.setPointerCapture(e.pointerId); } catch(_) {}
            });
            item.addEventListener('pointerup', async e => {
                if (!_swOk || e.pointerId !== _swPid) return;
                _swOk = false;
                try { item.releasePointerCapture(e.pointerId); } catch(_) {}
                const dx = e.clientX - _swX, dy = e.clientY - _swY;
                if (Math.abs(dx) < 25 || Math.abs(dy) > 35) return; // soglia 25px
                // Previeni il click che aprirebbe la lezione
                item.addEventListener('click', ev => ev.stopPropagation(), { once: true, capture: true });
                const cur  = parseInt(item.dataset.indent || '0');
                const next = dx > 0 ? Math.min(cur + 1, 1) : Math.max(cur - 1, 0);
                if (next === cur) return;
                item.dataset.indent = next;
                if (next > 0) item.classList.add('lesson-indented');
                else          item.classList.remove('lesson-indented');
                if (!this._indentCache[parentId]) this._indentCache[parentId] = {};
                this._indentCache[parentId][file.id] = next;
                const order = [...container.querySelectorAll(`.tree-item.lesson[data-folder-id="${parentId}"]`)]
                    .map(el => el.dataset.fileId);
                await this._saveOrder(parentId, order, this._indentCache[parentId]);
            });
        }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // AZIONI
    // ──────────────────────────────────────────────────────────────────────────

    /** Apre dialog per creare nuova cartella nella posizione selezionata. */
    async createFolder(parentId) {
        if (!this.drive.isConnected()) {
            toast('Connetti Drive prima.', 'error'); return;
        }
        const name = prompt('Nome nuova cartella:');
        if (!name || !name.trim()) return;
        try {
            await this.drive.createFolder(name.trim(), parentId || this.drive.lessonsFolderId);
            toast('Cartella creata!', 'success');
            this._forceRefresh();
        } catch (err) {
            toast('Errore creazione cartella: ' + err.message, 'error');
        }
    }

    /**
     * Carica una lezione da Drive e la applica alla lavagna.
     * @param {string} fileId
     * @param {string} fileName - usato solo per il nome progetto
     */
    async openLesson(fileId, fileName) {
        if (!this.drive.isConnected()) {
            toast('Connetti Drive prima.', 'error'); return;
        }

        // Se auto-save in corso, blocca e avvisa
        if (window.autoSaveMgr?.isSaving()) {
            toast('Salvataggio automatico in corso — attendi un momento.', 'info');
            return;
        }

        // BUG 1 FIX: Se dirty E c'è un file Drive aperto → salva sempre prima di cambiare lezione,
        // indipendentemente dallo stato del timer debounce (già scaduto o ancora pending).
        if (typeof CONFIG !== 'undefined' && CONFIG.isDirty && this.currentFileId) {
            // Cancella timer pending se esiste (evita doppio salvataggio)
            if (window.autoSaveMgr?._timer) {
                clearTimeout(window.autoSaveMgr._timer);
                window.autoSaveMgr._timer = null;
            }
            try {
                await this.overwriteCurrentLesson(false); // false = mostra toast
            } catch(e) {
                console.warn('Salvataggio pre-cambio lezione fallito:', e);
            }
        }

        // Mostra dialog salvataggio SOLO se:
        // - c'è un auto-save pending senza currentFileId (flush immediato), OPPURE
        // - isDirty=true E non c'è currentFileId (nessun auto-save attivo, salvataggio manuale)
        const hasPendingAutoSave = window.autoSaveMgr?.hasPending();
        if (hasPendingAutoSave && !this.currentFileId) {
            // Flush immediato prima di procedere
            clearTimeout(window.autoSaveMgr._timer);
            window.autoSaveMgr._timer = null;
            try { await window.libraryMgr.overwriteCurrentLesson(); } catch (_) {}
            window.autoSaveMgr._setError();
        } else if (typeof CONFIG !== 'undefined' && CONFIG.isDirty && !this.currentFileId) {
            // Solo se dirty E senza auto-save attivo (nessun file Drive aperto)
            if (typeof confirmIfDirty === 'function') {
                const canContinue = await confirmIfDirty();
                if (!canContinue) return;
            }
        }
        try {
            window.autoSaveMgr?.beginLoading();
            toast('Caricamento lezione...', 'info');
            const lesson = await this.drive.loadLesson(fileId);

            // 0. Pulisci lo stato corrente prima di caricare la nuova lezione
            if (typeof objectLayer !== 'undefined' && objectLayer) objectLayer.clear();

            // 1. Ripristina sfondo
            if (lesson.background) {
                if (lesson.background.type === 'image' && lesson.background.imageBase64) {
                    const img = new Image();
                    img.onload = () => bgMgr.setImage(img);
                    img.src    = lesson.background.imageBase64;
                } else {
                    bgMgr.setBackground(lesson.background.key || 'white');
                    // Aggiorna pulsante sfondo attivo nella toolbar
                    document.querySelectorAll('.bg-opt').forEach(b => b.classList.remove('active'));
                    const activeBtn = document.querySelector(`.bg-opt[data-bg="${lesson.background.key || 'white'}"]`);
                    if (activeBtn) activeBtn.classList.add('active');
                }
            }

            // 2. Ripristina disegno
            // FIX v14: se ci sono pagine multiple, NON caricare lesson.drawing —
            // createrebbe una race condition asincrona con _restorePage che
            // sovrappone il contenuto di una pagina sull'altra al caricamento.
            // lesson.drawing viene usato solo per retrocompatibilità (lezioni senza pages).
            const hasPages = lesson.pages && Array.isArray(lesson.pages) && lesson.pages.length > 0;
            if (lesson.drawing && !hasPages) {
                const img = new Image();
                // Offset calcolato ORA (sincrono), non dentro onload
                let offsetX = 0, offsetY = 0;
                if (lesson.pagePx != null && typeof bgMgr !== 'undefined') {
                    const W = canvasMgr.canvas.width, H = canvasMgr.canvas.height;
                    const curr = bgMgr._getPageRect(W, H);
                    offsetX = curr.px - lesson.pagePx;
                    offsetY = curr.py - lesson.pagePy;
                }
                img.onload = () => {
                    canvasMgr._saveUndo();
                    canvasMgr.ctx.clearRect(0, 0, canvasMgr.canvas.width, canvasMgr.canvas.height);
                    canvasMgr.ctx.drawImage(img, offsetX, offsetY);
                };
                img.src = lesson.drawing;
            }

            // 3. Aggiorna nome progetto
            const name = lesson.name || fileName.replace(/\.json$/, '');
            CONFIG.projectName = name;
            document.getElementById('project-name').textContent = name;

            // 4. Ripristina pagine multiple (se presenti)
            if (hasPages && typeof window.pageManager !== 'undefined' && window.pageManager) {
                window.pageManager.deserialize(lesson.pages);
            }

            toast('Lezione "' + name + '" caricata!', 'success');
            // Memorizza fileId corrente per ripristino posizione
            this.currentFileId = fileId;
            // Evidenzia subito la lezione nel pannello (se aperto) o alla prossima apertura
            setTimeout(() => this._highlightCurrentLesson(), 100);
            window.autoSaveMgr?.endLoading();
            // Reset isDirty con delay: le operazioni asincrone di ripristino (img.onload, ecc.)
            // potrebbero impostare isDirty=true dopo il reset sincrono — lo riesegiamo dopo
            setTimeout(() => {
                if (typeof CONFIG !== 'undefined') CONFIG.isDirty = false;
                window.autoSaveMgr?.reset();
            }, 500);
            // Memorizza come ultima lezione aperta per auto-open al prossimo avvio
            localStorage.setItem('eduboard_last_lesson', JSON.stringify({ fileId, fileName, userEmail: this.drive?.userEmail || null }));
            // NON chiude il pannello: rimane aperto stile OneNote per passare velocemente tra lezioni.
            // centerView si adatta alle dimensioni correnti (pannello aperto o chiuso).
            setTimeout(() => panMgr?.centerView(), 100);
        } catch (err) {
            window.autoSaveMgr?.endLoading();
            toast('Errore apertura lezione: ' + err.message, 'error');
        }
    }

    /**
     * Salva la lezione corrente nella cartella selezionata.
     * Se nessuna cartella è selezionata, chiede il nome e salva in "Lezioni".
     */
    async saveCurrentLesson(folderId) {
        if (!this.drive.isConnected()) {
            toast('Connetti Drive prima di salvare.', 'error'); return;
        }

        const targetFolder = folderId || this.currentFolderId || this.drive.lessonsFolderId;

        const name = prompt('Nome lezione:', CONFIG.projectName);
        if (!name || !name.trim()) return;

        try {
            toast('Salvataggio in corso...', 'info');

            // Salva posizione (pan+zoom) associata a questa lezione (se abbiamo un fileId corrente)
            if (typeof panMgr !== 'undefined' && panMgr && this.currentFileId) {
                localStorage.setItem('eduboard_view_' + this.currentFileId, JSON.stringify({
                    dx: panMgr.dx,
                    dy: panMgr.dy,
                    scale: panMgr.scale
                }));
            }

            // Raccoglie dati sfondo
            let bgImageBase64 = '';
            if (bgMgr.uploadedImage) {
                // Converti immagine sfondo in base64 usando un canvas temporaneo
                const tmp    = document.createElement('canvas');
                tmp.width    = bgMgr.canvas.width;
                tmp.height   = bgMgr.canvas.height;
                tmp.getContext('2d').drawImage(bgMgr.canvas, 0, 0);
                bgImageBase64 = tmp.toDataURL('image/jpeg', 0.85);
            }

            const savedFileId = await this.drive.saveLesson({
                name:           name.trim(),
                folderId:       targetFolder,
                drawingDataURL: canvasMgr.getDataURL(),
                bgKey:          bgMgr.currentBg,
                bgImageBase64,
                pages:          window.pageManager ? window.pageManager.serialize() : null,
                canvasWidth: canvasMgr?.canvas?.width || 0,
                pagePx: (typeof bgMgr !== 'undefined' && canvasMgr?.canvas) ? bgMgr._getPageRect(canvasMgr.canvas.width, canvasMgr.canvas.height).px : null,
                pagePy: (typeof bgMgr !== 'undefined' && canvasMgr?.canvas) ? bgMgr._getPageRect(canvasMgr.canvas.width, canvasMgr.canvas.height).py : null
            });

            // Traccia fileId corrente
            if (savedFileId) {
                this.currentFileId = savedFileId;
                localStorage.setItem('eduboard_last_lesson', JSON.stringify({ fileId: savedFileId, fileName: name.trim() + '.json', userEmail: this.drive?.userEmail || null }));
            }

            CONFIG.projectName = name.trim();
            document.getElementById('project-name').textContent = name.trim();
            CONFIG.isDirty = false;
            window.autoSaveMgr?.reset();
            toast('Lezione salvata su Drive!', 'success');
            this._forceRefresh();
        } catch (err) {
            toast('Errore salvataggio: ' + err.message, 'error');
        }
    }

    /**
     * MODIFICA 5: Sovrascrive la lezione Drive corrente (currentFileId) senza chiedere il nome.
     * Usato dal dialog "modifiche non salvate" e dall'auto-save.
     * @param {boolean} [silent=false] - se true, non mostra toast (usato dall'auto-save)
     */
    async overwriteCurrentLesson(silent = false) {
        if (!this.drive.isConnected()) { if (!silent) toast('Connetti Drive prima di salvare.', 'error'); return; }
        if (!this.currentFileId) { return this.saveCurrentLesson(this.currentFolderId); }

        try {
            if (!silent) toast('Sovrascrittura in corso...', 'info');

            let bgImageBase64 = '';
            if (bgMgr.uploadedImage) {
                const tmp = document.createElement('canvas');
                tmp.width  = bgMgr.canvas.width;
                tmp.height = bgMgr.canvas.height;
                tmp.getContext('2d').drawImage(bgMgr.canvas, 0, 0);
                bgImageBase64 = tmp.toDataURL('image/jpeg', 0.85);
            }

            // Usa _uploadMultipart direttamente con il fileId corrente (PATCH)
            await this.drive._uploadMultipart(
                CONFIG.projectName + '.json',
                {
                    version:    2,
                    name:       CONFIG.projectName,
                    modifiedAt: new Date().toISOString(),
                    background: {
                        type:        bgImageBase64 ? 'image' : 'preset',
                        key:         bgMgr.currentBg,
                        imageBase64: bgImageBase64
                    },
                    drawing: canvasMgr.getDataURL(),
                    pages:   window.pageManager ? window.pageManager.serialize() : null,
                    canvasWidth: canvasMgr?.canvas?.width || 0,
                    pagePx: (typeof bgMgr !== 'undefined' && canvasMgr?.canvas) ? bgMgr._getPageRect(canvasMgr.canvas.width, canvasMgr.canvas.height).px : null,
                    pagePy: (typeof bgMgr !== 'undefined' && canvasMgr?.canvas) ? bgMgr._getPageRect(canvasMgr.canvas.width, canvasMgr.canvas.height).py : null
                },
                this.currentFileId  // PATCH sul file esistente
            );

            CONFIG.isDirty = false;
            if (!silent) {
                window.autoSaveMgr?.reset();
                toast('Lezione sovrascritta su Drive!', 'success');
            }
        } catch (err) {
            if (!silent) toast('Errore sovrascrittura: ' + err.message, 'error');
            throw err; // rilancia per auto-save error handling
        }
    }

    /** Rinomina un elemento (file o cartella). */
    async rename(fileId, currentName) {
        if (!this.drive.isConnected()) { toast('Connetti Drive prima.', 'error'); return; }
        const newName = prompt('Nuovo nome:', currentName);
        if (!newName || !newName.trim() || newName.trim() === currentName) return;
        try {
            await this.drive.renameItem(fileId, newName.trim());
            toast('Rinominato!', 'success');
            this._forceRefresh();
        } catch (err) {
            toast('Errore rinomina: ' + err.message, 'error');
        }
    }

    /** Elimina un elemento con conferma. */
    async delete(fileId, name) {
        if (!this.drive.isConnected()) { toast('Connetti Drive prima.', 'error'); return; }
        if (!confirm(`Eliminare "${name}"? L'operazione non è reversibile.`)) return;
        try {
            await this.drive.deleteItem(fileId);
            toast('"' + name + '" eliminato.', 'success');
            this._forceRefresh();
        } catch (err) {
            toast('Errore eliminazione: ' + err.message, 'error');
        }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // HELPER UI
    // ──────────────────────────────────────────────────────────────────────────

    /** Crea un elemento riga dell'albero. */
    _createTreeItem(type, icon, label, _indent, depth = 0) {
        const item = document.createElement('div');
        item.className  = `tree-item ${type}`;
        item.dataset.type = type;
        item.dataset.depth = depth;

        item.innerHTML = `
            <span class="tree-icon">${icon}</span>
            <span class="tree-label">${this._esc(label)}</span>
            <span class="tree-actions"></span>`;
        // Handle di riordino (solo per file lezione, non per cartelle)
        if (type === 'lesson') {
            const handle = document.createElement('span');
            handle.className = 'drag-handle';
            handle.title = 'Trascina per riordinare';
            handle.textContent = '⠿';
            item.insertBefore(handle, item.firstChild);
        }
        return item;
    }

    /** Aggiunge pulsanti Rinomina/Elimina a un tree-item. */
    _addContextButtons(item, entry, type) {
        const actionsEl = item.querySelector('.tree-actions');
        actionsEl.innerHTML = `
            <button class="tree-btn" title="Rinomina" data-action="rename">✏️</button>
            <button class="tree-btn" title="Elimina"  data-action="delete">🗑️</button>`;

        actionsEl.querySelector('[data-action="rename"]').addEventListener('click', (e) => {
            e.stopPropagation();
            this.rename(entry.id, entry.name);
        });
        actionsEl.querySelector('[data-action="delete"]').addEventListener('click', (e) => {
            e.stopPropagation();
            this.delete(entry.id, entry.name);
        });
    }

    /** Seleziona una cartella come destinazione corrente. */
    _selectFolder(folderId, itemEl) {
        document.querySelectorAll('.tree-item.selected').forEach(el => el.classList.remove('selected'));
        itemEl.classList.add('selected');
        this.currentFolderId = folderId;
        // Applica lo sfondo memorizzato per questa cartella (se presente)
        const savedBg = localStorage.getItem('folder-bg-' + folderId);
        if (savedBg && typeof bgMgr !== 'undefined') {
            bgMgr.setBackground(savedBg);
            document.querySelectorAll('.bg-opt').forEach(b => b.classList.remove('active'));
            const btn = document.querySelector(`.bg-opt[data-bg="${savedBg}"]`);
            if (btn) btn.classList.add('active');
        }
    }

    /** Aggiorna il banner di stato Drive nel pannello. */
    _updateDriveStatus() {
        const statusEl = document.getElementById('library-drive-status');
        if (!statusEl) return;
        if (this.drive.isConnected()) {
            const display = this.drive.userName || this.drive.userEmail;
            statusEl.innerHTML = `<span class="drive-status-ok">☁️ ${this._esc(display)}</span>`;
        } else {
            statusEl.innerHTML = `<span class="drive-status-off">Drive non connesso</span>`;
        }
    }

    async _connectAndRefresh() {
        try {
            await this.drive.connect();
            driveConnectBtn.update();
            this.refresh();
        } catch (_) {}
    }

    _esc(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    /** Applica lo stile "linguetta colorata" a una riga cartella. */
    _applyFolderTabStyle(itemEl, color) {
        itemEl.classList.add('folder-tab');
        if (color) {
            itemEl.style.background  = _hexToRgba(color, 0.30);
            itemEl.style.borderLeft  = '3px solid ' + color;
        } else {
            itemEl.style.background  = '';
            itemEl.style.borderLeft  = '3px solid rgba(255,255,255,0.10)';
        }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // COLORI CARTELLE
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * Crea il cerchietto colorato per una cartella.
     * Gestisce click → popup con 8 swatches.
     * @param {string} folderId
     * @returns {HTMLElement} il <span class="folder-color-dot">
     */
    _createColorDot(folderId, itemEl = null) {
        const storageKey = 'folder-color-' + folderId;
        const currentColor = localStorage.getItem(storageKey) || null;

        const dot = document.createElement('span');
        dot.className = 'folder-color-dot' + (currentColor ? '' : ' no-color');
        if (currentColor) dot.style.backgroundColor = currentColor;
        dot.title = 'Cambia colore cartella';

        dot.addEventListener('click', (e) => {
            e.stopPropagation();
            this._showColorPopup(dot, folderId, storageKey, itemEl);
        });

        return dot;
    }

    /**
     * Mostra il mini popup con gli 8 swatches di colore.
     * @param {HTMLElement} dotEl    - il cerchietto che ha scatenato il click
     * @param {string}      folderId
     * @param {string}      storageKey
     */
    _showColorPopup(dotEl, folderId, storageKey, itemEl = null) {
        document.querySelector('.folder-color-popup')?.remove();

        const currentColor = localStorage.getItem(storageKey) || null;

        const popup = document.createElement('div');
        popup.className = 'folder-color-popup';

        const applyColor = (color) => {
            if (color) {
                localStorage.setItem(storageKey, color);
                dotEl.style.backgroundColor = color;
                dotEl.classList.remove('no-color');
                if (itemEl) this._applyFolderTabStyle(itemEl, color);
            } else {
                // Rimuovi colore
                localStorage.removeItem(storageKey);
                dotEl.style.backgroundColor = '';
                dotEl.classList.add('no-color');
                if (itemEl) this._applyFolderTabStyle(itemEl, null);
            }
            popup.remove();
            window.driveMgr?._saveFolderColors();
        };

        // ── Pulsante "Nessun colore" ───────────────────────────────────────
        const noColor = document.createElement('div');
        noColor.className = 'folder-color-swatch no-color-swatch' + (!currentColor ? ' selected' : '');
        noColor.title = 'Nessun colore';
        noColor.innerHTML = `<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="2" y1="2" x2="14" y2="14"/><line x1="14" y1="2" x2="2" y2="14"/>
        </svg>`;
        noColor.addEventListener('click', (e) => { e.stopPropagation(); applyColor(null); });
        popup.appendChild(noColor);

        // ── Swatches colori ───────────────────────────────────────────────
        for (const color of FOLDER_COLORS) {
            const swatch = document.createElement('div');
            swatch.className = 'folder-color-swatch' + (color === currentColor ? ' selected' : '');
            swatch.style.backgroundColor = color;
            swatch.title = color;
            swatch.addEventListener('click', (e) => { e.stopPropagation(); applyColor(color); });
            popup.appendChild(swatch);
        }

        document.body.appendChild(popup);

        // Posiziona il popup vicino al cerchietto (max 5 colonne = 5×24 + padding)
        const rect = dotEl.getBoundingClientRect();
        const popupW = 150; // 5 colonne × ~28px
        popup.style.left = Math.min(rect.left, window.innerWidth - popupW - 8) + 'px';
        popup.style.top  = (rect.bottom + 4) + 'px';

        const closeHandler = (e) => {
            if (!popup.contains(e.target) && e.target !== dotEl) {
                popup.remove();
                document.removeEventListener('click', closeHandler, true);
            }
        };
        setTimeout(() => document.addEventListener('click', closeHandler, true), 0);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // DRAG AND DROP
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * Rende un elemento riga trascinabile.
     * @param {HTMLElement} item      - la riga DOM
     * @param {string}      id        - ID Drive dell'elemento
     * @param {string}      parentId  - ID cartella padre corrente
     * @param {string}      name      - nome elemento
     * @param {string}      type      - 'folder' | 'lesson'
     */
    _makeDraggable(item, id, parentId, name, type) {
        item.setAttribute('draggable', 'true');

        item.addEventListener('dragstart', (e) => {
            e.stopPropagation();
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', JSON.stringify({ id, parentId, name, type }));
            item.style.opacity = '0.5';
        });

        item.addEventListener('dragend', () => {
            item.style.opacity = '';
        });
    }

    /**
     * Rende una cartella un drop target.
     * @param {HTMLElement} item         - la riga DOM della cartella
     * @param {HTMLElement} subContainer - il subContainer figli (può essere null)
     * @param {string}      folderId     - ID Drive della cartella destinazione
     */
    _makeDropTarget(item, subContainer, folderId) {
        item.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = 'move';
        });

        item.addEventListener('dragenter', (e) => {
            e.preventDefault();
            e.stopPropagation();
            item.classList.add('tree-drop-target');
        });

        item.addEventListener('dragleave', (e) => {
            // Rimuovi highlight solo se si esce effettivamente dall'elemento
            if (!item.contains(e.relatedTarget)) {
                item.classList.remove('tree-drop-target');
            }
        });

        item.addEventListener('drop', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            item.classList.remove('tree-drop-target');

            let dragData;
            try {
                dragData = JSON.parse(e.dataTransfer.getData('text/plain'));
            } catch (_) {
                return;
            }

            // Evita di spostare un elemento in se stesso
            if (dragData.id === folderId) return;
            // Evita di spostare nella stessa cartella
            if (dragData.parentId === folderId) return;

            try {
                toast('Spostamento in corso...', 'info');
                await this.drive.moveItem(dragData.id, folderId, dragData.parentId);
                toast(`"${dragData.name}" spostato.`, 'success');
                this._forceRefresh();
            } catch (err) {
                toast('Errore spostamento: ' + err.message, 'error');
            }
        });
    }

    // ──────────────────────────────────────────────────────────────────────────
    // RIORDINO FILE (drag & drop nella stessa cartella)
    // ──────────────────────────────────────────────────────────────────────────

    /** Riordina i file nel DOM e salva l'ordine su Drive. */
    _reorderFiles(folderId, container, draggedId, targetId, insertBefore) {
        const draggedEl = container.querySelector(`.tree-item.lesson[data-file-id="${draggedId}"]`);
        const targetEl  = container.querySelector(`.tree-item.lesson[data-file-id="${targetId}"]`);
        if (!draggedEl || !targetEl || draggedEl === targetEl) return;
        if (insertBefore) {
            container.insertBefore(draggedEl, targetEl);
        } else {
            container.insertBefore(draggedEl, targetEl.nextSibling);
        }
        // Legge il nuovo ordine dal DOM (solo file della stessa cartella)
        const newOrder = [...container.querySelectorAll(`.tree-item.lesson[data-folder-id="${folderId}"]`)]
            .map(el => el.dataset.fileId);
        this._saveOrder(folderId, newOrder, this._indentCache?.[folderId] || {});
    }

    /** Salva l'ordine (e le indentazioni) in _order.json nella cartella su Drive. */
    async _saveOrder(folderId, fileIds, indents = {}) {
        try {
            const cache   = this._orderCache?.[folderId];
            const orderId = cache?.orderId ?? null;
            const payload = { v: 2, folderId, order: fileIds, indents, updatedAt: new Date().toISOString() };
            const newId   = await this.drive._uploadMultipart('_order.json', payload, orderId, folderId);
            if (!this._orderCache) this._orderCache = {};
            this._orderCache[folderId] = { orderId: newId || orderId };
        } catch (err) {
            console.warn('_saveOrder fallito:', err);
        }
    }

    /** Legge _order.json dalla cartella su Drive. */
    async _loadOrder(folderId) {
        try {
            const q    = encodeURIComponent(`'${folderId}' in parents and name='_order.json' and mimeType='application/json' and trashed=false`);
            const resp = await this.drive._apiFetch(
                `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)&pageSize=1`
            );
            const found = (resp.files || [])[0];
            if (!found) return { orderId: null, order: [], indents: {} };
            const raw = await this.drive._apiFetch(
                `https://www.googleapis.com/drive/v3/files/${found.id}?alt=media`
            );
            return { orderId: found.id, order: Array.isArray(raw?.order) ? raw.order : [], indents: raw?.indents || {} };
        } catch (_) {
            return { orderId: null, order: [], indents: {} };
        }
    }

    /** Applica ordine personalizzato all'array di file. File nuovi (non in order) vanno in coda. */
    _applyOrder(files, order) {
        if (!order || !order.length) return files;
        const map     = new Map(files.map(f => [f.id, f]));
        const ordered = order.filter(id => map.has(id)).map(id => map.get(id));
        const rest    = files.filter(f => !order.includes(f.id));
        return [...ordered, ...rest];
    }

    /** Attacca la logica Pointer Events al drag-handle di un file lezione. */
    _attachReorderHandle(item, fileId, folderId, container) {
        const handle = item.querySelector('.drag-handle');
        if (!handle) return;
        let dragging = false;

        const cleanup = () => {
            dragging = false;
            item.classList.remove('dragging-reorder');
            item.setAttribute('draggable', 'true');
            container.querySelectorAll('.drag-over-before, .drag-over-after')
                .forEach(el => el.classList.remove('drag-over-before', 'drag-over-after'));
        };

        handle.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            e.stopPropagation();
            handle.setPointerCapture(e.pointerId);
            dragging = true;
            item.classList.add('dragging-reorder');
            // Disabilita il DnD HTML5 dell'intera riga durante il riordino
            item.setAttribute('draggable', 'false');
        });

        handle.addEventListener('pointermove', (e) => {
            if (!dragging) return;
            e.preventDefault();
            // pointer-events:none su .dragging-reorder → elementFromPoint vede l'elemento sotto
            const below  = document.elementFromPoint(e.clientX, e.clientY);
            const target = below?.closest('.tree-item.lesson');
            container.querySelectorAll('.drag-over-before, .drag-over-after')
                .forEach(el => el.classList.remove('drag-over-before', 'drag-over-after'));
            if (!target || target === item || target.dataset.folderId !== folderId) return;
            const rect = target.getBoundingClientRect();
            if (e.clientY < rect.top + rect.height / 2) {
                target.classList.add('drag-over-before');
            } else {
                target.classList.add('drag-over-after');
            }
        });

        handle.addEventListener('pointerup', (e) => {
            if (!dragging) return;
            const beforeTarget = container.querySelector('.drag-over-before');
            const afterTarget  = container.querySelector('.drag-over-after');
            cleanup();
            const target = beforeTarget || afterTarget;
            if (!target || target === item) return;
            this._reorderFiles(folderId, container, fileId, target.dataset.fileId, !!beforeTarget);
        });

        handle.addEventListener('pointercancel', cleanup);
    }
}


// =============================================================================
// SEZIONE 2b — UTILITY
// =============================================================================

/**
 * Apre automaticamente l'ultima lezione usata, se il Drive è connesso
 * e la lavagna non ha modifiche non salvate.
 */
async function _autoOpenLastLesson() {
    try {
        if (!driveMgr?.isConnected() || !libraryMgr) return;
        if (typeof CONFIG !== 'undefined' && CONFIG.isDirty) return; // non sovrascrivere lavoro in corso
        const raw = localStorage.getItem('eduboard_last_lesson');
        if (!raw) return;
        const last = JSON.parse(raw);
        if (!last?.fileId) return;
        // FIX QR 404: salta se il fileId appartiene a un account diverso
        if (last.userEmail && driveMgr.userEmail && last.userEmail !== driveMgr.userEmail) return;
        await libraryMgr.openLesson(last.fileId, last.fileName || 'ultima lezione');
    } catch (_) {}
}


// =============================================================================
// SEZIONE 3 — DriveConnectButton
// Gestisce il FAB Drive (basso destra) e il testo di stato nell'header
// =============================================================================

class DriveConnectButton {
    constructor(drive) {
        this.drive = drive;
        // FAB in basso a destra
        this.fab      = document.getElementById('drive-fab');
        this.fabIcon  = document.getElementById('drive-fab-icon');
        this.fabPhoto = document.getElementById('drive-fab-photo');
        this.fabBadge = document.getElementById('drive-fab-badge');
        // Status header
        this.statusEl   = document.getElementById('drive-status-header');
        this.statusText = document.getElementById('drive-status-text');
        this.statusIcon = document.getElementById('drive-status-icon');

        if (this.fab) {
            this.fab.addEventListener('click', () => this._onClick());
        }
    }

    update(state) {
        const connected = this.drive.isConnected();

        // --- Aggiorna FAB ---
        if (this.fab) {
            this.fab.classList.toggle('drive-fab--connected', connected);
        }
        if (this.fabBadge) {
            this.fabBadge.style.display = connected ? 'block' : 'none';
        }

        if (connected) {
            // Prova a caricare foto profilo
            const photoUrl = this.drive.userPhotoUrl;
            if (photoUrl && this.fabPhoto) {
                this.fabIcon.style.display = 'none';
                this.fabPhoto.src = photoUrl;
                this.fabPhoto.style.display = 'block';
            } else {
                // Nessuna foto: mostra omino con bordo verde (già gestito dal CSS)
                if (this.fabIcon) this.fabIcon.style.display = 'block';
                if (this.fabPhoto) this.fabPhoto.style.display = 'none';
                // Colora l'omino di verde quando connesso
                if (this.fabIcon) this.fabIcon.style.stroke = '#86efac';
            }
            // Status header
            if (this.statusEl) this.statusEl.classList.add('drive-status--connected');
            if (this.statusIcon) this.statusIcon.style.display = 'block';
            const name = this.drive.userName || this.drive.userEmail || 'Drive';
            if (this.statusText) this.statusText.textContent = name;
        } else {
            // Non connesso
            if (this.fabIcon) { this.fabIcon.style.display = 'block'; this.fabIcon.style.stroke = 'currentColor'; }
            if (this.fabPhoto) this.fabPhoto.style.display = 'none';
            if (this.statusEl) this.statusEl.classList.remove('drive-status--connected');
            if (this.statusIcon) this.statusIcon.style.display = 'none';
            if (this.statusText) this.statusText.textContent = 'Non connesso';
        }

        // Gestione stato syncing/errore (mantieni compatibilità)
        if (state === 'syncing' && this.fab) {
            this.fab.title = 'Drive — salvataggio in corso...';
        } else if (state === 'error' && this.fab) {
            this.fab.title = 'Drive — errore. Clicca per riconnetterti.';
        } else if (connected && this.fab) {
            this.fab.title = 'Drive connesso — clicca per opzioni';
        } else if (this.fab) {
            this.fab.title = 'Connetti a Google Drive';
        }
    }

    // Compatibilità con i listener precedenti
    async handleClick() {
        return this._onClick();
    }

    async _onClick() {
        if (this.drive.isConnected()) {
            this._showStatusPanel();
        } else {
            this._showGuestPanel();
        }
    }

    _showGuestPanel() {
        let panel = document.getElementById('drive-guest-panel');
        if (panel) { panel.remove(); return; } // toggle

        panel = document.createElement('div');
        panel.id = 'drive-guest-panel';
        panel.style.cssText = `
            position: fixed;
            bottom: 58px;
            right: 12px;
            background: #ffffff;
            border: 1px solid rgba(15,23,42,0.08);
            border-radius: 16px;
            padding: 6px;
            z-index: 601;
            min-width: 220px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06);
            display: flex;
            flex-direction: column;
            gap: 2px;
        `;
        panel.innerHTML = `
            <div style="display:flex;align-items:center;gap:10px;padding:10px 12px 10px 10px;border-bottom:1px solid rgba(15,23,42,0.07);margin-bottom:2px">
                <div style="width:36px;height:36px;border-radius:50%;background:#f1f5f9;display:flex;align-items:center;justify-content:center;flex-shrink:0">
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#64748b" stroke-width="1.8"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
                </div>
                <div style="min-width:0;flex:1">
                    <div style="font-size:0.88rem;font-weight:600;color:#0f172a">Accedi</div>
                    <span style="font-size:0.7rem;background:#e2e8f0;color:#64748b;padding:1px 6px;border-radius:10px;font-weight:500">Ospite</span>
                </div>
            </div>
            <button id="guest-panel-settings" style="background:transparent;border:none;color:#0f172a;padding:10px 14px;text-align:left;border-radius:10px;cursor:pointer;font-size:0.85rem;transition:background 0.15s;display:flex;align-items:center;gap:10px;font-family:inherit">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                Impostazioni & Guida
            </button>
            <div style="margin:2px 8px 4px;border-top:1px solid rgba(15,23,42,0.07)"></div>
            <button id="guest-panel-login" style="background:#3b82f6;border:none;color:#fff;padding:10px 14px;text-align:center;border-radius:10px;cursor:pointer;font-size:0.85rem;font-weight:600;transition:opacity 0.15s;font-family:inherit">
                Accedi con Google Drive
            </button>
        `;
        document.body.appendChild(panel);

        panel.querySelector('#guest-panel-settings')?.addEventListener('mouseenter', e => e.target.style.background = '#f8fafc');
        panel.querySelector('#guest-panel-settings')?.addEventListener('mouseleave', e => e.target.style.background = 'transparent');

        panel.querySelector('#guest-panel-settings')?.addEventListener('click', () => {
            panel.remove();
            if (typeof window.openSettingsModal === 'function') window.openSettingsModal();
        });
        panel.querySelector('#guest-panel-login')?.addEventListener('click', () => {
            panel.remove();
            if (window.eduBoardConnect) {
                window.eduBoardConnect.show();
            }
        });
        panel.querySelector('#guest-panel-login')?.addEventListener('mouseenter', e => e.target.style.opacity = '0.88');
        panel.querySelector('#guest-panel-login')?.addEventListener('mouseleave', e => e.target.style.opacity = '1');

        // Chiudi cliccando fuori
        setTimeout(() => {
            document.addEventListener('click', function closePanel(e) {
                if (!panel.contains(e.target) && e.target !== document.getElementById('drive-fab')) {
                    panel.remove();
                    document.removeEventListener('click', closePanel);
                }
            });
        }, 100);
    }

    _showStatusPanel() {
        // Mostra un mini-pannello con opzioni: Libreria, Disconnetti
        let panel = document.getElementById('drive-fab-panel');
        if (!panel) {
            panel = document.createElement('div');
            panel.id = 'drive-fab-panel';
            panel.style.cssText = `
                position: fixed;
                bottom: 84px;
                right: 16px;
                background: #ffffff;
                border: 1px solid rgba(15,23,42,0.08);
                border-radius: 16px;
                padding: 6px;
                z-index: 601;
                min-width: 220px;
                box-shadow: 0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06);
                display: flex;
                flex-direction: column;
                gap: 2px;
            `;
            const email = this.drive.userEmail || '';
            const name  = this.drive.userName  || '';
            const photo = this.drive.userPhotoUrl || '';
            const avatar = photo
                ? `<img src="${this._esc(photo)}" style="width:36px;height:36px;border-radius:50%;object-fit:cover;flex-shrink:0">`
                : `<div style="width:36px;height:36px;border-radius:50%;background:#eff6ff;display:flex;align-items:center;justify-content:center;flex-shrink:0"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#3b82f6" stroke-width="1.8"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg></div>`;
            panel.innerHTML = `
                <div style="display:flex;align-items:center;gap:10px;padding:10px 12px 10px 10px;border-bottom:1px solid rgba(15,23,42,0.07);margin-bottom:2px">
                    ${avatar}
                    <div style="min-width:0">
                        <div style="font-size:0.88rem;font-weight:600;color:#0f172a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${this._esc(name)}</div>
                        <div style="font-size:0.72rem;color:#64748b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:160px">${this._esc(email)}</div>
                    </div>
                </div>
                <button id="fab-panel-library" style="background:transparent;border:none;color:#0f172a;padding:10px 14px;text-align:left;border-radius:10px;cursor:pointer;font-size:0.85rem;transition:background 0.15s;display:flex;align-items:center;gap:10px">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
                    Apri libreria lezioni
                </button>
                <button id="fab-panel-settings" style="background:transparent;border:none;color:#0f172a;padding:10px 14px;text-align:left;border-radius:10px;cursor:pointer;font-size:0.85rem;transition:background 0.15s;display:flex;align-items:center;gap:10px">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                    Impostazioni & Guida
                </button>
                <button id="fab-panel-disconnect" style="background:transparent;border:none;color:#ef4444;padding:10px 14px;text-align:left;border-radius:10px;cursor:pointer;font-size:0.85rem;transition:background 0.15s;display:flex;align-items:center;gap:10px">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                    Disconnetti
                </button>
            `;
            document.body.appendChild(panel);
            // Hover
            panel.querySelectorAll('button').forEach(btn => {
                btn.addEventListener('mouseenter', () => btn.style.background = '#f8fafc');
                btn.addEventListener('mouseleave', () => btn.style.background = 'transparent');
            });
            document.getElementById('fab-panel-library')?.addEventListener('click', () => {
                panel.remove();
                const libraryPanel = document.getElementById('library-panel');
                if (libraryPanel) {
                    libraryPanel.classList.add('open');
                    if (typeof libraryMgr !== 'undefined' && libraryMgr) {
                        if (libraryMgr._treeLoaded) {
                            libraryMgr._backgroundRefresh('eduboard-lib-cache', libraryMgr.treeEl?.scrollTop || 0);
                        } else {
                            libraryMgr.refresh();
                        }
                    }
                }
            });
            document.getElementById('fab-panel-settings')?.addEventListener('click', () => {
                panel.remove();
                if (typeof window.openSettingsModal === 'function') window.openSettingsModal();
            });
            document.getElementById('fab-panel-disconnect')?.addEventListener('click', async () => {
                panel.remove();
                await this.drive.disconnect();
                this.update();
                libraryMgr?.refresh();
                toast('Drive disconnesso', 'info');
            });
            // Chiudi cliccando fuori
            setTimeout(() => {
                document.addEventListener('click', function closePanel(e) {
                    if (!panel.contains(e.target) && e.target !== document.getElementById('drive-fab')) {
                        panel.remove();
                        document.removeEventListener('click', closePanel);
                    }
                });
            }, 100);
        } else {
            panel.remove(); // toggle
        }
    }

    _esc(str) { return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
}


// =============================================================================
// SEZIONE 3b — CSS INIETTATO
// Stili per colori cartelle e drag-and-drop (iniettati nel <head>)
// =============================================================================

function _injectDriveStyles() {
    if (document.getElementById('drive-extra-styles')) return; // già iniettato
    const style = document.createElement('style');
    style.id = 'drive-extra-styles';
    style.textContent = `
/* ── Colori cartelle ── */
.folder-color-dot {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    cursor: pointer;
    flex-shrink: 0;
    border: 1px solid rgba(0,0,0,0.2);
    transition: transform 0.1s;
    margin-right: 4px;
}
.folder-color-dot.no-color {
    background: transparent;
    border: 1px dashed rgba(0,0,0,0.25);
}
.folder-color-dot:hover { transform: scale(1.3); }
.folder-color-popup {
    position: fixed;
    background: var(--bg-elevated, #1e293b);
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 10px;
    padding: 8px;
    display: grid;
    grid-template-columns: repeat(5, 24px);
    gap: 5px;
    z-index: 9999;
    box-shadow: 0 6px 20px rgba(0,0,0,0.5);
}
.folder-color-swatch {
    width: 24px;
    height: 24px;
    border-radius: 5px;
    cursor: pointer;
    border: 2px solid transparent;
    transition: border-color 0.1s, transform 0.1s;
}
.folder-color-swatch:hover { transform: scale(1.18); border-color: rgba(255,255,255,0.5); }
.folder-color-swatch.selected { border-color: white; box-shadow: 0 0 0 1px rgba(255,255,255,0.4); }
/* Swatch "nessun colore" */
.no-color-swatch {
    background: rgba(255,255,255,0.06);
    color: rgba(255,255,255,0.45);
    display: flex;
    align-items: center;
    justify-content: center;
}
.no-color-swatch:hover { color: rgba(255,255,255,0.8); }

/* ── Struttura ad albero: linee verticali ── */
.tree-subtree {
    position: relative;
    margin-left: 14px;
    padding-left: 8px;
    border-left: 1.5px solid rgba(148,163,184,0.20);
}
/* ── Linguetta cartella (stile OneNote verticale) ── */
.tree-item.folder-tab {
    border-radius: 0 5px 5px 0;
    transition: background 0.15s, filter 0.15s, border-left-color 0.15s;
}
.tree-item.folder-tab:hover {
    filter: brightness(1.35);
}
.tree-item.folder-tab.selected {
    filter: brightness(1.55) saturate(1.2);
    outline: 1px solid rgba(255,255,255,0.20);
    outline-offset: -1px;
}
/* ── Lezione indentata (sotto-pagina stile OneNote) ── */
.tree-item.lesson.lesson-indented {
    padding-left: 24px;
    opacity: 0.88;
    font-size: 0.93em;
}

/* ── Drag and drop ── */
.tree-drop-target {
    background: rgba(59, 130, 246, 0.2);
    border: 1px dashed rgba(59, 130, 246, 0.6);
    border-radius: 4px;
}
`;
    document.head.appendChild(style);
}

// =============================================================================
// SEZIONE 3b — EduBoardConnect
// Gestisce il pannello QR per connettere Drive via telefono (backend: Firebase RTDB)
// =============================================================================

const FIREBASE_DB    = 'https://eduboard-connect-default-rtdb.europe-west1.firebasedatabase.app';
const CONNECT_SERVER = 'https://eduboard-connect.edutechlab-ita.workers.dev'; // foto/laser/timer

class EduBoardConnect {
    constructor() {
        this._limId          = this._getLimId();
        this._eventSource    = null;
        this._photoInt       = null;
        this._laserInt       = null;
        this._timerInt       = null;
        this._alarmInt       = null;
        this._panel          = null;
        this._phoneConnected = false;
        this._timerWasActive = false;
        this._audioCtx       = null;
        // Sblocca AudioContext al primo gesto utente sulla LIM
        const unlockAudio = () => {
            if (!this._audioCtx) {
                try { this._audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch(_) {}
            }
            if (this._audioCtx?.state === 'suspended') this._audioCtx.resume().catch(() => {});
        };
        ['click','touchstart','keydown'].forEach(ev => document.addEventListener(ev, unlockAudio, { once: false, passive: true }));
    }

    // ID univoco per questa finestra LIM — sessionStorage (per-tab) evita che
    // due finestre dello stesso profilo Chrome condividano lo stesso ID e si
    // "rubino" la sessione EduConnect a vicenda.
    _getLimId() {
        let id = sessionStorage.getItem('ec_lim_id');
        if (!id) {
            id = (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2, 18));
            sessionStorage.setItem('ec_lim_id', id);
        }
        return id;
    }

    // Mostra il pannello QR (modal centrato a due colonne)
    show() {
        if (this._panel) { this._panel.style.display = 'flex'; this._startListening(); return; }

        const panel = document.createElement('div');
        panel.id = 'ec-panel';
        const limCode = this._limId.substring(0, 8).toUpperCase();
        panel.innerHTML = `
            <div class="ec-modal-box">
                <!-- Colonna sinistra: logo + QR + codice LIM -->
                <div class="ec-col-left">
                    <img src="./icon-192x192.png" alt="EduBoard" style="width:52px;height:52px;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,0.12)">
                    <div style="font-size:1rem;font-weight:700;color:#1e293b;letter-spacing:-0.01em"><span style="color:#3b82f6">Edu</span>Board</div>
                    <div class="ec-qr-wrap">
                        <div id="ec-qr-canvas" class="ec-qr-canvas"></div>
                        <div class="ec-qr-loading" id="ec-qr-loading">Generazione QR...</div>
                    </div>
                    <div style="font-size:0.7rem;color:#64748b;text-align:center;line-height:1.5">
                        Oppure inserisci il codice:<br>
                        <span id="ec-lim-code" style="font-size:1rem;color:#0f172a;letter-spacing:0.18em;font-weight:700;font-family:monospace">${limCode}</span>
                    </div>
                    <div class="ec-status" id="ec-status">
                        <span class="ec-dot"></span> In attesa del telefono...
                    </div>
                </div>
                <!-- Colonna destra: azioni -->
                <div class="ec-col-right">
                    <div style="font-size:1rem;font-weight:700;color:#1e293b;margin-bottom:4px">Connetti con</div>
                    <div style="font-size:0.78rem;color:#64748b;margin-bottom:8px">Scansiona il QR con il telefono o accedi dal PC</div>
                    <!-- Pulsante Google OAuth (dal PC) -->
                    <button class="ec-btn-google" id="ec-btn-manual">
                        <svg viewBox="0 0 24 24" width="18" height="18"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                        Accedi con Google
                    </button>
                    <div class="ec-divider">oppure</div>
                    <!-- Installa app telefono -->
                    <button class="ec-btn-install" id="ec-btn-install">📱 Installa EduBoard Connect</button>
                    <div style="flex:1"></div>
                    <!-- Skip -->
                    <button class="ec-btn-skip" id="ec-btn-skip">Continua senza Drive</button>
                </div>
            </div>`;
        document.body.appendChild(panel);
        this._panel = panel;

        // Chiudi overlay cliccando sul backdrop
        panel.addEventListener('click', (e) => {
            if (e.target === panel) this.hide();
        });

        panel.querySelector('#ec-btn-install').addEventListener('click', () => this._switchToInstall());
        panel.querySelector('#ec-btn-skip').addEventListener('click',    () => this.hide());
        panel.querySelector('#ec-btn-manual').addEventListener('click',  async () => {
            this.hide();
            if (!window.driveMgr) return;
            try {
                await window.driveMgr.connect();
                if (window.driveConnectBtn) window.driveConnectBtn.update();
                const greeting = window.driveMgr.userName || window.driveMgr.userEmail;
                toast('Google Drive connesso! Benvenuto, ' + greeting, 'success');
                setTimeout(() => _autoOpenLastLesson(), 800);
            } catch (err) {
                if (err?.message !== 'cancelled') toast('Errore: ' + (err?.message || err), 'error');
            }
        });

        // QR connessione (con limId direttamente nell'URL)
        const connectUrl = `https://board.edutechlab.it/connect.html?lid=${this._limId}`;
        const qrEl      = document.getElementById('ec-qr-canvas');
        const loadingEl = document.getElementById('ec-qr-loading');
        if (qrEl) {
            const img = document.createElement('img');
            img.src = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&ecc=M&data=${encodeURIComponent(connectUrl)}`;
            img.style.cssText = 'width:160px;height:160px;display:block';
            img.alt = 'QR connessione';
            img.onload  = () => { if (loadingEl) loadingEl.style.display = 'none'; };
            img.onerror = () => { if (loadingEl) loadingEl.textContent = 'Errore QR'; };
            qrEl.appendChild(img);
        }

        this._startListening();
    }

    _switchToInstall() {
        // Nel nuovo layout a due colonne non c'è la vista install inline:
        // usiamo il popup separato e nascondiamo il panel principale
        this.hide();
        this.showInstallQR();
    }

    showInstallQR() {
        let popup = document.getElementById('ec-install-popup');
        if (!popup) {
            popup = document.createElement('div');
            popup.id = 'ec-install-popup';
            popup.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(15,23,42,0.5);display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px)';
            popup.innerHTML = `
                <div style="background:#ffffff;border-radius:20px;padding:28px 24px;text-align:center;color:#0f172a;max-width:280px;width:90%;box-shadow:0 16px 48px rgba(15,23,42,0.2);border:1px solid rgba(15,23,42,0.1)">
                    <div style="font-size:1rem;font-weight:700;margin-bottom:4px">📱 Installa EduBoard Connect</div>
                    <div style="font-size:0.75rem;color:#64748b;margin-bottom:16px">Scansiona con il telefono e aggiungi alla schermata Home</div>
                    <img src="https://api.qrserver.com/v1/create-qr-code/?size=300x300&ecc=M&data=https%3A%2F%2Fboard.edutechlab.it%2Fconnect.html%3Finstall%3D1"
                         style="width:180px;height:180px;display:block;margin:0 auto 12px" alt="QR install">
                    <div style="font-size:0.65rem;color:#94a3b8;margin-bottom:16px">board.edutechlab.it/connect.html</div>
                    <button id="ec-install-popup-close" style="background:#3b82f6;color:#fff;border:none;padding:8px 24px;border-radius:8px;cursor:pointer;font-size:0.85rem;font-weight:600">Chiudi</button>
                </div>`;
            document.body.appendChild(popup);
            popup.querySelector('#ec-install-popup-close').addEventListener('click', () => { popup.style.display = 'none'; });
            popup.addEventListener('click', e => { if (e.target === popup) popup.style.display = 'none'; });
        }
        popup.style.display = 'flex';
    }

    _switchToConnect() {
        if (this._panel) this._panel.style.display = 'flex';
        this._startListening();
    }

    hide() {
        if (this._panel) { this._panel.style.display = 'none'; }
        // EventSource resta aperto in background per ricevere il segnale 'transferred'
    }

    _startListening() {
        this._stopListening();
        const es = new EventSource(`${FIREBASE_DB}/sessions/${this._limId}.json`);
        es.addEventListener('put', (e) => {
            try {
                const { data } = JSON.parse(e.data);
                if (!data) return; // null = vuoto o appena cancellato
                if (data.status === 'pending') {
                    // Aggiorna UI di conferma
                    const statusEl = document.getElementById('ec-status');
                    if (statusEl) statusEl.innerHTML = '<span style="color:#22c55e">Connesso come ' + data.email + '</span>';
                    // Nascondi pannello PRIMA di aprire lezione (evita decentramento canvas)
                    setTimeout(() => {
                        this.hide();
                        if (window.driveMgr) window.driveMgr._onExternalToken(data.token, data.email, data.expiry);
                        this._onExternalConnect(data.email);
                        // Pulisci sessione da Firebase (l'EventSource resta aperto per 'transferred')
                        fetch(`${FIREBASE_DB}/sessions/${this._limId}.json`, { method: 'DELETE' }).catch(() => {});
                    }, 800);
                } else if (data.status === 'transferred') {
                    // Questa LIM è stata scalzata da un'altra sessione dello stesso account
                    toast('Sessione Drive trasferita ad un\'altra classe.', 'info');
                    if (window.driveMgr) window.driveMgr.disconnect();
                    if (window.driveConnectBtn) window.driveConnectBtn.update();
                    fetch(`${FIREBASE_DB}/sessions/${this._limId}.json`, { method: 'DELETE' }).catch(() => {});
                }
            } catch(_) { /* silenzioso */ }
        });
        es.onerror = () => { /* EventSource si riconnette automaticamente */ };
        this._eventSource = es;
    }

    _stopListening() {
        if (this._eventSource) { this._eventSource.close(); this._eventSource = null; }
    }

    _onExternalConnect(email) {
        this._phoneConnected = true;
        this._phoneEmail = email;
        this._updateBell();
        if (window.driveConnectBtn) window.driveConnectBtn.update();
    }

    // Polling foto dal telefono — avviato da initDrive dopo la connessione
    startPhotoPolling() {
        if (this._photoInt) return;
        this._pendingPhotos = this._pendingPhotos || [];

        this._photoInt = setInterval(async () => {
            if (!this._phoneConnected) return;
            try {
                const res = await fetch(`${CONNECT_SERVER}/photos/${this._limId}`).then(r => r.json());
                if (!res.photos?.length) return;
                for (const photo of res.photos) {
                    this._pendingPhotos.push(photo);
                }
                this._updateBell();
            } catch (_) { /* silenzioso */ }
        }, 3000);
    }

    // Polling laser — avviato da initDrive dopo la connessione
    startLaserPolling() {
        if (this._laserInt) return;
        this._laserInt = setInterval(async () => {
            if (!this._phoneConnected) return;
            try {
                const res = await fetch(`${CONNECT_SERVER}/laser/${this._limId}`).then(r => r.json());
                this._updateLaser(res);
            } catch (_) { /* silenzioso */ }
        }, 500);
    }

    _updateLaser(data) {
        let dot = document.getElementById('laser-pointer-dot');
        if (!dot) {
            dot = document.createElement('div');
            dot.id = 'laser-pointer-dot';
            dot.style.cssText = `
                position:fixed; width:22px; height:22px; border-radius:50%;
                background:radial-gradient(circle, #ff3333 0%, rgba(255,0,0,0.4) 60%, transparent 100%);
                box-shadow: 0 0 16px #ff3333, 0 0 4px #fff;
                pointer-events:none; z-index:9000; transform:translate(-50%,-50%);
                display:none; transition:none;
            `;
            document.body.appendChild(dot);
        }

        if (!data.active) {
            dot.style.display = 'none';
            return;
        }

        // Mappa coordinate relative (0-1) sull'area canvas
        const canvasArea = document.getElementById('canvas-area');
        if (!canvasArea) return;
        const rect = canvasArea.getBoundingClientRect();
        const x = rect.left + data.x * rect.width;
        const y = rect.top  + data.y * rect.height;
        dot.style.left    = x + 'px';
        dot.style.top     = y + 'px';
        dot.style.display = 'block';
    }

    _updateBell() {
        const bell  = document.getElementById('photo-bell-btn');
        const badge = document.getElementById('photo-bell-badge');
        if (!bell) return;
        // Mostra la campanella solo se il telefono è connesso
        bell.style.display = this._phoneConnected ? 'flex' : 'none';
        if (!badge) return;
        const count = (this._pendingPhotos || []).filter(p => !p.added).length;
        badge.textContent = count > 9 ? '9+' : String(count);
        badge.style.display = count > 0 ? 'flex' : 'none';
        if (count > 0) bell.classList.add('bell-has-photos');
        else           bell.classList.remove('bell-has-photos');
        // Beep di notifica quando arrivano foto nuove
        if (this._lastPhotoCount === undefined) this._lastPhotoCount = 0;
        const isNew = count > this._lastPhotoCount;
        if (isNew) this._beep(523, 0.3, 0.4);
        this._lastPhotoCount = count;
        // Campanella foto in fullscreen — compare SOLO quando si è in fullscreen e ci sono foto
        const fsBell  = document.getElementById('fs-photo-bell');
        const fsBadge = document.getElementById('fs-photo-badge');
        if (!fsBell) return;
        const isFullscreen = !!(document.fullscreenElement || document.webkitFullscreenElement);
        if (count > 0 && isFullscreen) {
            fsBell.style.display = 'flex';
            if (isNew) {
                // Riscatta l'animazione rimuovendo e riaggingendo la classe
                fsBell.classList.remove('has-photos');
                void fsBell.offsetWidth; // reflow
                fsBell.classList.add('has-photos');
            } else {
                fsBell.classList.add('has-photos');
            }
        } else {
            fsBell.style.display = 'none';
            fsBell.classList.remove('has-photos');
        }
        if (fsBadge) {
            fsBadge.textContent = count > 9 ? '9+' : String(count);
            fsBadge.style.display = (count > 0 && isFullscreen) ? 'flex' : 'none';
        }
    }

    openPhotoPanel() {
        let panel = document.getElementById('photo-notif-panel');
        if (!panel) {
            panel = document.createElement('div');
            panel.id = 'photo-notif-panel';
            document.body.appendChild(panel);
        }
        this._renderPhotoPanel(panel);
        panel.style.display = 'flex';
    }

    _renderPhotoPanel(panel) {
        const photos = this._pendingPhotos || [];
        panel.innerHTML = `
            <div class="pnp-header">
                <span class="pnp-title">📷 Foto ricevute (${photos.length})</span>
                <button class="pnp-close" id="pnp-close-btn">✕</button>
            </div>
            <div class="pnp-body">
                ${photos.length === 0
                    ? '<div class="pnp-empty">Nessuna foto ricevuta</div>'
                    : photos.map((p, i) => `
                        <div class="pnp-item${p.added ? ' pnp-item-added' : ''}" data-idx="${i}">
                            <img src="${p.dataUrl}" alt="${p.name}" class="pnp-thumb">
                            <div class="pnp-item-info">
                                <div class="pnp-item-name">${p.name}</div>
                                <button class="pnp-add-btn" data-idx="${i}">${p.added ? '+ Aggiungi di nuovo' : 'Aggiungi alla lavagna'}</button>
                            </div>
                            <button class="pnp-del-btn" data-idx="${i}" title="Rimuovi">✕</button>
                        </div>
                    `).join('')}
            </div>
            ${photos.length > 0 ? '<button class="pnp-clear-btn" id="pnp-clear-btn">Cancella tutte</button>' : ''}
        `;

        panel.querySelector('#pnp-close-btn').addEventListener('click', () => {
            panel.style.display = 'none';
        });

        panel.querySelectorAll('.pnp-add-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = parseInt(btn.dataset.idx);
                this._addPhotoToCanvas(idx);
                this._renderPhotoPanel(panel); // Aggiorna UI
                this._updateBell();
            });
        });

        panel.querySelectorAll('.pnp-del-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = parseInt(btn.dataset.idx);
                this._pendingPhotos.splice(idx, 1);
                this._renderPhotoPanel(panel);
                this._updateBell();
            });
        });

        const clearBtn = panel.querySelector('#pnp-clear-btn');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                this._pendingPhotos = [];
                this._renderPhotoPanel(panel);
                this._updateBell();
            });
        }
    }

    _addPhotoToCanvas(idx) {
        const photo = (this._pendingPhotos || [])[idx];
        if (!photo) return;
        const img = new Image();
        img.onload = () => {
            if (window.objectLayer?.addObject) {
                // Calcola il centro dell'area visibile in coordinate canvas,
                // tenendo conto di pan (_dx/_dy) e zoom (_scale) del PanManager.
                const viewportW = window.innerWidth;
                const viewportH = window.innerHeight;
                let centerX, centerY, maxW, maxH;
                if (typeof panMgr !== 'undefined' && panMgr) {
                    const _dx    = panMgr.dx;
                    const _dy    = panMgr.dy;
                    const _scale = panMgr.scale;
                    centerX = (viewportW / 2 - _dx) / _scale;
                    centerY = (viewportH / 2 - _dy) / _scale;
                    // Dimensioni massime in coordinate canvas (60% dell'area visibile)
                    maxW = (viewportW * 0.6) / _scale;
                    maxH = (viewportH * 0.6) / _scale;
                } else {
                    // Fallback: usa le dimensioni del canvas element
                    const drawCanvas = document.getElementById('draw-canvas');
                    centerX = drawCanvas ? drawCanvas.width  / 2 : 640;
                    centerY = drawCanvas ? drawCanvas.height / 2 : 360;
                    maxW = (drawCanvas ? drawCanvas.width  : 1280) * 0.6;
                    maxH = (drawCanvas ? drawCanvas.height : 720)  * 0.6;
                }
                const scale = Math.min(1, maxW / img.naturalWidth, maxH / img.naturalHeight);
                const W = Math.round(img.naturalWidth  * scale);
                const H = Math.round(img.naturalHeight * scale);
                const x = centerX - W / 2;
                const y = centerY - H / 2;
                const obj = window.objectLayer.addObject('image', img, x, y, W, H);
                if (obj) window.objectLayer.bringToFront(obj.id);
                if (typeof toast === 'function') toast('Foto aggiunta alla lavagna', 'success');
                // Marca come aggiunta ma permette di riaggiungerla — il badge si azzera
                photo.added = true;
            } else {
                if (typeof toast === 'function') toast('Errore: objectLayer non disponibile', 'error');
            }
        };
        img.src = photo.dataUrl;
    }

    // Polling timer — avviato da initDrive
    startTimerPolling() {
        if (this._timerInt) return;
        this._timerInt = setInterval(async () => {
            if (!this._phoneConnected) return;
            try {
                const res = await fetch(`${CONNECT_SERVER}/timer/${this._limId}`).then(r => r.json());
                this._updateTimer(res);
            } catch(_) {}
        }, 500);
    }

    _beep(freq, duration, volume) {
        const ctx = this._audioCtx;
        if (!ctx) return;
        try {
            const osc  = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.frequency.value = freq;
            gain.gain.setValueAtTime(volume || 0.35, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + duration);
        } catch(_) {}
    }

    _playTimerAlarm() {
        [0, 500, 1000].forEach(d => setTimeout(() => this._beep(880, 0.45), d));
    }

    _stopAlarm() {
        if (this._alarmInt) {
            clearInterval(this._alarmInt);
            this._alarmInt = null;
        }
    }

    _startAlarm() {
        if (this._alarmInt) return; // già attivo
        // Suona subito il primo beep, poi ripete ogni 2s
        this._beep(880, 0.6, 0.6);
        this._alarmInt = setInterval(() => {
            this._beep(880, 0.45, 0.5);
            setTimeout(() => this._beep(1100, 0.35, 0.4), 300);
        }, 2000);
    }

    _updateTimer(data) {
        // Crea/aggiorna overlay timer sulla LIM
        let overlay = document.getElementById('eduboard-timer-overlay');

        // Caso: KV eliminato (STOP premuto dal telefono) → ferma allarme
        if (!data.active && !data.expired) {
            this._stopAlarm();
            this._timerWasActive = false;
            if (overlay) overlay.style.display = 'none';
            return;
        }

        // Caso: timer scaduto (expired) → avvia allarme in loop + overlay rosso lampeggiante
        if (data.expired) {
            if (!this._alarmInt) {
                // Prima volta che vediamo expired: avvia allarme
                this._startAlarm();
                if (typeof toast === 'function') toast('⏰ Tempo scaduto!', 'info');
            }
            this._timerWasActive = false;
            if (!overlay) {
                overlay = document.createElement('div');
                overlay.id = 'eduboard-timer-overlay';
                overlay.style.cssText = `
                    position:fixed; top:20px; right:20px; z-index:8000;
                    background:rgba(15,23,42,0.92); color:#ef4444;
                    border-radius:16px; padding:16px 24px; font-size:2rem;
                    font-weight:700; font-family:system-ui; letter-spacing:0.05em;
                    box-shadow:0 8px 32px rgba(0,0,0,0.4); backdrop-filter:blur(8px);
                    border:2px solid #ef4444; min-width:120px; text-align:center;
                    animation:timerExpiredBlink 1s step-start infinite;
                `;
                // Aggiunge keyframes per il lampeggio se non già presenti
                if (!document.getElementById('timer-expired-style')) {
                    const st = document.createElement('style');
                    st.id = 'timer-expired-style';
                    st.textContent = '@keyframes timerExpiredBlink { 0%,100%{opacity:1} 50%{opacity:0.35} }';
                    document.head.appendChild(st);
                }
                document.body.appendChild(overlay);
            }
            overlay.style.display = 'block';
            overlay.style.color = '#ef4444';
            overlay.style.border = '2px solid #ef4444';
            overlay.style.animation = 'timerExpiredBlink 1s step-start infinite';
            overlay.textContent = '⏰ TEMPO SCADUTO!';
            return;
        }

        // Caso: timer attivo
        this._timerWasActive = true;
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'eduboard-timer-overlay';
            overlay.style.cssText = `
                position:fixed; top:20px; right:20px; z-index:8000;
                background:rgba(15,23,42,0.92); color:#f1f5f9;
                border-radius:16px; padding:16px 24px; font-size:2.5rem;
                font-weight:700; font-family:system-ui; letter-spacing:0.05em;
                box-shadow:0 8px 32px rgba(0,0,0,0.4); backdrop-filter:blur(8px);
                border:1px solid rgba(255,255,255,0.1); min-width:120px; text-align:center;
            `;
            document.body.appendChild(overlay);
        }
        overlay.style.display = 'block';
        overlay.style.animation = '';
        overlay.style.border = '1px solid rgba(255,255,255,0.1)';
        // Calcola tempo rimanente
        const elapsed = Math.floor((Date.now() - data.startedAt) / 1000);
        const remaining = Math.max(0, data.seconds - elapsed);
        const m = Math.floor(remaining / 60);
        const s = remaining % 60;
        overlay.textContent = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
        // Rosso quando < 10 secondi
        overlay.style.color = remaining < 10 ? '#ef4444' : '#f1f5f9';
    }

}

// =============================================================================
// SEZIONE 4 — INIT
// Collegamento globale: istanziazione e wiring degli event listener
// =============================================================================

let driveMgr, libraryMgr, driveConnectBtn;

/**
 * initDrive() — chiamata dal DOMContentLoaded in app.js
 * (oppure si attiva automaticamente tramite window load listener)
 */
function initDrive() {
    _injectDriveStyles();

    driveMgr        = new DriveManager();
    libraryMgr      = new LibraryManager(driveMgr);
    driveConnectBtn = new DriveConnectButton(driveMgr);
    window.eduBoardConnect = new EduBoardConnect();
    window.eduBoardConnect.startPhotoPolling();
    window.eduBoardConnect.startLaserPolling();
    window.eduBoardConnect.startTimerPolling();

    document.getElementById('photo-bell-btn')?.addEventListener('click', () => {
        window.eduBoardConnect?.openPhotoPanel();
    });
    document.getElementById('fs-photo-bell')?.addEventListener('click', () => {
        window.eduBoardConnect?.openPhotoPanel();
    });

    // Aggiorna la campanella fullscreen quando si entra/esce dal fullscreen
    const _onFullscreenChange = () => window.eduBoardConnect?._updateBell();
    document.addEventListener('fullscreenchange',       _onFullscreenChange);
    document.addEventListener('webkitfullscreenchange', _onFullscreenChange);

    // Esponi come globali window.* — necessario per AutoSaveManager (onDirty usa window.libraryMgr e window.driveMgr)
    window.driveMgr        = driveMgr;
    window.libraryMgr      = libraryMgr;
    window.driveConnectBtn = driveConnectBtn;

    // Ripristina sessione precedente (se il token è ancora valido)
    const restored = driveMgr._loadSession();
    if (restored) {
        driveConnectBtn.update();
        window.eduBoardConnect._updateBell();
        if (driveMgr.isConnected()) {
            // Pre-carica la libreria in background all'avvio (senza aprire il pannello)
            // → quando l'utente la apre per la prima volta, è già pronta
            setTimeout(() => libraryMgr.refresh(), 800);
            // Apri ultima lezione
            setTimeout(() => _autoOpenLastLesson(), 1200);
        }
    }

    // ── Pulsante chiudi pannello libreria (×) ─────────────────────────────
    document.getElementById('library-close')?.addEventListener('click', () => {
        const panel = document.getElementById('library-panel');
        panel?.classList.remove('open');
        if (typeof _updateLibraryTabArrow === 'function') _updateLibraryTabArrow(panel);
    });

    // ── Tab freccia sinistra e destra (apri/chiudi libreria) ──────────────
    function _setupLibraryTab(tabId, side) {
        document.getElementById(tabId)?.addEventListener('click', () => {
            const panel = document.getElementById('library-panel');
            if (!panel) return;
            const isOpen  = panel.classList.contains('open');
            const curSide = panel.dataset.side || 'left';

            if (isOpen && curSide === side) {
                // Chiudi se già aperto dallo stesso lato
                panel.classList.remove('open');
            } else {
                // Apri (o cambia lato)
                panel.dataset.side = side;
                panel.classList.toggle('from-right', side === 'right');
                panel.classList.add('open');
                if (typeof libraryMgr !== 'undefined' && libraryMgr) {
                    // Se già caricata: mostra subito senza "Caricamento...", poi aggiorna in bg
                    if (libraryMgr._treeLoaded) {
                        libraryMgr._backgroundRefresh('eduboard-lib-cache', libraryMgr.treeEl?.scrollTop || 0);
                    } else {
                        libraryMgr.refresh();
                    }
                }
            }
            _syncLibraryTabArrows(panel);
        });
    }
    _setupLibraryTab('library-tab-left',  'left');
    _setupLibraryTab('library-tab-right', 'right');

    // ── Pulsante "Nuova lavagna" nel pannello ──────────────────────────────
    document.getElementById('library-new-board')?.addEventListener('click', () => {
        projectMgr.newBoard();
    });

    // ── Pulsante "Nuova cartella" nel pannello ─────────────────────────────
    document.getElementById('library-new-folder')?.addEventListener('click', () => {
        libraryMgr.createFolder(libraryMgr.currentFolderId);
    });

    // ── Pulsante "Salva qui" nel pannello ──────────────────────────────────
    document.getElementById('library-save-here')?.addEventListener('click', () => {
        libraryMgr.saveCurrentLesson(libraryMgr.currentFolderId);
    });

    // ── Pulsante Salva in header — sovrascrive projectMgr.save con Drive ──
    // (solo se Drive è connesso, altrimenti usa il salvataggio locale)
    const btnSave = document.getElementById('btn-save');
    if (btnSave) {
        btnSave.addEventListener('click', (e) => {
            if (driveMgr.isConnected()) {
                e.stopImmediatePropagation(); // blocca il listener di app.js (salvataggio locale)
                libraryMgr.saveCurrentLesson(libraryMgr.currentFolderId);
            }
            // Se non connesso: il listener originale di app.js gestisce il salvataggio locale
        }, true); // capture=true → intercetta prima del listener in app.js
    }

    // Il token è ora salvato in localStorage: _loadSession() lo ritrova già al prossimo avvio.
    // trySilentConnect() resta disponibile ma non viene chiamato automaticamente —
    // il modal GIS che mostrava causava confusione nell'UI.

    console.log('EduBoard Drive — inizializzato.');
}

// Auto-init se caricato dopo DOMContentLoaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDrive);
} else {
    initDrive();
}
