/**
 * EduBoard v2 — geometry.js
 * Strumenti geometrici interattivi: Righello, Goniometro, Compasso
 *
 * DIPENDENZE GLOBALI (definite in app.js, caricato prima):
 *   - CONFIG         : configurazione globale corrente
 *   - canvasMgr      : CanvasManager (ctx, _saveUndo, overlay canvas)
 *   - toast(msg,type): notifiche temporanee
 *
 * INIT (aggiungere in app.js, SEZIONE 12 — INIT, dopo setupKeyboard()):
 *   let geoMgr;
 *   // ... dentro DOMContentLoaded, dopo setupKeyboard():
 *   geoMgr = new GeometryManager();
 *
 * CSS: aggiungere il blocco in fondo a style.css (oppure tenere qui
 *       il <style> iniettato da _injectCSS).
 */

'use strict';

// =============================================================================
// RulerTool — righello orizzontale draggabile e ruotabile
// =============================================================================

// Stessa misura del quadretto da 10 mm (sfondo 'grid-10' in app.js)
const RULER_CANVAS_PX_PER_CM = 57;

// Strumenti di disegno che righello/goniometro/squadre/compasso possono "guidare"
// (condiviso fra _patchCanvasManager e il compasso)
const PENNE = ['pen', 'pencil', 'pastel', 'marker'];

class RulerTool {
    constructor() {
        this.el       = null;   // div#ruler-tool
        this.body     = null;   // div.ruler-body
        this.canvas   = null;   // canvas interno per le tacche
        this.visible  = false;

        // Posizione e angolo correnti
        this.x     = 80;    // posizione left del div
        this.y     = 200;   // posizione top del div
        this.angle = 0;     // gradi

        // Centro geometrico (aggiornato dopo ogni move/rotate)
        this.cx = 0;
        this.cy = 0;

        // Stato drag principale
        this._drag = { active: false, startX: 0, startY: 0, origX: 0, origY: 0 };

        // Stato drag rotazione
        this._rot  = { active: false, startAngle: 0, startMouse: 0 };
    }

    // ------------------------------------------------------------------
    // Creazione DOM
    // ------------------------------------------------------------------

    create() {
        const wrapper = document.createElement('div');
        wrapper.id        = 'ruler-tool';
        wrapper.className = 'geo-tool';
        wrapper.style.display = 'none';

        wrapper.innerHTML = `
            <div class="ruler-body" id="ruler-body">
                <div class="ruler-drag-handle" id="ruler-drag" title="Trascina per spostare"><svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true"><circle cx="2" cy="2" r="1.6"/><circle cx="7" cy="2" r="1.6"/><circle cx="12" cy="2" r="1.6"/><circle cx="2" cy="7" r="1.6"/><circle cx="7" cy="7" r="1.6"/><circle cx="12" cy="7" r="1.6"/><circle cx="2" cy="12" r="1.6"/><circle cx="7" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/></svg></div>
                <canvas id="ruler-canvas" width="560" height="68"></canvas>
                <input type="number" id="ruler-angle-input" class="ruler-angle-input" value="0" min="-360" max="360" step="1" title="Angolo (°)">
                <div class="ruler-rotate-handle" id="ruler-rotate" title="Ruota">&#8635;</div>
                <div class="ruler-close" id="ruler-close" title="Chiudi">&#215;</div>
            </div>`;

        document.body.appendChild(wrapper);

        this.el     = wrapper;
        this.body   = wrapper.querySelector('.ruler-body');
        this.canvas = wrapper.querySelector('#ruler-canvas');

        this._renderMarks();
        this._setupDrag();
        this._setupRotate();
        this._setupResize();
        wrapper.querySelector('#ruler-close').addEventListener('click', () => this.hide());
        const angleInput = wrapper.querySelector('#ruler-angle-input');
        angleInput.addEventListener('pointerdown', (e) => e.stopPropagation());
        angleInput.addEventListener('change', (e) => {
            this.angle = parseFloat(e.target.value) || 0;
            this._applyTransform();
        });
        angleInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { this.angle = parseFloat(e.target.value) || 0; this._applyTransform(); e.target.blur(); }
        });
    }

    // ------------------------------------------------------------------
    // Tacche millimetriche
    // ------------------------------------------------------------------

    _renderMarks() {
        const cvs = this.canvas;
        // Il canvas è in un flex: la bitmap deve coincidere con la larghezza a schermo,
        // altrimenti le tacche vengono stirate e la scala non corrisponde ai quadretti.
        if (cvs.clientWidth > 0 && cvs.width !== cvs.clientWidth) cvs.width = cvs.clientWidth;
        const ctx = cvs.getContext('2d');
        const W   = cvs.width;
        const H   = cvs.height;

        ctx.clearRect(0, 0, W, H);

        // 1 cm = un quadretto da 10 mm della lavagna (57 px di canvas) × zoom corrente
        const scale  = (typeof panMgr !== 'undefined' && panMgr && panMgr.scale) ? panMgr.scale : 1;
        const pxCm   = RULER_CANVAS_PX_PER_CM * scale;
        const pxMm   = pxCm / 10;
        const showMm  = pxMm >= 4;
        const showMid = pxCm / 2 >= 6;
        const labelEvery = pxCm >= 22 ? 1 : pxCm >= 11 ? 2 : pxCm >= 5 ? 5 : 10;

        for (let mm = 0; mm * pxMm <= W; mm++) {
            const isCm  = mm % 10 === 0;
            const isMid = mm % 5 === 0 && !isCm;
            if (!isCm && !(isMid && showMid) && !showMm) continue;

            const x     = Math.round(mm * pxMm) + 0.5;
            const tickH = isCm ? 26 : isMid ? 17 : 9;

            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, tickH);
            ctx.strokeStyle = isCm
                ? 'rgba(80, 40, 0, 0.85)'
                : 'rgba(80, 40, 0, 0.55)';
            ctx.lineWidth = isCm ? 1.4 : 0.8;
            ctx.stroke();

            const cm = mm / 10;
            if (isCm && cm > 0 && cm % labelEvery === 0) {
                ctx.font      = '13px Inter, sans-serif';
                ctx.fillStyle = 'rgba(60, 30, 0, 0.85)';
                ctx.textAlign = 'center';
                ctx.fillText(String(cm), x, tickH + 14);
            }
        }

        // Linea di bordo inferiore (riferimento per snap)
        ctx.beginPath();
        ctx.moveTo(0, H - 1);
        ctx.lineTo(W, H - 1);
        ctx.strokeStyle = 'rgba(80, 40, 0, 0.5)';
        ctx.lineWidth   = 1;
        ctx.stroke();
    }

    // Alias usato anche dalla logica di resize
    _drawTicks() {
        this._renderMarks();
    }

    // ------------------------------------------------------------------
    // Visibilità
    // ------------------------------------------------------------------

    show() {
        this.el.style.display = 'block';
        // Si apre al centro della pagina visibile, non in un punto fisso che può
        // finire fuori schermo su finestre piccole (Fabio, 04/10/2026 — stessa
        // richiesta già fatta per il compasso).
        const headerH = document.body.classList.contains('fullscreen-mode') ? 0 : 56;
        const w = this.body.offsetWidth || 600, h = this.body.offsetHeight || 68;
        this.x = (window.innerWidth - w) / 2;
        this.y = headerH + (window.innerHeight - headerH - h) / 2;
        this._applyTransform();
        this._renderMarks();   // lo zoom può essere cambiato mentre era nascosto
        this.visible = true;
    }

    hide() {
        this.el.style.display = 'none';
        this.visible = false;
    }

    isVisible() {
        return this.el && this.el.style.display !== 'none';
    }

    // ------------------------------------------------------------------
    // Posizionamento & trasformazione
    // ------------------------------------------------------------------

    _applyTransform() {
        this.el.style.left = this.x + 'px';
        this.el.style.top  = this.y + 'px';
        this.body.style.transform = `rotate(${this.angle}deg)`;
        const input = this.el ? this.el.querySelector('#ruler-angle-input') : null;
        if (input && document.activeElement !== input) {
            let display = ((this.angle % 360) + 360) % 360;
            input.value = Math.round(display);
        }
        this._updateCenter();
    }

    _updateCenter() {
        const rect = this.body.getBoundingClientRect();
        this.cx = rect.left + rect.width  / 2;
        this.cy = rect.top  + rect.height / 2;
    }

    // ------------------------------------------------------------------
    // Drag principale (sposta il righello)
    // ------------------------------------------------------------------

    _setupDrag() {
        const onStart = (e) => {
            e.preventDefault();
            e.stopPropagation();
            const pt = _getPoint(e);
            this._drag = {
                active: true,
                startX: pt.x,
                startY: pt.y,
                origX:  this.x,
                origY:  this.y
            };
            // setPointerCapture garantisce il tracking fluido anche se il dito
            // esce dai bordi dell'handle durante il trascinamento su LIM
            try { e.target.setPointerCapture(e.pointerId); } catch(_) {}
        };

        const onMove = (e) => {
            if (!this._drag.active) return;
            e.preventDefault();
            const pt = _getPoint(e);
            this.x = this._drag.origX + (pt.x - this._drag.startX);
            this.y = this._drag.origY + (pt.y - this._drag.startY);
            this._applyTransform();
        };

        const onEnd = () => {
            if (!this._drag.active) return;
            this._drag.active = false;
            this._updateCenter();
        };

        // Il drag è attivo SOLO sull'handle dedicato
        const dragHandle = this.el.querySelector('#ruler-drag');
        if (dragHandle) {
            dragHandle.addEventListener('pointerdown', onStart);
            // pointermove/pointerup vengono ricevuti anche dopo setPointerCapture,
            // ma li teniamo su window come safety-net per browser che non supportano
            // setPointerCapture sugli elementi figli
        }
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup',   onEnd);
    }

    // ------------------------------------------------------------------
    // Drag rotazione
    // ------------------------------------------------------------------

    _setupRotate() {
        const handle = this.el.querySelector('#ruler-rotate');

        const onStart = (e) => {
            e.preventDefault();
            e.stopPropagation();
            this._updateCenter();
            const pt = _getPoint(e);
            const dx = pt.x - this.cx;
            const dy = pt.y - this.cy;
            const mouseAngle = Math.atan2(dy, dx) * 180 / Math.PI;
            this._rot = {
                active:     true,
                startAngle: this.angle,
                startMouse: mouseAngle
            };
            handle.style.cursor = 'grabbing';
            // setPointerCapture per tracking continuo durante la rotazione su LIM
            try { e.target.setPointerCapture(e.pointerId); } catch(_) {}
        };

        const onMove = (e) => {
            if (!this._rot.active) return;
            e.preventDefault();
            const pt = _getPoint(e);
            const dx = pt.x - this.cx;
            const dy = pt.y - this.cy;
            const mouseAngle = Math.atan2(dy, dx) * 180 / Math.PI;
            this.angle = this._rot.startAngle + (mouseAngle - this._rot.startMouse);
            this._applyTransform();
        };

        const onEnd = () => {
            if (!this._rot.active) return;
            this._rot.active = false;
            handle.style.cursor = 'grab';
            this._updateCenter();
        };

        handle.addEventListener('pointerdown',  onStart);
        window.addEventListener('pointermove',  onMove);
        window.addEventListener('pointerup',    onEnd);
    }

    // ------------------------------------------------------------------
    // Resize handle
    // ------------------------------------------------------------------

    _setupResize() {
        const resizeHandle = document.createElement('div');
        resizeHandle.className = 'ruler-resize-handle';
        resizeHandle.textContent = '⟺';
        resizeHandle.title = 'Ridimensiona il righello';
        this.body.appendChild(resizeHandle);

        resizeHandle.addEventListener('pointerdown', (e) => {
            e.stopPropagation();
            e.preventDefault();
            const startX = e.clientX;
            const startW = this.body.offsetWidth;
            resizeHandle.setPointerCapture(e.pointerId);

            const onMove = (ev) => {
                const newW = Math.min(1200, Math.max(200, startW + (ev.clientX - startX)));
                this.body.style.width = newW + 'px';
                this.canvas.width = newW - 50; // spazio per handle rotate + close
                this._drawTicks();
            };
            const onEnd = () => {
                resizeHandle.removeEventListener('pointermove', onMove);
                resizeHandle.removeEventListener('pointerup', onEnd);
            };
            resizeHandle.addEventListener('pointermove', onMove);
            resizeHandle.addEventListener('pointerup', onEnd);
        });
    }

    // ------------------------------------------------------------------
    // Snap alla retta del righello
    // ------------------------------------------------------------------

    /**
     * Proietta il punto (x, y) sulla retta definita dalla posizione
     * e dall'angolo corrente del righello.
     *
     * NOTA: this.cx / this.cy sono coordinate schermo (pixel viewport),
     * ricavate da getBoundingClientRect(). Il punto (x, y) ricevuto dal
     * CanvasManager è invece in coordinate canvas (già diviso per scale).
     * Convertiamo il centro del righello nello stesso sistema di riferimento
     * usando panMgr.getCanvasCoords, oppure facendo la conversione a mano.
     *
     * La proiezione avviene sul bordo inferiore del righello (y + height/2
     * in coordinate locali), che è il riferimento visivo usato per tracciare.
     *
     * @param {number} x  — coordinata canvas (già convertita da getCoords)
     * @param {number} y  — coordinata canvas (già convertita da getCoords)
     * @returns {{x: number, y: number}}
     */
    snapToRuler(x, y) {
        // --- Converti il centro del righello in coordinate canvas ---
        let cxCanvas, cyCanvas;

        if (typeof panMgr !== 'undefined' && panMgr) {
            // Usa la stessa funzione che usa getCoords() in CanvasManager
            const cc = panMgr.getCanvasCoords(this.cx, this.cy);
            cxCanvas = cc.x;
            cyCanvas = cc.y;
        } else {
            // Fallback senza pan/zoom: sottrai l'offset del canvas dal DOM
            const area = document.getElementById('canvas-area');
            const areaRect = area ? area.getBoundingClientRect() : { left: 0, top: 0 };
            cxCanvas = this.cx - areaRect.left;
            cyCanvas = this.cy - areaRect.top;
        }

        // --- Offset verso il bordo superiore del righello (linea numerata) ---
        // ATTENZIONE: NON usare getBoundingClientRect().height su elementi ruotati —
        // restituisce l'AABB (bounding box allineato agli assi), che è molto più
        // grande dell'altezza originale quando l'angolo ≠ 0°/180°.
        // Si usa l'altezza fissa del canvas, invariata a qualsiasi angolo.
        const rulerHalfH = this.canvas.height / 2;
        const scale = (typeof panMgr !== 'undefined' && panMgr) ? panMgr.scale : 1;
        const halfHCanvas = rulerHalfH / scale;

        // Bordo SUPERIORE del righello = lato numerato (riferimento visivo per la scrittura)
        // Direzione perpendicolare verso l'alto rispetto all'asse del righello: (+sin, -cos)
        const rad = this.angle * Math.PI / 180;
        const edgeX = cxCanvas + halfHCanvas * Math.sin(rad);
        const edgeY = cyCanvas - halfHCanvas * Math.cos(rad);

        // --- Proiezione del punto sul bordo inferiore del righello ---
        const dx   = x - edgeX;
        const dy   = y - edgeY;
        const proj = dx * Math.cos(rad) + dy * Math.sin(rad);
        return {
            x: edgeX + proj * Math.cos(rad),
            y: edgeY + proj * Math.sin(rad)
        };
    }
}


// =============================================================================
// ProtractorTool — goniometro semicircolare draggabile
// =============================================================================

class ProtractorTool {
    constructor() {
        this.el      = null;
        this.cvs     = null;
        this.visible = false;

        this.x     = 200;
        this.y     = 120;
        this.angle = 0;
        this.cx    = 0;
        this.cy    = 0;

        // Modalità: semicerchio 180° (default) oppure cerchio intero 360°
        this.full360 = false;
        // Scala numeri invertita (lettura destra→sinistra)
        this.flipped = false;
        // Raggio reale (ridimensionabile) — NON è più uno scale CSS visivo:
        // il canvas viene ridisegnato più grande/piccolo, come per il righello.
        // Questo evita che la maniglia di resize resti "staccata" dal disegno
        // e mantiene lo snap sull'arco sempre centrato.
        this.baseR = 140;

        this._drag = { active: false, startX: 0, startY: 0, origX: 0, origY: 0 };
        this._rot  = { active: false, startAngle: 0, startMouse: 0 };
    }

    // ------------------------------------------------------------------
    // Dimensioni correnti (dipendono da baseR e dalla modalità 180°/360°)
    // ------------------------------------------------------------------
    // NOTA: cx/cy (centro del cerchio) coincidono sempre col centro reale
    // del disegno: W = 2R+20, H = R+20 (semicerchio) o 2R+20 (360°).

    _dims() {
        const R  = this.baseR;
        const cx = R + 10;
        const cy = R + 10;
        const W  = 2 * R + 20;
        const H  = this.full360 ? (2 * R + 20) : (R + 20);
        return { W, H, cx, cy, R };
    }

    // ------------------------------------------------------------------
    // Creazione DOM
    // ------------------------------------------------------------------

    create() {
        const wrapper = document.createElement('div');
        wrapper.id        = 'protractor-tool';
        wrapper.className = 'geo-tool';
        wrapper.style.display = 'none';

        wrapper.innerHTML = `
            <div class="protractor-body">
                <canvas id="protractor-canvas" width="300" height="160"></canvas>
                <input type="number" id="protractor-angle-input" class="geo-angle-input" value="0" min="-360" max="360" step="1" title="Angolo (°)">
                <div class="protractor-rotate-handle" id="protractor-rotate" title="Ruota">&#8635;</div>
                <div class="geo-close" id="protractor-close" title="Chiudi">&#215;</div>
                <div class="protractor-drag-handle" id="protractor-drag" title="Trascina per spostare"><svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true"><circle cx="2" cy="2" r="1.6"/><circle cx="7" cy="2" r="1.6"/><circle cx="12" cy="2" r="1.6"/><circle cx="2" cy="7" r="1.6"/><circle cx="7" cy="7" r="1.6"/><circle cx="12" cy="7" r="1.6"/><circle cx="2" cy="12" r="1.6"/><circle cx="7" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/></svg></div>
                <div class="protractor-mode-btn" id="protractor-full360" title="Passa a goniometro 360°">360&#176;</div>
                <div class="protractor-flip-btn" id="protractor-flip" title="Inverti la scala destra/sinistra">&#8644;</div>
            </div>`;

        document.body.appendChild(wrapper);

        this.el  = wrapper;
        this.cvs = wrapper.querySelector('#protractor-canvas');

        this._render();
        this._setupDrag();
        this._setupResize();
        this._setupRotate();
        this._setupModeButtons();
        wrapper.querySelector('#protractor-close').addEventListener('click', () => this.hide());
        const angleInput = wrapper.querySelector('#protractor-angle-input');
        angleInput.addEventListener('pointerdown', (e) => e.stopPropagation());
        angleInput.addEventListener('change', (e) => {
            this.angle = parseFloat(e.target.value) || 0;
            this._applyTransform();
        });
        angleInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { this.angle = parseFloat(e.target.value) || 0; this._applyTransform(); e.target.blur(); }
        });
    }

    // ------------------------------------------------------------------
    // Rendering semicerchio
    // ------------------------------------------------------------------

    _render() {
        const canvas = this.cvs;
        const ctx    = canvas.getContext('2d');
        const { W, H, cx, cy, R } = this._dims();
        const maxDeg = this.full360 ? 360 : 180;
        const loopEnd = this.full360 ? maxDeg - 5 : maxDeg;

        canvas.width  = W;
        canvas.height = H;
        ctx.clearRect(0, 0, W, H);

        // Sfondo semicircolare o circolare completo, semitrasparente
        ctx.beginPath();
        if (this.full360) {
            ctx.arc(cx, cy, R, 0, Math.PI * 2);
        } else {
            ctx.arc(cx, cy, R, Math.PI, 0);
            ctx.lineTo(cx + R, cy);
            ctx.lineTo(cx - R, cy);
            ctx.closePath();
        }
        ctx.fillStyle   = 'rgba(219, 234, 254, 0.70)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(59, 130, 246, 0.80)';
        ctx.lineWidth   = 1.5;
        ctx.stroke();

        // Diametro di base (solo in modalità semicerchio: nel cerchio intero è già chiuso)
        if (!this.full360) {
            ctx.beginPath();
            ctx.moveTo(cx - R, cy);
            ctx.lineTo(cx + R, cy);
            ctx.strokeStyle = 'rgba(30, 58, 138, 0.85)';
            ctx.lineWidth   = 1.5;
            ctx.stroke();
        }

        // Tacche e numeri
        for (let deg = 0; deg <= loopEnd; deg += 5) {
            const rad     = (180 - deg) * Math.PI / 180;
            const isMajor = deg % 10 === 0;
            const len     = isMajor ? 15 : 8;

            ctx.beginPath();
            ctx.moveTo(
                cx + (R - len) * Math.cos(rad),
                cy - (R - len) * Math.sin(rad)
            );
            ctx.lineTo(
                cx + R * Math.cos(rad),
                cy - R * Math.sin(rad)
            );
            ctx.strokeStyle = 'rgba(30, 58, 138, 0.80)';
            ctx.lineWidth   = isMajor ? 1.5 : 0.8;
            ctx.stroke();

            if (isMajor) {
                const textR = R - 22;
                const label = this.flipped ? (maxDeg - deg) : deg;
                ctx.font      = '9px Inter, sans-serif';
                ctx.fillStyle = 'rgba(30, 58, 138, 0.90)';
                ctx.textAlign = 'center';
                ctx.fillText(
                    String(label),
                    cx + textR * Math.cos(rad),
                    cy - textR * Math.sin(rad) + 3
                );
            }
        }

        // Punto centrale
        ctx.beginPath();
        ctx.arc(cx, cy, 4, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(59, 130, 246, 0.90)';
        ctx.fill();
    }

    // ------------------------------------------------------------------
    // Cambio modalità 180°/360° — ridimensiona il canvas mantenendo fermo
    // il centro visivo (cx/cy restano 150/150 in entrambe le modalità)
    // ------------------------------------------------------------------

    _setMode(full360) {
        this.full360 = full360;
        this._render();
        this._applyTransform();
    }

    // ------------------------------------------------------------------
    // Visibilità
    // ------------------------------------------------------------------

    show() {
        this.el.style.display = 'block';
        this._applyTransform();
        this.visible = true;
    }

    hide() {
        this.el.style.display = 'none';
        this.visible = false;
    }

    isVisible() {
        return this.el && this.el.style.display !== 'none';
    }

    // ------------------------------------------------------------------
    // Posizionamento & trasformazione
    // ------------------------------------------------------------------

    _applyTransform() {
        this.el.style.left = this.x + 'px';
        this.el.style.top  = this.y + 'px';
        const body = this.el.querySelector('.protractor-body');
        const { cx, cy } = this._dims();
        body.style.transform = `rotate(${this.angle}deg)`;
        // Dinamico: deve coincidere sempre col centro del cerchio disegnato,
        // altrimenti lo snap sull'arco (snapToProtractor) si decentra alla rotazione
        body.style.transformOrigin = `${cx}px ${cy}px`;
        const input = this.el ? this.el.querySelector('#protractor-angle-input') : null;
        if (input && document.activeElement !== input) {
            let display = ((this.angle % 360) + 360) % 360;
            input.value = Math.round(display);
        }
        this._updateCenter();
    }

    _updateCenter() {
        const body = this.el.querySelector('.protractor-body');
        const rect = body.getBoundingClientRect();
        this.cx = rect.left + rect.width  / 2;
        this.cy = rect.top  + rect.height;
    }

    _setupRotate() {
        const handle = this.el.querySelector('#protractor-rotate');
        if (!handle) return;

        const onStart = (e) => {
            e.preventDefault();
            e.stopPropagation();
            this._updateCenter();
            const pt = _getPoint(e);
            const dx = pt.x - this.cx;
            const dy = pt.y - this.cy;
            const mouseAngle = Math.atan2(dy, dx) * 180 / Math.PI;
            this._rot = {
                active:     true,
                startAngle: this.angle,
                startMouse: mouseAngle
            };
            handle.style.cursor = 'grabbing';
        };

        const onMove = (e) => {
            if (!this._rot.active) return;
            e.preventDefault();
            const pt = _getPoint(e);
            const dx = pt.x - this.cx;
            const dy = pt.y - this.cy;
            const mouseAngle = Math.atan2(dy, dx) * 180 / Math.PI;
            this.angle = this._rot.startAngle + (mouseAngle - this._rot.startMouse);
            this._applyTransform();
        };

        const onEnd = () => {
            if (!this._rot.active) return;
            this._rot.active = false;
            handle.style.cursor = 'grab';
            this._updateCenter();
        };

        handle.addEventListener('pointerdown', onStart);
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup',   onEnd);
    }

    // ------------------------------------------------------------------
    // Drag
    // ------------------------------------------------------------------

    _setupDrag() {
        const onStart = (e) => {
            e.preventDefault();
            e.stopPropagation();
            const pt = _getPoint(e);
            this._drag = {
                active: true,
                startX: pt.x,
                startY: pt.y,
                origX:  this.x,
                origY:  this.y
            };
        };

        const onMove = (e) => {
            if (!this._drag.active) return;
            e.preventDefault();
            const pt = _getPoint(e);
            this.x = this._drag.origX + (pt.x - this._drag.startX);
            this.y = this._drag.origY + (pt.y - this._drag.startY);
            this._applyTransform();
        };

        const onEnd = () => {
            if (!this._drag.active) return;
            this._drag.active = false;
            this._updateCenter();
        };

        // Il drag è attivo SOLO sull'handle dedicato
        const dragHandle = this.el.querySelector('#protractor-drag');
        if (dragHandle) dragHandle.addEventListener('pointerdown', onStart);
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup',   onEnd);
    }

    // ------------------------------------------------------------------
    // Resize handle
    // ------------------------------------------------------------------

    _setupResize() {
        const resizeHandle = document.createElement('div');
        resizeHandle.className = 'protractor-resize-handle';
        resizeHandle.textContent = '⟺';
        resizeHandle.title = 'Ridimensiona il goniometro';
        this.el.appendChild(resizeHandle);

        resizeHandle.addEventListener('pointerdown', (e) => {
            e.stopPropagation();
            e.preventDefault();
            const startX = e.clientX;
            const startR  = this.baseR;

            // Cattura la posizione schermo del centro "o" PRIMA del resize:
            // deve restare ancorata lì (cerchi concentrici), anche se la
            // posizione locale del centro nel canvas cambia con R.
            const dims0 = this._dims();
            const pivotScreenX = this.x + dims0.cx;
            const pivotScreenY = this.y + dims0.cy;

            resizeHandle.setPointerCapture(e.pointerId);

            const onMove = (ev) => {
                // Ridisegna davvero il canvas più grande/piccolo (come il righello),
                // invece di applicare uno scale CSS visivo: la maniglia resta sempre
                // attaccata al bordo e lo snap sull'arco resta centrato.
                const delta = ev.clientX - startX;
                this.baseR = Math.min(350, Math.max(70, startR + delta));
                const dims1 = this._dims();
                // Riancora il centro "o" alla stessa posizione schermo di partenza
                this.x = pivotScreenX - dims1.cx;
                this.y = pivotScreenY - dims1.cy;
                this._render();
                this._applyTransform();
            };
            const onEnd = () => {
                resizeHandle.removeEventListener('pointermove', onMove);
                resizeHandle.removeEventListener('pointerup', onEnd);
            };
            resizeHandle.addEventListener('pointermove', onMove);
            resizeHandle.addEventListener('pointerup', onEnd);
        });
    }

    // ------------------------------------------------------------------
    // Pulsanti modalità: 180°/360° e inverti scala (accanto al drag handle)
    // ------------------------------------------------------------------

    _setupModeButtons() {
        const full360Btn = this.el.querySelector('#protractor-full360');
        if (full360Btn) {
            full360Btn.addEventListener('pointerdown', (e) => e.stopPropagation());
            full360Btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this._setMode(!this.full360);
                full360Btn.innerHTML = this.full360 ? '180&#176;' : '360&#176;';
                full360Btn.classList.toggle('active', this.full360);
            });
        }

        const flipBtn = this.el.querySelector('#protractor-flip');
        if (flipBtn) {
            flipBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
            flipBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.flipped = !this.flipped;
                this._render();
                flipBtn.classList.toggle('active', this.flipped);
            });
        }
    }

    // ------------------------------------------------------------------
    // Snap al bordo del goniometro (analogo a RulerTool.snapToRuler, ma
    // sull'arco circolare invece che su una retta)
    // ------------------------------------------------------------------

    /**
     * Proietta il punto (x, y) — coordinate canvas — sul bordo circolare
     * del goniometro, preservando l'angolo rispetto al centro e forzando
     * la distanza al raggio R. In modalità semicerchio, i punti "fuori"
     * dalla metà disegnata vengono agganciati all'estremo più vicino.
     *
     * @returns {{x:number, y:number, angle:number, cx:number, cy:number, r:number}}
     *          angle/cx/cy/r sono in coordinate canvas, utili per disegnare
     *          l'arco reale tra due punti successivi (vedi _drawProtractorArc).
     */
    snapToProtractor(x, y) {
        const { cx, cy, R } = this._dims();

        // Il transform-origin di .protractor-body è fissato a (150px,150px),
        // che coincide sempre col centro del cerchio disegnato: questo punto
        // resta invariato sullo schermo qualunque siano scale/angle correnti.
        const pivotXScreen = this.x + cx;
        const pivotYScreen = this.y + cy;

        let cxCanvas, cyCanvas;
        if (typeof panMgr !== 'undefined' && panMgr) {
            const cc = panMgr.getCanvasCoords(pivotXScreen, pivotYScreen);
            cxCanvas = cc.x;
            cyCanvas = cc.y;
        } else {
            const area = document.getElementById('canvas-area');
            const areaRect = area ? area.getBoundingClientRect() : { left: 0, top: 0 };
            cxCanvas = pivotXScreen - areaRect.left;
            cyCanvas = pivotYScreen - areaRect.top;
        }

        const scale   = (typeof panMgr !== 'undefined' && panMgr) ? panMgr.scale : 1;
        const RCanvas = R / scale;

        const rot = this.angle * Math.PI / 180;
        const dx  = x - cxCanvas;
        const dy  = y - cyCanvas;

        // Angolo del punto relativo all'orientamento corrente del goniometro
        let relAngle = Math.atan2(dy, dx) - rot;
        relAngle = Math.atan2(Math.sin(relAngle), Math.cos(relAngle)); // normalizza (-PI, PI]

        if (!this.full360 && relAngle > 0) {
            // Fuori dal semicerchio disegnato: aggancia all'estremo più vicino
            relAngle = (relAngle < Math.PI / 2) ? 0 : -Math.PI;
        }

        const finalAngle = relAngle + rot;
        return {
            x: cxCanvas + RCanvas * Math.cos(finalAngle),
            y: cyCanvas + RCanvas * Math.sin(finalAngle),
            angle: finalAngle,
            cx: cxCanvas,
            cy: cyCanvas,
            r:  RCanvas
        };
    }
}


// =============================================================================
// SetSquareTool — squadra 45° (90-45-45) o 30°/60° (90-60-30)
// Come righello e goniometro: trasparente ai tocchi (solo i comandi ricevono il
// dito), scala in cm = quadretti veri che segue lo zoom, la penna scorre lungo
// il lato più vicino.
// =============================================================================

const SETSQ_COLORI = {
    '45':   { fill: 'rgba(220, 252, 231, 0.72)', edge: 'rgba(22, 163, 74, 0.85)',  ink: 'rgba(20, 83, 45, 0.90)' },
    '3060': { fill: 'rgba(237, 233, 254, 0.72)', edge: 'rgba(124, 58, 237, 0.85)', ink: 'rgba(76, 29, 149, 0.90)' }
};
const SETSQ_PUNTINI = '<svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true"><circle cx="2" cy="2" r="1.6"/><circle cx="7" cy="2" r="1.6"/><circle cx="12" cy="2" r="1.6"/><circle cx="2" cy="7" r="1.6"/><circle cx="7" cy="7" r="1.6"/><circle cx="12" cy="7" r="1.6"/><circle cx="2" cy="12" r="1.6"/><circle cx="7" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/></svg>';

class SetSquareTool {
    constructor(kind) {
        this.kind  = kind;                                  // '45' | '3060'
        this.el    = null;
        this.body  = null;
        this.cvs   = null;
        this.x     = kind === '45' ? 260 : 700;
        this.y     = kind === '45' ? 110 : 170;
        this.angle = 0;
        this.flip  = false;                                 // angolo retto a destra invece che a sinistra
        this.size  = kind === '45' ? 300 : 400;             // cateto orizzontale, px schermo
        this.minSize = kind === '45' ? 280 : 370;           // sotto, i comandi non stanno più dentro
    }

    // A = angolo retto (perno di rotazione), B = fine del cateto orizzontale, C = fine del verticale
    _dims() {
        const P  = 14;
        const Lx = this.size;
        const Ly = this.kind === '45' ? Lx : Lx / Math.sqrt(3);
        const W  = Lx + 2 * P, H = Ly + 2 * P;
        const A = this.flip ? { x: P + Lx, y: P + Ly } : { x: P,      y: P + Ly };
        const B = this.flip ? { x: P,      y: P + Ly } : { x: P + Lx, y: P + Ly };
        const C = this.flip ? { x: P + Lx, y: P }      : { x: P,      y: P };
        const hyp = Math.hypot(Lx, Ly);
        const per = Lx + Ly + hyp;
        // Incentro: il punto più lontano dai tre lati, dove stanno i comandi
        const I = { x: (hyp * A.x + Ly * B.x + Lx * C.x) / per, y: (hyp * A.y + Ly * B.y + Lx * C.y) / per };
        return { P, Lx, Ly, W, H, A, B, C, I };
    }

    create() {
        const w = document.createElement('div');
        w.className = 'geo-tool setsq-tool';
        w.style.display = 'none';
        const nome = this.kind === '45' ? 'squadra 45°' : 'squadra 30°/60°';
        w.innerHTML = `
            <div class="setsq-body">
                <canvas class="setsq-canvas"></canvas>
                <div class="setsq-ctrl">
                    <div class="setsq-row">
                        <div class="setsq-btn setsq-drag" title="Trascina per spostare la ${nome}">${SETSQ_PUNTINI}</div>
                        <div class="setsq-btn setsq-rotate" title="Ruota">&#8635;</div>
                        <div class="setsq-btn setsq-resize" title="Ingrandisci o rimpicciolisci">&#10234;</div>
                    </div>
                    <div class="setsq-row">
                        <input type="number" class="geo-angle-input setsq-angle" value="0" min="-360" max="360" step="1" title="Angolo (°)">
                        <div class="setsq-btn setsq-flip" title="Capovolgi (angolo retto a destra o a sinistra)">&#8644;</div>
                        <div class="setsq-btn setsq-close" title="Chiudi">&#215;</div>
                    </div>
                </div>
            </div>`;
        document.body.appendChild(w);
        this.el   = w;
        this.body = w.querySelector('.setsq-body');
        this.cvs  = w.querySelector('.setsq-canvas');

        this._render();
        this._setupDrag();
        this._setupRotate();
        this._setupResize();
        w.querySelector('.setsq-close').addEventListener('click', () => this.hide());
        const flip = w.querySelector('.setsq-flip');
        if (flip) {
            flip.addEventListener('pointerdown', (e) => e.stopPropagation());
            flip.addEventListener('click', (e) => {
                e.stopPropagation();
                this._riancora(() => { this.flip = !this.flip; });
                flip.classList.toggle('active', this.flip);
            });
        }
        const inp = w.querySelector('.setsq-angle');
        inp.addEventListener('pointerdown', (e) => e.stopPropagation());
        inp.addEventListener('change', (e) => { this.angle = parseFloat(e.target.value) || 0; this._applyTransform(); });
        inp.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { this.angle = parseFloat(e.target.value) || 0; this._applyTransform(); e.target.blur(); }
        });
    }

    show() { this.el.style.display = 'block'; this._render(); this._applyTransform(); }
    hide() { this.el.style.display = 'none'; }
    isVisible() { return this.el && this.el.style.display !== 'none'; }

    _render() {
        const d   = this._dims();
        const cvs = this.cvs;
        cvs.width = Math.ceil(d.W); cvs.height = Math.ceil(d.H);
        const ctx = cvs.getContext('2d');
        const col = SETSQ_COLORI[this.kind];
        ctx.clearRect(0, 0, cvs.width, cvs.height);

        ctx.beginPath();
        ctx.moveTo(d.A.x, d.A.y); ctx.lineTo(d.B.x, d.B.y); ctx.lineTo(d.C.x, d.C.y); ctx.closePath();
        ctx.fillStyle = col.fill; ctx.fill();
        ctx.strokeStyle = col.edge; ctx.lineWidth = 1.5; ctx.stroke();

        this._scala(ctx, d.A, d.B, d.C, d.Lx, d.Ly / d.Lx, col, true);
        this._scala(ctx, d.A, d.C, d.B, d.Ly, d.Lx / d.Ly, col, false);

        // Ampiezza degli angoli acuti, accanto al lato lungo (lontano dalle scale dei cateti)
        ctx.font = 'bold 13px Inter, sans-serif';
        ctx.fillStyle = col.ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const hyp = Math.hypot(d.C.x - d.B.x, d.C.y - d.B.y);
        const nA = Math.hypot(d.A.x - (d.B.x + d.C.x) / 2, d.A.y - (d.B.y + d.C.y) / 2);
        const inx = (d.A.x - (d.B.x + d.C.x) / 2) / nA, iny = (d.A.y - (d.B.y + d.C.y) / 2) / nA;
        const acuto = (V, W, gradi, sinV) => {
            const s = 64 / sinV;                            // oltre i numeri della scala del cateto
            const ux = (W.x - V.x) / hyp, uy = (W.y - V.y) / hyp;
            ctx.fillText(gradi + '°', V.x + ux * s + inx * 14, V.y + uy * s + iny * 14);
        };
        acuto(d.B, d.C, this.kind === '45' ? 45 : 30, d.Ly / hyp);
        acuto(d.C, d.B, this.kind === '45' ? 45 : 60, d.Lx / hyp);

        // Comandi al centro, spostati un poco via dall'angolo retto per stare lontani dalle scale
        const ctrl = this.el.querySelector('.setsq-ctrl');
        const dA = Math.hypot(d.I.x - d.A.x, d.I.y - d.A.y);
        ctrl.style.left = (d.I.x + (d.I.x - d.A.x) / dA * 12) + 'px';
        ctrl.style.top  = (d.I.y + (d.I.y - d.A.y) / dA * 12) + 'px';
    }

    // Tacche da `da` verso `a`, rivolte verso l'interno (`dentro`); `pend` = restringimento del
    // triangolo verso la punta, per non disegnare tacche e numeri fuori dalla squadra.
    _scala(ctx, da, a, dentro, len, pend, col, orizzontale) {
        const ux = (a.x - da.x) / len, uy = (a.y - da.y) / len;
        const nl = Math.hypot(dentro.x - da.x, dentro.y - da.y);
        const nx = (dentro.x - da.x) / nl, ny = (dentro.y - da.y) / nl;
        const scale = (typeof panMgr !== 'undefined' && panMgr && panMgr.scale) ? panMgr.scale : 1;
        const pxCm = RULER_CANVAS_PX_PER_CM * scale, pxMm = pxCm / 10;
        const showMm = pxMm >= 4, showMid = pxCm / 2 >= 6;
        const labelEvery = pxCm >= 22 ? 1 : pxCm >= 11 ? 2 : pxCm >= 5 ? 5 : 10;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = '12px Inter, sans-serif';
        for (let mm = 0; mm * pxMm <= len; mm++) {
            const isCm = mm % 10 === 0, isMid = mm % 5 === 0 && !isCm;
            if (!isCm && !(isMid && showMid) && !showMm) continue;
            const s = mm * pxMm;
            const spazio = (len - s) * pend;               // altezza della squadra in quel punto
            const tickH = isCm ? 18 : isMid ? 12 : 7;
            if (spazio < tickH + 2) break;
            if (s < 20) continue;                          // vicino all'angolo retto c'è la scala dell'altro cateto
            const px = da.x + ux * s, py = da.y + uy * s;
            ctx.beginPath();
            ctx.moveTo(px, py); ctx.lineTo(px + nx * tickH, py + ny * tickH);
            ctx.strokeStyle = col.ink; ctx.lineWidth = isCm ? 1.3 : 0.8; ctx.stroke();
            const cm = mm / 10;
            if (isCm && cm > 0 && cm % labelEvery === 0 && spazio >= tickH + 22 && (orizzontale || s >= 42)) {
                ctx.fillStyle = col.ink;
                ctx.fillText(String(cm), px + nx * (tickH + 10), py + ny * (tickH + 10));
            }
        }
    }

    _applyTransform() {
        const d = this._dims();
        this.el.style.left = this.x + 'px';
        this.el.style.top  = this.y + 'px';
        this.body.style.transformOrigin = `${d.A.x}px ${d.A.y}px`;
        this.body.style.transform = `rotate(${this.angle}deg)`;
        const inp = this.el.querySelector('.setsq-angle');
        if (inp && document.activeElement !== inp) inp.value = Math.round(((this.angle % 360) + 360) % 360);
    }

    // Cambia forma/dimensione tenendo fermo sullo schermo l'angolo retto
    _riancora(cambia) {
        const d0 = this._dims();
        const px = this.x + d0.A.x, py = this.y + d0.A.y;
        cambia();
        const d1 = this._dims();
        this.x = px - d1.A.x; this.y = py - d1.A.y;
        this._render(); this._applyTransform();
    }

    _perno() { const d = this._dims(); return { x: this.x + d.A.x, y: this.y + d.A.y }; }

    _setupDrag() {
        const h = this.el.querySelector('.setsq-drag');
        let st = null;
        h.addEventListener('pointerdown', (e) => {
            e.preventDefault(); e.stopPropagation();
            st = { sx: e.clientX, sy: e.clientY, ox: this.x, oy: this.y };
            try { h.setPointerCapture(e.pointerId); } catch (_) {}
        });
        window.addEventListener('pointermove', (e) => {
            if (!st) return;
            this.x = st.ox + e.clientX - st.sx; this.y = st.oy + e.clientY - st.sy;
            this._applyTransform();
        });
        window.addEventListener('pointerup', () => { st = null; });
    }

    _setupRotate() {
        const h = this.el.querySelector('.setsq-rotate');
        let st = null;
        const ang = (e) => { const p = this._perno(); return Math.atan2(e.clientY - p.y, e.clientX - p.x) * 180 / Math.PI; };
        h.addEventListener('pointerdown', (e) => {
            e.preventDefault(); e.stopPropagation();
            st = { a0: this.angle, m0: ang(e) };
            try { h.setPointerCapture(e.pointerId); } catch (_) {}
        });
        window.addEventListener('pointermove', (e) => {
            if (!st) return;
            this.angle = st.a0 + ang(e) - st.m0;
            this._applyTransform();
        });
        window.addEventListener('pointerup', () => { st = null; });
    }

    _setupResize() {
        const h = this.el.querySelector('.setsq-resize');
        let st = null;
        h.addEventListener('pointerdown', (e) => {
            e.preventDefault(); e.stopPropagation();
            const p = this._perno();
            st = { d0: Math.hypot(e.clientX - p.x, e.clientY - p.y), s0: this.size };
            try { h.setPointerCapture(e.pointerId); } catch (_) {}
        });
        window.addEventListener('pointermove', (e) => {
            if (!st) return;
            const p = this._perno();
            const dd = Math.hypot(e.clientX - p.x, e.clientY - p.y);
            const nuova = Math.min(900, Math.max(this.minSize, st.s0 * dd / Math.max(1, st.d0)));
            this._riancora(() => { this.size = nuova; });
        });
        window.addEventListener('pointerup', () => { st = null; });
    }

    // Vertici A, B, C in coordinate canvas (le stesse dei tratti)
    _vertici() {
        const d = this._dims();
        const p = this._perno();
        const r = this.angle * Math.PI / 180, cs = Math.cos(r), sn = Math.sin(r);
        return [d.A, d.B, d.C].map(v => {
            const dx = v.x - d.A.x, dy = v.y - d.A.y;
            const sx = p.x + dx * cs - dy * sn, sy = p.y + dx * sn + dy * cs;
            return (typeof panMgr !== 'undefined' && panMgr) ? panMgr.getCanvasCoords(sx, sy) : { x: sx, y: sy };
        });
    }

    // Lato più vicino al punto (coordinate canvas): 0 = AB, 1 = BC (ipotenusa), 2 = CA
    latoVicino(x, y) {
        const v = this._vertici();
        let best = { i: 0, dist: Infinity };
        [[0, 1], [1, 2], [2, 0]].forEach(([a, b], i) => {
            const ax = v[a].x, ay = v[a].y, bx = v[b].x, by = v[b].y;
            const l2 = (bx - ax) ** 2 + (by - ay) ** 2;
            const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / l2));
            const dist = Math.hypot(x - (ax + t * (bx - ax)), y - (ay + t * (by - ay)));
            if (dist < best.dist) best = { i, dist };
        });
        return best;
    }

    // Proiezione sulla retta del lato scelto (come il righello: si può uscire dalla punta)
    snapToLato(i, x, y) {
        const v = this._vertici();
        const [a, b] = [[0, 1], [1, 2], [2, 0]][i];
        const ax = v[a].x, ay = v[a].y, dx = v[b].x - ax, dy = v[b].y - ay;
        const t = ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy);
        return { x: ax + t * dx, y: ay + t * dy };
    }
}


// =============================================================================
// CompassTool — compasso vero, su modello fornito da Fabio (screenshot 04/10/2026):
// due bracci di lunghezza FISSA incernierati in alto, l'ago resta fisso nel punto
// 0 e la matita si sposta — la cerniera è calcolata con la cinematica vera (due
// cerchi di raggio L che si intersecano), non più approssimata. Colonna di 6
// comandi: chiudi, impostazioni (angolo/dimensione/unità), occhio (misura
// persistente), apri-chiudi, inverti, disegna (usa colore/spessore/tipo dello
// strumento di disegno a mano libera corrente — pen/pencil/pastel/marker).
// =============================================================================

const COMPASS_DIM = 2200; // lato fisso del canvas locale (l'ago sta sempre al centro) — margine per bracci fino a 400px
const COMPASS_LEGLEN_MIN = 100;
const COMPASS_LEGLEN_MAX = 400;
const COMPASS_LEGLEN_DEFAULT = (COMPASS_LEGLEN_MIN + COMPASS_LEGLEN_MAX) / 2; // "a riposo": metà scala, su richiesta di Fabio
const COMPASS_ANGOLO_DEFAULT = 10 * Math.PI / 180; // a riposo quasi chiuso, non spalancato (Fabio, 04/10/2026)

class CompassTool {
    constructor() {
        this.el      = null;
        this.visible = false;

        this.x = 280;                      // ago (perno, punto 0) — posizione schermo
        this.y = 240;
        this.legLen      = COMPASS_LEGLEN_DEFAULT;  // L — lunghezza fissa dei bracci, px schermo ("dimensione")
        this.pencilDist  = 2 * COMPASS_LEGLEN_DEFAULT * Math.sin(COMPASS_ANGOLO_DEFAULT / 2); // r — distanza ago↔matita
        this.pencilAngle = 0;               // direzione (da N) della matita — 0 = dritto, simmetrico
        this.flip  = false;                 // lato della cerniera — serve insieme a pencilAngle per il vero specchio
        this.unit  = 'cm';                  // mm | cm | in
        this.misuraVisibile = false;        // occhio: lettura persistente fra le due punte

        this.pivotScreenX = 0;              // ricalcolati da _updateCenter()
        this.pivotScreenY = 0;
    }

    create() {
        const w = document.createElement('div');
        w.id = 'compass-tool';
        w.className = 'geo-tool compass-tool';
        w.style.display = 'none';
        w.innerHTML = `
            <canvas class="compass-canvas" width="${COMPASS_DIM}" height="${COMPASS_DIM}"></canvas>
            <div class="compass-needle" title="Tieni premuto per spostare il compasso"></div>
            <div class="compass-readout">
                <span class="compass-readout-text"></span>
                <input type="text" inputmode="decimal" class="compass-readout-input" style="display:none">
            </div>
            <div class="compass-ctrl">
                <div class="compass-btn compass-close" title="Chiudi">&#215;</div>
                <div class="compass-btn compass-gear" title="Dimensione, angolo e unità di misura">&#9881;</div>
                <div class="compass-btn compass-eye" title="Mostra/nascondi la misura fra le due punte">&#128065;&#65039;</div>
                <div class="compass-btn compass-resize" title="Trascina per aprire o chiudere">&#8596;</div>
                <div class="compass-btn compass-flip" title="Inverti il compasso">&#8644;</div>
                <div class="compass-btn compass-draw" title="Tieni premuto e trascina per disegnare">&#9999;&#65039;</div>
            </div>
            <div class="compass-panel" style="display:none">
                <div class="compass-panel-row">
                    <span class="compass-panel-ic" title="Angolo di apertura">&#8735;</span>
                    <input type="number" class="compass-angle-input" min="2" max="175" step="1" value="0">
                    <span class="compass-panel-deg">&#176;</span>
                </div>
                <div class="compass-panel-row">
                    <span class="compass-panel-ic" title="Dimensione del compasso">&#10530;</span>
                    <input type="range" class="compass-size-slider" min="${COMPASS_LEGLEN_MIN}" max="${COMPASS_LEGLEN_MAX}" step="2" value="${COMPASS_LEGLEN_DEFAULT}">
                </div>
                <div class="compass-panel-row compass-unit-row">
                    <span class="compass-panel-ic" title="Unità di misura">&#128207;</span>
                    <button class="compass-unit-btn" data-unit="mm">mm</button>
                    <button class="compass-unit-btn" data-unit="cm">cm</button>
                    <button class="compass-unit-btn" data-unit="in">in</button>
                </div>
            </div>`;
        document.body.appendChild(w);
        this.el       = w;
        this.cvs      = w.querySelector('.compass-canvas');
        this.needleEl = w.querySelector('.compass-needle');
        this.resizeEl = w.querySelector('.compass-resize');
        this.drawEl   = w.querySelector('.compass-draw');
        this.readoutEl = w.querySelector('.compass-readout');
        this.readoutTextEl  = w.querySelector('.compass-readout-text');
        this.readoutInputEl = w.querySelector('.compass-readout-input');
        this.panelEl  = w.querySelector('.compass-panel');

        this._applyPos();
        this._render();
        this._setupNeedleDrag();
        this._setupResizeDrag();
        this._setupPanel();
        this._setupReadoutEdit();

        w.querySelector('.compass-close').addEventListener('click', () => this.hide());

        const flipBtn = w.querySelector('.compass-flip');
        flipBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
        flipBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            // Specchio VERO destra/sinistra, a qualunque apertura: serve riflettere l'angolo
            // della matita rispetto all'asse verticale per l'ago (fisso) E insieme invertire
            // this.flip, che sceglie da che parte sta la cerniera in _punti() — fatta solo
            // la riflessione dell'angolo, la cerniera saltava sopra/sotto invece di restare
            // dalla stessa parte (dimostrato algebricamente, 2ª segnalazione di Fabio).
            let a = Math.PI - this.pencilAngle;
            this.pencilAngle = Math.atan2(Math.sin(a), Math.cos(a));
            this.flip = !this.flip;
            this._render();
        });

        const eyeBtn = w.querySelector('.compass-eye');
        eyeBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
        eyeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.misuraVisibile = !this.misuraVisibile;
            eyeBtn.classList.toggle('active', this.misuraVisibile);
            this._render();
        });

        const gearBtn = w.querySelector('.compass-gear');
        gearBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
        gearBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const apri = this.panelEl.style.display === 'none';
            this.panelEl.style.display = apri ? 'block' : 'none';
            gearBtn.classList.toggle('active', apri);
            if (apri) this._syncPanel();
        });
    }

    show() {
        this.el.style.display = 'block';
        // «Si apre sempre dritto, in posizione di riposo»: niente eredità dall'ultima volta —
        // angolo simmetrico, dimensione a metà scala E posizione al centro della pagina
        // visibile (non più un punto fisso che con bracci grandi finiva fuori schermo),
        // ogni volta che lo si riapre (Fabio, 04/10/2026).
        this.pencilAngle = 0;
        this.flip        = false;
        this.legLen      = COMPASS_LEGLEN_DEFAULT;
        this.pencilDist  = 2 * COMPASS_LEGLEN_DEFAULT * Math.sin(COMPASS_ANGOLO_DEFAULT / 2);
        const headerH = document.body.classList.contains('fullscreen-mode') ? 0 : 56;
        this.x = window.innerWidth / 2;
        this.y = headerH + (window.innerHeight - headerH) / 2;
        this._applyPos();
        this._render();
        this.visible = true;
    }
    hide() { this.el.style.display = 'none'; this.panelEl.style.display = 'none'; this.visible = false; }
    isVisible() { return this.el && this.el.style.display !== 'none'; }

    // Posiziona il wrapper così che il centro del canvas locale (COMPASS_DIM/2) coincida
    // con (this.x, this.y) sullo schermo — l'ago resta sempre al centro.
    _applyPos() {
        const half = COMPASS_DIM / 2;
        this.el.style.left = (this.x - half) + 'px';
        this.el.style.top  = (this.y - half) + 'px';
        this._updateCenter();
    }

    _updateCenter() {
        const r = this.needleEl.getBoundingClientRect();
        this.pivotScreenX = r.left + r.width / 2;
        this.pivotScreenY = r.top + r.height / 2;
    }

    distClamped() {
        return Math.max(10, Math.min(this.legLen * 1.9, this.pencilDist));
    }

    // Apertura reale (gradi) alla cerniera, dati raggio corrente r e bracci L —
    // r = 2L·sin(θ/2)  →  θ = 2·asin((r/2)/L)
    aperturaGradi() {
        const r = this.distClamped();
        const x = Math.max(-1, Math.min(1, (r / 2) / this.legLen));
        return 2 * Math.asin(x) * 180 / Math.PI;
    }

    // Punto della matita e della cerniera, in coordinate LOCALI del canvas (COMPASS_DIM)
    _punti() {
        const half = COMPASS_DIM / 2;
        const r = this.distClamped();
        const P = { x: half + r * Math.cos(this.pencilAngle), y: half + r * Math.sin(this.pencilAngle) };
        const dx = P.x - half, dy = P.y - half;
        const halfR = r / 2;
        const off = Math.sqrt(Math.max(0, this.legLen * this.legLen - halfR * halfR));
        const ux = dx / r, uy = dy / r;
        const nx = -uy, ny = ux;
        // Il segno dipende da this.flip — SERVE insieme allo specchiare pencilAngle nel
        // pulsante ⇄ (vedi sotto) per ottenere un vero specchio destra/sinistra a
        // qualunque apertura: usare un segno fisso (come nel primo tentativo) sembrava
        // "continuo" durante il disegno ma faceva saltare la cerniera sopra/sotto appena
        // l'angolo veniva riflesso di scatto — dimostrato algebricamente e corretto da
        // Fabio il 04/10/2026 (seconda segnalazione sullo stesso pulsante).
        const sign = this.flip ? 1 : -1;
        const H = { x: half + dx / 2 + nx * off * sign, y: half + dy / 2 + ny * off * sign };
        return { N: { x: half, y: half }, H, P };
    }

    cmPerPx() {
        const scale = (typeof panMgr !== 'undefined' && panMgr && panMgr.scale) ? panMgr.scale : 1;
        return RULER_CANVAS_PX_PER_CM * scale; // px-schermo per 1 cm REALE
    }

    misuraTesto() {
        const cm = this.distClamped() / this.cmPerPx();
        const val = this.unit === 'mm' ? cm * 10 : this.unit === 'in' ? cm / 2.54 : cm;
        return val.toFixed(1).replace('.', ',') + ' ' + this.unit;
    }

    _taperedLeg(ctx, x0, y0, x1, y1, w0, w1) {
        const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len, ny = dx / len;
        ctx.beginPath();
        ctx.moveTo(x0 + nx * w0 / 2, y0 + ny * w0 / 2);
        ctx.lineTo(x1 + nx * w1 / 2, y1 + ny * w1 / 2);
        ctx.lineTo(x1 - nx * w1 / 2, y1 - ny * w1 / 2);
        ctx.lineTo(x0 - nx * w0 / 2, y0 - ny * w0 / 2);
        ctx.closePath();
        ctx.fillStyle = '#f2f2f4'; ctx.fill();
        ctx.strokeStyle = '#d6d6da'; ctx.lineWidth = 1.2; ctx.stroke();
    }

    _render() {
        const { N, H, P } = this._punti();
        const ctx = this.cvs.getContext('2d');
        ctx.clearRect(0, 0, COMPASS_DIM, COMPASS_DIM);

        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.22)';
        ctx.shadowBlur = 6;
        ctx.shadowOffsetY = 2;
        this._taperedLeg(ctx, H.x, H.y, N.x, N.y, 15, 3);
        this._taperedLeg(ctx, H.x, H.y, P.x, P.y, 15, 3);
        ctx.restore();

        // Le due punte ora si distinguono (richiesta di Fabio): l'ago è sottile e aguzzo,
        // si incernera al foglio; la matita ha corpo in legno e mina nel colore di disegno
        // corrente, così si vede anche con cosa sta per scrivere.
        const dirN = { x: (N.x - H.x) / (Math.hypot(N.x - H.x, N.y - H.y) || 1), y: (N.y - H.y) / (Math.hypot(N.x - H.x, N.y - H.y) || 1) };
        const dirP = { x: (P.x - H.x) / (Math.hypot(P.x - H.x, P.y - H.y) || 1), y: (P.y - H.y) / (Math.hypot(P.x - H.x, P.y - H.y) || 1) };

        // Ago: triangolo lungo e sottile, la punta coincide esattamente col perno (N)
        (() => {
            const back = 16, w = 1.8;
            const nx = -dirN.y, ny = dirN.x;
            const bx = N.x - dirN.x * back, by = N.y - dirN.y * back;
            ctx.beginPath();
            ctx.moveTo(bx + nx * w, by + ny * w);
            ctx.lineTo(N.x, N.y);
            ctx.lineTo(bx - nx * w, by - ny * w);
            ctx.closePath();
            ctx.fillStyle = '#2a2a2c'; ctx.fill();
        })();

        // Matita: corpo in legno + mina nel colore corrente di disegno, la punta coincide con P
        (() => {
            const backWood = 16, backGraphite = 7, w = 5;
            const nx = -dirP.y, ny = dirP.x;
            const wbx = P.x - dirP.x * backWood, wby = P.y - dirP.y * backWood;
            const mbx = P.x - dirP.x * backGraphite, mby = P.y - dirP.y * backGraphite;
            ctx.beginPath();
            ctx.moveTo(wbx + nx * w, wby + ny * w);
            ctx.lineTo(mbx + nx * w * 0.45, mby + ny * w * 0.45);
            ctx.lineTo(mbx - nx * w * 0.45, mby - ny * w * 0.45);
            ctx.lineTo(wbx - nx * w, wby - ny * w);
            ctx.closePath();
            ctx.fillStyle = '#e8b974'; ctx.fill();
            ctx.strokeStyle = '#b8894a'; ctx.lineWidth = 1; ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(mbx + nx * w * 0.45, mby + ny * w * 0.45);
            ctx.lineTo(P.x, P.y);
            ctx.lineTo(mbx - nx * w * 0.45, mby - ny * w * 0.45);
            ctx.closePath();
            ctx.fillStyle = (typeof CONFIG !== 'undefined' && CONFIG.currentColor) ? CONFIG.currentColor : '#3a3a3c';
            ctx.fill();
        })();

        // Cerniera: cappuccio scuro sopra, alloggiamento chiaro, vite al centro
        ctx.beginPath();
        ctx.roundRect ? ctx.roundRect(H.x - 7, H.y - 22, 14, 18, 7) : ctx.rect(H.x - 7, H.y - 22, 14, 18);
        ctx.fillStyle = '#3a3a3c'; ctx.fill();
        ctx.beginPath(); ctx.arc(H.x, H.y, 15, 0, Math.PI * 2);
        ctx.fillStyle = '#f3f3f5'; ctx.fill();
        ctx.strokeStyle = '#d6d6da'; ctx.lineWidth = 1.2; ctx.stroke();
        ctx.beginPath(); ctx.arc(H.x, H.y, 6, 0, Math.PI * 2);
        ctx.fillStyle = '#3a3a3c'; ctx.fill();

        // Maniglia reale (DOM) dell'ago — riceve il dito per spostare il compasso
        this.needleEl.style.left = N.x + 'px'; this.needleEl.style.top = N.y + 'px';

        // Lettura persistente (occhio): linea + etichetta fra le due punte
        if (this.misuraVisibile) {
            ctx.beginPath();
            ctx.moveTo(N.x, N.y); ctx.lineTo(P.x, P.y);
            ctx.strokeStyle = 'rgba(59, 130, 246, 0.85)'; ctx.lineWidth = 2;
            ctx.setLineDash([]); ctx.stroke();
            if (document.activeElement !== this.readoutInputEl) this.readoutTextEl.textContent = this.misuraTesto();
            this.readoutEl.style.display = 'flex';
            const midX = (N.x + P.x) / 2, midY = (N.y + P.y) / 2;
            this.readoutEl.style.left = midX + 'px';
            this.readoutEl.style.top  = (midY + 14) + 'px';
        } else {
            this.readoutEl.style.display = 'none';
        }

        // Comandi: colonna accanto alla cerniera, inclinata in parallelo al braccio della
        // matita (come nel modello di Fabio) — perno della rotazione appena fuori dalla
        // cerniera, lungo la perpendicolare al braccio — SEMPRE dal lato opposto all'ago
        // (fuori dal compasso), mai verso l'interno che lo coprirebbe (corretto da Fabio).
        const dxp = P.x - H.x, dyp = P.y - H.y;
        const legScreenLen = Math.hypot(dxp, dyp) || 1;
        const legAngleDeg = Math.atan2(dyp, dxp) * 180 / Math.PI;
        let perpx = -dyp / legScreenLen, perpy = dxp / legScreenLen;
        const Nvx = N.x - H.x, Nvy = N.y - H.y; // dalla cerniera verso l'ago
        if (perpx * Nvx + perpy * Nvy > 0) { perpx = -perpx; perpy = -perpy; } // scarta il lato verso l'ago
        const ctrl = this.el.querySelector('.compass-ctrl');
        ctrl.style.left = (H.x + perpx * 30) + 'px';
        ctrl.style.top  = (H.y + perpy * 30) + 'px';
        ctrl.style.transform = `translate(-50%, 0) rotate(${legAngleDeg - 90}deg)`;
        // Contro-ruota ogni icona così i simboli restano dritti anche se la colonna è inclinata
        const controRot = -(legAngleDeg - 90);
        ctrl.querySelectorAll('.compass-btn').forEach(b => { b.style.transform = `rotate(${controRot}deg)`; });

        // Il pannello impostazioni resta sempre dritto (numeri leggibili), non ruota col braccio
        this.panelEl.style.left = (H.x + 26) + 'px';
        this.panelEl.style.top  = (H.y + 170) + 'px';
    }

    _setupNeedleDrag() {
        const h = this.needleEl;
        let st = null;
        h.addEventListener('pointerdown', (e) => {
            e.preventDefault(); e.stopPropagation();
            st = { sx: e.clientX, sy: e.clientY, ox: this.x, oy: this.y };
            try { h.setPointerCapture(e.pointerId); } catch (_) {}
        });
        window.addEventListener('pointermove', (e) => {
            if (!st) return;
            this.x = st.ox + e.clientX - st.sx;
            this.y = st.oy + e.clientY - st.sy;
            this._applyPos();
            this._render();
        });
        window.addEventListener('pointerup', () => { st = null; });
    }

    // Pulsante ⇆ nella colonna comandi: trascina per aprire/chiudere (niente inchiostro)
    _setupResizeDrag() {
        const h = this.el.querySelector('.compass-resize');
        let st = null;
        h.addEventListener('pointerdown', (e) => {
            e.preventDefault(); e.stopPropagation();
            st = { sx: e.clientX, sy: e.clientY, od: this.pencilDist };
            try { h.setPointerCapture(e.pointerId); } catch (_) {}
        });
        window.addEventListener('pointermove', (e) => {
            if (!st) return;
            const delta = (e.clientX - st.sx) + (e.clientY - st.sy);
            this.pencilDist = Math.max(10, Math.min(this.legLen * 1.9, st.od + delta));
            this._render();
        });
        window.addEventListener('pointerup', () => { st = null; });
    }

    _setupPanel() {
        const angleInp = this.el.querySelector('.compass-angle-input');
        angleInp.addEventListener('pointerdown', (e) => e.stopPropagation());
        const applyAngle = () => {
            const deg = Math.max(2, Math.min(175, parseFloat(angleInp.value) || 1));
            const rad = deg * Math.PI / 180;
            this.pencilDist = Math.max(10, 2 * this.legLen * Math.sin(rad / 2));
            this._render();
        };
        angleInp.addEventListener('change', applyAngle);
        angleInp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { applyAngle(); angleInp.blur(); } });

        const sizeSlider = this.el.querySelector('.compass-size-slider');
        sizeSlider.addEventListener('pointerdown', (e) => e.stopPropagation());
        sizeSlider.addEventListener('input', () => {
            const apertura = this.aperturaGradi() * Math.PI / 180; // conservata mentre cambia la dimensione
            this.legLen = parseFloat(sizeSlider.value);
            this.pencilDist = Math.max(10, 2 * this.legLen * Math.sin(apertura / 2));
            this._render();
        });

        this.el.querySelectorAll('.compass-unit-btn').forEach(btn => {
            btn.addEventListener('pointerdown', (e) => e.stopPropagation());
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.unit = btn.dataset.unit;
                this._syncPanel();
                this._render();
            });
        });
    }

    // Tocca la misura nell'ovale blu (occhio attivo) → diventa un campo editabile, per
    // scrivere la distanza a tastiera invece di trascinare (richiesta di Fabio, 04/10/2026).
    _setupReadoutEdit() {
        const text = this.readoutTextEl, input = this.readoutInputEl;
        text.addEventListener('pointerdown', (e) => e.stopPropagation());
        input.addEventListener('pointerdown', (e) => e.stopPropagation());
        text.addEventListener('click', (e) => {
            e.stopPropagation();
            const cm = this.distClamped() / this.cmPerPx();
            const val = this.unit === 'mm' ? cm * 10 : this.unit === 'in' ? cm / 2.54 : cm;
            input.value = val.toFixed(1).replace('.', ',');
            text.style.display = 'none';
            input.style.display = 'inline-block';
            input.focus(); input.select();
        });
        const applica = () => {
            const val = parseFloat(input.value.replace(',', '.'));
            if (!isNaN(val) && val > 0) {
                const cm = this.unit === 'mm' ? val / 10 : this.unit === 'in' ? val * 2.54 : val;
                const px = cm * this.cmPerPx();
                // Il valore scritto va onorato per intero: se serve più apertura di quella
                // raggiungibile con la dimensione attuale, il compasso si allarga da solo
                // (fino al massimo della scala) invece di accorciare in silenzio il numero
                // digitato — Fabio, 04/10/2026: la misura deve corrispondere a quella vera.
                if (px > this.legLen * 1.9) {
                    this.legLen = Math.min(COMPASS_LEGLEN_MAX, px / 1.9);
                }
                this.pencilDist = Math.max(10, Math.min(this.legLen * 1.9, px));
            }
            input.style.display = 'none';
            text.style.display = 'inline';
            this._render();
        };
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') applica(); });
        input.addEventListener('blur', applica);
    }

    _syncPanel() {
        const angleInp = this.el.querySelector('.compass-angle-input');
        if (document.activeElement !== angleInp) angleInp.value = Math.round(this.aperturaGradi());
        const sizeSlider = this.el.querySelector('.compass-size-slider');
        sizeSlider.value = this.legLen;
        this.el.querySelectorAll('.compass-unit-btn').forEach(b => b.classList.toggle('active', b.dataset.unit === this.unit));
    }
}


// =============================================================================
// GeometryManager — controller principale
// =============================================================================

class GeometryManager {
    constructor() {
        this._injectCSS();
        this.ruler      = new RulerTool();
        this.protractor = new ProtractorTool();
        this.compass    = new CompassTool();
        this.sq45       = new SetSquareTool('45');
        this.sq3060     = new SetSquareTool('3060');

        this.ruler.create();
        this.protractor.create();
        this.compass.create();
        this.sq45.create();
        this.sq3060.create();

        // Il pulsante nel Magic Box è evidenziato solo quando lo strumento è davvero aperto,
        // anche se lo si chiude con la × sulla lavagna invece che dal pulsante.
        this._coppie = [['btn-geo-ruler', this.ruler], ['btn-geo-protractor', this.protractor],
                        ['btn-geo-compass', this.compass],
                        ['btn-geo-sq45', this.sq45], ['btn-geo-sq3060', this.sq3060]];
        this._coppie.forEach(([, t]) => {
            const show = t.show.bind(t), hide = t.hide.bind(t);
            t.show = () => { show(); this._syncBottoni(); };
            t.hide = () => { hide(); this._syncBottoni(); };
        });

        this._setupButtons();
        this._patchCanvasManager();
    }

    // ------------------------------------------------------------------
    // CSS iniettato dinamicamente (alternativa: copiarlo in style.css)
    // ------------------------------------------------------------------

    _injectCSS() {
        const style = document.createElement('style');
        style.id    = 'geometry-css';
        style.textContent = `
/* ============================================================
   EduBoard v2 — Strumenti geometrici (geometry.js)
   ============================================================ */

/* --- Contenitore comune --- */
.geo-tool {
    position: fixed;
    z-index: 180;
    user-select: none;
    touch-action: none;
    cursor: move;
}

/* ============================================================
   RIGHELLO
   ============================================================ */

#ruler-tool {
    /* posizione gestita via JS */
}

.ruler-body {
    position: relative;
    width: 600px;
    height: 68px;
    background: rgba(212, 160, 23, 0.82);
    border: 1.5px solid rgba(160, 110, 5, 0.90);
    border-radius: 4px;
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.30);
    display: flex;
    align-items: flex-start;
    overflow: visible;
    transform-origin: center center;
    pointer-events: none; /* Il corpo è trasparente agli eventi — i tocchi arrivano al canvas */
}

#ruler-canvas {
    display: block;
    pointer-events: none;
    /* Il canvas delle tacche occupa la parte sinistra del corpo */
    flex: 1;
    min-width: 0;
}

.ruler-rotate-handle {
    position: absolute;
    right: 70px;
    top: 57px; /* sulla riga della casella dei gradi, sotto i numeri */
    transform: translateY(-50%);
    /* Area visiva 22×22, ma hit-area minima 44×44 per uso dito su LIM */
    width: 44px;
    height: 44px;
    cursor: grab;
    color: rgba(80, 40, 0, 0.85);
    font-size: 20px;
    line-height: 1;
    user-select: none;
    touch-action: none;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2;
    pointer-events: auto; /* Handle interattivo — riceve eventi */
}

.ruler-rotate-handle:active {
    cursor: grabbing;
}

.ruler-close {
    position: absolute;
    top: 48px;
    right: 4px;
    width: 18px;
    height: 18px;
    background: rgba(0, 0, 0, 0.30);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    font-size: 13px;
    color: #fff;
    line-height: 1;
    z-index: 15;
    pointer-events: auto; /* Handle interattivo */
}

.ruler-close:hover {
    background: rgba(0, 0, 0, 0.55);
}

.ruler-drag-handle {
    position: absolute;
    left: 4px;
    top: 57px;
    transform: translateY(-50%);
    /* Minimo 44×44 per hit-area dito su LIM */
    width: 44px;
    height: 44px;
    cursor: grab;
    color: rgba(80, 40, 0, 0.65);
    font-size: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    user-select: none;
    touch-action: none;
    z-index: 4;
    border-radius: 6px;
    pointer-events: auto; /* Handle interattivo */
}
.ruler-drag-handle:hover { background: rgba(80,40,0,0.10); }
.ruler-drag-handle:active { cursor: grabbing; }

.ruler-resize-handle {
    position: absolute;
    right: 30px;
    top: 57px;
    transform: translateY(-50%);
    width: 44px;  /* minimo 44px per hit-area dito su LIM */
    height: 44px;
    cursor: ew-resize;
    color: rgba(80, 40, 0, 0.6);
    font-size: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    user-select: none;
    touch-action: none;
    z-index: 10;
    pointer-events: auto; /* Handle interattivo */
    border-radius: 6px;
}
.ruler-resize-handle:hover { background: rgba(80,40,0,0.10); }

/* ============================================================
   GONIOMETRO
   ============================================================ */

#protractor-tool {
    position: fixed;
    /* Trasparente ai tocchi: lo stilo appoggiato all'arco deve arrivare alla lavagna
       (snapToProtractor), come col righello. Solo i comandi restano cliccabili. */
    pointer-events: none;
}

.protractor-body {
    pointer-events: none;
    display: inline-block;
    /* Fisso: coincide sempre col centro del cerchio disegnato (cx/cy=150,150
       in entrambe le modalità 180°/360°) — necessario per lo snap sull'arco */
    transform-origin: 150px 150px;
}

#protractor-canvas {
    display: block;
    pointer-events: none;
}

.geo-close {
    position: absolute;
    top: 2px;
    right: 2px;
    width: 18px;
    height: 18px;
    background: rgba(0, 0, 0, 0.30);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    font-size: 13px;
    color: #fff;
    line-height: 1;
    z-index: 3;
    pointer-events: auto;
}

.geo-close:hover {
    background: rgba(0, 0, 0, 0.55);
}

.protractor-resize-handle {
    position: absolute;
    right: 4px;
    bottom: 4px;
    width: 18px;
    height: 18px;
    cursor: ew-resize;
    color: rgba(59, 130, 246, 0.7);
    font-size: 13px;
    display: flex;
    align-items: center;
    justify-content: center;
    user-select: none;
    pointer-events: auto;
}

.protractor-drag-handle {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 28px;
    height: 28px;
    cursor: grab;
    color: rgba(30, 58, 138, 0.65);
    font-size: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    user-select: none;
    z-index: 4;
    border-radius: 50%;
    background: rgba(200, 220, 255, 0.5);
    pointer-events: auto;
}
.protractor-drag-handle:hover { background: rgba(200,220,255,0.8); }
.protractor-drag-handle:active { cursor: grabbing; }

.protractor-mode-btn,
.protractor-flip-btn {
    position: absolute;
    top: 50%;
    width: 30px;
    height: 30px;
    border-radius: 50%;
    background: rgba(200, 220, 255, 0.55);
    color: rgba(30, 58, 138, 0.85);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    font-weight: 600;
    cursor: pointer;
    user-select: none;
    touch-action: none;
    z-index: 4;
    pointer-events: auto;
}
.protractor-mode-btn { left: calc(50% - 46px); transform: translate(-50%, -50%); }
.protractor-flip-btn { left: calc(50% + 46px); transform: translate(-50%, -50%); font-size: 15px; }
.protractor-mode-btn:hover,
.protractor-flip-btn:hover { background: rgba(200,220,255,0.85); }
.protractor-mode-btn.active,
.protractor-flip-btn.active { background: rgba(59, 130, 246, 0.65); color: #fff; }

.ruler-angle-input,
.geo-angle-input {
    position: absolute;
    bottom: 2px;
    left: 50%;
    transform: translateX(-50%);
    width: 52px;
    height: 18px;
    border: 1px solid rgba(80, 40, 0, 0.40);
    border-radius: 3px;
    background: rgba(255, 240, 200, 0.85);
    color: rgba(60, 30, 0, 0.90);
    font-size: 11px;
    text-align: center;
    padding: 0 2px;
    cursor: text;
    z-index: 5;
    outline: none;
    pointer-events: auto; /* Input interattivo */
}
.geo-angle-input {
    bottom: auto;
    top: 2px;
    left: 2px;
    transform: none;
    background: rgba(200, 220, 255, 0.85);
    color: rgba(30, 58, 138, 0.90);
    border-color: rgba(59, 130, 246, 0.40);
    width: 48px;
}
.protractor-rotate-handle {
    position: absolute;
    top: 2px;
    right: 24px;
    width: 20px;
    height: 20px;
    cursor: grab;
    color: rgba(30, 58, 138, 0.85);
    font-size: 18px;
    line-height: 1;
    user-select: none;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 4;
    pointer-events: auto;
}
.protractor-rotate-handle:active { cursor: grabbing; }

/* ============================================================
   SQUADRE (45° e 30°/60°) — trasparenti ai tocchi, solo i comandi rispondono
   ============================================================ */

.setsq-tool { pointer-events: none; }
.setsq-body { position: relative; display: inline-block; pointer-events: none; }
.setsq-canvas { display: block; pointer-events: none; }
.setsq-ctrl {
    position: absolute;
    transform: translate(-50%, -50%);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    pointer-events: none;
}
.setsq-row { display: flex; align-items: center; gap: 4px; pointer-events: none; }
.setsq-btn {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(255, 255, 255, 0.6);
    color: rgba(30, 41, 59, 0.85);
    font-size: 16px;
    line-height: 1;
    cursor: pointer;
    user-select: none;
    touch-action: none;
    pointer-events: auto;
}
.setsq-btn:hover { background: rgba(255, 255, 255, 0.9); }
.setsq-drag { cursor: grab; }
.setsq-resize { cursor: nwse-resize; }
.setsq-close { background: rgba(0, 0, 0, 0.30); color: #fff; font-size: 14px; }
.setsq-close:hover { background: rgba(0, 0, 0, 0.55); }
.setsq-flip.active { background: rgba(59, 130, 246, 0.65); color: #fff; }
.geo-angle-input.setsq-angle { position: static; transform: none; }

/* ============================================================
   COMPASSO — due bracci rigidi incernierati, ago fisso nel punto 0
   (modello fornito da Fabio il 04/10/2026)
   ============================================================ */

.compass-tool { pointer-events: none; }
.compass-canvas { display: block; pointer-events: none; }

.compass-needle {
    position: absolute;
    width: 40px; height: 40px;
    transform: translate(-50%, -50%);
    border-radius: 50%;
    cursor: grab;
    touch-action: none;
    pointer-events: auto;
    opacity: 0;
    transition: opacity 0.15s ease, background 0.15s ease;
}
.compass-needle:hover, .compass-needle:active { opacity: 1; background: rgba(59, 130, 246, 0.12); }
.compass-needle:active { cursor: grabbing; }

.compass-readout {
    position: absolute;
    transform: translate(-50%, 0);
    background: rgba(37, 99, 235, 0.92);
    color: #fff;
    font-size: 13px;
    font-weight: 700;
    padding: 4px 10px;
    border-radius: 7px;
    white-space: nowrap;
    pointer-events: auto;
    display: none;
    align-items: center;
}
.compass-readout-text { cursor: text; }
.compass-readout-input {
    width: 54px;
    background: transparent;
    border: none;
    border-bottom: 1.5px solid #fff;
    color: #fff;
    font-size: 13px;
    font-weight: 700;
    font-family: inherit;
    text-align: center;
    outline: none;
}

.compass-ctrl {
    position: absolute;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 5px;
    pointer-events: none;
    transform-origin: top center;
}
.compass-btn {
    width: 26px; height: 26px;
    border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    background: rgba(255, 255, 255, 0.92);
    border: 1px solid rgba(0, 0, 0, 0.08);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
    color: rgba(50, 50, 55, 0.9);
    font-size: 13px;
    line-height: 1;
    cursor: pointer;
    user-select: none;
    touch-action: none;
    pointer-events: auto;
}
.compass-btn:hover { background: #fff; }
.compass-eye.active, .compass-gear.active { background: rgba(59, 130, 246, 0.9); color: #fff; }
.compass-resize, .compass-draw { cursor: grab; } /* si trascinano, stessa misura degli altri */
.compass-resize:active, .compass-draw:active { cursor: grabbing; }
.compass-close { background: rgba(60, 60, 64, 0.85); color: #fff; font-size: 13px; }
.compass-close:hover { background: rgba(60, 60, 64, 1); }

.compass-panel {
    position: absolute;
    width: 190px;
    background: #fff;
    border-radius: 14px;
    box-shadow: 0 8px 28px rgba(0, 0, 0, 0.22);
    padding: 14px;
    pointer-events: auto;
}
.compass-panel-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 10px;
}
.compass-panel-row:last-child { margin-bottom: 0; }
.compass-panel-ic { font-size: 16px; color: #555; width: 18px; text-align: center; flex-shrink: 0; }
.compass-angle-input {
    flex: 1; min-width: 0;
    border: none; border-bottom: 2px solid #ef4444;
    font-size: 15px; text-align: right; padding: 2px 4px;
    outline: none;
}
.compass-panel-deg { color: #777; font-size: 13px; }
.compass-size-slider { flex: 1; accent-color: #3b82f6; }
.compass-unit-row .compass-unit-btn {
    flex: 1;
    border: 1px solid #ddd;
    background: #fff;
    border-radius: 7px;
    padding: 5px 0;
    font-size: 13px;
    cursor: pointer;
}
.compass-unit-btn.active { background: #2563eb; color: #fff; border-color: #2563eb; }

/* ============================================================
   STATO ATTIVO BOTTONI GEO
   ============================================================ */

.tool-btn.geo-active {
    background: rgba(59, 130, 246, 0.20);
    color: #93c5fd;
}
        `;
        document.head.appendChild(style);
    }

    // ------------------------------------------------------------------
    // Collegamento pulsanti nel geo-popup
    // ------------------------------------------------------------------

    _syncBottoni() {
        this._coppie.forEach(([id, t]) => {
            const b = document.getElementById(id);
            if (b) b.classList.toggle('geo-active', !!t.isVisible());
        });
    }

    _setupButtons() {
        // Bottone Righello
        const btnRuler = document.getElementById('btn-geo-ruler');
        if (btnRuler) {
            btnRuler.addEventListener('click', () => {
                if (this.ruler.isVisible()) {
                    this.ruler.hide();
                    btnRuler.classList.remove('geo-active');
                } else {
                    this.ruler.show();
                    btnRuler.classList.add('geo-active');
                    // Chiudi popup
                    const popup = document.getElementById('geo-popup');
                    if (popup) popup.style.display = 'none';
                }
            });
        }

        // Bottone Goniometro
        const btnProt = document.getElementById('btn-geo-protractor');
        if (btnProt) {
            btnProt.addEventListener('click', () => {
                if (this.protractor.isVisible()) {
                    this.protractor.hide();
                    btnProt.classList.remove('geo-active');
                } else {
                    this.protractor.show();
                    btnProt.classList.add('geo-active');
                    const popup = document.getElementById('geo-popup');
                    if (popup) popup.style.display = 'none';
                }
            });
        }

        // Squadre
        [['btn-geo-sq45', this.sq45], ['btn-geo-sq3060', this.sq3060]].forEach(([id, sq]) => {
            const btn = document.getElementById(id);
            if (!btn) return;
            btn.addEventListener('click', () => {
                if (sq.isVisible()) { sq.hide(); btn.classList.remove('geo-active'); }
                else { sq.show(); btn.classList.add('geo-active'); }
            });
        });

        // Bottone Compasso
        const btnComp = document.getElementById('btn-geo-compass');
        if (btnComp) {
            btnComp.addEventListener('click', () => {
                if (this.compass.isVisible()) {
                    this.compass.hide();
                    btnComp.classList.remove('geo-active');
                } else {
                    this.compass.show();
                    btnComp.classList.add('geo-active');
                    const popup = document.getElementById('geo-popup');
                    if (popup) popup.style.display = 'none';
                }
            });
        }
    }

    // ------------------------------------------------------------------
    // Patch del CanvasManager per intercettare il compasso e lo snap
    // al righello durante la penna
    // ------------------------------------------------------------------

    _patchCanvasManager() {
        if (typeof canvasMgr === 'undefined' || !canvasMgr) {
            setTimeout(() => this._patchCanvasManager(), 50);
            return;
        }

        const mgr = canvasMgr;
        const geo  = this;

        // Scala del righello = quadretti reali: ridisegno delle tacche a ogni zoom
        if (typeof panMgr !== 'undefined' && panMgr && typeof panMgr._applyTransform === 'function') {
            const origApply = panMgr._applyTransform.bind(panMgr);
            panMgr._applyTransform = function () {
                origApply();
                if (geo.ruler.isVisible()) geo.ruler._renderMarks();
                if (geo.sq45.isVisible()) geo.sq45._render();
                if (geo.sq3060.isVisible()) geo.sq3060._render();
            };
        }

        // Con più strumenti aperti (es. squadra appoggiata al righello) il tratto va a
        // quello il cui bordo è più vicino alla penna; con uno solo, sempre a quello.
        const scegliStrumento = (raw) => {
            let best = null;
            const prova = (s) => { if (!best || s.dist < best.dist) best = s; };
            if (geo.ruler.isVisible()) {
                const p = geo.ruler.snapToRuler(raw.x, raw.y);
                prova({ nome: 'ruler', dist: Math.hypot(raw.x - p.x, raw.y - p.y) });
            }
            if (geo.protractor.isVisible()) {
                const p = geo.protractor.snapToProtractor(raw.x, raw.y);
                prova({ nome: 'protractor', dist: Math.hypot(raw.x - p.x, raw.y - p.y) });
            }
            [geo.sq45, geo.sq3060].forEach(sq => {
                if (!sq.isVisible()) return;
                const l = sq.latoVicino(raw.x, raw.y);
                prova({ nome: 'squadra', sq, lato: l.i, dist: l.dist });
            });
            return best;
        };
        const puntoDritto = (t, raw) => t.nome === 'ruler'
            ? geo.ruler.snapToRuler(raw.x, raw.y)
            : t.sq.snapToLato(t.lato, raw.x, raw.y);

        const origStart = mgr._onStart.bind(mgr);
        const origMove  = mgr._onMove.bind(mgr);
        const origEnd   = mgr._onEnd.bind(mgr);

        mgr._onStart = function(e) {
            geo._geoAttivo = null;
            if (PENNE.includes(CONFIG.currentTool)) {
                const raw = mgr.getCoords(e);
                const t = scegliStrumento(raw);
                if (t) {
                    let x, y;
                    if (t.nome === 'protractor') {
                        const snap = geo.protractor.snapToProtractor(raw.x, raw.y);
                        x = snap.x; y = snap.y;
                        geo._protLastAngle = snap.angle;
                    } else {
                        ({ x, y } = puntoDritto(t, raw));
                    }
                    geo._geoAttivo = t;
                    if (typeof toolbarMgr !== 'undefined') toolbarMgr.hide();
                    CONFIG.isDrawing = true;
                    mgr._saveUndo();
                    CONFIG.lastX = x;
                    CONFIG.lastY = y;
                    mgr._currentPoints = [{ x, y }]; // primo punto per tracking vettoriale (lazo/selezione)
                    // _drawSegment(x0,y0, cpX,cpY, x1,y1) — 6 argomenti richiesti
                    mgr._drawSegment(x, y, x, y, x, y);
                    return;
                }
            }
            origStart(e);
        };

        mgr._onMove = function(e) {
            const t = geo._geoAttivo;
            if (t && t.nome !== 'protractor' && CONFIG.isDrawing && PENNE.includes(CONFIG.currentTool)) {
                const raw = mgr.getCoords(e);
                const { x, y } = puntoDritto(t, raw);
                // Segmento dritto: control point = punto di partenza → nessuna curvatura
                mgr._drawSegment(CONFIG.lastX, CONFIG.lastY, CONFIG.lastX, CONFIG.lastY, x, y);
                CONFIG.lastX = x;
                CONFIG.lastY = y;
                mgr._currentPoints.push({ x, y }); // raccolta punti per tracking vettoriale (lazo/selezione)
                return;
            }
            if (t && t.nome === 'protractor' && CONFIG.isDrawing && PENNE.includes(CONFIG.currentTool)) {
                const raw  = mgr.getCoords(e);
                const snap = geo.protractor.snapToProtractor(raw.x, raw.y);
                // Disegna un arco reale (non una corda dritta) tra l'angolo precedente e quello nuovo
                geo._drawProtractorArc(mgr, geo._protLastAngle, snap.angle, snap.cx, snap.cy, snap.r);
                CONFIG.lastX = snap.x;
                CONFIG.lastY = snap.y;
                geo._protLastAngle = snap.angle;
                mgr._currentPoints.push({ x: snap.x, y: snap.y }); // raccolta punti per tracking vettoriale (lazo/selezione)
                return;
            }
            origMove(e);
        };

        mgr._onEnd = function(e) {
            if (geo._geoAttivo && CONFIG.isDrawing && PENNE.includes(CONFIG.currentTool)) {
                CONFIG.isDrawing = false;
                geo._geoAttivo = null;
                geo._finalizeGeoStroke(mgr);
                return;
            }
            geo._geoAttivo = null;
            origEnd(e);
        };

        this._setupCompassDrawing();
    }

    // ------------------------------------------------------------------
    // Disegno del compasso: la maniglia della matita ha un gesto TUTTO SUO
    // (non passa da _onStart/_onMove/_onEnd del canvas, esattamente come il
    // drag del righello) — primi gradi di movimento = "apro i bracci" (raggio
    // live, niente inchiostro); superata la soglia, il raggio si blocca e si
    // disegna l'arco vero con geo._drawProtractorArc, riusando identica la
    // pipeline di annulla/selezione/salvataggio del righello e del goniometro.
    // ------------------------------------------------------------------

    // Pulsante ✏️ nella colonna comandi del compasso: tenerlo premuto e girare il dito
    // intorno al perno disegna l'arco. Il raggio è quello GIÀ impostato (col pulsante ⇆
    // o con il pannello ⚙) — qui si segue solo l'angolo, come fa il goniometro con lo
    // snapToProtractor: stessa pipeline (_drawProtractorArc + _finalizeGeoStroke) per
    // ereditare gratis annulla, selezione e gomma.
    _setupCompassDrawing() {
        const geo = this;
        const c   = this.compass;
        const handle = c.el.querySelector('.compass-draw');
        let st = null;

        const puntoCanvas = (clientX, clientY) => {
            if (typeof panMgr !== 'undefined' && panMgr) return panMgr.getCanvasCoords(clientX, clientY);
            const area = document.getElementById('canvas-area');
            const r = area ? area.getBoundingClientRect() : { left: 0, top: 0 };
            return { x: clientX - r.left, y: clientY - r.top };
        };

        handle.addEventListener('pointerdown', (e) => {
            e.preventDefault(); e.stopPropagation();
            c._updateCenter();
            const pivotCanvas = puntoCanvas(c.pivotScreenX, c.pivotScreenY);
            const scale = (typeof panMgr !== 'undefined' && panMgr && panMgr.scale) ? panMgr.scale : 1;
            const raggioCanvas = c.distClamped() / scale; // raggio GIA' impostato, bloccato per tutto il gesto
            const ptCanvas = puntoCanvas(e.clientX, e.clientY);
            const startAngle = Math.atan2(ptCanvas.y - pivotCanvas.y, ptCanvas.x - pivotCanvas.x);
            st = { pivotCanvas, raggioCanvas, lastAngle: startAngle, inking: false };

            if (PENNE.includes(CONFIG.currentTool)) {
                st.inking = true;
                canvasMgr._saveUndo();
                const p0 = { x: pivotCanvas.x + raggioCanvas * Math.cos(startAngle), y: pivotCanvas.y + raggioCanvas * Math.sin(startAngle) };
                canvasMgr._currentPoints = [p0];
                canvasMgr._drawSegment(p0.x, p0.y, p0.x, p0.y, p0.x, p0.y);
            } else if (typeof toast === 'function') {
                toast('Scegli prima penna, matita, biro o pastello per disegnare col compasso', 'info');
            }
            try { handle.setPointerCapture(e.pointerId); } catch (_) {}
        });

        const processaMossa = (e) => {
            const ptCanvas = puntoCanvas(e.clientX, e.clientY);
            const rawAngle = Math.atan2(ptCanvas.y - st.pivotCanvas.y, ptCanvas.x - st.pivotCanvas.x);
            if (st.inking) {
                const punti = geo._drawProtractorArc(canvasMgr, st.lastAngle, rawAngle, st.pivotCanvas.x, st.pivotCanvas.y, st.raggioCanvas);
                canvasMgr._currentPoints.push(...punti);
            }
            st.lastAngle = rawAngle;
            c.pencilAngle = rawAngle; // la matita disegnata segue l'angolo corrente, raggio invariato
        };

        window.addEventListener('pointermove', (e) => {
            if (!st) return;
            e.preventDefault();
            // getCoalescedEvents: su LIM/stilo un gesto veloce genera più campioni fra un
            // pointermove e l'altro — elaborarli tutti tiene i punti del tratto fini quanto
            // il disegno vero (stesso motivo per cui lo fa già CanvasManager._setupEvents).
            const evts = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
            for (const ev of evts) processaMossa(ev);
            c._render();
        });

        window.addEventListener('pointerup', () => {
            if (!st) return;
            if (st.inking) geo._finalizeGeoStroke(canvasMgr);
            st = null;
        });
    }

    // Registra il tratto disegnato con righello/goniometro come vettore in _pageStrokes,
    // esattamente come fa CanvasManager._onEnd per pen/pencil/pastel/marker — senza
    // questo, il tratto resta solo pixel sul canvas e lazo/tap-selezione non lo trovano
    // (bug segnalato da Fabio 09/07/2026: "il lazo non riconosce righello/compasso").
    _finalizeGeoStroke(mgr) {
        const lastIdx = mgr._vectorStrokes.length - 1;
        if (lastIdx >= 0 && mgr._currentPoints.length > 0) {
            const strokeEntry = {
                tool:   CONFIG.currentTool,
                color:  CONFIG.currentColor,
                size:   CONFIG.currentSize,
                points: [...mgr._currentPoints],
            };
            mgr._vectorStrokes[lastIdx] = strokeEntry;
            mgr._pageStrokes.push({ ...strokeEntry });
        }
        mgr._currentPoints = [];
        CONFIG.isDirty = true;
        window.autoSaveMgr?.onDirty();
    }

    // ------------------------------------------------------------------
    // Disegna un arco reale tra due angoli (usato dallo snap sul goniometro)
    // suddividendolo in piccoli segmenti per ottenere una curva perfetta.
    // ------------------------------------------------------------------

    // Ritorna l'elenco dei punti campionati (serve al compasso per tenere il tracking
    // vettoriale fine quanto il disegno vero, invece di un punto solo per pointermove —
    // altrimenti gomma-tratto/selezione, che lavorano sui punti e non sui pixel, non
    // riconoscono bene un arco ampio disegnato in pochi eventi).
    _drawProtractorArc(mgr, fromAngle, toAngle, cx, cy, r) {
        // Verso più breve tra i due angoli, normalizzato in (-PI, PI]
        let delta = toAngle - fromAngle;
        while (delta > Math.PI)  delta -= 2 * Math.PI;
        while (delta < -Math.PI) delta += 2 * Math.PI;

        const maxStepRad = 3 * Math.PI / 180; // un segmento ogni ~3°
        const steps = Math.max(1, Math.ceil(Math.abs(delta) / maxStepRad));

        let prevX = cx + r * Math.cos(fromAngle);
        let prevY = cy + r * Math.sin(fromAngle);
        const punti = [];

        for (let i = 1; i <= steps; i++) {
            const a = fromAngle + delta * (i / steps);
            const x = cx + r * Math.cos(a);
            const y = cy + r * Math.sin(a);
            mgr._drawSegment(prevX, prevY, prevX, prevY, x, y);
            prevX = x;
            prevY = y;
            punti.push({ x, y });
        }
        return punti;
    }

    // ------------------------------------------------------------------
    // API pubblica
    // ------------------------------------------------------------------

    showRuler() {
        this.ruler.show();
    }

    hideRuler() {
        this.ruler.hide();
    }

    showProtractor() {
        this.protractor.show();
    }

    hideProtractor() {
        this.protractor.hide();
    }

    showCompass() {
        this.compass.show();
    }

    hideCompass() {
        this.compass.hide();
    }
}


// =============================================================================
// Utility condivisa: coordinate unificate mouse / touch / pointer
// =============================================================================

function _getPoint(e) {
    if (e.touches && e.touches.length > 0) {
        return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
    return { x: e.clientX, y: e.clientY };
}


// =============================================================================
// INIT — viene eseguito a DOMContentLoaded (geometry.js caricato dopo app.js)
// =============================================================================

// NOTA PER L'INTEGRAZIONE IN app.js:
// ─────────────────────────────────────────────────────────────────────────────
// 1. Aggiungere in index.html PRIMA di </body>, DOPO <script src="app.js">:
//        <script src="geometry.js"></script>
//
// 2. Aggiungere nella SEZIONE 12 di app.js, nella dichiarazione let globale:
//        let bgMgr, brush, laserMgr, canvasMgr, toolbarMgr, textMgr, projectMgr, geoMgr;
//
// 3. Aggiungere in DOMContentLoaded di app.js, DOPO setupKeyboard():
//        geoMgr = new GeometryManager();
//
// Oppure, in alternativa senza modificare app.js, geometry.js si auto-inizializza
// qui sotto all'evento DOMContentLoaded (se il DOM non è ancora pronto)
// oppure immediatamente (se lo script è caricato dopo il parsing del body).
// ─────────────────────────────────────────────────────────────────────────────

(function autoInit() {
    // Se geometry.js è caricato DOPO app.js (come da design),
    // canvasMgr potrebbe non essere ancora pronto al momento del parsing
    // ma lo sarà dopo il DOMContentLoaded di app.js.
    // La dichiarazione globale permette ai callback di app.js di trovarlo.
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            // Piccolo delay per lasciare che app.js completi il suo DOMContentLoaded
            setTimeout(() => {
                if (typeof geoMgr === 'undefined') {
                    window.geoMgr = new GeometryManager();
                }
            }, 0);
        });
    } else {
        // DOM già pronto (script eseguito dopo il parsing)
        if (typeof geoMgr === 'undefined') {
            window.geoMgr = new GeometryManager();
        }
    }
})();
