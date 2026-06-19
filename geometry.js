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
                <div class="ruler-drag-handle" id="ruler-drag" title="Trascina per spostare">⠿</div>
                <canvas id="ruler-canvas" width="560" height="48"></canvas>
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
        const ctx = cvs.getContext('2d');
        const W   = cvs.width;
        const H   = cvs.height;

        ctx.clearRect(0, 0, W, H);

        // Ogni 5px = 1 mm, ogni 50px = 1 cm
        for (let px = 0; px <= W; px += 5) {
            const isCm  = px % 50 === 0;
            const isMid = px % 25 === 0 && !isCm;  // mezzo cm

            const tickH = isCm ? 20 : isMid ? 13 : 7;
            const y0    = 0;
            const y1    = tickH;

            ctx.beginPath();
            ctx.moveTo(px, y0);
            ctx.lineTo(px, y1);
            ctx.strokeStyle = isCm
                ? 'rgba(80, 40, 0, 0.85)'
                : 'rgba(80, 40, 0, 0.55)';
            ctx.lineWidth = isCm ? 1.4 : 0.8;
            ctx.stroke();

            // Numero cm
            if (isCm && px > 0) {
                const cm = px / 50;
                ctx.font      = '10px Inter, sans-serif';
                ctx.fillStyle = 'rgba(60, 30, 0, 0.85)';
                ctx.textAlign = 'center';
                ctx.fillText(String(cm), px, tickH + 11);
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
        // Il canvas ruler è fisso 48px → metà = 24px sempre, a qualsiasi angolo.
        const rulerHalfH = 24; // metà di 48px (height fissa del canvas righello)
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
        this.scale   = 1.0;

        this.x     = 200;
        this.y     = 120;
        this.angle = 0;
        this.cx    = 0;
        this.cy    = 0;

        this._drag = { active: false, startX: 0, startY: 0, origX: 0, origY: 0 };
        this._rot  = { active: false, startAngle: 0, startMouse: 0 };
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
                <div class="protractor-drag-handle" id="protractor-drag" title="Trascina per spostare">⠿</div>
            </div>`;

        document.body.appendChild(wrapper);

        this.el  = wrapper;
        this.cvs = wrapper.querySelector('#protractor-canvas');

        this._render();
        this._setupDrag();
        this._setupResize();
        this._setupRotate();
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
        const W      = canvas.width;
        const H      = canvas.height;
        const cx     = W / 2;
        const cy     = H - 10;
        const R      = H - 20;

        ctx.clearRect(0, 0, W, H);

        // Sfondo semicircolare semitrasparente
        ctx.beginPath();
        ctx.arc(cx, cy, R, Math.PI, 0);
        ctx.lineTo(cx + R, cy);
        ctx.lineTo(cx - R, cy);
        ctx.closePath();
        ctx.fillStyle   = 'rgba(219, 234, 254, 0.70)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(59, 130, 246, 0.80)';
        ctx.lineWidth   = 1.5;
        ctx.stroke();

        // Diametro di base
        ctx.beginPath();
        ctx.moveTo(cx - R, cy);
        ctx.lineTo(cx + R, cy);
        ctx.strokeStyle = 'rgba(30, 58, 138, 0.85)';
        ctx.lineWidth   = 1.5;
        ctx.stroke();

        // Tacche e numeri
        for (let deg = 0; deg <= 180; deg += 5) {
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
                ctx.font      = '9px Inter, sans-serif';
                ctx.fillStyle = 'rgba(30, 58, 138, 0.90)';
                ctx.textAlign = 'center';
                ctx.fillText(
                    String(deg),
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
        body.style.transform = `scale(${this.scale}) rotate(${this.angle}deg)`;
        body.style.transformOrigin = 'center bottom';
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
            const startScale = this.scale;
            resizeHandle.setPointerCapture(e.pointerId);

            const onMove = (ev) => {
                const delta = (ev.clientX - startX) / 100;
                this.scale = Math.min(2.5, Math.max(0.5, startScale + delta));
                const body = this.el.querySelector('.protractor-body');
                body.style.transform = `scale(${this.scale})`;
                body.style.transformOrigin = 'center bottom';
            };
            const onEnd = () => {
                resizeHandle.removeEventListener('pointermove', onMove);
                resizeHandle.removeEventListener('pointerup', onEnd);
            };
            resizeHandle.addEventListener('pointermove', onMove);
            resizeHandle.addEventListener('pointerup', onEnd);
        });
    }
}


// =============================================================================
// CompassTool — compasso a 2 fasi (centro + raggio)
// =============================================================================

class CompassTool {
    constructor() {
        this.active = false;
        this.phase  = 0;   // 0=inattivo, 1=aspetta centro, 2=aspetta raggio
        this.cx     = 0;
        this.cy     = 0;
        this.radius = 0;
    }

    activate() {
        this.active = true;
        this.phase  = 1;
        document.getElementById('draw-canvas').style.cursor = 'crosshair';
        toast('Compasso: clicca per impostare il centro', 'info');
    }

    deactivate() {
        this.active = false;
        this.phase  = 0;
        document.getElementById('draw-canvas').style.cursor = 'crosshair';
        const overlay = document.getElementById('overlay-canvas');
        overlay.getContext('2d').clearRect(0, 0, overlay.width, overlay.height);
    }

    handleStart(x, y) {
        if (this.phase === 1) {
            this.cx    = x;
            this.cy    = y;
            this.phase = 2;
            toast('Trascina per impostare il raggio', 'info');
        }
    }

    handleMove(x, y) {
        if (this.phase !== 2) return;
        this.radius = Math.hypot(x - this.cx, y - this.cy);

        const overlay = document.getElementById('overlay-canvas');
        const ctx     = overlay.getContext('2d');
        ctx.clearRect(0, 0, overlay.width, overlay.height);

        ctx.save();
        ctx.strokeStyle = CONFIG.currentColor;
        ctx.globalAlpha = 0.7;

        // Punto centrale
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(this.cx, this.cy, 4, 0, Math.PI * 2);
        ctx.stroke();

        // Linea raggio tratteggiata
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(this.cx, this.cy);
        ctx.lineTo(x, y);
        ctx.stroke();

        // Cerchio preview
        ctx.setLineDash([]);
        ctx.lineWidth = CONFIG.currentSize;
        ctx.beginPath();
        ctx.arc(this.cx, this.cy, this.radius, 0, Math.PI * 2);
        ctx.stroke();

        ctx.restore();
    }

    handleEnd() {
        if (this.phase !== 2 || this.radius < 5) {
            // Raggio troppo piccolo: resta in fase 1 per nuovo centro
            this.phase = 1;
            const overlay = document.getElementById('overlay-canvas');
            overlay.getContext('2d').clearRect(0, 0, overlay.width, overlay.height);
            return;
        }

        // Disegna definitivamente sul draw canvas
        canvasMgr._saveUndo();
        const ctx = canvasMgr.ctx;
        ctx.save();
        ctx.strokeStyle = CONFIG.currentColor;
        ctx.lineWidth   = CONFIG.currentSize;
        ctx.lineCap     = 'round';
        ctx.beginPath();
        ctx.arc(this.cx, this.cy, this.radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();

        // Pulisce overlay
        const overlay = document.getElementById('overlay-canvas');
        overlay.getContext('2d').clearRect(0, 0, overlay.width, overlay.height);

        // Torna in fase 1 per un altro cerchio
        this.phase = 1;
        toast('Cerchio disegnato! Clicca per un nuovo centro', 'info');
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

        this.ruler.create();
        this.protractor.create();

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
    height: 48px;
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
}

.ruler-rotate-handle {
    position: absolute;
    right: 22px;
    top: 50%;
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
    z-index: 15;
    pointer-events: auto; /* Handle interattivo */
}

.ruler-close:hover {
    background: rgba(0, 0, 0, 0.55);
}

.ruler-drag-handle {
    position: absolute;
    left: 4px;
    top: 50%;
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
    right: 2px;
    top: 50%;
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
}

.protractor-body {
    display: inline-block;
    transform-origin: center bottom;
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
}
.protractor-drag-handle:hover { background: rgba(200,220,255,0.8); }
.protractor-drag-handle:active { cursor: grabbing; }

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
}
.protractor-rotate-handle:active { cursor: grabbing; }

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

        // Bottone Compasso — rimosso dal menu geo (funzionalità cerchio spostata nelle Forme)
        // La classe CompassTool rimane nel codice ma non è più accessibile dall'UI
        // const btnComp = document.getElementById('btn-geo-compass');
        // if (btnComp) { ... }
    }

    _activateCompass(btn) {
        // Deseleziona altri tool-btn
        document.querySelectorAll('.tool-btn[data-tool]').forEach(b => b.classList.remove('active'));
        if (btn) btn.classList.add('active');
        CONFIG.currentTool = 'compass';
        this.compass.activate();
    }

    _deactivateCompass(btn) {
        if (btn) btn.classList.remove('active');
        CONFIG.currentTool = 'pen';
        this.compass.deactivate();
        // Ripristina il cursore
        const penBtn = document.querySelector('.tool-btn[data-tool="pen"]');
        if (penBtn) {
            penBtn.classList.add('active');
        }
        document.getElementById('draw-canvas').style.cursor = 'crosshair';
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

        const origStart = mgr._onStart.bind(mgr);
        const origMove  = mgr._onMove.bind(mgr);
        const origEnd   = mgr._onEnd.bind(mgr);

        mgr._onStart = function(e) {
            if (CONFIG.currentTool === 'compass' && geo.compass.active) {
                const { x, y } = mgr.getCoords(e);
                geo.compass.handleStart(x, y);
                CONFIG.isDrawing = true;
                return;
            }
            if (geo.ruler.isVisible() &&
                ['pen', 'pencil', 'pastel', 'marker'].includes(CONFIG.currentTool)) {
                const raw = mgr.getCoords(e);
                const { x, y } = geo.ruler.snapToRuler(raw.x, raw.y);
                if (typeof toolbarMgr !== 'undefined') toolbarMgr.hide();
                CONFIG.isDrawing = true;
                mgr._saveUndo();
                CONFIG.lastX = x;
                CONFIG.lastY = y;
                // _drawSegment(x0,y0, cpX,cpY, x1,y1) — 6 argomenti richiesti
                mgr._drawSegment(x, y, x, y, x, y);
                return;
            }
            origStart(e);
        };

        mgr._onMove = function(e) {
            if (CONFIG.currentTool === 'compass' && geo.compass.active) {
                if (!CONFIG.isDrawing) return;
                const { x, y } = mgr.getCoords(e);
                geo.compass.handleMove(x, y);
                return;
            }
            if (geo.ruler.isVisible() && CONFIG.isDrawing &&
                ['pen', 'pencil', 'pastel', 'marker'].includes(CONFIG.currentTool)) {
                const raw = mgr.getCoords(e);
                const { x, y } = geo.ruler.snapToRuler(raw.x, raw.y);
                // Segmento dritto: control point = punto di partenza → nessuna curvatura
                mgr._drawSegment(CONFIG.lastX, CONFIG.lastY, CONFIG.lastX, CONFIG.lastY, x, y);
                CONFIG.lastX = x;
                CONFIG.lastY = y;
                return;
            }
            origMove(e);
        };

        mgr._onEnd = function(e) {
            if (CONFIG.currentTool === 'compass' && geo.compass.active) {
                geo.compass.handleEnd();
                CONFIG.isDrawing = false;
                return;
            }
            if (geo.ruler.isVisible() && CONFIG.isDrawing &&
                ['pen', 'pencil', 'pastel', 'marker'].includes(CONFIG.currentTool)) {
                CONFIG.isDrawing = false;
                return;
            }
            origEnd(e);
        };
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
        const btn = document.getElementById('btn-geo-compass');
        this._activateCompass(btn);
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
