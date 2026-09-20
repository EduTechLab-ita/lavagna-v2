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

    // Elenco pagine del pannello: righe vere, che richiamano i metodi veri di
    // PageManager (goToPage/deletePage) — nessuna logica di pagine riscritta qui.
    function renderPagesPanel() {
        const list = document.getElementById('v2-pagelist');
        if (!list || typeof pageManager === 'undefined' || !pageManager) return;
        list.innerHTML = '';
        pageManager.pages.forEach((p, i) => {
            const row = document.createElement('div');
            row.className = 'v2-pagerow' + (i === pageManager.currentIndex ? ' v2-current' : '');
            const name = document.createElement('span');
            name.className = 'v2-pagename';
            name.innerHTML = 'Pagina ' + (i + 1) + (i === pageManager.currentIndex ? ' <em>— sei qui</em>' : '');
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
            row.addEventListener('click', () => {
                pageManager.goToPage(i);
                renderPagesPanel();
            });
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
    const OWNED_BY_PANEL = PEN_FAMILY.concat(['eraser', 'shape']);
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
        ['v2-magic-panel', 'v2-file-panel', 'v2-pen-panel', 'v2-eraser-panel', 'v2-pages-panel'].forEach(id => {
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

        document.addEventListener('click', (e) => {
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
