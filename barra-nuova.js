// barra-nuova.js — Restyling barra EduBoard (20/09/2026).
// Caricato SOLO da index-nuovo.html, DOPO app.js/drive.js/geometry.js.
// Additivo e reversibile: non modifica app.js. La #page-bar viene ricostruita
// da zero da PageManager._updatePageBar() ad ogni pagina aggiunta/rimossa/rinominata
// (bar.innerHTML = '') — qui la si osserva e si riapplicano icona nuova + pulsante
// Presentazione ogni volta che succede, invece di toccare quella funzione.
(function () {

    function syncPresentIcon() {
        const use = document.getElementById('v2-present-use');
        if (!use) return;
        const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement);
        use.setAttribute('href', isFs ? '#ic-present-on' : '#ic-present');
    }

    function augmentPageBar(bar) {
        // Icona nuova sul pulsante "Cambia sfondo" già esistente — stessa funzione, solo il disegno cambia
        const bgBtn = bar.querySelector('.page-bar-icon-btn:not(.v2-present-btn)');
        if (bgBtn) bgBtn.innerHTML = '<svg viewBox="0 0 24 24"><use href="#ic-bg"/></svg>';

        // Pulsante "Presentazione" — nuovo, prima dello sfondo — richiama gli stessi
        // pulsanti già esistenti in header (#btn-fullscreen / #btn-exit-fullscreen)
        if (!bar.querySelector('.v2-present-btn')) {
            const presentBtn = document.createElement('button');
            presentBtn.className = 'page-bar-icon-btn v2-present-btn';
            presentBtn.title = 'Presentazione — schermo intero, i comandi restano';
            presentBtn.innerHTML = '<svg viewBox="0 0 24 24"><use href="#ic-present" id="v2-present-use"/></svg>';
            presentBtn.addEventListener('click', () => {
                const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement);
                document.getElementById(isFs ? 'btn-exit-fullscreen' : 'btn-fullscreen')?.click();
            });
            bar.insertBefore(presentBtn, bar.firstChild);
            syncPresentIcon();
        }
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

    function closeV2Panels() {
        let any = false;
        ['v2-magic-panel', 'v2-file-panel', 'v2-pen-panel'].forEach(id => {
            const el = document.getElementById(id);
            if (el && el.classList.contains('v2-open')) { el.classList.remove('v2-open'); any = true; }
        });
        if (any) {
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
        document.querySelectorAll('#v2-magic-panel .popup-close-btn, #v2-file-panel .popup-close-btn, #v2-pen-panel .popup-close-btn')
            .forEach(btn => btn.addEventListener('click', (e) => { e.stopPropagation(); closeV2Panels(); }));

        // Click dentro un pannello non lo richiude; click fuori (o su un altro
        // strumento) sì — stesso pattern del banco di prova.
        document.querySelectorAll('#v2-magic-panel, #v2-file-panel, #v2-pen-panel')
            .forEach(p => p.addEventListener('click', (e) => e.stopPropagation()));
        document.addEventListener('click', closeV2Panels);
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
        const PEN_FAMILY = ['pen', 'pencil', 'pastel', 'marker', 'laser'];
        document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
            btn.addEventListener('click', () => {
                toolbarMgr._updateOptionsRow();
                document.getElementById('v2-pen-btn')?.classList.toggle(
                    'active', PEN_FAMILY.includes(btn.dataset.tool)
                );
            });
        });
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
