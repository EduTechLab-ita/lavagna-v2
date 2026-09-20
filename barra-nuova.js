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

    function positionV2Panel(panel) {
        const wrapper = document.getElementById('toolbar-wrapper');
        const header = document.getElementById('app-header');
        if (!wrapper) return;
        const tbRect = wrapper.getBoundingClientRect();
        const headerH = header?.offsetHeight || 56;
        const bottomOffset = window.innerHeight - tbRect.top + 12;
        const availableH = tbRect.top - headerH - 12;
        panel.style.bottom = bottomOffset + 'px';
        panel.style.maxHeight = Math.max(180, availableH) + 'px';
    }

    function closeV2Panels() {
        let any = false;
        ['v2-magic-panel', 'v2-file-panel'].forEach(id => {
            const el = document.getElementById(id);
            if (el && el.style.display !== 'none' && el.style.display !== '') { el.style.display = 'none'; any = true; }
        });
        if (any) {
            const overlay = document.getElementById('overlay-canvas');
            if (overlay) overlay.style.pointerEvents = 'auto';
        }
    }

    function openV2Panel(id) {
        const panel = document.getElementById(id);
        if (!panel) return;
        const wasOpen = panel.style.display === 'block';
        if (typeof toolbarMgr !== 'undefined' && toolbarMgr) toolbarMgr._closeAllPopups();
        closeV2Panels();
        if (!wasOpen) {
            panel.style.display = 'block';
            positionV2Panel(panel);
            const overlay = document.getElementById('overlay-canvas');
            if (overlay) overlay.style.pointerEvents = 'none';
        }
    }

    function setupV2Panels() {
        document.getElementById('v2-magic-btn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            openV2Panel('v2-magic-panel');
        });
        document.getElementById('v2-file-btn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            openV2Panel('v2-file-panel');
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

        // × interna ai due pannelli nuovi (il listener nativo su .popup-close-btn
        // chiude solo i popup nativi, non conosce questi id)
        document.querySelectorAll('#v2-magic-panel .popup-close-btn, #v2-file-panel .popup-close-btn')
            .forEach(btn => btn.addEventListener('click', (e) => { e.stopPropagation(); closeV2Panels(); }));

        // Click dentro un pannello non lo richiude; click fuori (o su un altro
        // strumento) sì — stesso pattern del banco di prova.
        document.querySelectorAll('#v2-magic-panel, #v2-file-panel')
            .forEach(p => p.addEventListener('click', (e) => e.stopPropagation()));
        document.addEventListener('click', closeV2Panels);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setupV2Panels);
    } else {
        setupV2Panels();
    }
})();
