// barra-nuova.js — Restyling barra EduBoard (20/09/2026).
// Caricato SOLO da index-nuovo.html, DOPO app.js/drive.js/geometry.js.
// Additivo e reversibile: non modifica app.js. La #page-bar viene ricostruita
// da zero da PageManager._updatePageBar() ad ogni pagina aggiunta/rimossa/rinominata
// (bar.innerHTML = '') — qui la si osserva e si riapplicano icona nuova + pulsante
// Presentazione ogni volta che succede, invece di toccare quella funzione.
(function () {

    function syncPresentIcon() {
        const use = document.getElementById('v2-present-use');
        const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement);
        if (use) use.setAttribute('href', isFs ? '#ic-present-on' : '#ic-present');
        // Il pulsante resta ACCESO in azzurro mentre si è a schermo intero, così si
        // capisce che è attivo e che ricliccandolo si torna alla vista normale.
        const btn = document.querySelector('.v2-present-btn');
        if (btn) {
            btn.classList.toggle('v2-on', isFs);
            btn.title = isFs
                ? 'Esci dalla presentazione (schermo intero attivo)'
                : 'Presentazione — schermo intero, i comandi restano';
        }
    }

    // Barra pagine come nel banco: [Presentazione][Sfondo] │ [‹][N/M][›][+].
    // I pulsanti-pagina numerati creati da app.js restano nel DOM (li usa lui) ma sono
    // nascosti via CSS: al loro posto c'è il contatore, che apre il pannello pagine.
    function augmentPageBar(bar) {
        // Icona nuova sul pulsante "Cambia sfondo" già esistente — stessa funzione, solo il disegno cambia
        const bgBtn = bar.querySelector('.page-bar-icon-btn:not(.v2-added)');
        if (bgBtn) {
            bgBtn.innerHTML = '<svg viewBox="0 0 24 24"><use href="#ic-bg"/></svg>';
            // Anche qui il riclic deve richiudere (stesso difetto di _togglePopup)
            let bgWasOpen = false;
            bgBtn.addEventListener('pointerdown', () => {
                const p = document.getElementById('bg-popup');
                bgWasOpen = !!p && p.style.display === 'block';
            });
            bgBtn.addEventListener('click', () => {
                if (!bgWasOpen) return;
                const p = document.getElementById('bg-popup');
                if (p) p.style.display = 'none';
                const overlay = document.getElementById('overlay-canvas');
                if (overlay) overlay.style.pointerEvents = 'auto';
            });
        }

        // Pulsante "Presentazione" — nuovo, prima dello sfondo — richiama gli stessi
        // pulsanti già esistenti in header (#btn-fullscreen / #btn-exit-fullscreen)
        if (!bar.querySelector('.v2-present-btn')) {
            const presentBtn = document.createElement('button');
            presentBtn.className = 'page-bar-icon-btn v2-added v2-present-btn';
            presentBtn.title = 'Presentazione — schermo intero, i comandi restano';
            presentBtn.innerHTML = '<svg viewBox="0 0 24 24"><use href="#ic-present" id="v2-present-use"/></svg>';
            presentBtn.addEventListener('click', () => {
                const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement);
                document.getElementById(isFs ? 'btn-exit-fullscreen' : 'btn-fullscreen')?.click();
            });
            bar.insertBefore(presentBtn, bar.firstChild);
            syncPresentIcon();
        }

        // Navigazione pagine: separatore, precedente, contatore, successiva, aggiungi
        if (!bar.querySelector('.v2-pagenav')) {
            const nav = document.createElement('span');
            nav.className = 'v2-pagenav';
            nav.style.cssText = 'display:inline-flex;align-items:center;gap:2px';
            nav.innerHTML =
                '<span class="v2-barsep"></span>' +
                '<button class="page-bar-icon-btn v2-added" id="v2-page-prev" title="Pagina precedente"><svg viewBox="0 0 24 24"><use href="#ic-chevron-l"/></svg></button>' +
                '<button class="v2-pagechip v2-added" id="v2-page-chip" title="Tutte le pagine — scegli, aggiungi, elimina">1/1</button>' +
                '<button class="page-bar-icon-btn v2-added" id="v2-page-next" title="Pagina successiva"><svg viewBox="0 0 24 24"><use href="#ic-chevron-r"/></svg></button>' +
                '<button class="page-bar-icon-btn v2-added" id="v2-page-add" title="Aggiungi pagina"><svg viewBox="0 0 24 24"><use href="#ic-addpage"/></svg></button>';
            bar.appendChild(nav);

            nav.querySelector('#v2-page-prev').addEventListener('click', () => {
                if (typeof pageManager !== 'undefined' && pageManager && pageManager.currentIndex > 0) {
                    pageManager.goToPage(pageManager.currentIndex - 1);
                }
            });
            nav.querySelector('#v2-page-next').addEventListener('click', () => {
                if (typeof pageManager !== 'undefined' && pageManager && pageManager.currentIndex < pageManager.pages.length - 1) {
                    pageManager.goToPage(pageManager.currentIndex + 1);
                }
            });
            nav.querySelector('#v2-page-add').addEventListener('click', () => {
                bar.querySelector('.page-btn--add')?.click();   // il pulsante vero di app.js
            });
            nav.querySelector('#v2-page-chip').addEventListener('click', (e) => {
                e.stopPropagation();
                renderPagesPanel();
                openV2Panel('v2-pages-panel', e.currentTarget);
            });
        }
        updatePageChip();
    }

    function updatePageChip() {
        const chip = document.getElementById('v2-page-chip');
        if (!chip || typeof pageManager === 'undefined' || !pageManager) return;
        chip.textContent = (pageManager.currentIndex + 1) + '/' + pageManager.pages.length;
    }

    // ---- Anteprima di una pagina ----
    // I dati ci sono già: ogni pagina salva `drawImageData` (l'intero canvas) e
    // `captureRect` (dove stava il foglio dentro quel canvas). Si ritaglia il foglio
    // e lo si rimpicciolisce. Per la pagina CORRENTE il dato salvato è vecchio —
    // si fotografa il canvas vivo, altrimenti l'anteprima mostrerebbe com'era prima.
    function buildPageThumb(index, imgEl) {
        const pm = pageManager;
        const isCurrent = index === pm.currentIndex;
        const drawCanvas = document.getElementById('draw-canvas');
        const objCanvas = document.getElementById('objects-canvas');
        let src = null, rect = null;

        if (isCurrent && drawCanvas && drawCanvas.width) {
            // Pagina aperta: si fotografano INSIEME disegno e immagini (stanno su due
            // canvas diversi — prima l'anteprima mostrava solo le scritte).
            const unione = document.createElement('canvas');
            unione.width = drawCanvas.width;
            unione.height = drawCanvas.height;
            const ux = unione.getContext('2d');
            if (objCanvas && objCanvas.width) ux.drawImage(objCanvas, 0, 0);
            ux.drawImage(drawCanvas, 0, 0);
            src = unione.toDataURL('image/png');
            if (typeof bgMgr !== 'undefined' && bgMgr) {
                const r = bgMgr._getPageRect(drawCanvas.width, drawCanvas.height);
                rect = { px: r.px, py: r.py, pw: r.pw, ph: r.ph };
            }
        } else {
            src = pm.pages[index]?.drawImageData || null;
            rect = pm.pages[index]?.captureRect || null;
        }
        const pagina = pm.pages[index] || {};
        if (!src && !(pagina.objects || []).length && !(pagina.embeds || []).length) return;
        const img = new Image();
        img.onload = img.onerror = async () => {
            const TW = 112, TH = 80;            // doppio della misura a schermo, per la nitidezza
            const r = (rect && rect.pw)
                ? rect
                : { px: 0, py: 0, pw: img.width || 1600, ph: img.height || 1100 };

            // 1) ritaglia il foglio a piena risoluzione
            let cur = document.createElement('canvas');
            cur.width = Math.max(1, Math.round(r.pw));
            cur.height = Math.max(1, Math.round(r.ph));
            const cctx = cur.getContext('2d');
            if (img.naturalWidth) cctx.drawImage(img, r.px, r.py, r.pw, r.ph, 0, 0, cur.width, cur.height);

            // 1b) per le pagine NON aperte le immagini incollate stanno a parte (non sono
            //     nel disegno): si ridisegnano qui, altrimenti l'anteprima mostrava solo
            //     le scritte e non si capiva cosa ci fosse nella pagina.
            if (!isCurrent && (pagina.objects || []).length) {
                const disegni = (pagina.objects || []).map(o => new Promise(res => {
                    if (!o.dataUrl) { res(); return; }
                    const oi = new Image();
                    oi.onload = () => {
                        // coordinate salvate come frazione del foglio (objectFormat page-fraction)
                        const x = (pagina.objectFormat === 'page-fraction') ? o.x * r.pw : (o.x - r.px);
                        const y = (pagina.objectFormat === 'page-fraction') ? o.y * r.pw : (o.y - r.py);
                        const w = (pagina.objectFormat === 'page-fraction') ? o.w * r.pw : o.w;
                        const h = (pagina.objectFormat === 'page-fraction') ? o.h * r.pw : o.h;
                        try { cctx.drawImage(oi, x, y, w, h); } catch (_) {}
                        res();
                    };
                    oi.onerror = res;
                    oi.src = o.dataUrl;
                }));
                await Promise.all(disegni);
            }

            // 2) dimezza a passi fino a sfiorare la misura finale. Rimpicciolire di colpo
            //    da 2160px a 112px fa sparire le linee sottili (si mediano col bianco e
            //    restano quasi invisibili): a passi invece restano leggibili.
            while (cur.width / 2 > TW) {
                const n = document.createElement('canvas');
                n.width = Math.round(cur.width / 2);
                n.height = Math.round(cur.height / 2);
                const nx = n.getContext('2d');
                nx.imageSmoothingQuality = 'high';
                nx.drawImage(cur, 0, 0, n.width, n.height);
                cur = n;
            }

            // 3) ultimo passo dentro il riquadro dell'anteprima
            const c = document.createElement('canvas');
            c.width = TW; c.height = TH;
            const ctx = c.getContext('2d');
            ctx.fillStyle = '#fff';
            ctx.fillRect(0, 0, TW, TH);
            ctx.imageSmoothingQuality = 'high';
            const s = Math.min(TW / cur.width, TH / cur.height);
            const dw = cur.width * s, dh = cur.height * s;
            ctx.drawImage(cur, (TW - dw) / 2, (TH - dh) / 2, dw, dh);

            // 4) bollini dei contenuti incorporati: un video o una pagina web non
            //    lasciano traccia nell'immagine (sono riquadri veri, non disegno), quindi
            //    senza questi non si capirebbe che la pagina ne contiene.
            const incorporati = (isCurrent && typeof embedMgr !== 'undefined' && embedMgr)
                ? embedMgr.serialize()
                : (pagina.embeds || []);
            incorporati.slice(0, 3).forEach((em, i) => {
                const bx = 4 + i * 20, by = TH - 20;
                const url = String(em.url || '');
                const youtube = /youtube\.com|youtu\.be/i.test(url);
                const link = em.type === 'link';
                ctx.fillStyle = youtube ? '#e14434' : (link ? '#e8763a' : '#3b82f6');
                ctx.beginPath();
                ctx.roundRect ? ctx.roundRect(bx, by, 16, 16, 4) : ctx.rect(bx, by, 16, 16);
                ctx.fill();
                ctx.fillStyle = '#fff';
                if (youtube) {                                  // triangolo "play"
                    ctx.beginPath();
                    ctx.moveTo(bx + 6, by + 4.5);
                    ctx.lineTo(bx + 12, by + 8);
                    ctx.lineTo(bx + 6, by + 11.5);
                    ctx.closePath();
                    ctx.fill();
                } else if (link) {                              // due anelli di catena
                    ctx.lineWidth = 1.6;
                    ctx.strokeStyle = '#fff';
                    ctx.beginPath(); ctx.arc(bx + 6, by + 8, 2.6, 0, Math.PI * 2); ctx.stroke();
                    ctx.beginPath(); ctx.arc(bx + 10, by + 8, 2.6, 0, Math.PI * 2); ctx.stroke();
                } else {                                        // mappamondo
                    ctx.lineWidth = 1.4;
                    ctx.strokeStyle = '#fff';
                    ctx.beginPath(); ctx.arc(bx + 8, by + 8, 4.6, 0, Math.PI * 2); ctx.stroke();
                    ctx.beginPath(); ctx.moveTo(bx + 3.4, by + 8); ctx.lineTo(bx + 12.6, by + 8); ctx.stroke();
                    ctx.beginPath(); ctx.ellipse(bx + 8, by + 8, 2.2, 4.6, 0, 0, Math.PI * 2); ctx.stroke();
                }
            });

            imgEl.src = c.toDataURL();
        };
        img.src = src || 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
    }

    function closeRowMenu() {
        document.querySelectorAll('.v2-rowmenu').forEach(m => m.remove());
    }

    // Identificativo del video da qualunque forma di link YouTube (o dall'id nudo)
    function estraiIdYouTube(raw) {
        const s = (raw || '').trim();
        if (!s) return null;
        if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;                 // già solo l'id
        const schemi = [
            /[?&]v=([A-Za-z0-9_-]{11})/,                              // watch?v=
            /youtu\.be\/([A-Za-z0-9_-]{11})/,                         // youtu.be/
            /\/embed\/([A-Za-z0-9_-]{11})/,                           // /embed/
            /\/shorts\/([A-Za-z0-9_-]{11})/,                          // /shorts/
            /\/live\/([A-Za-z0-9_-]{11})/                             // /live/
        ];
        for (const re of schemi) {
            const m = s.match(re);
            if (m) return m[1];
        }
        return null;
    }

    // ⋮ di riga: duplica la pagina, oppure la sposta in un'altra lezione (quest'ultima
    // è la funzione che l'app aveva già sul vecchio pulsante ⇄).
    function openRowMenu(index, anchor) {
        closeRowMenu();
        const menu = document.createElement('div');
        menu.className = 'v2-rowmenu';
        menu.innerHTML =
            '<button data-act="dup"><svg viewBox="0 0 24 24"><use href="#ic-pages"/></svg>Duplica questa pagina</button>' +
            '<button data-act="move"><svg viewBox="0 0 24 24"><use href="#ic-movepage"/></svg>Sposta o copia in un\'altra lezione</button>';
        document.body.appendChild(menu);
        const r = anchor.getBoundingClientRect();
        menu.style.left = Math.min(r.left, window.innerWidth - menu.offsetWidth - 12) + 'px';
        menu.style.top = Math.max(12, r.top - menu.offsetHeight - 6) + 'px';
        menu.addEventListener('click', (e) => {
            e.stopPropagation();
            const act = e.target.closest('button')?.dataset.act;
            if (act === 'dup') duplicatePage(index);
            if (act === 'move') {
                closeV2Panels();
                window.libraryMgr?.openMovePageModal(index);
            }
            closeRowMenu();
        });
    }

    function duplicatePage(index) {
        const pm = pageManager;
        if (!pm || !pm.pages[index]) return;
        // Se si duplica la pagina aperta, prima se ne fotografa lo stato attuale
        if (index === pm.currentIndex) pm.pages[index] = pm._captureCurrentPage();
        pm.pages.splice(index + 1, 0, JSON.parse(JSON.stringify(pm.pages[index])));
        if (pm.currentIndex > index) pm.currentIndex++;
        pm._updatePageBar();
        CONFIG.isDirty = true;
        window.autoSaveMgr?.onDirty();
        renderPagesPanel();
        toast?.('Pagina duplicata', 'success');
    }

    // Trascinamento con Pointer Events (non HTML5 drag&drop: quello col dito sulla LIM
    // non funziona). Si riordinano le righe nel DOM mentre si trascina, e al rilascio
    // si applica lo stesso ordine all'array vero delle pagine.
    // Riga grigia che mostra DOVE finirà la pagina mentre la si trascina: senza,
    // si sposta alla cieca (richiesta di Fabio). Si posiziona sopra o sotto la riga
    // trascinata, a seconda di dove andrebbe a finire.
    function mostraSegnoInserimento(row, list) {
        let segno = list.querySelector('.v2-drop-line');
        if (!segno) {
            segno = document.createElement('div');
            segno.className = 'v2-drop-line';
            list.appendChild(segno);
        }
        const b = row.getBoundingClientRect();
        const bl = list.getBoundingClientRect();
        segno.style.top = (b.top - bl.top + list.scrollTop - 3) + 'px';
        segno.style.display = 'block';
    }

    function togliSegnoInserimento(list) {
        const segno = list.querySelector('.v2-drop-line');
        if (segno) segno.remove();
    }

    function setupRowDrag(row, list) {
        // Si trascina da TUTTA la riga, non solo dalla maniglia ⠿: quella è un bersaglio
        // di pochi pixel, impossibile da prendere col dito sulla LIM (Fabio riferiva che
        // "non funziona" mentre il meccanismo girava: semplicemente non lo agganciava).
        // I pulsanti della riga restano esclusi, altrimenti non si potrebbe più cliccarli.
        row.addEventListener('pointerdown', (e) => {
            if (e.target.closest('.v2-rowbtn')) return;
            e.preventDefault();
            e.stopPropagation();
            const partenzaY = e.clientY;
            row.classList.add('v2-dragging');
            let spostata = false;

            // ⚠️ I movimenti si ascoltano sul DOCUMENTO, non sulla maniglia con
            // setPointerCapture: riordinando si sposta la riga nel DOM, e spostare
            // (= staccare e riattaccare) l'elemento che ha la cattura la fa perdere
            // al primo scambio — il trascinamento si fermava lì. Sul documento
            // invece gli eventi continuano ad arrivare per tutto il gesto.
            const onMove = (ev) => {
                // Soglia: sotto i 5px è un tocco, non un trascinamento — così un tap
                // un po' tremolante continua ad aprire la pagina invece di spostarla.
                if (!spostata && Math.abs(ev.clientY - partenzaY) < 5) return;
                spostata = true;
                const righe = Array.from(list.querySelectorAll('.v2-pagerow'));
                for (const altra of righe) {
                    if (altra === row) continue;
                    const b = altra.getBoundingClientRect();
                    if (ev.clientY > b.top && ev.clientY < b.bottom) {
                        const prima = ev.clientY < b.top + b.height / 2;
                        list.insertBefore(row, prima ? altra : altra.nextSibling);
                        break;
                    }
                }
                mostraSegnoInserimento(row, list);
            };
            const onUp = () => {
                document.removeEventListener('pointermove', onMove);
                document.removeEventListener('pointerup', onUp);
                document.removeEventListener('pointercancel', onUp);
                row.classList.remove('v2-dragging');
                togliSegnoInserimento(list);
                if (spostata) {
                    // Il click che segue il rilascio non deve far cambiare pagina
                    ignoraClickFino = Date.now() + 400;
                    applyRowOrder(list);
                }
            };
            document.addEventListener('pointermove', onMove);
            document.addEventListener('pointerup', onUp);
            document.addEventListener('pointercancel', onUp);
        });
    }

    function applyRowOrder(list) {
        const pm = pageManager;
        if (!pm) return;
        const order = Array.from(list.querySelectorAll('.v2-pagerow')).map(r => parseInt(r.dataset.idx, 10));
        if (order.some(isNaN) || order.length !== pm.pages.length) return;
        const unchanged = order.every((v, i) => v === i);
        if (unchanged) return;
        const current = pm.pages[pm.currentIndex];
        const old = pm.pages.slice();
        pm.pages = order.map(i => old[i]);
        pm.currentIndex = pm.pages.indexOf(current);
        pm._updatePageBar();
        CONFIG.isDirty = true;
        window.autoSaveMgr?.onDirty();
        renderPagesPanel();
    }

    // Elenco pagine del pannello, come nel banco: maniglia, anteprima, nome, cestino, ⋮.
    // Tutte le azioni passano dai metodi veri di PageManager — niente logica duplicata.
    function renderPagesPanel() {
        const list = document.getElementById('v2-pagelist');
        if (!list || typeof pageManager === 'undefined' || !pageManager) return;
        closeRowMenu();
        list.innerHTML = '';
        pageManager.pages.forEach((p, i) => {
            const isCurrent = i === pageManager.currentIndex;
            const row = document.createElement('div');
            row.className = 'v2-pagerow' + (isCurrent ? ' v2-current' : '');
            row.dataset.idx = i;

            const grip = document.createElement('span');
            grip.className = 'v2-grip';
            grip.title = 'Trascina per riordinare';
            grip.textContent = '⠿';
            row.appendChild(grip);

            const thumb = document.createElement('img');
            thumb.className = 'v2-thumb';
            thumb.alt = '';
            row.appendChild(thumb);
            buildPageThumb(i, thumb);

            const name = document.createElement('span');
            name.className = 'v2-pagename';
            name.innerHTML = 'Pagina ' + (i + 1) + (isCurrent ? ' <em>— sei qui</em>' : '');
            row.appendChild(name);

            if (pageManager.pages.length > 1) {
                const del = document.createElement('button');
                del.className = 'v2-rowbtn';
                del.title = 'Elimina pagina ' + (i + 1);
                del.innerHTML = '<svg viewBox="0 0 24 24"><use href="#ic-trash"/></svg>';
                del.addEventListener('click', (e) => {
                    e.stopPropagation();
                    pageManager.deletePage(i);
                    renderPagesPanel();
                });
                row.appendChild(del);
            }

            const dots = document.createElement('button');
            dots.className = 'v2-rowbtn';
            dots.title = 'Duplica, sposta in un\'altra lezione';
            dots.textContent = '⋮';
            dots.addEventListener('click', (e) => {
                e.stopPropagation();
                openRowMenu(i, dots);
            });
            row.appendChild(dots);

            row.addEventListener('click', () => {
                if (Date.now() < ignoraClickFino) return;   // arriva da un trascinamento
                pageManager.goToPage(i);
                renderPagesPanel();
            });
            setupRowDrag(row, list);
            list.appendChild(row);
        });
    }

    function watchPageBar() {
        const bar = document.getElementById('page-bar');
        if (!bar) {
            // Pagine non ancora caricate (es. Drive in corso): aspetta che PageManager la crei.
            const bodyObs = new MutationObserver(() => {
                if (document.getElementById('page-bar')) { bodyObs.disconnect(); watchPageBar(); }
            });
            bodyObs.observe(document.body, { childList: true, subtree: true });
            return;
        }
        augmentPageBar(bar);
        const obs = new MutationObserver(() => {
            obs.disconnect();          // evita di reagire alle mutazioni che produciamo noi stessi
            augmentPageBar(bar);
            obs.observe(bar, { childList: true });
        });
        obs.observe(bar, { childList: true });
    }

    ['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange'].forEach(ev => {
        document.addEventListener(ev, syncPresentIcon);
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', watchPageBar);
    } else {
        watchPageBar();
    }

    // ------------------------------------------------------------------
    // STEP 3: Magic Box + Gestione File.
    // Pannelli nuovi, gestiti qui — stessa formula di posizionamento di
    // ToolbarManager._togglePopup() in app.js (mai toccato), così restano
    // allineati agli stessi popup nativi (Sfondo/Forme).
    // ------------------------------------------------------------------

    function positionV2Panel(panel, btn) {
        const wrapper = document.getElementById('toolbar-wrapper');
        const header = document.getElementById('app-header');
        if (!wrapper) return;
        const tbRect = wrapper.getBoundingClientRect();
        const headerH = header?.offsetHeight || 56;
        const bottomOffset = window.innerHeight - tbRect.top + 12;
        const availableH = tbRect.top - headerH - 12;
        panel.style.bottom = bottomOffset + 'px';
        panel.style.maxHeight = Math.max(180, availableH) + 'px';

        // Come nel banco: il pannello nasce sopra il pulsante che l'ha aperto, non
        // sempre al centro schermo (qui `left` resta in px, il CSS applica comunque
        // translateX(-50%): stesso schema del banco, che fa esattamente questo).
        if (btn) {
            const r = btn.getBoundingClientRect();
            const half = panel.offsetWidth / 2;
            const min = half + 14, max = window.innerWidth - half - 14;
            const centre = r.left + r.width / 2;
            panel.style.left = Math.max(min, Math.min(max, centre)) + 'px';
        } else {
            panel.style.left = '50%';
        }
    }

    // ---- I nodi VERI delle opzioni (colori, spessori, modi gomma) viaggiano ----
    // Nel banco colori e spessore stanno DENTRO il pannello della penna, non in una
    // pillola a parte. Qui non se ne creano di nuovi (sarebbero finti e scollegati):
    // si spostano i nodi originali dell'app dentro il pannello aperto e si rimettono
    // al loro posto alla chiusura. Stessi nodi ⇒ stessi listener di app.js, intatti.
    const PEN_FAMILY = ['pen', 'pencil', 'pastel', 'marker', 'laser'];
    let optionHomes = null;
    let ignoraClickFino = 0;     // finestra in cui il click dopo un trascinamento va ignorato

    function captureOptionHomes() {
        if (optionHomes) return;
        optionHomes = ['options-colors', 'options-sizes', 'eraser-mode-btns']
            .map(id => document.getElementById(id))
            .filter(Boolean)
            .map(node => ({ node, parent: node.parentNode, next: node.nextElementSibling }));
    }

    function homeOptionNodes() {
        if (!optionHomes) return;
        optionHomes.forEach(h => {
            if (h.node.parentNode !== h.parent) h.parent.insertBefore(h.node, h.next);
        });
    }

    function moveOptionsInto(pairs) {
        captureOptionHomes();
        Object.keys(pairs).forEach(nodeId => {
            const node = document.getElementById(nodeId);
            const slot = document.getElementById(pairs[nodeId]);
            if (node && slot) slot.appendChild(node);
        });
    }

    // Per penna, gomma e forme le opzioni vivono nel rispettivo pannello: la pillola
    // sotto la barra non deve comparire (resta solo per il Testo, che pannello non ha).
    const OWNED_BY_PANEL = PEN_FAMILY.concat(['eraser', 'shape', 'text']);
    function syncOptionsRowVisibility() {
        const row = document.getElementById('tool-options-row');
        if (!row || typeof CONFIG === 'undefined') return;
        if (OWNED_BY_PANEL.includes(CONFIG.currentTool)) row.style.display = 'none';
    }

    // Il popup Forme è di app.js: qui gli si aggiungono due vassoi in fondo (spessore
    // del bordo + colore) che ospiteranno gli stessi nodi veri, come fa il pannello
    // della penna. La griglia delle forme e la sua logica non si toccano.
    function ensureShapeSlots() {
        const popup = document.getElementById('shape-popup');
        if (!popup || popup.querySelector('#v2-slot-shape-sizes')) return;
        const wrap = document.createElement('div');
        wrap.innerHTML =
            '<div class="v2-trayv" style="margin-top:12px"><div class="v2-trayv-title">Spessore del bordo</div>' +
            '<div class="v2-row v2-options-slot" id="v2-slot-shape-sizes"></div></div>' +
            '<div class="v2-trayv"><div class="v2-trayv-title">Colore</div>' +
            '<div class="v2-row v2-options-slot" id="v2-slot-shape-colors"></div></div>';
        popup.appendChild(wrap);
    }

    // Chi "possiede" adesso i nodi delle opzioni: un pannello aperto, il popup Forme,
    // oppure nessuno (e allora tornano a casa).
    function syncOptionOwnership(tool) {
        if (document.querySelector('.v2-panel.v2-open')) return;   // li tiene il pannello
        const popup = document.getElementById('shape-popup');
        const shapeOpen = popup && popup.style.display !== 'none' && popup.style.display !== '';
        if (tool === 'shape' && shapeOpen) {
            ensureShapeSlots();
            moveOptionsInto({ 'options-sizes': 'v2-slot-shape-sizes', 'options-colors': 'v2-slot-shape-colors' });
            return;
        }
        homeOptionNodes();
    }

    function closeV2Panels() {
        let any = false;
        closeRowMenu();
        ['v2-magic-panel', 'v2-file-panel', 'v2-pen-panel', 'v2-eraser-panel', 'v2-pages-panel', 'v2-text-panel'].forEach(id => {
            const el = document.getElementById(id);
            if (el && el.classList.contains('v2-open')) { el.classList.remove('v2-open'); any = true; }
        });
        if (any) {
            homeOptionNodes();
            syncOptionsRowVisibility();
            const overlay = document.getElementById('overlay-canvas');
            if (overlay) overlay.style.pointerEvents = 'auto';
        }
    }

    function openV2Panel(id, btn) {
        const panel = document.getElementById(id);
        if (!panel) return;
        const wasOpen = panel.classList.contains('v2-open');
        if (typeof toolbarMgr !== 'undefined' && toolbarMgr) toolbarMgr._closeAllPopups();
        closeV2Panels();
        if (!wasOpen) {
            // I nodi veri delle opzioni entrano nel pannello PRIMA di misurarlo,
            // altrimenti `left` verrebbe calcolato su una larghezza sbagliata.
            if (id === 'v2-pen-panel') {
                moveOptionsInto({ 'options-sizes': 'v2-slot-sizes', 'options-colors': 'v2-slot-colors' });
            } else if (id === 'v2-eraser-panel') {
                moveOptionsInto({ 'eraser-mode-btns': 'v2-slot-eraser-modes', 'options-sizes': 'v2-slot-eraser-sizes' });
            } else if (id === 'v2-text-panel') {
                moveOptionsInto({ 'options-colors': 'v2-slot-text-colors' });
            }
            positionV2Panel(panel, btn);
            panel.classList.add('v2-open');
            const overlay = document.getElementById('overlay-canvas');
            if (overlay) overlay.style.pointerEvents = 'none';
        }
    }

    // Consolidamento Penna (20/09/2026): il pulsante di barra mostra sempre l'icona
    // dell'ultimo strumento di scrittura scelto — stessa idea già usata da app.js per
    // l'icona dinamica del quick-strip (#qab-writing-tool), qui riapplicata al nuovo
    // pulsante con la sprite nuova invece dei path grezzi.
    const V2_PEN_ICONS = { pen: '#ic-pen', pencil: '#ic-pencil', pastel: '#ic-crayon', marker: '#ic-marker', laser: '#ic-laser' };
    function syncPenTriggerIcon(tool) {
        const use = document.getElementById('v2-pen-trigger-use');
        if (use && V2_PEN_ICONS[tool]) use.setAttribute('href', V2_PEN_ICONS[tool]);
    }

    function setupV2Panels() {
        document.getElementById('v2-pen-btn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            openV2Panel('v2-pen-panel', e.currentTarget);
        });
        // Gomma: apre il suo pannello (modi + dimensione) oltre a selezionare lo
        // strumento — il click nativo di app.js è già attaccato e continua a valere.
        const eraserBtn = document.querySelector('.main-row .tool-btn[data-tool="eraser"]');
        if (eraserBtn) {
            // Icone nuove sui due modi già esistenti (Area / Tratto): si sostituisce
            // solo il disegno dentro il pulsante, il nodo e i suoi listener restano.
            const areaBtn = document.querySelector('#eraser-mode-btns [data-mode="area"]');
            const strokeBtn = document.querySelector('#eraser-mode-btns [data-mode="stroke"]');
            if (areaBtn) areaBtn.innerHTML = '<svg viewBox="0 0 24 24"><use href="#ic-eraser"/></svg>';
            if (strokeBtn) strokeBtn.innerHTML = '<svg viewBox="0 0 24 24"><use href="#ic-eraser-stroke"/></svg>';
            eraserBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                openV2Panel('v2-eraser-panel', eraserBtn);
            });
        }
        // Testo: stesso trattamento di Penna/Gomma/Forme — il colore sta nel suo
        // pannello invece che in una barretta sempre accesa sotto la barra.
        const textBtn = document.querySelector('.main-row .tool-btn[data-tool="text"]');
        textBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            openV2Panel('v2-text-panel', textBtn);
        });

        document.getElementById('v2-magic-btn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            openV2Panel('v2-magic-panel', e.currentTarget);
        });
        document.getElementById('v2-file-btn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            openV2Panel('v2-file-panel', e.currentTarget);
        });
        document.getElementById('v2-new-board-btn')?.addEventListener('click', () => {
            document.getElementById('btn-new-board-header')?.click();
        });

        // Gestione File: ogni voce richiama il pulsante VERO già esistente — nessuna
        // funzione nuova dietro, solo una scorciatoia raggruppata.
        document.getElementById('v2-file-new')?.addEventListener('click', () => {
            closeV2Panels();
            document.getElementById('btn-new-board-header')?.click();
        });
        document.getElementById('v2-file-open')?.addEventListener('click', () => {
            closeV2Panels();
            document.getElementById('library-tab-right')?.click();
        });
        document.getElementById('v2-file-print')?.addEventListener('click', () => {
            closeV2Panels();
            document.getElementById('btn-export')?.click();
        });
        document.getElementById('v2-file-save')?.addEventListener('click', () => {
            closeV2Panels();
            document.getElementById('btn-save')?.click();
        });

        // YouTube: pulsante dedicato. Estrae l'identificativo da QUALUNQUE forma di
        // link (watch?v=, youtu.be/, /shorts/, /live/, /embed/, con o senza parametri)
        // e incorpora sempre nel formato /embed/, l'unico che YouTube permette.
        document.getElementById('v2-youtube-btn')?.addEventListener('click', () => {
            closeV2Panels();
            showPromptModal('Incorpora un video di YouTube', '', (val) => {
                const id = estraiIdYouTube(val);
                if (!id) { toast('Non riconosco questo link di YouTube', 'error'); return; }
                const t = (val.match(/[?&]t=(\d+)/) || val.match(/[?&]start=(\d+)/) || [])[1];
                const url = 'https://www.youtube.com/embed/' + id + (t ? '?start=' + t : '');
                const centro = (typeof _getPageCenter === 'function') ? _getPageCenter() : getViewportCenter();
                embedMgr.addEmbed(url, centro.x, centro.y, 640, 420, 'iframe');
                toast('Video incorporato', 'success');
            }, 'Incolla qui il link del video');
        });

        // Il Magic Box si chiude da solo appena si usa uno strumento al suo interno
        ['btn-geo-ruler', 'btn-geo-protractor', 'embed-web-btn', 'embed-link-btn',
         'btn-capture-board', 'btn-timer', 'btn-spotlight', 'btn-tendina'].forEach(id => {
            document.getElementById(id)?.addEventListener('click', closeV2Panels);
        });

        // Il pannello Penna si chiude da solo appena si sceglie un tipo di tratto,
        // e il pulsante di barra prende la sua icona — stesso comportamento del banco.
        document.querySelectorAll('#v2-pen-panel [data-tool]').forEach(btn => {
            btn.addEventListener('click', () => {
                syncPenTriggerIcon(btn.dataset.tool);
                closeV2Panels();
            });
        });

        // × interna ai pannelli nuovi (il listener nativo su .popup-close-btn
        // chiude solo i popup nativi, non conosce questi id)
        document.querySelectorAll('.v2-panel .popup-close-btn')
            .forEach(btn => btn.addEventListener('click', (e) => { e.stopPropagation(); closeV2Panels(); }));

        // Click dentro un pannello o sulla barra non richiude nulla (i pulsanti della
        // barra gestiscono da sé il proprio pannello); un click ALTROVE sì. Prima ci si
        // affidava a stopPropagation sui singoli pulsanti, ma bastava un listener
        // registrato nell'ordine sbagliato per richiudere il pannello appena aperto —
        // era il caso della Gomma, che selezionava lo strumento ma non mostrava il suo
        // pannello. Questo controllo sul bersaglio non dipende dall'ordine.
        // Ricliccando l'icona il suo pannello deve richiudersi. Per i popup nativi
        // (Forme, Sfondo) non succede: _selectTool() chiama _closeAllPopups() PRIMA
        // di _togglePopup(), quindi quest'ultimo trova sempre il popup già chiuso e
        // lo riapre — il "toggle" non scatta mai. Qui si registra lo stato al
        // pointerdown (che precede il click) e, se era aperto, lo si richiude dopo.
        function makeNativePopupToggle(triggerId, popupId) {
            const trigger = document.getElementById(triggerId);
            if (!trigger) return;
            let wasOpen = false;
            trigger.addEventListener('pointerdown', () => {
                const p = document.getElementById(popupId);
                wasOpen = !!p && p.style.display === 'block';
            });
            trigger.addEventListener('click', () => {
                if (!wasOpen) return;
                const p = document.getElementById(popupId);
                if (p) p.style.display = 'none';
                homeOptionNodes();
                syncOptionsRowVisibility();
                const overlay = document.getElementById('overlay-canvas');
                if (overlay) overlay.style.pointerEvents = 'auto';
            });
        }
        makeNativePopupToggle('shape-tool-btn', 'shape-popup');

        document.getElementById('v2-pages-add')?.addEventListener('click', () => {
            document.querySelector('#page-bar .page-btn--add')?.click();
            renderPagesPanel();
        });

        // Confermata (o annullata) la scritta, il pannello Testo si chiude da solo:
        // prima restava aperto sopra la lavagna anche a testo inserito.
        document.getElementById('txt-confirm')?.addEventListener('click', closeV2Panels);
        document.getElementById('txt-cancel')?.addEventListener('click', closeV2Panels);

        document.addEventListener('click', (e) => {
            if (e.target.closest && e.target.closest('.v2-rowmenu')) return;
            closeRowMenu();
            if (e.target.closest && (e.target.closest('#toolbar-wrapper') ||
                                     e.target.closest('#page-bar') ||
                                     e.target.closest('.v2-panel'))) return;
            closeV2Panels();
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setupV2Panels);
    } else {
        setupV2Panels();
    }

    // ------------------------------------------------------------------
    // STEP 3b: la barra non si allarga più — resta fissa, sono i pulsanti
    // (Penna/Gomma/Forme) a far apparire il loro pannello sopra, esattamente
    // come già fa il Magic Box. `#tool-options-row` (colori+dimensioni) è
    // già una "pillola" bianca gestita da app.js (_updateOptionsRow mostra/
    // nasconde SOLO quel nodo secondo lo strumento) — qui non se ne tocca la
    // logica: si tiene semplicemente `toolbarMgr` sempre nello stato "aperto"
    // (stesso stato che oggi si raggiunge solo cliccando la freccetta), così
    // quella pillola può comparire senza dover prima espandere tutta la barra.
    // ------------------------------------------------------------------
    function keepToolbarOpen() {
        if (typeof toolbarMgr === 'undefined' || !toolbarMgr) return;
        toolbarMgr.hide = function () {}; // su questa pagina la barra non si richiude mai
        toolbarMgr.show();

        // Difetto preesistente in app.js, invisibile finché la barra si apriva solo a
        // richiesta: lo strumento "pan" (Mano) non richiama _updateOptionsRow(), quindi
        // se la pillola colori/dimensioni era aperta resta visibile anche con la Mano
        // selezionata. Rete di sicurezza generica (nessuna riga toccata in app.js):
        // dopo OGNI click su un tool-btn, si ririchiama la funzione già esistente —
        // è idempotente, legge solo CONFIG.currentTool e aggiorna il display.
        // Nello stesso giro: il pulsante Penna consolidato non ha un suo data-tool
        // (apre solo il pannello), quindi _updateActiveBtn() di app.js non lo tocca
        // mai — qui gli si dà/toglie ".active" a mano secondo lo strumento scelto.
        captureOptionHomes();
        document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
            btn.addEventListener('click', () => {
                toolbarMgr._updateOptionsRow();
                syncOptionOwnership(btn.dataset.tool);
                syncOptionsRowVisibility();
                document.getElementById('v2-pen-btn')?.classList.toggle(
                    'active', PEN_FAMILY.includes(btn.dataset.tool)
                );
            });
        });
        syncOptionsRowVisibility();
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', keepToolbarOpen);
    } else {
        keepToolbarOpen();
    }

    // ------------------------------------------------------------------
    // Comandi degli incorporati a misura fissa + foto profilo nell'angolo.
    // ------------------------------------------------------------------

    // Pubblica l'inverso dello zoom come variabile CSS: la usano le regole
    // .embed-header/.embed-btn/... per restare della stessa grandezza a schermo.
    function syncEmbedScale() {
        const layer = document.getElementById('embed-layer');
        if (!layer || typeof panMgr === 'undefined' || !panMgr || !panMgr.scale) return;
        layer.style.setProperty('--v2-inv', (1 / panMgr.scale).toFixed(4));
    }

    // La foto profilo arriva DOPO il primo aggiornamento del pulsante account
    // (prima c'è solo il token), e quell'aggiornamento non viene più ripetuto:
    // nel menù la foto si vedeva, nel pallino sulla lavagna no. Qui la si applica
    // appena l'indirizzo è disponibile. Nessuna chiamata a Drive: solo la <img>.
    function syncAvatar() {
        const d = window.driveMgr;
        const img = document.getElementById('drive-fab-photo');
        const icon = document.getElementById('drive-fab-icon');
        if (!d || !img || !icon || typeof d.isConnected !== 'function') return false;
        if (!d.isConnected() || !d.userPhotoUrl) return false;
        if (img.getAttribute('src') === d.userPhotoUrl) {
            return img.complete && img.naturalWidth > 0;     // già a posto
        }
        img.referrerPolicy = 'no-referrer';
        img.onload = () => { img.style.display = 'block'; icon.style.display = 'none'; };
        img.onerror = () => { img.style.display = 'none'; icon.style.display = 'block'; };
        img.src = d.userPhotoUrl;
        return true;
    }

    // Anteprime degli sfondi presi dal Drive: app.js le mette come SFONDO CSS, e a
    // un'immagine di sfondo non si può dire "non mandare il referrer" — Google allora
    // la rifiuta e il riquadro resta vuoto (stessa causa della foto profilo). Qui ogni
    // riquadro riceve una <img> vera con referrerpolicy corretta. Non si tocca app.js:
    // si osserva la griglia e si converte ciò che compare.
    function convertiAnteprimeSfondi() {
        document.querySelectorAll('.bg-drive-thumb').forEach(thumb => {
            if (thumb.dataset.v2Img === '1') return;
            const bg = thumb.style.backgroundImage || '';
            const m = bg.match(/url\(['"]?(.+?)['"]?\)/);
            if (!m) return;
            thumb.dataset.v2Img = '1';
            thumb.style.backgroundImage = 'none';
            const im = document.createElement('img');
            im.referrerPolicy = 'no-referrer';
            im.alt = '';
            im.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:4px;display:block';
            im.onerror = () => { im.remove(); thumb.textContent = '🖼️'; };
            im.src = m[1];
            thumb.textContent = '';
            thumb.appendChild(im);
        });
    }

    function setupLateBits() {
        syncEmbedScale();

        const griglia = document.getElementById('bg-drive-images');
        if (griglia) {
            convertiAnteprimeSfondi();
            new MutationObserver(convertiAnteprimeSfondi).observe(griglia, { childList: true, subtree: true });
        }
        // Ogni pan/zoom ricalcola la variabile: si aggancia la funzione vera di
        // PanManager senza modificarla (si chiama l'originale e poi la nostra).
        if (typeof panMgr !== 'undefined' && panMgr && typeof panMgr._applyTransform === 'function') {
            const originale = panMgr._applyTransform.bind(panMgr);
            panMgr._applyTransform = function () { originale(); syncEmbedScale(); };
        }
        window.addEventListener('resize', syncEmbedScale);

        // La foto può arrivare anche molto dopo il caricamento: si ritenta a intervalli
        // finché non è a posto, poi si smette.
        let tentativi = 0;
        const t = setInterval(() => {
            if (syncAvatar() || ++tentativi > 60) clearInterval(t);
        }, 1000);
        document.getElementById('drive-fab')?.addEventListener('click', () => setTimeout(syncAvatar, 400));
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setupLateBits);
    } else {
        setupLateBits();
    }

    // ------------------------------------------------------------------
    // STEP 3c: freccia di ritraibilità sul gruppo zoom (#bottom-right-bar) —
    // stesso pattern del banco di prova (.corner .fold → .zoomgroup ritratto).
    // ------------------------------------------------------------------
    function setupZoomFold() {
        const btn = document.getElementById('v2-zoom-fold');
        const group = document.getElementById('v2-zoomgroup');
        const use = document.getElementById('v2-zoom-fold-use');
        if (btn && group) {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const folded = group.classList.toggle('v2-folded');
                use?.setAttribute('href', folded ? '#ic-chevron-l' : '#ic-chevron-r');
                btn.title = folded ? 'Mostra lo zoom' : 'Nascondi lo zoom';
            });
        }

        // "Adatta alla pagina" — stessa funzione reale del pulsante dentro il popup
        // dello zoom (PanManager._computeFitScale + centerView), nessuna logica nuova.
        document.getElementById('v2-zoom-fit')?.addEventListener('click', () => {
            if (typeof panMgr !== 'undefined' && panMgr) {
                panMgr.scale = panMgr._computeFitScale();
                panMgr.centerView();
            }
        });
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setupZoomFold);
    } else {
        setupZoomFold();
    }
})();
