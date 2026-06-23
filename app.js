/**
 * EduBoard v2 — Lavagna digitale interattiva per la scuola
 * Architettura: 3 canvas sovrapposti (bg, draw, overlay)
 * NO import/export — script tag normale, classi ES6
 */

'use strict';

// =============================================================================
// SEZIONE 0 — PWA INSTALL (intercetta beforeinstallprompt il prima possibile)
// =============================================================================
let _pwaInstallPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    _pwaInstallPrompt = e;
    const btn = document.getElementById('btn-install-pwa');
    if (btn) btn.style.display = '';
});
window.addEventListener('appinstalled', () => {
    _pwaInstallPrompt = null;
    const btn = document.getElementById('btn-install-pwa');
    if (btn) btn.style.display = 'none';
});

// =============================================================================
// SEZIONE 1 — CONFIG GLOBALE
// =============================================================================

const CONFIG = {
    currentTool: 'pen',
    currentColor: '#000000',
    currentSize: 3,
    currentShape: 'line',
    shapeFill: false,
    currentBg: 'white',
    isDrawing: false,
    isDirty: false,
    lastX: 0,
    lastY: 0,
    shapeStartX: 0,
    shapeStartY: 0,
    undoStack: [],
    redoStack: [],
    maxUndo: 50,
    toolbarVisible: false,
    projectName: 'Nuova Lavagna',
    // Strumenti che usano colore + dimensione
    drawTools: ['pen', 'pencil', 'pastel', 'marker', 'eraser'],
    // Modalità gomma: 'area' = cancella zona, 'stroke' = cancella tratto intero
    eraserMode: 'area',
};

// Colori standard palette toolbar (usati da tutti gli strumenti tranne marker)
const DEFAULT_COLORS = [
    { color: '#000000', title: 'Nero' },
    { color: '#1d4ed8', title: 'Blu' },
    { color: '#dc2626', title: 'Rosso' },
    { color: '#16a34a', title: 'Verde' },
    { color: '#d97706', title: 'Arancio' },
    { color: '#7c3aed', title: 'Viola' },
    { color: '#be185d', title: 'Rosa' },
    { color: '#0891b2', title: 'Azzurro' },
    { color: '#854d0e', title: 'Marrone' },
    { color: '#ffffff', title: 'Bianco' },
];

// Colori evidenziatore (Feature 1)
const MARKER_COLORS = [
    { color: '#FFFF00', title: 'Giallo' },
    { color: '#00FF7F', title: 'Verde' },
    { color: '#FF69B4', title: 'Rosa' },
    { color: '#FF8C00', title: 'Arancio' },
    { color: '#00BFFF', title: 'Azzurro' },
    { color: '#DA70D6', title: 'Orchidea' },
    { color: '#7FFFD4', title: 'Acquamarina' },
    { color: '#FF6347', title: 'Pomodoro' },
    { color: '#ffffff', title: 'Bianco' },  // placeholder per mantenere layout
    { color: '#ffffff', title: 'Bianco' },  // placeholder
];

// Palette 80 colori Material Design (Feature 2)
const COLOR_PALETTE = [
    // Rossi
    '#FFEBEE','#FFCDD2','#EF9A9A','#E57373','#EF5350','#F44336','#E53935','#D32F2F','#C62828','#B71C1C',
    // Rosa
    '#FCE4EC','#F8BBD0','#F48FB1','#F06292','#EC407A','#E91E63','#D81B60','#C2185B','#AD1457','#880E4F',
    // Viola
    '#F3E5F5','#E1BEE7','#CE93D8','#BA68C8','#AB47BC','#9C27B0','#8E24AA','#7B1FA2','#6A1B9A','#4A148C',
    // Blu-viola
    '#EDE7F6','#D1C4E9','#B39DDB','#9575CD','#7E57C2','#673AB7','#5E35B1','#512DA8','#4527A0','#311B92',
    // Blu
    '#E3F2FD','#BBDEFB','#90CAF9','#64B5F6','#42A5F5','#2196F3','#1E88E5','#1976D2','#1565C0','#0D47A1',
    // Ciano/verde
    '#E0F7FA','#B2EBF2','#80DEEA','#4DD0E1','#26C6DA','#00BCD4','#00ACC1','#0097A7','#00838F','#006064',
    // Verde
    '#E8F5E9','#C8E6C9','#A5D6A7','#81C784','#66BB6A','#4CAF50','#43A047','#388E3C','#2E7D32','#1B5E20',
    // Giallo/ambra/arancio
    '#FFFDE7','#FFF9C4','#FFF176','#FFF176','#FFEE58','#FFEB3B','#FDD835','#F9A825','#F57F17','#E65100',
];

// =============================================================================
// SEZIONE 2 — BackgroundManager
// Gestisce il canvas di sfondo (#bg-canvas): colori, righe, griglie, immagini
// =============================================================================

class BackgroundManager {
    constructor() {
        this.canvas = document.getElementById('bg-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.currentBg = 'white';
        this.uploadedImage = null; // HTMLImageElement se caricata foto
        this.orientation = 'landscape'; // 'landscape' | 'portrait'
        this.bgColor = '#ffffff';       // colore pagina (bianco di default)
    }

    resize(w, h) {
        this.canvas.width = w;
        this.canvas.height = h;
        this.render();
    }

    // Restituisce dimensioni del "foglio A4" in pixel, centrato orizzontalmente
    _getPageRect(W, H) {
        const ratio = this.orientation === 'portrait' ? (210 / 297) : (297 / 210);
        const MARGIN = Math.round(W * 0.04);
        let pw, ph;
        if (this.orientation === 'landscape') {
            pw = Math.round(W * 0.5);
            ph = Math.round(pw / ratio);
            // Clamp: se ph supera H disponibile, riscala da H
            if (ph > H * 0.9) { ph = Math.round(H * 0.9); pw = Math.round(ph * ratio); }
        } else {
            // Portrait: usa W come base, non H
            pw = Math.round(W * 0.3);
            ph = Math.round(pw / ratio);
        }
        // px centrato orizzontalmente (non dipende da H → stabile al toggle fullscreen)
        const px = Math.round((W - pw) / 2);
        // py fisso in alto (non dipende da H → nessuno shift al toggle fullscreen)
        const py = MARGIN;
        return { px, py, pw, ph };
    }

    // Configurazione pattern CSS per gli sfondi semplici (righe, quadretti, dots).
    // Restituisce null per pattern complessi (elementare, pentagramma) → rimangono su canvas.
    _cssPatternConfig() {
        const map = {
            'lines-8':  { type: 'lines', spacing: 45,  color: '#94a3b8' },
            'lines-5':  { type: 'lines', spacing: 30,  color: '#94a3b8' },
            'lines-3':  { type: 'lines', spacing: 17,  color: '#94a3b8' },
            'grid-10':  { type: 'grid',  spacing: 57,  colorH: '#bfdbfe', colorV: '#dbeafe' },
            'grid-5':   { type: 'grid',  spacing: 30,  colorH: '#bfdbfe', colorV: '#dbeafe' },
            'dots':     { type: 'dots',  spacing: 30,  color: '#94a3b8' },
            'lines-9':  { type: 'lines', spacing: 54,  color: '#94a3b8' },
            'lines-7':  { type: 'lines', spacing: 42,  color: '#94a3b8' },
        };
        return map[this.currentBg] || null;
    }

    // Aggiorna il CSS background del body in sincronia con pan+zoom del canvas.
    // Chiamato da PanManager._applyTransform() ad ogni pan/zoom.
    refreshBodyPattern(dx, dy, scale) {
        if (this.uploadedImage) { this._clearBodyPattern(); return; }
        const cfg = this._cssPatternConfig();
        if (!cfg) { this._clearBodyPattern(); return; }

        const bg = this.bgColor || '#ffffff';
        const ss = cfg.spacing * scale; // spacing scalato in px schermo
        const modPos = (v) => ((v % ss) + ss) % ss; // sempre positivo

        document.body.style.backgroundColor = bg;

        if (cfg.type === 'lines') {
            document.body.style.backgroundImage =
                `repeating-linear-gradient(0deg, transparent 0px, transparent ${ss - 1}px, ${cfg.color} ${ss - 1}px, ${cfg.color} ${ss}px)`;
            document.body.style.backgroundSize   = `100% ${ss}px`;
            document.body.style.backgroundPosition = `0px ${modPos(dy)}px`;
        } else if (cfg.type === 'grid') {
            document.body.style.backgroundImage =
                `repeating-linear-gradient(90deg, transparent 0px, transparent ${ss-1}px, ${cfg.colorV} ${ss-1}px, ${cfg.colorV} ${ss}px),` +
                `repeating-linear-gradient(0deg,  transparent 0px, transparent ${ss-1}px, ${cfg.colorH} ${ss-1}px, ${cfg.colorH} ${ss}px)`;
            document.body.style.backgroundSize     = `${ss}px ${ss}px`;
            document.body.style.backgroundPosition = `${modPos(dx)}px ${modPos(dy)}px`;
        } else if (cfg.type === 'dots') {
            const r = Math.max(1, ss / 13);
            const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${ss}' height='${ss}'><circle cx='${ss/2}' cy='${ss/2}' r='${r}' fill='${cfg.color}'/></svg>`;
            document.body.style.backgroundImage    = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
            document.body.style.backgroundSize     = `${ss}px ${ss}px`;
            document.body.style.backgroundPosition = `${modPos(dx)}px ${modPos(dy)}px`;
        }
    }

    _clearBodyPattern() {
        document.body.style.backgroundImage   = 'none';
        document.body.style.backgroundColor  = '#ffffff';
        document.body.style.backgroundSize   = '';
        document.body.style.backgroundPosition = '';
    }

    // Ridisegna le righe sul canvas (usato prima dell'export PNG, che legge il canvas).
    renderForCapture() {
        const ctx = this.ctx;
        const W = this.canvas.width;
        const H = this.canvas.height;
        ctx.fillStyle = this.bgColor || '#ffffff';
        ctx.fillRect(0, 0, W, H);
        if (this.currentBg !== 'white') {
            ctx.strokeStyle = '#94a3b8';
            ctx.lineWidth = 1;
            switch (this.currentBg) {
                case 'lines-8':  this._drawLines(ctx, 0, 0, W, H, 45); break;
                case 'lines-5':  this._drawLines(ctx, 0, 0, W, H, 30); break;
                case 'lines-3':  this._drawLines(ctx, 0, 0, W, H, 17); break;
                case 'grid-10':  this._drawGrid(ctx, 0, 0, W, H, 57);  break;
                case 'grid-5':   this._drawGrid(ctx, 0, 0, W, H, 30);  break;
                case 'dots':     this._drawDots(ctx, 0, 0, W, H, 30);  break;
                case 'staff':    this._drawStaff(ctx, 0, 0, W, H);     break;
                case 'lines-15-aux': this._drawLinesThreeZone(ctx, 0, 0, W, H, 36, 20); break;
                case 'lines-12-aux': this._drawLinesWithAux(ctx, 0, 0, W, H, 48, 24);   break;
                case 'lines-9':  this._drawLines(ctx, 0, 0, W, H, 54); break;
                case 'lines-7':  this._drawLines(ctx, 0, 0, W, H, 42); break;
            }
        }
    }

    render() {
        const ctx = this.ctx;
        const W = this.canvas.width;
        const H = this.canvas.height;

        if (this.uploadedImage) {
            // Immagine di sfondo: mantieni il foglio A4 classico con ombra
            this._clearBodyPattern();
            ctx.fillStyle = '#f8fafc';
            ctx.fillRect(0, 0, W, H);
            const { px, py, pw, ph } = this._getPageRect(W, H);
            ctx.save();
            ctx.shadowColor = 'rgba(0,0,0,0.18)';
            ctx.shadowBlur = 18;
            ctx.shadowOffsetX = 3;
            ctx.shadowOffsetY = 3;
            ctx.fillStyle = this.bgColor;
            ctx.fillRect(px, py, pw, ph);
            ctx.restore();
            const img = this.uploadedImage;
            let drawW = img.width;
            let drawH = img.height;
            if (drawW > pw || drawH > ph) {
                const scale = Math.min(pw / drawW, ph / drawH);
                drawW = drawW * scale;
                drawH = drawH * scale;
            }
            ctx.save();
            ctx.beginPath();
            ctx.rect(px, py, pw, ph);
            ctx.clip();
            ctx.globalAlpha = 0.9;
            ctx.drawImage(img, px, py, drawW, drawH);
            ctx.globalAlpha = 1;
            ctx.restore();
            return;
        }

        if (this._cssPatternConfig()) {
            // Pattern semplice (righe, quadretti, dots): bg-canvas trasparente.
            // Il pattern è sul CSS del body (infinito) — sincronizzato da PanManager.
            ctx.clearRect(0, 0, W, H);
            // Cornice tratteggiata per il bordo di stampa A4
            const { px, py, pw, ph } = this._getPageRect(W, H);
            ctx.save();
            ctx.strokeStyle = 'rgba(100, 120, 160, 0.65)';
            ctx.lineWidth = 1;
            ctx.setLineDash([6, 5]);
            ctx.strokeRect(px, py, pw, ph);
            ctx.setLineDash([]);
            ctx.font = '11px system-ui, sans-serif';
            ctx.fillStyle = 'rgba(100, 120, 160, 0.65)';
            ctx.textAlign = 'left';
            ctx.fillText('area stampa', px + 6, py + ph - 6);
            ctx.restore();
            return;
        }

        // Sfondo bianco o pattern complesso (elementare, pentagramma): bianco su tutto il canvas
        ctx.fillStyle = this.bgColor || '#ffffff';
        ctx.fillRect(0, 0, W, H);

        if (this.currentBg !== 'white') {
            ctx.strokeStyle = '#94a3b8';
            ctx.lineWidth = 1;
            switch (this.currentBg) {
                case 'staff':        this._drawStaff(ctx, 0, 0, W, H);                  break;
                case 'lines-15-aux': this._drawLinesThreeZone(ctx, 0, 0, W, H, 36, 20); break;
                case 'lines-12-aux': this._drawLinesWithAux(ctx, 0, 0, W, H, 48, 24);   break;
            }
        }

        // Cornice tratteggiata per il bordo di stampa A4
        const { px, py, pw, ph } = this._getPageRect(W, H);
        ctx.save();
        ctx.strokeStyle = 'rgba(100, 120, 160, 0.65)';
        ctx.lineWidth = 1;
        ctx.setLineDash([6, 5]);
        ctx.strokeRect(px, py, pw, ph);
        ctx.setLineDash([]);
        ctx.font = '11px system-ui, sans-serif';
        ctx.fillStyle = 'rgba(148, 163, 184, 0.5)';
        ctx.textAlign = 'right';
        ctx.fillText('area stampa', px + pw - 6, py + 14);
        ctx.restore();
    }

    _drawLines(ctx, px, py, pw, ph, spacing) {
        for (let y = py + spacing; y < py + ph; y += spacing) {
            ctx.beginPath();
            ctx.moveTo(px, y);
            ctx.lineTo(px + pw, y);
            ctx.stroke();
        }
    }

    _drawGrid(ctx, px, py, pw, ph, spacing) {
        ctx.strokeStyle = '#dbeafe'; // più leggero per le colonne
        for (let x = px + spacing; x < px + pw; x += spacing) {
            ctx.beginPath();
            ctx.moveTo(x, py);
            ctx.lineTo(x, py + ph);
            ctx.stroke();
        }
        ctx.strokeStyle = '#bfdbfe';
        for (let y = py + spacing; y < py + ph; y += spacing) {
            ctx.beginPath();
            ctx.moveTo(px, y);
            ctx.lineTo(px + pw, y);
            ctx.stroke();
        }
    }

    _drawDots(ctx, px, py, pw, ph, spacing) {
        ctx.fillStyle = '#94a3b8';
        for (let x = px + spacing; x < px + pw; x += spacing) {
            for (let y = py + spacing; y < py + ph; y += spacing) {
                ctx.beginPath();
                ctx.arc(x, y, 1.5, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }

    _drawStaff(ctx, px, py, pw, ph) {
        // Gruppi da 5 righe con spazio più grande tra i gruppi
        const lineSpacing = 12;  // tra le righe del pentagramma
        const groupSpacing = 60; // tra un pentagramma e il successivo
        let y = py + groupSpacing;
        while (y + lineSpacing * 4 < py + ph) {
            for (let i = 0; i < 5; i++) {
                ctx.beginPath();
                ctx.moveTo(px, y + i * lineSpacing);
                ctx.lineTo(px + pw, y + i * lineSpacing);
                ctx.stroke();
            }
            y += lineSpacing * 4 + groupSpacing;
        }
    }

    // Feature 4a: righino ausiliario per 2a elementare (2 zone)
    _drawLinesWithAux(ctx, px, py, pw, ph, spacing, auxOffset) {
        // Riga principale blu
        ctx.strokeStyle = '#60a5fa';
        ctx.lineWidth = 1.2;
        for (let y = py + spacing; y < py + ph; y += spacing) {
            ctx.beginPath(); ctx.moveTo(px, y); ctx.lineTo(px + pw, y); ctx.stroke();
        }
        // Righino ausiliario rosso
        ctx.strokeStyle = '#f87171';
        ctx.lineWidth = 0.9;
        for (let y = py + spacing; y < py + ph; y += spacing) {
            const auxY = y - spacing + auxOffset;
            if (auxY > py) {
                ctx.beginPath(); ctx.moveTo(px, auxY); ctx.lineTo(px + pw, auxY); ctx.stroke();
            }
        }
        // Margine sinistro rosso
        ctx.strokeStyle = '#f87171';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(px + 60, py); ctx.lineTo(px + 60, py + ph); ctx.stroke();
    }

    // Feature 4b: righe a 3 zone per 1a elementare (grande-piccola-grande)
    _drawLinesThreeZone(ctx, px, py, pw, ph, large, small) {
        const period = large + small + large;
        for (let y = py + large; y < py + ph; y += period) {
            // Rigo superiore (leggero, grigio-blu) — tetto lettere alte
            ctx.strokeStyle = '#93c5fd';
            ctx.lineWidth = 0.8;
            ctx.beginPath(); ctx.moveTo(px, y); ctx.lineTo(px + pw, y); ctx.stroke();
            // Rigo x-height (rosso) — tetto lettere piccole, dove si scrive
            const xhY = y + large;
            ctx.strokeStyle = '#f87171';
            ctx.lineWidth = 1.0;
            ctx.beginPath(); ctx.moveTo(px, xhY); ctx.lineTo(px + pw, xhY); ctx.stroke();
            // Baseline (blu, più spessa) — riga di base
            const baseY = y + large + small;
            ctx.strokeStyle = '#60a5fa';
            ctx.lineWidth = 1.4;
            ctx.beginPath(); ctx.moveTo(px, baseY); ctx.lineTo(px + pw, baseY); ctx.stroke();
        }
        // Margine sinistro rosso
        ctx.strokeStyle = '#f87171';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(px + 60, py); ctx.lineTo(px + 60, py + ph); ctx.stroke();
    }

    setBackground(bgKey) {
        this.currentBg = bgKey;
        this.uploadedImage = null;
        this.render();
        this._syncBodyNow();
        CONFIG.currentBg = bgKey;
        CONFIG.isDirty = true;
        window.autoSaveMgr?.onDirty();
    }

    setImage(imgElement) {
        this.uploadedImage = imgElement;
        this.currentBg = 'image';
        this.render();
        this._syncBodyNow();
        CONFIG.isDirty = true;
        window.autoSaveMgr?.onDirty();
    }

    // Alias per compatibilità con PageManager e drive.js
    get currentType() { return this.currentBg; }
    set currentType(v) { this.currentBg = v; }

    // Alias di render() usato da PageManager
    draw() { this.render(); }

    setOrientation(orientation) {
        this.orientation = orientation;
        this.render();
    }

    setBgColor(color) {
        this.bgColor = color;
        this.render();
        this._syncBodyNow();
    }

    // Aggiorna subito il body CSS usando la posizione corrente del panMgr
    _syncBodyNow() {
        if (typeof panMgr !== 'undefined' && panMgr) {
            this.refreshBodyPattern(panMgr.dx, panMgr.dy, panMgr.scale);
            // Forza il browser a comporre il nuovo stile subito (senza scroll)
            void document.body.offsetHeight;
        }
    }
}

// =============================================================================
// SEZIONE 3 — BrushEngine
// Contiene i metodi per disegnare ogni tipo di pennello. NON accede al DOM.
// =============================================================================

class BrushEngine {

    // Penna liscia — tratto netto e scorrevole
    pen(ctx, x0, y0, cpX, cpY, x1, y1, size, color) {
        ctx.save();
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = color;
        ctx.lineWidth = size;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.quadraticCurveTo(cpX, cpY, x1, y1);
        ctx.stroke();
        ctx.restore();
    }

    // Matita HB — tratto granuloso, leggermente irregolare
    pencil(ctx, x0, y0, cpX, cpY, x1, y1, size, color) {
        // Lunghezza approssimativa lungo la curva Bézier
        const dist = Math.hypot(cpX - x0, cpY - y0) + Math.hypot(x1 - cpX, y1 - cpY);
        const steps = Math.max(1, Math.ceil(dist * 1.5));
        ctx.save();
        ctx.fillStyle = color;
        ctx.globalCompositeOperation = 'source-over';
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const mt = 1 - t;
            // Valuta curva Bézier quadratica: B(t) = mt²·P0 + 2·mt·t·CP + t²·P1
            const x = mt * mt * x0 + 2 * mt * t * cpX + t * t * x1;
            const y = mt * mt * y0 + 2 * mt * t * cpY + t * t * y1;
            // 4-6 punti per step, dispersi casualmente
            const numDots = Math.floor(size * 0.7) + 3;
            for (let d = 0; d < numDots; d++) {
                const spread = size * 0.45;
                const dx = (Math.random() - 0.5) * spread;
                const dy = (Math.random() - 0.5) * spread;
                const dotR = Math.random() * size * 0.11 + size * 0.04;
                ctx.globalAlpha = Math.random() * 0.45 + 0.2;
                ctx.beginPath();
                ctx.arc(x + dx, y + dy, dotR, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        ctx.restore();
    }

    // Pastello morbido — sfumato con strati multipli (no filter:blur per performance)
    pastel(ctx, x0, y0, cpX, cpY, x1, y1, size, color) {
        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = color;
        ctx.globalCompositeOperation = 'source-over';
        const layers = [
            { w: size * 3.5, a: 0.022 },
            { w: size * 2.5, a: 0.035 },
            { w: size * 1.8, a: 0.055 },
            { w: size * 1.2, a: 0.08  },
            { w: size * 0.7, a: 0.12  },
            { w: size * 0.35, a: 0.18 },
        ];
        layers.forEach(({ w, a }) => {
            ctx.globalAlpha = a;
            ctx.lineWidth = w;
            ctx.beginPath();
            ctx.moveTo(x0, y0);
            ctx.quadraticCurveTo(cpX, cpY, x1, y1);
            ctx.stroke();
        });
        ctx.restore();
    }

    // Evidenziatore — tratto largo e semitrasparente
    marker(ctx, x0, y0, cpX, cpY, x1, y1, size, color) {
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = size * 2.5;
        ctx.lineCap = 'square';
        ctx.lineJoin = 'round';
        ctx.globalAlpha = 0.35;
        ctx.globalCompositeOperation = 'source-over';
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.quadraticCurveTo(cpX, cpY, x1, y1);
        ctx.stroke();
        ctx.restore();
    }

    // Gomma — cancella usando destination-out (mostra il bg-canvas sotto)
    eraser(ctx, x, y, size) {
        ctx.save();
        ctx.globalCompositeOperation = 'destination-out';
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    // Helper: poligono regolare (Feature 3)
    _polygon(ctx, cx, cy, r, sides, rotation = 0) {
        ctx.beginPath();
        for (let i = 0; i < sides; i++) {
            const angle = (i * 2 * Math.PI / sides) - Math.PI / 2 + rotation;
            if (i === 0) ctx.moveTo(cx + r * Math.cos(angle), cy + r * Math.sin(angle));
            else ctx.lineTo(cx + r * Math.cos(angle), cy + r * Math.sin(angle));
        }
        ctx.closePath();
    }

    // Forme geometriche — disegna su ctx passato, con colore e spessore dati
    shape(ctx, type, x0, y0, x1, y1, size, color, fill) {
        ctx.save();
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.lineWidth = size;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.globalAlpha = 1;
        ctx.beginPath();

        switch (type) {
            case 'line':
                ctx.moveTo(x0, y0);
                ctx.lineTo(x1, y1);
                ctx.stroke();
                break;

            case 'rect':
                if (fill) {
                    ctx.globalAlpha = 0.15;
                    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
                    ctx.globalAlpha = 1;
                }
                ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
                break;

            case 'circle': {
                const rx = Math.abs(x1 - x0) / 2;
                const ry = Math.abs(y1 - y0) / 2;
                const cx = (x0 + x1) / 2;
                const cy = (y0 + y1) / 2;
                ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
                if (fill) {
                    ctx.globalAlpha = 0.15;
                    ctx.fill();
                    ctx.globalAlpha = 1;
                }
                ctx.stroke();
                break;
            }

            case 'cerchio': {
                // Cerchio perfetto (icona compasso) — raggio = min(w,h)/2
                const w = Math.abs(x1 - x0);
                const h = Math.abs(y1 - y0);
                const r = Math.min(w, h) / 2;
                const cx = (x0 + x1) / 2;
                const cy = (y0 + y1) / 2;
                ctx.arc(cx, cy, r, 0, Math.PI * 2);
                if (fill) {
                    ctx.globalAlpha = 0.15;
                    ctx.fill();
                    ctx.globalAlpha = 1;
                }
                ctx.stroke();
                break;
            }

            case 'triangle': {
                const mx = (x0 + x1) / 2;
                ctx.moveTo(mx, y0);
                ctx.lineTo(x1, y1);
                ctx.lineTo(x0, y1);
                ctx.closePath();
                if (fill) {
                    ctx.globalAlpha = 0.15;
                    ctx.fill();
                    ctx.globalAlpha = 1;
                }
                ctx.stroke();
                break;
            }

            case 'arrow': {
                const dx = x1 - x0;
                const dy = y1 - y0;
                const len = Math.hypot(dx, dy);
                if (len === 0) break;
                const ux = dx / len;
                const uy = dy / len;
                const headLen = Math.min(30, len * 0.35);
                ctx.moveTo(x0, y0);
                ctx.lineTo(x1, y1);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(x1, y1);
                ctx.lineTo(x1 - headLen * (ux - uy * 0.4), y1 - headLen * (uy + ux * 0.4));
                ctx.moveTo(x1, y1);
                ctx.lineTo(x1 - headLen * (ux + uy * 0.4), y1 - headLen * (uy - ux * 0.4));
                ctx.stroke();
                break;
            }

            case 'star': {
                const cx2 = (x0 + x1) / 2;
                const cy2 = (y0 + y1) / 2;
                const outerR = Math.min(Math.abs(x1 - x0), Math.abs(y1 - y0)) / 2;
                const innerR = outerR * 0.4;
                for (let i = 0; i < 10; i++) {
                    const angle = (i * Math.PI) / 5 - Math.PI / 2;
                    const r = i % 2 === 0 ? outerR : innerR;
                    if (i === 0) {
                        ctx.moveTo(cx2 + r * Math.cos(angle), cy2 + r * Math.sin(angle));
                    } else {
                        ctx.lineTo(cx2 + r * Math.cos(angle), cy2 + r * Math.sin(angle));
                    }
                }
                ctx.closePath();
                if (fill) {
                    ctx.globalAlpha = 0.15;
                    ctx.fill();
                    ctx.globalAlpha = 1;
                }
                ctx.stroke();
                break;
            }

            // Feature 3 — Forme aggiuntive

            case 'diamond': {
                const dcx = (x0 + x1) / 2;
                const dcy = (y0 + y1) / 2;
                const dw = Math.abs(x1 - x0) / 2;
                const dh = Math.abs(y1 - y0) / 2;
                ctx.moveTo(dcx, dcy - dh);
                ctx.lineTo(dcx + dw, dcy);
                ctx.lineTo(dcx, dcy + dh);
                ctx.lineTo(dcx - dw, dcy);
                ctx.closePath();
                if (fill) { ctx.globalAlpha = 0.15; ctx.fill(); ctx.globalAlpha = 1; }
                ctx.stroke();
                break;
            }

            case 'pentagon': {
                const pcx = (x0 + x1) / 2;
                const pcy = (y0 + y1) / 2;
                const pr = Math.min(Math.abs(x1 - x0), Math.abs(y1 - y0)) / 2;
                this._polygon(ctx, pcx, pcy, pr, 5);
                if (fill) { ctx.globalAlpha = 0.15; ctx.fill(); ctx.globalAlpha = 1; }
                ctx.stroke();
                break;
            }

            case 'hexagon': {
                const hcx = (x0 + x1) / 2;
                const hcy = (y0 + y1) / 2;
                const hr = Math.min(Math.abs(x1 - x0), Math.abs(y1 - y0)) / 2;
                this._polygon(ctx, hcx, hcy, hr, 6, Math.PI / 6);
                if (fill) { ctx.globalAlpha = 0.15; ctx.fill(); ctx.globalAlpha = 1; }
                ctx.stroke();
                break;
            }

            case 'arrow-right': {
                // Freccia destra: corpo rettangolare + testa triangolare
                const arW = x1 - x0;
                const arH = y1 - y0;
                const ary = y0 + arH * 0.3;
                const arMidY = y0 + arH / 2;
                const aryB = y0 + arH * 0.7;
                const arTip = x1;
                const arBody = x0 + arW * 0.65;
                ctx.moveTo(x0, ary);
                ctx.lineTo(arBody, ary);
                ctx.lineTo(arBody, y0);
                ctx.lineTo(arTip, arMidY);
                ctx.lineTo(arBody, y1);
                ctx.lineTo(arBody, aryB);
                ctx.lineTo(x0, aryB);
                ctx.closePath();
                if (fill) { ctx.globalAlpha = 0.15; ctx.fill(); ctx.globalAlpha = 1; }
                ctx.stroke();
                break;
            }

            case 'double-arrow': {
                // Freccia doppia ← →
                const daW = x1 - x0;
                const daH = y1 - y0;
                const day = y0 + daH * 0.3;
                const daMidY = y0 + daH / 2;
                const dayB = y0 + daH * 0.7;
                const daHead = Math.abs(daW) * 0.2;
                const daBodyL = x0 + daHead;
                const daBodyR = x1 - daHead;
                ctx.moveTo(x0, daMidY);
                ctx.lineTo(daBodyL, y0);
                ctx.lineTo(daBodyL, day);
                ctx.lineTo(daBodyR, day);
                ctx.lineTo(daBodyR, y0);
                ctx.lineTo(x1, daMidY);
                ctx.lineTo(daBodyR, y1);
                ctx.lineTo(daBodyR, dayB);
                ctx.lineTo(daBodyL, dayB);
                ctx.lineTo(daBodyL, y1);
                ctx.closePath();
                if (fill) { ctx.globalAlpha = 0.15; ctx.fill(); ctx.globalAlpha = 1; }
                ctx.stroke();
                break;
            }

            case 'speech': {
                // Nuvoletta: rettangolo arrotondato + codino in basso a sinistra
                const sw = x1 - x0;
                const sh = y1 - y0;
                const sRadius = Math.min(Math.abs(sw), Math.abs(sh)) * 0.12;
                const tailH = Math.abs(sh) * 0.2;
                const bodyH = Math.abs(sh) - tailH;
                const sx0 = Math.min(x0, x1);
                const sy0 = Math.min(y0, y1);
                const sx1 = Math.max(x0, x1);
                const sy1 = Math.max(y0, y1);
                const sbH = (sy1 - sy0) - tailH;
                // Corpo arrotondato
                ctx.moveTo(sx0 + sRadius, sy0);
                ctx.lineTo(sx1 - sRadius, sy0);
                ctx.arcTo(sx1, sy0, sx1, sy0 + sRadius, sRadius);
                ctx.lineTo(sx1, sy0 + sbH - sRadius);
                ctx.arcTo(sx1, sy0 + sbH, sx1 - sRadius, sy0 + sbH, sRadius);
                // Codino
                ctx.lineTo(sx0 + (sx1 - sx0) * 0.35, sy0 + sbH);
                ctx.lineTo(sx0 + (sx1 - sx0) * 0.15, sy1);
                ctx.lineTo(sx0 + (sx1 - sx0) * 0.25, sy0 + sbH);
                ctx.lineTo(sx0 + sRadius, sy0 + sbH);
                ctx.arcTo(sx0, sy0 + sbH, sx0, sy0 + sbH - sRadius, sRadius);
                ctx.lineTo(sx0, sy0 + sRadius);
                ctx.arcTo(sx0, sy0, sx0 + sRadius, sy0, sRadius);
                ctx.closePath();
                if (fill) { ctx.globalAlpha = 0.15; ctx.fill(); ctx.globalAlpha = 1; }
                ctx.stroke();
                break;
            }

            case 'heart': {
                const hx = (x0 + x1) / 2;
                const hy = (y0 + y1) / 2;
                const hr2 = Math.min(Math.abs(x1 - x0), Math.abs(y1 - y0)) / 2;
                ctx.moveTo(hx, hy + hr2 * 0.3);
                ctx.bezierCurveTo(hx, hy - hr2 * 0.6, hx - hr2, hy - hr2 * 0.6, hx - hr2, hy);
                ctx.bezierCurveTo(hx - hr2, hy + hr2 * 0.6, hx, hy + hr2, hx, hy + hr2);
                ctx.bezierCurveTo(hx, hy + hr2, hx + hr2, hy + hr2 * 0.6, hx + hr2, hy);
                ctx.bezierCurveTo(hx + hr2, hy - hr2 * 0.6, hx, hy - hr2 * 0.6, hx, hy + hr2 * 0.3);
                ctx.closePath();
                if (fill) { ctx.globalAlpha = 0.15; ctx.fill(); ctx.globalAlpha = 1; }
                ctx.stroke();
                break;
            }

            case 'brace': {
                // Parentesi graffa aperta { (verticale, orientata a destra)
                const bcx = (x0 + x1) / 2;
                const bcy = (y0 + y1) / 2;
                const bh = Math.abs(y1 - y0) / 2;
                const bw = Math.abs(x1 - x0) * 0.3;
                const tip = bcx - Math.abs(x1 - x0) * 0.15;
                const right = Math.max(x0, x1);
                ctx.moveTo(right, y0);
                ctx.bezierCurveTo(right - bw, y0, tip, bcy - bh * 0.3, tip, bcy);
                ctx.bezierCurveTo(tip, bcy + bh * 0.3, right - bw, y1, right, y1);
                ctx.stroke();
                break;
            }
        }

        ctx.restore();
    }
}

// =============================================================================
// SEZIONE 4 — LaserManager
// Effetto laser rosso con trail che svanisce. Usa #overlay-canvas.
// =============================================================================

class LaserManager {
    constructor(overlayCanvas) {
        this.canvas = overlayCanvas;
        this.ctx = overlayCanvas.getContext('2d');
        this.points = []; // { x, y, t }
        this.animFrame = null;
        this.active = false;
    }

    addPoint(x, y) {
        this.points.push({ x, y, t: performance.now() });
        if (!this.animFrame) this._animate();
    }

    stop() {
        // Continua l'animazione finché i punti svaniscono da soli
    }

    _animate() {
        const now = performance.now();
        const lifetime = 700; // ms prima che un punto sparisca
        this.points = this.points.filter(p => now - p.t < lifetime);

        const ctx = this.ctx;
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        if (this.points.length === 0) {
            this.animFrame = null;
            return;
        }

        // Disegna cerchio rosso con glow sull'ultimo punto
        const last = this.points[this.points.length - 1];
        ctx.save();
        ctx.shadowColor = '#ff0000';
        ctx.shadowBlur = 24;
        ctx.fillStyle = '#ff3333';
        ctx.globalAlpha = 0.95;
        ctx.beginPath();
        ctx.arc(last.x, last.y, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 8;
        ctx.fillStyle = '#ffffff';
        ctx.globalAlpha = 0.8;
        ctx.beginPath();
        ctx.arc(last.x, last.y, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Disegna trail che svanisce
        if (this.points.length > 1) {
            for (let i = 0; i < this.points.length - 1; i++) {
                const p = this.points[i];
                const age = (now - p.t) / lifetime;
                const alpha = (1 - age) * 0.5;
                const r = 4 * (1 - age * 0.7);
                ctx.save();
                ctx.globalAlpha = alpha;
                ctx.fillStyle = '#ff4444';
                ctx.beginPath();
                ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }
        }

        this.animFrame = requestAnimationFrame(() => this._animate());
    }

    clear() {
        this.points = [];
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    resize(w, h) {
        this.canvas.width = w;
        this.canvas.height = h;
    }
}

// =============================================================================
// SEZIONE 5 — CanvasManager
// Gestisce draw-canvas, eventi mouse/touch, undo/redo.
// Dipende da: bgMgr, brush, laserMgr (globali); toolbarMgr, textMgr (globali post-init)
// =============================================================================

class CanvasManager {
    constructor(bgMgr, brush, laserMgr) {
        this.bgMgr = bgMgr;
        this.brush = brush;
        this.laser = laserMgr;

        this.canvas = document.getElementById('draw-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.overlayCanvas = document.getElementById('overlay-canvas');
        this.overlayCtx = this.overlayCanvas.getContext('2d');

        this.undoStack = [];
        this.redoStack = [];

        // Tracking vettoriale per gomma-tratto: parallelo a undoStack
        this._vectorStrokes = []; // null | {tool, color, size, points[]}
        this._currentPoints  = []; // punti del tratto in corso

        this._setupEvents();
        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    resize() {
        const vW = window.innerWidth;
        const headerH = document.body.classList.contains('fullscreen-mode') ? 0 : 56;
        const vH = window.innerHeight - headerH;

        const prevCanvasW = this.canvas.width;
        const prevCanvasH = this.canvas.height;
        const isFirstResize = prevCanvasW === 0;

        // Il canvas NON deve mai rimpicciolirsi: passare da fullscreen a normale
        // riduce vH di ~280px (56px header × 3), tagliando i disegni in basso.
        // Math.max garantisce che il contenuto non venga mai perso.
        const W = Math.max(vW * 3, prevCanvasW);
        const H = Math.max(vH * 3, prevCanvasH);

        const savedURL = prevCanvasW > 0 ? this.canvas.toDataURL() : null;
        const prevDx = (typeof panMgr !== 'undefined' && panMgr) ? panMgr.dx : 0;
        const prevDy = (typeof panMgr !== 'undefined' && panMgr) ? panMgr.dy : 0;

        this.canvas.width  = W; this.canvas.height  = H;
        this.canvas.style.width  = W + 'px'; this.canvas.style.height = H + 'px';
        this.overlayCanvas.width = W; this.overlayCanvas.height = H;
        this.overlayCanvas.style.width = W + 'px'; this.overlayCanvas.style.height = H + 'px';
        const bgCvs = document.getElementById('bg-canvas');
        if (bgCvs) { bgCvs.width = W; bgCvs.height = H;
                     bgCvs.style.width = W + 'px'; bgCvs.style.height = H + 'px'; }
        if (typeof objectLayer !== 'undefined' && objectLayer) {
            objectLayer.resize(W, H);
        } else {
            const objCvs = document.getElementById('objects-canvas');
            if (objCvs) { objCvs.width = W; objCvs.height = H;
                          objCvs.style.width = W + 'px'; objCvs.style.height = H + 'px'; }
        }
        this.bgMgr.resize(W, H);
        if (this.laser) this.laser.resize(W, H);

        if (savedURL) {
            const img = new Image();
            img.onload = () => this.ctx.drawImage(img, 0, 0);
            img.src = savedURL;
        }

        if (typeof panMgr !== 'undefined' && panMgr) {
            if (isFirstResize) {
                panMgr.centerView();
            } else {
                const ratioX = W / prevCanvasW;
                if (ratioX !== 1) {
                    // Canvas cresciuto: ricalcola tutto da zero invece di scalare dx
                    // (scalare dx proporzionalmente dà valori errati rispetto al foglio A4)
                    panMgr.centerView();
                } else {
                    panMgr.dx = prevDx;
                    panMgr.dy = prevDy;
                    panMgr._applyTransform();
                }
            }
        }
    }

    getCoords(e) {
        // Con Pointer Events API, clientX/clientY sono sempre disponibili
        // (mouse, touch e penna usano la stessa proprietà)
        const clientX = e.clientX;
        const clientY = e.clientY;
        if (typeof panMgr !== 'undefined' && panMgr) {
            return panMgr.getCanvasCoords(clientX, clientY);
        }
        // Fallback: senza panMgr usa il rect direttamente
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: (clientX - rect.left) / (rect.width / this.canvas.width),
            y: (clientY - rect.top) / (rect.height / this.canvas.height)
        };
    }

    _setupEvents() {
        // Usa overlay-canvas come surface di input (z-index più alto, gestisce tutti gli eventi)
        // draw-canvas rimane sotto, non intercetta
        const el = this.overlayCanvas;
        el.style.pointerEvents = 'auto'; // overlay riceve eventi
        this.canvas.style.pointerEvents = 'none'; // draw-canvas non riceve eventi diretti

        el.addEventListener('pointerdown', e => {
            e.preventDefault();
            if (e.pointerType === 'touch' && e.isPrimary === false) return;
            this._onStart(e);
        }, { passive: false });

        el.addEventListener('pointermove', e => {
            if (e.pointerType === 'touch' && e.isPrimary === false) return;
            const evts = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
            for (const ev of evts) this._onMove(ev);
        }, { passive: false });

        // Listener su document per catturare pointerup anche fuori dall'overlay
        // (senza setPointerCapture il browser non garantisce pointerup sull'elemento)
        const _onDocUp = (e) => {
            if (e.pointerType === 'touch' && e.isPrimary === false) return;
            this._onEnd(e);
        };

        const _onDocCancel = (e) => {
            CONFIG.isDrawing = false;
        };

        document.addEventListener('pointerup',     _onDocUp);
        document.addEventListener('pointercancel', _onDocCancel);
    }

    _onStart(e) {
        const { x, y } = this.getCoords(e);

        // Modalità gomma-tratto: premi e scorri per cancellare (stile OneNote)
        if (CONFIG.currentTool === 'eraser' && CONFIG.eraserMode === 'stroke') {
            this._erasingStrokes = true;
            const idx = this.findNearestStroke(x, y);
            if (idx >= 0) this.eraseStroke(idx);
            return;
        }

        CONFIG.isDrawing = true;

        // Auto-hide toolbar quando si inizia a disegnare
        toolbarMgr.hide();

        if (CONFIG.currentTool === 'select') {
            selectMgr?.onPointerDown(x, y);
            return;
        }
        if (CONFIG.currentTool === 'pan') {
            panMgr?.onPointerDown(e.clientX, e.clientY);
            CONFIG.isDrawing = true;
            return;
        }
        if (CONFIG.currentTool === 'laser') {
            this.laser.addPoint(x, y);
            return;
        }
        if (CONFIG.currentTool === 'text') {
            // Il TextManager gestisce i click sul canvas autonomamente via pointerdown
            CONFIG.isDrawing = false;
            return;
        }
        if (CONFIG.currentTool === 'shape') {
            CONFIG.shapeStartX = x;
            CONFIG.shapeStartY = y;
            return;
        }

        // Tutti gli altri strumenti: salva undo state all'inizio del tratto
        this._saveUndo();
        CONFIG.lastX = x;
        CONFIG.lastY = y;
        this._smoothMidX = x; // midpoint precedente per Bézier smoothing
        this._smoothMidY = y;
        this._currentPoints = [{x, y}]; // primo punto per tracking vettoriale

        // Disegna il punto iniziale (dot)
        if (CONFIG.currentTool === 'eraser') {
            this.brush.eraser(this.ctx, x, y, CONFIG.currentSize * 2);
        } else {
            this._drawSegment(x, y, x, y, x, y);
        }
    }

    _onMove(e) {
        // Gomma-tratto: se sto premendo → cancella subito; altrimenti → evidenzia hover
        if (CONFIG.currentTool === 'eraser' && CONFIG.eraserMode === 'stroke') {
            const { x, y } = this.getCoords(e);
            const idx = this.findNearestStroke(x, y);
            if (this._erasingStrokes) {
                if (idx >= 0 && !this._eraseInProgress) this.eraseStroke(idx);
            } else {
                this._highlightStroke(idx);
            }
            return;
        }
        // Cursor hint sugli handle selezione (funziona anche senza isDrawing, per mouse hover)
        if (CONFIG.currentTool === 'select' && !CONFIG.isDrawing) {
            const { x, y } = this.getCoords(e);
            selectMgr?.onPointerMove(x, y);
            return;
        }
        if (!CONFIG.isDrawing) return;
        const { x, y } = this.getCoords(e);

        if (CONFIG.currentTool === 'select') {
            selectMgr?.onPointerMove(x, y);
            return;
        }
        if (CONFIG.currentTool === 'pan') {
            panMgr?.onPointerMove(e.clientX, e.clientY);
            return;
        }
        if (CONFIG.currentTool === 'laser') {
            this.laser.addPoint(x, y);
            return;
        }
        if (CONFIG.currentTool === 'shape') {
            // Preview live sul livello overlay (leggero): nessuna copia pixel del canvas reale
            this.overlayCtx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
            this.brush.shape(
                this.overlayCtx,
                CONFIG.currentShape,
                CONFIG.shapeStartX, CONFIG.shapeStartY,
                x, y,
                CONFIG.currentSize,
                CONFIG.currentColor,
                CONFIG.shapeFill
            );
            return;
        }

        if (CONFIG.currentTool === 'eraser') {
            this.brush.eraser(this.ctx, x, y, CONFIG.currentSize * 2);
        } else {
            // Bézier smoothing: usa il midpoint come endpoint e il punto corrente come controllo
            // Questo elimina gli spigoli vivi tra segmenti su PC lenti (pochi eventi pointer)
            const midX = (CONFIG.lastX + x) / 2;
            const midY = (CONFIG.lastY + y) / 2;
            this._drawSegment(this._smoothMidX, this._smoothMidY, CONFIG.lastX, CONFIG.lastY, midX, midY);
            this._smoothMidX = midX;
            this._smoothMidY = midY;
        }

        this._currentPoints.push({x, y}); // raccolta punti per tracking vettoriale
        CONFIG.lastX = x;
        CONFIG.lastY = y;
    }

    _onEnd(e) {
        // Gomma-tratto: rilascia la modalità press-and-swipe
        if (CONFIG.currentTool === 'eraser' && CONFIG.eraserMode === 'stroke' && this._erasingStrokes) {
            this._erasingStrokes = false;
            this.overlayCtx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
            return;
        }
        if (!CONFIG.isDrawing) return;
        CONFIG.isDrawing = false;

        if (CONFIG.currentTool === 'select') {
            const { x, y } = this.getCoords(e);
            selectMgr?.onPointerUp(x, y);
            return;
        }
        if (CONFIG.currentTool === 'pan') {
            panMgr?.onPointerUp();
            CONFIG.isDrawing = false;
            return;
        }
        if (CONFIG.currentTool === 'laser') {
            this.laser.stop();
            return;
        }
        if (CONFIG.currentTool === 'shape') {
            // Preview era solo sull'overlay: ora disegna la forma definitiva una sola volta sul canvas reale
            const { x, y } = this.getCoords(e);
            this._saveUndo(true); // salva PRIMA di disegnare (stato corretto per l'undo), notifica dirty
            this.brush.shape(
                this.ctx,
                CONFIG.currentShape,
                CONFIG.shapeStartX, CONFIG.shapeStartY,
                x, y,
                CONFIG.currentSize,
                CONFIG.currentColor,
                CONFIG.shapeFill
            );
            this.overlayCtx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
            return;
        }

        // Fine tratto per strumenti di disegno (pen, pencil, pastel, marker, eraser):
        // salva dati vettoriali + notifica dirty
        if (CONFIG.drawTools.includes(CONFIG.currentTool)) {
            // Finalizza il vector stroke nell'ultimo slot di _vectorStrokes
            const lastIdx = this._vectorStrokes.length - 1;
            if (lastIdx >= 0 && this._currentPoints.length > 0) {
                this._vectorStrokes[lastIdx] = {
                    tool:   CONFIG.currentTool,
                    color:  CONFIG.currentColor,
                    size:   CONFIG.currentSize,
                    points: [...this._currentPoints],
                };
            }
            this._currentPoints = [];
            CONFIG.isDirty = true;
            window.autoSaveMgr?.onDirty();
        }
    }

    _drawSegment(x0, y0, cpX, cpY, x1, y1) {
        const tool  = CONFIG.currentTool;
        const color = CONFIG.currentColor;
        const size  = CONFIG.currentSize;

        switch (tool) {
            case 'pen':    this.brush.pen(this.ctx, x0, y0, cpX, cpY, x1, y1, size, color);    break;
            case 'pencil': this.brush.pencil(this.ctx, x0, y0, cpX, cpY, x1, y1, size, color); break;
            case 'pastel': this.brush.pastel(this.ctx, x0, y0, cpX, cpY, x1, y1, size, color); break;
            case 'marker': this.brush.marker(this.ctx, x0, y0, cpX, cpY, x1, y1, size, color); break;
        }
    }

    // Snapshot degli oggetti nel layer (riferimenti img stabili, nessuna serializzazione pesante)
    _snapshotObjects() {
        if (typeof objectLayer === 'undefined' || !objectLayer) return null;
        return objectLayer.objects.map(o => ({ ...o })); // shallow copy
    }

    _saveUndo(notifyDirty = false) {
        this.undoStack.push({ canvas: this.canvas.toDataURL(), objects: this._snapshotObjects() });
        this._vectorStrokes.push(null); // placeholder, aggiornato in _onEnd
        if (this.undoStack.length > CONFIG.maxUndo) {
            this.undoStack.shift();
            this._vectorStrokes.shift();
        }
        this.redoStack = [];
        this._currentPoints = [];
        if (notifyDirty) {
            CONFIG.isDirty = true;
            window.autoSaveMgr?.onDirty();
        }
    }

    _applyUndoEntry(entry) {
        // Retrocompatibilità: entry può essere stringa (vecchio formato) o {canvas, objects}
        const canvasUrl = (typeof entry === 'string') ? entry : entry.canvas;
        const objs      = (typeof entry === 'string') ? null  : entry.objects;
        this._loadURL(canvasUrl);
        if (objs !== null && objs !== undefined && typeof objectLayer !== 'undefined' && objectLayer) {
            objectLayer.objects = objs;
            objectLayer.render();
        }
    }

    undo() {
        if (this.undoStack.length === 0) return;
        this.redoStack.push({ canvas: this.canvas.toDataURL(), objects: this._snapshotObjects() });
        this._vectorStrokes.pop();
        this._applyUndoEntry(this.undoStack.pop());
    }

    redo() {
        if (this.redoStack.length === 0) return;
        this.undoStack.push({ canvas: this.canvas.toDataURL(), objects: this._snapshotObjects() });
        this._vectorStrokes.push(null);
        this._applyUndoEntry(this.redoStack.pop());
    }

    _loadURL(url) {
        const img = new Image();
        img.onload = () => {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            this.ctx.drawImage(img, 0, 0);
        };
        img.src = url;
    }

    _loadURLAsync(url) {
        return new Promise(resolve => {
            const img = new Image();
            img.onload = () => {
                this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
                this.ctx.drawImage(img, 0, 0);
                resolve();
            };
            img.src = url;
        });
    }

    // Cancella un tratto specifico per indice (modalità gomma-tratto)
    async eraseStroke(strokeIndex) {
        if (strokeIndex < 0 || strokeIndex >= this._vectorStrokes.length) return;
        if (this._eraseInProgress) return; // evita cancellazioni concorrenti
        this._eraseInProgress = true;

        try {
            // Nascondi hover highlight
            this.overlayCtx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);

            // Ripristina lo snapshot prima del tratto — undoStack può avere formato stringa o {canvas,objects}
            const entry = this.undoStack[strokeIndex];
            const canvasUrl = (typeof entry === 'string') ? entry : entry?.canvas;
            const objs      = (typeof entry === 'string') ? null  : entry?.objects;
            if (!canvasUrl) { this._eraseInProgress = false; return; }
            await this._loadURLAsync(canvasUrl);
            if (objs !== null && objs !== undefined && typeof objectLayer !== 'undefined' && objectLayer) {
                objectLayer.objects = objs;
                objectLayer.render();
            }

            // Ridisegna tutti i tratti successivi tramite dati vettoriali
            for (let i = strokeIndex + 1; i < this._vectorStrokes.length; i++) {
                const stroke = this._vectorStrokes[i];
                if (stroke) this._replayStroke(stroke);
            }

            // Rimuovi il tratto cancellato dagli stack
            this.undoStack.splice(strokeIndex, 1);
            this._vectorStrokes.splice(strokeIndex, 1);

            CONFIG.isDirty = true;
            window.autoSaveMgr?.onDirty();
        } finally {
            this._eraseInProgress = false;
        }
    }

    // Trova il tratto più vicino al punto (x,y) — ritorna l'indice in _vectorStrokes
    findNearestStroke(x, y, maxDist = 40) {
        let bestIdx = -1, bestDist = maxDist;
        for (let i = 0; i < this._vectorStrokes.length; i++) {
            const stroke = this._vectorStrokes[i];
            if (!stroke || !stroke.points || stroke.tool === 'eraser') continue;
            for (const pt of stroke.points) {
                const d = Math.hypot(pt.x - x, pt.y - y);
                if (d < bestDist) {
                    bestDist = d;
                    bestIdx = i;
                }
            }
        }
        return bestIdx;
    }

    // Ridisegna un tratto da dati vettoriali (usato dopo eraseStroke)
    _replayStroke(stroke) {
        const { tool, color, size, points } = stroke;
        if (!points || points.length === 0) return;

        if (tool === 'eraser') {
            for (const { x, y } of points) {
                this.brush.eraser(this.ctx, x, y, size * 2);
            }
            return;
        }
        // Dot iniziale
        this._drawSegmentWith(tool, color, size, points[0].x, points[0].y, points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
            this._drawSegmentWith(tool, color, size, points[i-1].x, points[i-1].y, points[i].x, points[i].y);
        }
    }

    // Come _drawSegment ma con parametri tool/color/size espliciti (per replay)
    _drawSegmentWith(tool, color, size, x0, y0, x1, y1) {
        switch (tool) {
            case 'pen':    this.brush.pen(this.ctx, x0, y0, x1, y1, size, color);    break;
            case 'pencil': this.brush.pencil(this.ctx, x0, y0, x1, y1, size, color); break;
            case 'pastel': this.brush.pastel(this.ctx, x0, y0, x1, y1, size, color); break;
            case 'marker': this.brush.marker(this.ctx, x0, y0, x1, y1, size, color); break;
        }
    }

    // Evidenzia il tratto sotto il cursore (overlay canvas rosso semitrasparente)
    _highlightStroke(strokeIdx) {
        this.overlayCtx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
        if (strokeIdx < 0) return;
        const stroke = this._vectorStrokes[strokeIdx];
        if (!stroke || !stroke.points || stroke.points.length === 0) return;

        this.overlayCtx.save();
        this.overlayCtx.strokeStyle = 'rgba(239,68,68,0.65)';
        this.overlayCtx.lineWidth = stroke.size + 10;
        this.overlayCtx.lineCap = 'round';
        this.overlayCtx.lineJoin = 'round';
        this.overlayCtx.beginPath();
        this.overlayCtx.moveTo(stroke.points[0].x, stroke.points[0].y);
        for (let i = 1; i < stroke.points.length; i++) {
            this.overlayCtx.lineTo(stroke.points[i].x, stroke.points[i].y);
        }
        this.overlayCtx.stroke();
        this.overlayCtx.restore();
    }

    clear() {
        this._saveUndo();
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.laser.clear();
    }

    exportPNG() {
        // Assicura che le righe/quadretti CSS siano sul canvas per l'export
        this.bgMgr.renderForCapture();
        const tmp = document.createElement('canvas');
        tmp.width  = this.canvas.width;
        tmp.height = this.canvas.height;
        const tCtx = tmp.getContext('2d');
        tCtx.drawImage(this.bgMgr.canvas, 0, 0);
        tCtx.drawImage(this.canvas, 0, 0);
        const url = tmp.toDataURL('image/png');
        const a = document.createElement('a');
        a.href = url;
        a.download = (CONFIG.projectName || 'eduboard') + '.png';
        a.click();
        // Ripristina bg-canvas trasparente dopo l'export
        this.bgMgr.render();
    }

    getDataURL() {
        return this.canvas.toDataURL();
    }
}

// =============================================================================
// SEZIONE 6 — ToolbarManager
// Gestisce la toolbar a scomparsa, la selezione strumenti, i pannelli opzioni.
// Dipende da: canvasMgr, bgMgr (globali post-init)
// =============================================================================

class ToolbarManager {
    constructor() {
        this.wrapper    = document.getElementById('toolbar-wrapper');
        this.toggleBtn     = document.getElementById('toolbar-toggle');
        this.toggleBtnOpen = document.getElementById('toolbar-toggle-open');
        this.optionsRow    = document.getElementById('tool-options-row');
        this.visible    = false;

        this._setupToggle();
        this._setupTools();
        this._setupColors();
        this._setupSizes();
        this._setupShapePanel();
        this._setupBgPanel();
        this._setupColorPalettePopup(); // Feature 2
        this._setupEraserMode();        // Gomma tratti

        // Mostra la riga opzioni subito (penna selezionata di default)
        this._updateOptionsRow();
        this._updateColorSwatches(CONFIG.currentTool);

        // Centra il menu nello spazio libero reale tra barra pagine (sx) e barra zoom/account (dx)
        window.addEventListener('resize', () => this._updateBounds());
        requestAnimationFrame(() => this._updateBounds());
    }

    // Misura lo spazio disponibile tra #page-bar e #bottom-right-bar e centra
    // #toolbar-wrapper esattamente in quello spazio — adattivo a qualsiasi
    // risoluzione e a qualsiasi numero di pagine (la page-bar cambia larghezza).
    // Se lo spazio non basta nemmeno per la toolbar "con etichette", passa in
    // modalità compatta (solo icone) invece di farla sbordare fuori dallo schermo.
    _updateBounds() {
        const pageBar  = document.getElementById('page-bar');
        const rightBar = document.getElementById('bottom-right-bar');
        const inner    = document.getElementById('floating-toolbar');
        if (!pageBar || !rightBar || !inner || !this.wrapper) return;
        const GAP = 16; // margine di sicurezza da ogni lato
        const leftEdge  = pageBar.getBoundingClientRect().right + GAP;
        const rightEdge = rightBar.getBoundingClientRect().left - GAP;
        const available = Math.max(rightEdge - leftEdge, 0);

        // Misura la larghezza naturale "con etichette" (rimuovendo temporaneamente
        // il limite corrente) per decidere se serve la modalità compatta
        const prevMaxWidth = this.wrapper.style.maxWidth;
        const wasCompact = this.wrapper.classList.contains('compact');
        this.wrapper.classList.remove('compact');
        this.wrapper.style.maxWidth = 'none';
        const naturalWidth = inner.scrollWidth;
        this.wrapper.style.maxWidth = prevMaxWidth;
        if (wasCompact) this.wrapper.classList.add('compact');
        this.wrapper.classList.toggle('compact', naturalWidth > available);

        if (available <= 150) return; // schermo troppo piccolo anche in compatta: resta sul fallback CSS centrato
        this.wrapper.style.left = (leftEdge + available / 2) + 'px';
        this.wrapper.style.maxWidth = Math.min(1200, available) + 'px';
    }

    show() {
        this.visible = true;
        this.wrapper.classList.add('visible');
        this.toggleBtn.querySelector('#toggle-arrow').style.transform = 'rotate(180deg)';
        this._updateOptionsRow();
        // Nascondi le mini-bar quando il menu grande è aperto (si sovrapporrebbero)
        document.dispatchEvent(new CustomEvent('toolbar:opened'));
    }

    hide() {
        this.visible = false;
        this.wrapper.classList.remove('visible');
        this.toggleBtn.querySelector('#toggle-arrow').style.transform = 'rotate(0deg)';
        this._closeAllPopups();
        this.optionsRow.style.display = 'none'; // nasconde esplicitamente la riga opzioni
        // Mostra le mini-bar quando il menu grande si chiude
        document.dispatchEvent(new CustomEvent('toolbar:closed'));
    }

    toggle() {
        if (this.visible) this.hide(); else this.show();
    }

    _setupToggle() {
        this.toggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggle();
        });
        // Freccia ∨ dentro toolbar-controls-row (visibile quando toolbar è aperta)
        this.toggleBtnOpen?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggle();
        });
    }

    _setupTools() {
        document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
            btn.addEventListener('click', () => {
                this._selectTool(btn.dataset.tool, btn);
            });
        });

        document.getElementById('btn-undo').addEventListener('click',  () => canvasMgr.undo());
        document.getElementById('btn-redo').addEventListener('click',  () => canvasMgr.redo());
        document.getElementById('btn-clear').addEventListener('click', () => {
            if (confirm('Cancellare tutto il disegno?')) canvasMgr.clear();
        });
    }

    _selectTool(tool, btn) {
        // Chiudi popup aperti
        this._closeAllPopups();

        if (tool === 'background') {
            selectMgr?.deactivate();
            this._togglePopup('bg-popup', btn);
            return;
        }
        if (tool === 'shape') {
            selectMgr?.deactivate();
            this._togglePopup('shape-popup', btn);
            CONFIG.currentTool = 'shape';
            this._updateActiveBtn(btn);
            this._updateOptionsRow();
            return;
        }
        if (tool === 'geo') {
            selectMgr?.deactivate();
            this._togglePopup('geo-popup', btn);
            this._updateActiveBtn(btn);
            return;
        }
        if (tool === 'upload-bg') {
            selectMgr?.deactivate();
            document.getElementById('file-bg-input').click();
            return;
        }
        if (tool === 'import-media') {
            selectMgr?.deactivate();
            document.getElementById('file-import-input').click();
            return;
        }
        if (tool === 'select') {
            CONFIG.currentTool = 'select';
            this._updateActiveBtn(btn);
            this._updateOptionsRow();
            this._updateCursor();
            selectMgr?.activate();
            panMgr?.deactivate();
            return;
        }
        if (tool === 'pan') {
            CONFIG.currentTool = 'pan';
            this._updateActiveBtn(btn);
            this._updateCursor();
            panMgr?.activate();
            selectMgr?.deactivate();
            return;
        }

        // Tutti gli altri strumenti: disattiva select e text
        selectMgr?.deactivate();
        panMgr?.deactivate();
        if (tool !== 'text' && typeof textMgr !== 'undefined') {
            textMgr.deactivate();
        }
        // Se si stava usando la gomma-tratto, pulisci l'highlight sull'overlay
        if (CONFIG.currentTool === 'eraser' && CONFIG.eraserMode === 'stroke' && window.canvasMgr) {
            canvasMgr.overlayCtx.clearRect(0, 0, canvasMgr.overlayCanvas.width, canvasMgr.overlayCanvas.height);
        }

        CONFIG.currentTool = tool;

        // Aggiorna icona dinamica nel quick strip per gli strumenti di scrittura
        const _QAB_SVGS = {
            pen:    '<path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>',
            pencil: '<path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>',
            pastel: '<path d="M9.06 11.9l8.07-8.06a2.85 2.85 0 1 1 4.03 4.03l-8.06 8.08"/><path d="M7.07 14.94c-1.66 0-3 1.35-3 3.02 0 1.33-2.5 1.52-2 2.02 1.08 1.1 2.49 2.02 4 2.02 2.2 0 4-1.8 4-4.04a3.01 3.01 0 0 0-3-3.02z"/>',
            marker: '<rect x="3" y="8" width="18" height="8" rx="3"/><path d="M21 12H3"/>'
        };
        const _QAB_NAMES = { pen:'Penna', pencil:'Matita', pastel:'Pastello', marker:'Evidenziatore' };
        if (_QAB_SVGS[tool]) {
            const dynBtn = document.getElementById('qab-writing-tool');
            if (dynBtn) {
                dynBtn.dataset.tool = tool;
                dynBtn.title = _QAB_NAMES[tool];
                const svg = dynBtn.querySelector('svg');
                if (svg) svg.innerHTML = _QAB_SVGS[tool];
            }
        }

        this._updateActiveBtn(btn);
        this._updateOptionsRow();
        this._updateCursor();

        // Attiva textMgr se strumento testo
        if (tool === 'text' && typeof textMgr !== 'undefined') {
            textMgr.activate();
        }

        // Feature 1: aggiorna palette colori in base allo strumento
        this._updateColorSwatches(tool);
    }

    _updateActiveBtn(activeBtn) {
        document.querySelectorAll('.tool-btn[data-tool]').forEach(b => b.classList.remove('active'));
        if (activeBtn) {
            // Marca attivi tutti i bottoni con lo stesso data-tool (toolbar principale + quick strip)
            const tool = activeBtn.dataset.tool;
            document.querySelectorAll(`.tool-btn[data-tool="${tool}"]`).forEach(b => b.classList.add('active'));
        }
    }

    _updateOptionsRow() {
        const tool = CONFIG.currentTool;
        const showOptions = ['pen', 'pencil', 'pastel', 'marker', 'eraser', 'shape', 'text'].includes(tool);
        // 'select', 'laser', 'geo', 'background', 'upload-bg' non mostrano la riga opzioni
        this.optionsRow.style.display = showOptions ? 'flex' : 'none';

        // Nascondi colori per strumenti che non ne hanno bisogno
        const showColors = !['eraser', 'laser'].includes(tool);
        document.getElementById('options-colors').style.display = showColors ? 'flex' : 'none';
        const divider = document.querySelector('.options-divider');
        if (divider) divider.style.display = showColors ? 'block' : 'none';

        // Modalità gomma (Area / Tratto) — visibile solo per lo strumento gomma
        const showEraserMode = (tool === 'eraser');
        const eraserModeBtns = document.getElementById('eraser-mode-btns');
        const eraserModeDivider = document.getElementById('eraser-mode-divider');
        if (eraserModeBtns) eraserModeBtns.style.display = showEraserMode ? 'flex' : 'none';
        if (eraserModeDivider) eraserModeDivider.style.display = showEraserMode ? 'block' : 'none';
    }

    _updateCursor() {
        // overlay-canvas è ora il layer di input (pointer-events: auto)
        const canvas = document.getElementById('overlay-canvas');
        const cursorMap = {
            pen:    'crosshair',
            pencil: 'crosshair',
            pastel: 'crosshair',
            marker: 'crosshair',
            eraser: 'cell',
            text:   'text',
            laser:  'none',
            shape:  'crosshair',
            select: 'crosshair',
            pan:    'grab',
            'import-media': 'default',
        };
        let cursor = cursorMap[CONFIG.currentTool] || 'default';
        // Modalità gomma-tratto: usa cursore puntatore per indicare "clicca per cancellare"
        if (CONFIG.currentTool === 'eraser' && CONFIG.eraserMode === 'stroke') cursor = 'pointer';
        if (canvas) canvas.style.cursor = cursor;
    }

    // Feature 1: aggiorna i color-swatch in base allo strumento
    _updateColorSwatches(tool) {
        const swatches = document.querySelectorAll('.color-swatch:not(#color-custom)');
        const colors = (tool === 'marker') ? MARKER_COLORS : DEFAULT_COLORS;

        swatches.forEach((btn, i) => {
            if (i < colors.length) {
                const c = colors[i];
                btn.dataset.color = c.color;
                btn.style.background = c.color;
                btn.title = c.title;
                // I placeholder bianchi del marker li rendiamo invisibili
                if (tool === 'marker' && i >= 8) {
                    btn.style.opacity = '0';
                    btn.style.pointerEvents = 'none';
                } else {
                    btn.style.opacity = '';
                    btn.style.pointerEvents = '';
                }
                // Bordo speciale per il bianco
                if (c.color === '#ffffff' && !(tool === 'marker' && i >= 8)) {
                    btn.style.border = '2px solid #64748b';
                } else if (tool !== 'marker' || i < 8) {
                    btn.style.border = '';
                }
            }
        });

        // Rimuovi active da tutti, imposta attivo sul primo
        document.querySelectorAll('.color-swatch').forEach(b => b.classList.remove('active'));
        if (swatches[0]) {
            swatches[0].classList.add('active');
            CONFIG.currentColor = colors[0].color;
            document.dispatchEvent(new CustomEvent('minicolor:update', { detail: { color: CONFIG.currentColor } }));
        }
    }

    _setupColors() {
        document.querySelectorAll('.color-swatch').forEach(btn => {
            if (btn.id === 'color-custom') return;
            btn.addEventListener('click', () => {
                CONFIG.currentColor = btn.dataset.color;
                document.querySelectorAll('.color-swatch').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                document.dispatchEvent(new CustomEvent('minicolor:update', { detail: { color: CONFIG.currentColor } }));
            });
        });

        // Feature 2: il pulsante "+" apre la tavolozza invece del picker diretto
        document.getElementById('color-custom').addEventListener('click', () => {
            this._togglePopup('color-palette-popup', document.getElementById('color-custom'));
        });

        document.getElementById('color-picker-input').addEventListener('input', (e) => {
            CONFIG.currentColor = e.target.value;
            const customBtn = document.getElementById('color-custom');
            customBtn.style.background = e.target.value;
            document.querySelectorAll('.color-swatch').forEach(b => b.classList.remove('active'));
            customBtn.classList.add('active');
            document.dispatchEvent(new CustomEvent('minicolor:update', { detail: { color: CONFIG.currentColor } }));
        });
    }

    // Feature 2: setup popup tavolozza 80 colori
    _setupColorPalettePopup() {
        const grid = document.getElementById('color-palette-grid');
        if (!grid) return;

        // Genera griglia 80 colori
        COLOR_PALETTE.forEach(color => {
            const btn = document.createElement('button');
            btn.style.background = color;
            btn.title = color;
            btn.addEventListener('click', () => {
                CONFIG.currentColor = color;
                const customBtn = document.getElementById('color-custom');
                customBtn.style.background = color;
                document.querySelectorAll('.color-swatch').forEach(b => b.classList.remove('active'));
                customBtn.classList.add('active');
                this._closeAllPopups();
                document.dispatchEvent(new CustomEvent('minicolor:update', { detail: { color } }));
            });
            grid.appendChild(btn);
        });

        // Pulsante colore personalizzato in fondo alla tavolozza
        document.getElementById('palette-custom-btn').addEventListener('click', () => {
            document.getElementById('color-picker-input').click();
            this._closeAllPopups();
        });
    }

    _setupEraserMode() {
        document.querySelectorAll('.eraser-mode-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                CONFIG.eraserMode = btn.dataset.mode;
                document.querySelectorAll('.eraser-mode-btn').forEach(b => b.classList.toggle('active', b === btn));
                this._updateCursor();
                // Pulisci eventuali highlight rimasti sull'overlay
                if (window.canvasMgr) {
                    canvasMgr.overlayCtx.clearRect(0, 0, canvasMgr.overlayCanvas.width, canvasMgr.overlayCanvas.height);
                }
            });
        });
    }

    _setupSizes() {
        document.querySelectorAll('.size-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                CONFIG.currentSize = parseInt(btn.dataset.size);
                document.querySelectorAll('.size-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });
    }

    _setupShapePanel() {
        document.querySelectorAll('.shape-opt').forEach(btn => {
            btn.addEventListener('click', () => {
                CONFIG.currentShape = btn.dataset.shape;
                document.querySelectorAll('.shape-opt').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this._closeAllPopups();
            });
        });

        document.getElementById('shape-fill-check').addEventListener('change', (e) => {
            CONFIG.shapeFill = e.target.checked;
        });
    }

    _setupBgPanel() {
        // Orientamento A4
        document.getElementById('bg-orient-landscape')?.addEventListener('click', () => {
            bgMgr.setOrientation('landscape');
            document.getElementById('bg-orient-landscape')?.classList.add('active');
            document.getElementById('bg-orient-portrait')?.classList.remove('active');
        });
        document.getElementById('bg-orient-portrait')?.addEventListener('click', () => {
            bgMgr.setOrientation('portrait');
            document.getElementById('bg-orient-portrait')?.classList.add('active');
            document.getElementById('bg-orient-landscape')?.classList.remove('active');
        });

        // Colore pagina — palette predefinita + fallback color picker nativo
        const PAGE_COLORS = [
            // Bianchi e crema
            '#ffffff', '#fffef5', '#fafaf8', '#f5f0e8',
            // Gialli e ambra
            '#fffde7', '#fff9c4', '#fff3cd', '#fdefc3',
            // Verdi chiari
            '#f1f8e9', '#e8f5e9', '#e0f2e9', '#d7f5e3',
            // Blu chiari
            '#e3f2fd', '#dbeafe', '#e0f0ff', '#e8eaf6',
            // Rosa e lilla
            '#fce4ec', '#fde8f0', '#f3e5f5', '#ede7f6',
            // Arancio e pesca
            '#fff3e0', '#fbe9e7', '#fef3ee', '#fdecea',
            // Toni medi
            '#eceff1', '#f5f5f5', '#eeeeee', '#e0e0e0',
            // Scuri
            '#90a4ae', '#546e7a', '#37474f', '#263238',
            '#1e293b', '#0f172a', '#1a1a2e', '#000000',
        ];

        const _applyPageColor = (color) => {
            bgMgr.setBgColor(color);
            const swatch = document.getElementById('bg-page-color-swatch');
            if (swatch) swatch.style.background = color;
            // Aggiorna anche il color picker nascosto per coerenza
            const picker = document.getElementById('bg-page-color');
            if (picker) picker.value = color;
        };

        // Popola la griglia colori
        const colorGrid = document.getElementById('bg-page-color-grid');
        if (colorGrid) {
            PAGE_COLORS.forEach(color => {
                const dot = document.createElement('button');
                dot.className = 'bg-page-color-dot';
                dot.style.background = color;
                dot.title = color;
                // Bordo scuro per i colori chiari (leggibilità)
                if (['#ffffff','#fffef5','#fafaf8','#f5f0e8','#fffde7','#fff9c4'].includes(color))
                    dot.style.border = '2px solid rgba(0,0,0,0.12)';
                dot.addEventListener('click', () => {
                    _applyPageColor(color);
                    colorGrid.querySelectorAll('.bg-page-color-dot').forEach(d => d.classList.remove('active'));
                    dot.classList.add('active');
                    document.getElementById('bg-page-color-popup').style.display = 'none';
                    CONFIG.isDirty = true;
                    window.autoSaveMgr?.onDirty();
                });
                colorGrid.appendChild(dot);
            });
        }

        // Apri/chiudi palette colori — posizionata vicino al bottone con JS
        document.getElementById('bg-page-color-btn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            const popup = document.getElementById('bg-page-color-popup');
            if (!popup) return;
            if (popup.style.display !== 'none') { popup.style.display = 'none'; return; }
            popup.style.display = 'block';
            // Posiziona sopra/accanto al bottone colore
            const btnRect = e.currentTarget.getBoundingClientRect();
            const popW = 220, popH = 240;
            let left = btnRect.left;
            let top  = btnRect.top - popH - 8;
            if (left + popW > window.innerWidth - 8) left = window.innerWidth - popW - 8;
            if (top < 60) top = btnRect.bottom + 8; // se non c'è spazio sopra, apri sotto
            popup.style.left = left + 'px';
            popup.style.top  = top  + 'px';
        });

        // Pulsante "Altro..." apre color picker nativo
        document.getElementById('bg-page-color-custom-btn')?.addEventListener('click', () => {
            document.getElementById('bg-page-color')?.click();
        });

        // Color picker nativo (fallback)
        document.getElementById('bg-page-color')?.addEventListener('input', (e) => {
            _applyPageColor(e.target.value);
            CONFIG.isDirty = true;
            window.autoSaveMgr?.onDirty();
        });

        // Chiudi mini-popup cliccando fuori
        document.addEventListener('click', (e) => {
            const popup = document.getElementById('bg-page-color-popup');
            if (!popup || popup.style.display === 'none') return;
            if (!e.target.closest('#bg-page-color-btn') && !e.target.closest('#bg-page-color-popup')) {
                popup.style.display = 'none';
            }
        });

        document.querySelectorAll('.bg-opt').forEach(btn => {
            btn.addEventListener('click', () => {
                bgMgr.setBackground(btn.dataset.bg);
                // Memorizza sfondo per la cartella corrente (se Drive connesso)
                if (typeof libraryMgr !== 'undefined' && libraryMgr?.currentFolderId) {
                    localStorage.setItem('folder-bg-' + libraryMgr.currentFolderId, btn.dataset.bg);
                }
                document.querySelectorAll('.bg-opt').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this._closeAllPopups();
                toast('Sfondo aggiornato');
            });
        });

        document.getElementById('file-bg-input').addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                const img = new Image();
                img.onload = () => {
                    bgMgr.setImage(img);
                    document.querySelectorAll('.bg-opt').forEach(b => b.classList.remove('active'));
                    toast('Immagine sfondo caricata');
                };
                img.src = ev.target.result;
            };
            reader.readAsDataURL(file);
            e.target.value = ''; // reset per consentire ri-selezione stessa immagine
        });

        // Import media (immagini/PDF) come oggetti sul canvas
        const importInput = document.getElementById('file-import-input');
        if (importInput) {
            importInput.addEventListener('change', async (e) => {
                const file = e.target.files[0];
                if (!file) return;
                if (file.type.startsWith('image/')) {
                    await importImageFile(file);
                } else if (file.type === 'application/pdf') {
                    await importPdfFile(file);
                }
                e.target.value = '';
            });
        }

        // Drag & Drop di file sul canvas-area
        const area = document.getElementById('canvas-area');
        if (area) {
            area.addEventListener('dragover', e => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'copy';
            });
            area.addEventListener('drop', async e => {
                e.preventDefault();
                const files = e.dataTransfer.files;
                if (!files.length) return;
                for (const file of files) {
                    if (file.type.startsWith('image/')) {
                        await importImageFile(file, e.clientX, e.clientY);
                    } else if (file.type === 'application/pdf') {
                        await importPdfFile(file, e.clientX, e.clientY);
                    }
                }
            });
        }
    }

    _togglePopup(id, triggerBtn) {
        const popup = document.getElementById(id);
        const isVisible = popup.style.display !== 'none';
        this._closeAllPopups();
        if (!isVisible) {
            popup.style.display = 'block';
            // Posiziona popup sopra la toolbar — non deborda sull'header
            const tbRect  = this.wrapper.getBoundingClientRect();
            const headerH = document.getElementById('app-header')?.offsetHeight || 56;
            const bottomOffset = window.innerHeight - tbRect.top + 12;
            const availableH   = tbRect.top - headerH - 12; // spazio tra header e toolbar
            popup.style.bottom    = bottomOffset + 'px';
            popup.style.maxHeight = Math.max(180, availableH) + 'px';
            // Se è il popup sfondi, carica le immagini da Drive
            if (id === 'bg-popup') {
                loadDriveBackgrounds();
            }
        }
    }

    _closeAllPopups() {
        ['shape-popup', 'bg-popup', 'color-palette-popup', 'geo-popup'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });
    }
}

// =============================================================================
// SEZIONE 7 — TextManager
// Gestisce l'input testo inline (no prompt!).
// Dipende da: canvasMgr (globale post-init)
// =============================================================================

class TextManager {
    constructor() {
        this.active     = false;
        this.editing    = false;
        this.fontFamily = 'Inter, sans-serif';
        this.fontSize   = 28;
        this.fontStyle  = '';        // '' | 'bold' | 'italic' | 'bold italic'
        this.underline  = false;
        this.color      = '#000000';

        this._buildToolbar();
        this._buildInput();
        this._setupCanvasListener();
    }

    // ── Toolbar contestuale testo ─────────────────────────────────────
    _buildToolbar() {
        // Crea un popup contestuale FISSO in cima alla toolbar (visibile quando text è attivo)
        const bar = document.createElement('div');
        bar.id        = 'text-toolbar';
        bar.className = 'text-toolbar';
        bar.innerHTML = `
            <select id="txt-font" title="Font">
                <option value="Inter, sans-serif">Inter</option>
                <option value="'Georgia', serif">Georgia</option>
                <option value="'Times New Roman', serif">Times New Roman</option>
                <option value="'Arial', sans-serif">Arial</option>
                <option value="'Courier New', monospace">Courier New</option>
                <option value="'Comic Sans MS', cursive">Comic Sans</option>
                <option value="'Verdana', sans-serif">Verdana</option>
                <option value="'Trebuchet MS', sans-serif">Trebuchet</option>
            </select>
            <select id="txt-size" title="Dimensione">
                ${[12,16,20,24,28,32,40,48,56,72].map(s =>
                    `<option value="${s}" ${s===28?'selected':''}>${s}px</option>`
                ).join('')}
            </select>
            <button id="txt-bold"      class="txt-btn" title="Grassetto (Ctrl+B)"><b>B</b></button>
            <button id="txt-italic"    class="txt-btn" title="Corsivo (Ctrl+I)"><i>I</i></button>
            <button id="txt-underline" class="txt-btn" title="Sottolineato (Ctrl+U)"><u>U</u></button>
            <div class="txt-sep"></div>
            <button id="txt-confirm" class="txt-btn txt-btn--primary" title="Conferma (Enter)">✓ OK</button>
            <button id="txt-cancel"  class="txt-btn" title="Annulla (Esc)">✕</button>
        `;
        bar.style.display = 'none';
        document.body.appendChild(bar);

        // Listeners
        document.getElementById('txt-font').addEventListener('change', e => {
            this.fontFamily = e.target.value;
            this._syncInputStyle();
        });
        document.getElementById('txt-size').addEventListener('change', e => {
            this.fontSize = parseInt(e.target.value);
            this._syncInputStyle();
        });
        document.getElementById('txt-bold').addEventListener('click', () => {
            this._toggleBold();
        });
        document.getElementById('txt-italic').addEventListener('click', () => {
            this._toggleItalic();
        });
        document.getElementById('txt-underline').addEventListener('click', () => {
            this.underline = !this.underline;
            document.getElementById('txt-underline').classList.toggle('txt-btn--active', this.underline);
            this._syncInputStyle();
        });
        document.getElementById('txt-confirm').addEventListener('click', () => this._commit());
        document.getElementById('txt-cancel').addEventListener('click',  () => this._cancel());
    }

    _toggleBold() {
        const hasBold = this.fontStyle.includes('bold');
        this.fontStyle = hasBold
            ? this.fontStyle.replace('bold', '').trim()
            : (this.fontStyle + ' bold').trim();
        document.getElementById('txt-bold').classList.toggle('txt-btn--active', !hasBold);
        this._syncInputStyle();
    }

    _toggleItalic() {
        const hasItalic = this.fontStyle.includes('italic');
        this.fontStyle = hasItalic
            ? this.fontStyle.replace('italic', '').trim()
            : (this.fontStyle + ' italic').trim();
        document.getElementById('txt-italic').classList.toggle('txt-btn--active', !hasItalic);
        this._syncInputStyle();
    }

    // ── Input box ─────────────────────────────────────────────────────
    _buildInput() {
        // Usa il div #text-cursor esistente
        this.inputEl = document.getElementById('text-cursor');
        if (!this.inputEl) {
            this.inputEl = document.createElement('div');
            this.inputEl.id = 'text-cursor';
            document.getElementById('canvas-area').appendChild(this.inputEl);
        }
        this.inputEl.contentEditable = 'false';
        this.inputEl.style.display   = 'none';

        // Tasti speciali nell'input
        this.inputEl.addEventListener('keydown', e => {
            if (e.key === 'Escape') { e.preventDefault(); this._cancel(); }
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this._commit(); }
            if (e.ctrlKey && e.key === 'b') { e.preventDefault(); this._toggleBold(); }
            if (e.ctrlKey && e.key === 'i') { e.preventDefault(); this._toggleItalic(); }
            if (e.ctrlKey && e.key === 'u') {
                e.preventDefault();
                this.underline = !this.underline;
                document.getElementById('txt-underline').classList.toggle('txt-btn--active', this.underline);
                this._syncInputStyle();
            }
        });
    }

    _syncInputStyle() {
        if (!this.inputEl) return;
        const style = `${this.fontStyle} ${this.fontSize}px ${this.fontFamily}`.trim();
        this.inputEl.style.font           = style;
        this.inputEl.style.textDecoration = this.underline ? 'underline' : '';
        this.inputEl.style.color          = this.color;
    }

    // ── Listener sul canvas ───────────────────────────────────────────
    _setupCanvasListener() {
        // Usa overlay-canvas come surface di input (è il layer più in alto con pointer-events)
        const inputCanvas = document.getElementById('overlay-canvas');
        inputCanvas.addEventListener('pointerdown', e => {
            if (CONFIG.currentTool !== 'text') return;
            if (this.editing) {
                // Se clicco fuori dall'input → commit
                const rect = this.inputEl.getBoundingClientRect();
                const inside = e.clientX >= rect.left && e.clientX <= rect.right &&
                               e.clientY >= rect.top  && e.clientY <= rect.bottom;
                if (!inside) this._commit();
                return;
            }
            e.preventDefault();
            e.stopPropagation();
            this._startEditing(e.clientX, e.clientY);
        });
    }

    _startEditing(clientX, clientY) {
        this.editing = true;
        this.color   = CONFIG.currentColor || '#000000';

        // Posiziona l'input nel canvas (coordinate locali del canvas-area, che ha transform scale)
        const canvasArea = document.getElementById('canvas-area');
        const areaRect   = canvasArea.getBoundingClientRect();
        const s = (typeof panMgr !== 'undefined' && panMgr) ? panMgr.scale : 1;
        const x = (clientX - areaRect.left) / s;
        const y = (clientY - areaRect.top) / s;

        this.inputEl.style.display  = 'block';
        this.inputEl.style.left     = x + 'px';
        this.inputEl.style.top      = y + 'px';
        this.inputEl.style.minWidth = '4px';
        this.inputEl.style.minHeight = (this.fontSize + 8) + 'px';
        this.inputEl.textContent    = '';
        this.inputEl.contentEditable = 'true';
        this._syncInputStyle();

        // Mostra toolbar testo
        document.getElementById('text-toolbar').style.display = 'flex';

        // Focus e cursore
        this.inputEl.focus();
        const range = document.createRange();
        range.selectNodeContents(this.inputEl);
        range.collapse(false);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
    }

    _commit() {
        if (!this.editing) return;
        const text = this.inputEl.textContent.trim();
        if (text) {
            this._renderTextToCanvas(text);
        }
        this._endEditing();
    }

    _cancel() {
        this._endEditing();
    }

    _endEditing() {
        this.editing = false;
        this.inputEl.contentEditable = 'false';
        this.inputEl.style.display   = 'none';
        this.inputEl.textContent     = '';
        document.getElementById('text-toolbar').style.display = 'none';
    }

    _renderTextToCanvas(text) {
        const drawCanvas = document.getElementById('draw-canvas');
        const ctx        = drawCanvas.getContext('2d');

        // Recupera posizione input relativa al canvas
        const canvasRect  = drawCanvas.getBoundingClientRect();
        const inputRect   = this.inputEl.getBoundingClientRect();
        const scaleX = drawCanvas.width  / canvasRect.width;
        const scaleY = drawCanvas.height / canvasRect.height;
        const x = (inputRect.left - canvasRect.left) * scaleX;
        const y = (inputRect.top  - canvasRect.top)  * scaleY + this.fontSize * scaleY;

        // Salva undo e notifica dirty (azione testo completata)
        if (typeof canvasMgr !== 'undefined') canvasMgr._saveUndo(true);

        ctx.save();
        const fontString = `${this.fontStyle} ${this.fontSize * scaleY}px ${this.fontFamily}`.trim();
        ctx.font          = fontString;
        ctx.fillStyle     = this.color;
        ctx.textBaseline  = 'alphabetic';

        // Testo multilinea
        const lines = text.split('\n');
        const lineH = this.fontSize * scaleY * 1.3;
        lines.forEach((line, i) => {
            ctx.fillText(line, x, y + i * lineH);
            if (this.underline) {
                const w = ctx.measureText(line).width;
                ctx.strokeStyle = this.color;
                ctx.lineWidth   = Math.max(1, this.fontSize * scaleY * 0.06);
                ctx.beginPath();
                ctx.moveTo(x, y + i * lineH + 2);
                ctx.lineTo(x + w, y + i * lineH + 2);
                ctx.stroke();
            }
        });
        ctx.restore();
    }

    activate()   { this.active = true; }
    deactivate() { this.active = false; if (this.editing) this._cancel(); }
}

// =============================================================================
// SEZIONE 8 — ProjectManager
// Salvataggio su LocalStorage ed esportazione.
// Dipende da: canvasMgr, bgMgr (globali post-init)
// =============================================================================

class ProjectManager {
    save() {
        const name = prompt('Nome progetto:', CONFIG.projectName) || CONFIG.projectName;
        CONFIG.projectName = name;
        document.getElementById('project-name').textContent = name;

        const data = {
            name,
            drawing: canvasMgr.getDataURL(),
            bg: CONFIG.currentBg,
            ts: Date.now()
        };
        const projects = JSON.parse(localStorage.getItem('eduboard-v2') || '{}');
        projects[name + '_' + Date.now()] = data;
        localStorage.setItem('eduboard-v2', JSON.stringify(projects));
        CONFIG.isDirty = false;
        window.autoSaveMgr?.reset();
        toast('Progetto salvato!', 'success');
    }

    saveQuiet() {
        const data = {
            name: CONFIG.projectName,
            drawing: canvasMgr.getDataURL(),
            bg: CONFIG.currentBg,
            ts: Date.now()
        };
        const projects = JSON.parse(localStorage.getItem('eduboard-v2') || '{}');
        projects[CONFIG.projectName + '_' + Date.now()] = data;
        localStorage.setItem('eduboard-v2', JSON.stringify(projects));
        CONFIG.isDirty = false;
        window.autoSaveMgr?.reset();
        toast('Progetto salvato!', 'success');
    }

    async newBoard() {
        // Se auto-save in corso, blocca
        if (window.autoSaveMgr?.isSaving()) {
            toast('Salvataggio automatico in corso — attendi un momento.', 'info');
            return;
        }
        // Se pending, flush immediato prima di procedere
        if (window.autoSaveMgr?.hasPending()) {
            clearTimeout(window.autoSaveMgr._timer);
            window.autoSaveMgr._timer = null;
            try { await window.libraryMgr?.overwriteCurrentLesson(); } catch (_) {}
            window.autoSaveMgr?._setError();
        } else if (CONFIG.isDirty) {
            const ok = await confirmIfDirty();
            if (!ok) return;
        }
        // Leggi preferenze utente salvate nelle Impostazioni
        const _prefs = (() => { try { return JSON.parse(localStorage.getItem('eduboard-prefs-v1') || '{}'); } catch(e) { return {}; } })();
        const defBg    = _prefs.defaultBg    || 'white';
        const defTool  = _prefs.defaultTool  || 'pen';
        const defColor = _prefs.defaultColor || '#000000';

        canvasMgr.clear();
        if (typeof objectLayer !== 'undefined' && objectLayer) objectLayer.clear();
        // FIX newBoard: reset PageManager → pagine vecchie non restano in memoria
        if (window.pageMgr) {
            window.pageMgr.pages = [{ drawImageData: null, objects: [], background: { type: defBg, color: '#ffffff', orientation: 'landscape' } }];
            window.pageMgr.currentIndex = 0;
            window.pageMgr._renderPageBar();
        }
        bgMgr.setBackground(defBg);
        CONFIG.projectName = 'Nuova Lavagna';
        CONFIG.isDirty = false;
        window.autoSaveMgr?.reset();
        if (typeof libraryMgr !== 'undefined' && libraryMgr) libraryMgr.currentFileId = null;
        document.getElementById('project-name').textContent = CONFIG.projectName;
        document.querySelectorAll('.bg-opt').forEach(b => b.classList.remove('active'));
        const defBgBtn = document.querySelector(`.bg-opt[data-bg="${defBg}"]`);
        if (defBgBtn) defBgBtn.classList.add('active');
        // Applica strumento e colore di default
        document.querySelector(`.tool-btn[data-tool="${defTool}"]`)?.click();
        CONFIG.currentColor = defColor;
        if (typeof brush !== 'undefined' && brush) brush.color = defColor;
        document.dispatchEvent(new CustomEvent('minicolor:update', { detail: { color: defColor } }));
    }
}

// =============================================================================
// SEZIONE 8b — Dialog "salva prima di continuare"
// =============================================================================

function confirmIfDirty() {
    return new Promise((resolve) => {
        if (!CONFIG.isDirty) { resolve(true); return; }

        const modal = document.getElementById('dirty-modal');
        if (!modal) { resolve(true); return; }

        // MODIFICA 5: mostra pulsanti Drive se c'è un file Drive aperto
        const btnOverwrite = document.getElementById('dirty-btn-overwrite');
        const btnSaveAs    = document.getElementById('dirty-btn-saveas');
        const btnSave      = document.getElementById('dirty-btn-save');
        const btnSkip      = document.getElementById('dirty-btn-skip');
        const btnCancel    = document.getElementById('dirty-btn-cancel');

        const hasDriveFile = typeof libraryMgr !== 'undefined' && libraryMgr?.currentFileId;
        if (btnOverwrite) btnOverwrite.style.display = hasDriveFile ? '' : 'none';
        if (btnSaveAs)    btnSaveAs.style.display    = hasDriveFile ? '' : 'none';
        if (btnSave)      btnSave.style.display      = hasDriveFile ? 'none' : '';

        modal.style.display = 'flex';

        function cleanup() {
            modal.style.display = 'none';
            if (btnOverwrite) btnOverwrite.removeEventListener('click', onOverwrite);
            if (btnSaveAs)    btnSaveAs.removeEventListener('click', onSaveAs);
            btnSave.removeEventListener('click', onSave);
            btnSkip.removeEventListener('click', onSkip);
            btnCancel.removeEventListener('click', onCancel);
        }

        async function onOverwrite() {
            cleanup();
            if (typeof libraryMgr !== 'undefined' && libraryMgr) {
                await libraryMgr.overwriteCurrentLesson();
            }
            resolve(true);
        }
        async function onSaveAs() {
            cleanup();
            if (typeof libraryMgr !== 'undefined' && libraryMgr) {
                await libraryMgr.saveCurrentLesson(libraryMgr.currentFolderId);
            }
            resolve(true);
        }
        function onSave() {
            cleanup();
            projectMgr.saveQuiet();
            resolve(true);
        }
        function onSkip() {
            cleanup();
            resolve(true);
        }
        function onCancel() {
            cleanup();
            resolve(false);
        }

        if (btnOverwrite) btnOverwrite.addEventListener('click', onOverwrite);
        if (btnSaveAs)    btnSaveAs.addEventListener('click', onSaveAs);
        btnSave.addEventListener('click', onSave);
        btnSkip.addEventListener('click', onSkip);
        btnCancel.addEventListener('click', onCancel);
    });
}

// =============================================================================
// SEZIONE 9 — Toast
// Funzione globale per notifiche temporanee a schermo.
// =============================================================================

function toast(msg, type = 'info') {
    const container = document.getElementById('toast-container');
    const el = document.createElement('div');
    el.className   = `toast ${type}`;
    el.textContent = msg;
    container.appendChild(el);
    setTimeout(() => el.remove(), 3200);
}

// =============================================================================
// SEZIONE 10 — PWAManager
// Gestisce registrazione Service Worker e banner aggiornamento.
// =============================================================================

class PWAManager {
    constructor() {
        if ('serviceWorker' in navigator && location.protocol === 'https:') {
            // Traccia se c'era già un SW attivo (= aggiornamento, non prima installazione)
            const hadController = !!navigator.serviceWorker.controller;

            navigator.serviceWorker.register('./sw.js').then(reg => {
                // Forza controllo aggiornamenti ad ogni apertura (bypassa cache HTTP di GitHub Pages)
                reg.update();
                navigator.serviceWorker.addEventListener('controllerchange', () => {
                    window.location.reload();
                });
            });

            // Riceve il messaggio UPDATE_AVAILABLE dal SW durante l'activate
            navigator.serviceWorker.addEventListener('message', (event) => {
                if (event.data?.type === 'UPDATE_AVAILABLE' && hadController) {
                    // Salva changelog in sessionStorage: verrà mostrato dopo il reload
                    sessionStorage.setItem('sw_pending_changelog', JSON.stringify({
                        version: event.data.version || '',
                        changelog: event.data.changelog || ''
                    }));
                }
            });
        }

        // Mostra il changelog se era stato salvato prima del reload
        const pendingRaw = sessionStorage.getItem('sw_pending_changelog');
        if (pendingRaw) {
            sessionStorage.removeItem('sw_pending_changelog');
            try {
                const { version, changelog } = JSON.parse(pendingRaw);
                this._showChangelog(version, changelog);
            } catch (_) {}
        }

        document.getElementById('update-btn')?.addEventListener('click', () => {
            navigator.serviceWorker.controller?.postMessage({ type: 'SKIP_WAITING' });
        });
        document.getElementById('dismiss-update')?.addEventListener('click', () => {
            document.getElementById('update-banner').style.display = 'none';
        });
    }

    _showChangelog(version, changelog) {
        const overlay = document.createElement('div');
        overlay.className = 'sw-changelog-overlay';
        const vLabel = version ? version.replace('eduboard-', '') : '';
        overlay.innerHTML = `
            <div class="sw-changelog-card">
                <div class="sw-changelog-icon">✨</div>
                <div class="sw-changelog-version">${vLabel ? 'Aggiornato a ' + vLabel : 'EduBoard aggiornato'}</div>
                <div class="sw-changelog-text">${changelog || 'Nuove funzionalità disponibili.'}</div>
                <div class="sw-changelog-bar"><div class="sw-changelog-progress"></div></div>
            </div>`;
        document.body.appendChild(overlay);
        // Auto-rimozione dopo 6 secondi
        const DURATION = 6000;
        overlay.querySelector('.sw-changelog-progress').style.animationDuration = DURATION + 'ms';
        const dismiss = () => {
            overlay.classList.add('sw-changelog-out');
            setTimeout(() => overlay.remove(), 400);
        };
        overlay.addEventListener('click', dismiss);
        setTimeout(dismiss, DURATION);
    }
}

// =============================================================================
// SEZIONE 11 — Keyboard shortcuts
// =============================================================================

function setupKeyboard() {
    document.addEventListener('keydown', (e) => {
        // Non interferire con l'input testo inline
        if (textMgr.editing) return;
        // Non interferire con il project-name in modifica
        if (document.getElementById('project-name').contentEditable === 'true') return;

        if (e.ctrlKey || e.metaKey) {
            if (e.key === 'z') {
                e.preventDefault();
                e.shiftKey ? canvasMgr.redo() : canvasMgr.undo();
            }
            if (e.key === 'y') {
                e.preventDefault();
                canvasMgr.redo();
            }
            if (e.key === 's') {
                e.preventDefault();
                projectMgr.save();
            }
            if (e.key === 'c' && CONFIG.currentTool === 'select') {
                e.preventDefault();
                selectMgr?._handleCtxAction('copy', null);
            }
            if (e.key === 'v' && CONFIG.currentTool === 'select') {
                e.preventDefault();
                selectMgr?._handleCtxAction('paste', null);
            }
            if (e.key === 'x' && CONFIG.currentTool === 'select') {
                e.preventDefault();
                selectMgr?._handleCtxAction('cut', null);
            }
        }

        if (!e.ctrlKey && !e.metaKey) {
            // Gestione tasti speciali per SelectManager (Escape, Delete, Backspace)
            selectMgr?.handleKeydown(e);

            // Scorciatoie strumenti:
            //   p=penna  m=matita  c=pastello  h=evidenziatore
            //   e=gomma  l=laser   t=testo     s=forme  a=seleziona
            const toolMap = {
                p: 'pen',
                m: 'pencil',
                c: 'pastel',
                h: 'marker',
                e: 'eraser',
                l: 'laser',
                t: 'text',
                s: 'shape',
                a: 'select',
                g: 'pan',
            };
            if (toolMap[e.key]) {
                const btn = document.querySelector(`.tool-btn[data-tool="${toolMap[e.key]}"]`);
                if (btn) btn.click();
            }
        }
    });
}

// =============================================================================
// SEZIONE 12 — Feature 5: Fullscreen API (con header nascosto)
// =============================================================================

function setupFullscreen() {
    const btnFs    = document.getElementById('btn-fullscreen');
    const btnExit  = document.getElementById('btn-exit-fullscreen');
    const icon     = document.getElementById('fullscreen-icon');
    const label    = document.getElementById('fullscreen-label');

    function enterFs() {
        const el = document.documentElement;
        if (el.requestFullscreen)            el.requestFullscreen();
        else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
        else if (el.mozRequestFullScreen)    el.mozRequestFullScreen();
    }

    function exitFs() {
        if (document.exitFullscreen)            document.exitFullscreen();
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
        else if (document.mozCancelFullScreen)  document.mozCancelFullScreen();
    }

    function isFullscreen() {
        return !!(document.fullscreenElement ||
                  document.webkitFullscreenElement ||
                  document.mozFullScreenElement);
    }

    function applyFullscreenUI(active) {
        const header     = document.getElementById('app-header');
        const canvasArea = document.getElementById('canvas-area');
        if (active) {
            document.body.classList.add('fullscreen-mode');
            if (header) header.style.display = 'none';
            if (btnExit) btnExit.style.display = 'flex';
            if (icon)    icon.innerHTML = '<path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/>';
            if (label)   label.textContent = 'Riduci';
            // Modalità compatta: chiudi la toolbar automaticamente in fullscreen
            // La linguetta (toggle) rimane visibile per riaprirla al bisogno
            if (typeof toolbarMgr !== 'undefined' && toolbarMgr?.visible) {
                toolbarMgr.hide();
            }
        } else {
            document.body.classList.remove('fullscreen-mode');
            if (header) header.style.display = '';
            if (btnExit) btnExit.style.display = 'none';
            if (icon)    icon.innerHTML = '<path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>';
            if (label)   label.textContent = 'Espandi';
        }
        // Ridisegna il canvas con le nuove dimensioni
        setTimeout(() => canvasMgr?.resize(), 0);
    }

    if (btnFs) btnFs.addEventListener('click', () => {
        if (isFullscreen()) {
            exitFs();
            applyFullscreenUI(false);
        } else {
            enterFs();
            applyFullscreenUI(true);
        }
    });
    if (btnExit) btnExit.addEventListener('click', () => {
        exitFs();
        applyFullscreenUI(false);
    });

    // Tasto F11 (intercept + fullscreen API)
    document.addEventListener('keydown', e => {
        if (e.key === 'F11') { e.preventDefault(); isFullscreen() ? exitFs() : enterFs(); }
    });

    // Ascolta cambiamenti fullscreen (es. utente preme Esc)
    ['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange'].forEach(ev => {
        document.addEventListener(ev, () => {
            applyFullscreenUI(isFullscreen());
            // Ridisegna il canvas dopo il resize
            setTimeout(() => { if (typeof canvasMgr !== 'undefined') canvasMgr.resize(); }, 100);
        });
    });
}

// =============================================================================
// SEZIONE 12b — Linguette libreria laterali (RIMOSSE — ora usa .library-tab fixed in CSS)
// =============================================================================
// setupLibraryTabs() rimossa: le vecchie #lib-tab-left/right sono state eliminate.
// La nuova #library-tab (position:fixed) è sempre visibile e gestita in drive.js.

/** Sincronizza le frecce e l'highlight di entrambi i tab libreria. */
function _updateLibraryTabArrow(panel) { _syncLibraryTabArrows(panel); }
function _syncLibraryTabArrows(panel) {
    if (!panel) return;
    const open     = panel.classList.contains('open');
    const curSide  = panel.dataset.side || 'left';

    // Tab sinistro: aperto da sinistra → freccia sx (chiudi); altrimenti → freccia dx (apri)
    const arrowL = document.getElementById('library-tab-arrow-left');
    if (arrowL) arrowL.setAttribute('points',
        (open && curSide === 'left') ? '15 18 9 12 15 6' : '9 18 15 12 9 6');

    // Tab destro: aperto da destra → freccia dx (chiudi); altrimenti → freccia sx (apri)
    const arrowR = document.getElementById('library-tab-arrow-right');
    if (arrowR) arrowR.setAttribute('points',
        (open && curSide === 'right') ? '9 18 15 12 9 6' : '15 18 9 12 15 6');

    // Highlight tab attivo
    document.getElementById('library-tab-left') ?.classList.toggle('active', open && curSide === 'left');
    document.getElementById('library-tab-right')?.classList.toggle('active', open && curSide === 'right');
}

function openLibraryFrom(side) {
    const panel = document.getElementById('library-panel');
    if (!panel) return;

    const isOpen = panel.classList.contains('open');
    const currentSide = panel.dataset.side || 'left';

    if (isOpen && currentSide === side) {
        // Chiudi
        panel.classList.remove('open');
        document.getElementById(`lib-tab-${side}`)?.classList.remove('lib-tab--active');
        _updateLibraryTabArrow(panel);
        return;
    }

    // Aggiorna lato
    panel.dataset.side = side;
    if (side === 'right') {
        panel.classList.add('from-right');
    } else {
        panel.classList.remove('from-right');
    }

    // Chiudi tab opposta
    const otherSide = side === 'left' ? 'right' : 'left';
    document.getElementById(`lib-tab-${otherSide}`)?.classList.remove('lib-tab--active');
    document.getElementById(`lib-tab-${side}`)?.classList.add('lib-tab--active');

    panel.classList.add('open');
    _updateLibraryTabArrow(panel);
    if (typeof libraryMgr !== 'undefined' && libraryMgr) {
        libraryMgr.refresh();
    }
}

// =============================================================================
// SEZIONE 13 — Feature 6: Nome lezione modificabile
// =============================================================================

function setupProjectName() {
    const badge = document.getElementById('project-name');
    badge.title = 'Click per rinominare';
    badge.style.cursor = 'text';

    function startEdit() {
        if (badge.contentEditable === 'true') return;
        badge.contentEditable = 'true';
        badge.classList.add('editing');
        badge.focus();
        const range = document.createRange();
        range.selectNodeContents(badge);
        window.getSelection().removeAllRanges();
        window.getSelection().addRange(range);
    }

    async function commitEdit() {
        if (badge.contentEditable !== 'true') return;
        badge.contentEditable = 'false';
        badge.classList.remove('editing');
        const newName = badge.textContent.trim() || CONFIG.projectName;
        badge.textContent = newName;

        if (newName === CONFIG.projectName) return; // nessuna modifica
        const oldName = CONFIG.projectName;
        CONFIG.projectName = newName;

        // Se c'è un file Drive aperto, rinomina anche lì
        const fileId = window.libraryMgr?.currentFileId;
        if (fileId && window.libraryMgr?.drive?.isConnected?.()) {
            try {
                await window.libraryMgr.drive.renameItem(fileId, newName);
                window.libraryMgr.refresh(); // aggiorna l'albero
                toast('Rinominato!', 'success');
            } catch (err) {
                toast('Errore rinomina Drive: ' + err.message, 'error');
                CONFIG.projectName = oldName;
                badge.textContent = oldName;
            }
        }
    }

    badge.addEventListener('click', startEdit);

    badge.addEventListener('blur', commitEdit);

    badge.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); badge.blur(); }
        if (e.key === 'Escape') {
            badge.textContent = CONFIG.projectName;
            badge.contentEditable = 'false';
            badge.classList.remove('editing');
        }
    });
}

// =============================================================================
// SEZIONE 13a — PanManager
// Strumento mano: trascina per scorrere la lavagna + zoom con scroll/pinch
// =============================================================================

class PanManager {
    constructor() {
        this.active = false;
        this.dx = 0;
        this.dy = 0;
        this.scale = 1;
        this._drag = { on: false, startX: 0, startY: 0, origDx: 0, origDy: 0 };
        this._pinch = { active: false, initialDist: 0, initialScale: 1 };
        this._zoomIndicatorTimer = null;
        this._setupScrollZoom();
        this._setupPinchZoom();
        this._setupZoomBadge();
    }

    activate() {
        this.active = true;
        this._setCursor('grab');
    }

    deactivate() {
        this.active = false;
        this._setCursor('crosshair');
    }

    onPointerDown(clientX, clientY) {
        this._drag = { on: true, startX: clientX, startY: clientY, origDx: this.dx, origDy: this.dy };
        this._setCursor('grabbing');
    }

    onPointerMove(clientX, clientY) {
        if (!this._drag.on) return;
        this.dx = this._drag.origDx + (clientX - this._drag.startX);
        this.dy = this._drag.origDy + (clientY - this._drag.startY);
        this._applyTransform();
    }

    onPointerUp() {
        this._drag.on = false;
        this._setCursor('grab');
    }

    resetPan() {
        this.dx = 0;
        this.dy = 0;
        this.scale = 1;
        this._applyTransform();
    }

    // 100% = foglio largo quanto la viewport (con 20px di margine per lato).
    // Usa la larghezza reale del foglio A4 (landscape: W*0.9, portrait: W*0.55).
    _computeFitScale() {
        const vW = window.innerWidth;
        const canvas = document.getElementById('draw-canvas');
        if (!canvas || canvas.width === 0) return 1 / (3 * 0.9);
        const W = canvas.width;
        const H = canvas.height;
        const { pw } = (typeof bgMgr !== 'undefined' && bgMgr)
            ? bgMgr._getPageRect(W, H)
            : { pw: Math.round(W * 0.9) };
        return (vW - 40) * 0.80 / pw; // 80% → margine visibile reale intorno alla pagina (non solo body CSS)
    }

    centerView() {
        const canvas = document.getElementById('draw-canvas');
        if (!canvas || canvas.width === 0) return;
        const vW = window.innerWidth;
        const headerH = document.body.classList.contains('fullscreen-mode') ? 0 : 56;

        // Reimposta sempre scale = fitScale (100%) — garantisce zoom corretto
        // all'apertura lezione indipendentemente dallo scale precedente
        this.scale = this._computeFitScale();

        // Calcola posizione pagina (py = MARGIN = W*0.04, costante)
        const W = canvas.width;
        const MARGIN = Math.round(W * 0.04);
        const SCREEN_MARGIN = 20; // pixel dal bordo schermo

        // Orizzontale: centra il canvas (la pagina finisce quasi al bordo destro)
        this.dx = (vW - canvas.width * this.scale) / 2;
        // Verticale: top della pagina a SCREEN_MARGIN px dal bordo superiore (NON centrare)
        this.dy = SCREEN_MARGIN - MARGIN * this.scale;

        this._applyTransform();
        const badge = document.getElementById('zoom-display') || document.getElementById('zoom-badge');
        if (badge && !badge._editing) {
            badge.textContent = '100%';
        }
    }

    // Converte coordinate client in coordinate canvas (tenendo conto di pan+zoom)
    getCanvasCoords(clientX, clientY) {
        const area = document.getElementById('canvas-area');
        const rect = area.getBoundingClientRect();
        return {
            x: (clientX - rect.left) / this.scale,
            y: (clientY - rect.top) / this.scale
        };
    }

    _setupScrollZoom() {
        const area = document.getElementById('canvas-area');
        if (!area) return;
        area.addEventListener('wheel', (e) => {
            e.preventDefault();
            const oldScale = this.scale;
            const factor = e.deltaY < 0 ? 1.08 : 0.92;
            const newScale = Math.max(0.2, Math.min(4, oldScale * factor));

            // Zoom centrato sul centro del viewport (più stabile del cursore)
            const vw = window.innerWidth;
            const headerH = document.body.classList.contains('fullscreen-mode') ? 0 : 56;
            const vh = window.innerHeight - headerH;
            const pivotX = vw / 2;
            const pivotY = vh / 2;

            this.dx = pivotX - (pivotX - this.dx) * (newScale / oldScale);
            this.dy = pivotY - (pivotY - this.dy) * (newScale / oldScale);
            this.scale = newScale;
            this._applyTransform();
            this._showZoomIndicator();
        }, { passive: false });
    }

    _setupPinchZoom() {
        // Ascolta su document per catturare pinch da qualsiasi elemento
        document.addEventListener('touchstart', (e) => {
            if (e.touches.length === 2) {
                // Se lo Spotlight è attivo, lascia che gestisca lui il 2-dita (pinch focus)
                if (typeof spotlightTool !== 'undefined' && spotlightTool?.visible) return;
                // Controlla che il pinch sia dentro l'area della lavagna
                const area = document.getElementById('canvas-area');
                if (!area) return;
                e.preventDefault();
                const t1 = e.touches[0], t2 = e.touches[1];
                this._pinch = {
                    active: true,
                    initialDist: Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY),
                    initialScale: this.scale,
                    initialDx: this.dx,
                    initialDy: this.dy,
                    midX: (t1.clientX + t2.clientX) / 2,
                    midY: (t1.clientY + t2.clientY) / 2
                };
            }
        }, { passive: false });

        document.addEventListener('touchmove', (e) => {
            if (this._pinch.active && e.touches.length === 2) {
                e.preventDefault();
                const t1 = e.touches[0], t2 = e.touches[1];
                const newDist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
                const newScale = Math.max(0.2, Math.min(4,
                    this._pinch.initialScale * (newDist / this._pinch.initialDist)));

                // Nuovo midpoint (per il pan insieme allo zoom)
                const newMidX = (t1.clientX + t2.clientX) / 2;
                const newMidY = (t1.clientY + t2.clientY) / 2;
                const pivotX = this._pinch.midX;
                const pivotY = this._pinch.midY;

                // Zoom centrato sul midpoint iniziale + pan del midpoint corrente
                this.dx = pivotX - (pivotX - this._pinch.initialDx) * (newScale / this._pinch.initialScale) + (newMidX - pivotX);
                this.dy = pivotY - (pivotY - this._pinch.initialDy) * (newScale / this._pinch.initialScale) + (newMidY - pivotY);
                this.scale = newScale;
                this._applyTransform();
                this._showZoomIndicator();
            }
        }, { passive: false });

        document.addEventListener('touchend', (e) => {
            if (e.touches.length < 2) {
                this._pinch.active = false;
            }
        });
    }

    _applyTransform() {
        // Applica la transform CSS a #canvas-area (container di tutti i canvas)
        const area = document.getElementById('canvas-area');
        if (area) {
            area.style.transform = `translate(${this.dx}px, ${this.dy}px) scale(${this.scale})`;
            area.style.transformOrigin = '0 0';
        }
        // Sincronizza il pattern CSS del body con pan+zoom (sfondo infinito)
        if (typeof bgMgr !== 'undefined' && bgMgr) {
            bgMgr.refreshBodyPattern(this.dx, this.dy, this.scale);
        }
    }

    _showZoomIndicator() {
        const fitScale = this._computeFitScale();
        const pct = fitScale > 0 ? Math.round(this.scale / fitScale * 100) + '%' : Math.round(this.scale * 100) + '%';
        // Aggiorna il display zoom nella barra basso destra
        const badge = document.getElementById('zoom-display') || document.getElementById('zoom-badge');
        if (badge && !badge._editing) badge.textContent = pct;
        // Indicatore temporaneo (fade-out dopo 1.5s)
        let indicator = document.getElementById('zoom-indicator');
        if (!indicator) {
            indicator = document.createElement('div');
            indicator.id = 'zoom-indicator';
            document.body.appendChild(indicator);
        }
        indicator.textContent = pct;
        indicator.classList.add('visible');
        clearTimeout(this._zoomIndicatorTimer);
        this._zoomIndicatorTimer = setTimeout(() => {
            indicator.classList.remove('visible');
        }, 1500);
    }

    _setupZoomBadge() {
        const init = () => {
            const badge = document.getElementById('zoom-display') || document.getElementById('zoom-badge');
            if (!badge) return;

            const showPopup = () => {
                if (badge._editing) return;
                badge._editing = true;

                const fitScaleNow = this._computeFitScale();
                const currentPct = fitScaleNow > 0
                    ? Math.round(this.scale / fitScaleNow * 100)
                    : Math.round(this.scale * 100);

                // Crea popup sopra il badge
                const popup = document.createElement('div');
                popup.id = 'zoom-popup';
                popup.innerHTML = `
                    <input id="zoom-input" type="text" inputmode="numeric"
                        value="${currentPct}" maxlength="4" autocomplete="off">
                    <span class="zoom-popup-pct">%</span>
                    <button id="zoom-reset-btn" title="Adatta alla larghezza">100%</button>
                `;
                document.body.appendChild(popup);

                const inp = popup.querySelector('#zoom-input');
                const resetBtn = popup.querySelector('#zoom-reset-btn');

                inp.focus();
                inp.select();

                const applyZoom = (val) => {
                    if (!isNaN(val) && val >= 5 && val <= 500) {
                        const fitScale = this._computeFitScale();
                        this.scale = (val / 100) * fitScale;
                        const cvs = document.getElementById('draw-canvas');
                        if (cvs) {
                            const vW2 = window.innerWidth;
                            const headerH2 = document.body.classList.contains('fullscreen-mode') ? 0 : 56;
                            const vH2 = window.innerHeight - headerH2;
                            this.dx = (vW2 - cvs.width * this.scale) / 2;
                            const W2 = cvs.width;
                            const MARGIN2 = Math.round(W2 * 0.04);
                            this.dy = 20 - MARGIN2 * this.scale;
                        }
                        this._applyTransform();
                    }
                };

                const closePopup = () => {
                    if (popup._closed) return;  // già chiuso (es. da resetBtn)
                    popup._closed = true;
                    const val = parseInt(inp.value, 10);
                    applyZoom(val);
                    const fitScale2 = this._computeFitScale();
                    badge.textContent = Math.round(this.scale / fitScale2 * 100) + '%';
                    badge._editing = false;
                    popup.remove();
                };

                resetBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    popup._closed = true;  // blocca outsideClick/blur dal riapplicare il vecchio zoom
                    this.scale = this._computeFitScale();
                    this.centerView();
                    badge._editing = false;
                    popup.remove();
                });

                inp.addEventListener('blur', (e) => {
                    // Evita chiusura se si clicca il pulsante reset
                    setTimeout(() => {
                        if (!popup._closed && document.getElementById('zoom-popup')) closePopup();
                    }, 150);
                });

                inp.addEventListener('keydown', e => {
                    if (e.key === 'Enter') { e.preventDefault(); closePopup(); }
                    if (e.key === 'Escape') {
                        popup._closed = true;
                        badge._editing = false;
                        const fitScale2 = this._computeFitScale();
                        badge.textContent = Math.round(this.scale / fitScale2 * 100) + '%';
                        popup.remove();
                    }
                });

                inp.addEventListener('wheel', e => e.stopPropagation());

                // Chiudi popup se si clicca fuori
                setTimeout(() => {
                    document.addEventListener('pointerdown', function outsideClick(e) {
                        if (!popup.contains(e.target) && e.target !== badge) {
                            if (!popup._closed) closePopup();  // non riapplicare se già chiuso da resetBtn
                            document.removeEventListener('pointerdown', outsideClick);
                        }
                    });
                }, 100);
            };

            badge.addEventListener('click', showPopup);
        };

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', init);
        } else {
            init();
        }
    }

    _setCursor(cursor) {
        const el = document.getElementById('overlay-canvas');
        if (el) el.style.cursor = cursor;
    }

    zoomIn() {
        const newScale = this.scale * 1.25;
        const maxScale = this._computeFitScale() * 5;
        this.scale = Math.min(newScale, maxScale);
        const vW = window.innerWidth;
        const headerH = document.body.classList.contains('fullscreen-mode') ? 0 : 56;
        const vH = window.innerHeight - headerH;
        const cvs = document.getElementById('draw-canvas');
        if (cvs) {
            this.dx = (vW - cvs.width * this.scale) / 2;
            const W = cvs.width;
            const MARGIN = Math.round(W * 0.04);
            this.dy = 20 - MARGIN * this.scale;
        }
        this._applyTransform();
        this._showZoomIndicator();
    }

    zoomOut() {
        const newScale = this.scale * 0.8;
        const minScale = this._computeFitScale() * 0.1;
        this.scale = Math.max(newScale, minScale);
        const vW = window.innerWidth;
        const headerH = document.body.classList.contains('fullscreen-mode') ? 0 : 56;
        const vH = window.innerHeight - headerH;
        const cvs = document.getElementById('draw-canvas');
        if (cvs) {
            this.dx = (vW - cvs.width * this.scale) / 2;
            const W = cvs.width;
            const MARGIN = Math.round(W * 0.04);
            this.dy = 20 - MARGIN * this.scale;
        }
        this._applyTransform();
        this._showZoomIndicator();
    }
}

// =============================================================================
// SEZIONE 13b — SelectManager
// Strumento freccia/dito: selezione rettangolare e spostamento
// =============================================================================

class SelectManager {
    constructor(drawCanvas, bgCanvas) {
        this.drawCanvas = drawCanvas;
        this.bgCanvas   = bgCanvas;
        this.ctx        = drawCanvas.getContext('2d');
        this.active     = false;   // strumento attivo
        this.selection  = null;    // { x, y, w, h } rettangolo selezionato
        this.dragData   = null;    // { startX, startY, imgData, selX, selY }
        this.phase      = 'idle'; // 'idle' | 'selecting' | 'selected' | 'dragging' | 'object-selected' | 'object-dragging' | 'object-resizing'
        this.startX     = 0;
        this.startY     = 0;
        this.selectedObject = null; // oggetto ObjectLayer selezionato
        this._objDragStart  = null; // {x, y, origObjX, origObjY}
        this._pixelClipboard  = null; // { data: ImageData, w, h, srcX, srcY }
        this._objectClipboard = null; // copia di un oggetto ObjectLayer
        this._pixelResizeData = null; // dati resize in corso per selezione pixel
        this._pastedData      = null; // { snap: ImageData, data: ImageData, w, h } — snapshot pre-paste
        this._pressing        = false; // true solo quando pointer/mouse è premuto
        this._setupContextPanel();
    }

    activate() {
        this.active = true;
        this.phase = 'idle';
        this.selection = null;
        this.selectedObject = null;
        // Cursore sull'overlay
        const oc = document.getElementById('overlay-canvas');
        if (oc) oc.style.cursor = 'crosshair';
    }
    deactivate() {
        this.active = false;
        this._clearSelection();
        this._hideContextPanel();
    }

    _setupContextPanel() {
        const panel = document.getElementById('object-context-panel');
        if (!panel) return;

        // Clipboard interna per copia/incolla selezione pixel
        this._pixelClipboard = null;

        // Gear button — apre/chiude la toolbar
        const gearBtn = document.getElementById('ctx-gear-btn');
        if (gearBtn) {
            gearBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const isOpen = panel.classList.toggle('ctx-panel--open');
                gearBtn.classList.toggle('is-open', isOpen);
                // Chiudi popup interno se chiudiamo il pannello
                if (!isOpen) {
                    const popup = document.getElementById('ctx-popup');
                    if (popup) { popup.style.display = 'none'; popup.dataset.action = ''; }
                }
            });
        }

        // Chiudi toolbar quando si clicca fuori dal pannello
        document.addEventListener('pointerdown', (e) => {
            if (!panel.contains(e.target)) {
                panel.classList.remove('ctx-panel--open');
                if (gearBtn) gearBtn.classList.remove('is-open');
                const popup = document.getElementById('ctx-popup');
                if (popup) { popup.style.display = 'none'; popup.dataset.action = ''; }
            }
        }, true);

        // Event delegation sulla toolbar icone
        const toolbar = panel.querySelector('.ctx-toolbar');
        if (toolbar) {
            toolbar.addEventListener('click', (e) => {
                const btn = e.target.closest('.ctx-icon-btn');
                if (!btn) return;
                const action = btn.dataset.action;
                this._handleCtxAction(action, btn);
            });
        }
    }

    _handleCtxAction(action, btn) {
        const popup = document.getElementById('ctx-popup');
        const obj = this.selectedObject;

        // Chiudi popup corrente se clicco su pulsante diverso
        if (popup) {
            const currentAction = popup.dataset.action;
            if (currentAction === action && popup.style.display !== 'none') {
                popup.style.display = 'none';
                popup.dataset.action = '';
                return;
            }
            popup.style.display = 'none';
            popup.dataset.action = '';
        }

        // Helper: applica filtro pixel-by-pixel su un'area del draw-canvas
        const _applyPixelFilter = (type, value, sel) => {
            const { x: sx, y: sy, w: sw, h: sh } = sel;
            const imgData = this.ctx.getImageData(sx, sy, sw, sh);
            const data = imgData.data;
            for (let i = 0; i < data.length; i += 4) {
                if (type === 'brightness') {
                    const factor = value / 100;
                    data[i]   = Math.min(255, data[i]   * factor);
                    data[i+1] = Math.min(255, data[i+1] * factor);
                    data[i+2] = Math.min(255, data[i+2] * factor);
                } else if (type === 'contrast') {
                    const factor = (value - 100) / 100;
                    const f = (259 * (factor * 255 + 255)) / (255 * (259 - factor * 255));
                    data[i]   = Math.min(255, Math.max(0, f * (data[i]   - 128) + 128));
                    data[i+1] = Math.min(255, Math.max(0, f * (data[i+1] - 128) + 128));
                    data[i+2] = Math.min(255, Math.max(0, f * (data[i+2] - 128) + 128));
                } else if (type === 'saturation') {
                    const factor = value / 100;
                    const avg = (data[i] + data[i+1] + data[i+2]) / 3;
                    data[i]   = Math.min(255, Math.max(0, avg + factor * (data[i]   - avg)));
                    data[i+1] = Math.min(255, Math.max(0, avg + factor * (data[i+1] - avg)));
                    data[i+2] = Math.min(255, Math.max(0, avg + factor * (data[i+2] - avg)));
                } else if (type === 'opacity') {
                    data[i+3] = Math.min(255, Math.max(0, Math.round(data[i+3] * value)));
                }
            }
            this.ctx.putImageData(imgData, sx, sy);
            CONFIG.isDirty = true;
            window.autoSaveMgr?.onDirty();
        };

        const isPixelSel = (this.phase === 'selected' && this.selection && !obj);

        // Azioni immediate (non aprono popup)
        switch (action) {
            case 'bring-front':
                if (obj) { objectLayer.bringToFront(obj.id); this._updateSelectionOverlay(); CONFIG.isDirty = true; window.autoSaveMgr?.onDirty(); }
                return;
            case 'send-back':
                if (obj) { objectLayer.sendToBack(obj.id); this._updateSelectionOverlay(); CONFIG.isDirty = true; window.autoSaveMgr?.onDirty(); }
                return;
            case 'flip-h':
                if (obj) {
                    obj.flipH = !obj.flipH; objectLayer.render();
                    CONFIG.isDirty = true; window.autoSaveMgr?.onDirty();
                } else if (isPixelSel) {
                    const { x: sx, y: sy, w: sw, h: sh } = this.selection;
                    if (typeof canvasMgr !== 'undefined') canvasMgr._saveUndo();
                    const imgData = this.ctx.getImageData(sx, sy, sw, sh);
                    const tmp = document.createElement('canvas');
                    tmp.width = sw; tmp.height = sh;
                    const tctx = tmp.getContext('2d');
                    tctx.putImageData(imgData, 0, 0);
                    this.ctx.save();
                    this.ctx.clearRect(sx, sy, sw, sh);
                    this.ctx.translate(sx + sw, sy);
                    this.ctx.scale(-1, 1);
                    this.ctx.drawImage(tmp, 0, 0);
                    this.ctx.restore();
                    CONFIG.isDirty = true; window.autoSaveMgr?.onDirty();
                }
                return;
            case 'flip-v':
                if (obj) {
                    obj.flipV = !obj.flipV; objectLayer.render();
                    CONFIG.isDirty = true; window.autoSaveMgr?.onDirty();
                } else if (isPixelSel) {
                    const { x: sx, y: sy, w: sw, h: sh } = this.selection;
                    if (typeof canvasMgr !== 'undefined') canvasMgr._saveUndo();
                    const imgData = this.ctx.getImageData(sx, sy, sw, sh);
                    const tmp = document.createElement('canvas');
                    tmp.width = sw; tmp.height = sh;
                    const tctx = tmp.getContext('2d');
                    tctx.putImageData(imgData, 0, 0);
                    this.ctx.save();
                    this.ctx.clearRect(sx, sy, sw, sh);
                    this.ctx.translate(sx, sy + sh);
                    this.ctx.scale(1, -1);
                    this.ctx.drawImage(tmp, 0, 0);
                    this.ctx.restore();
                    CONFIG.isDirty = true; window.autoSaveMgr?.onDirty();
                }
                return;
            case 'rot-cw':
                if (obj) {
                    obj.rotation = ((obj.rotation || 0) + 90) % 360; objectLayer.render(); this._drawSelectionRect(obj.x, obj.y, obj.w, obj.h, true);
                    CONFIG.isDirty = true; window.autoSaveMgr?.onDirty();
                } else if (isPixelSel) {
                    const { x: sx, y: sy, w: sw, h: sh } = this.selection;
                    if (typeof canvasMgr !== 'undefined') canvasMgr._saveUndo();
                    const imgData = this.ctx.getImageData(sx, sy, sw, sh);
                    const tmp = document.createElement('canvas');
                    tmp.width = sh; tmp.height = sw;
                    const tctx = tmp.getContext('2d');
                    tctx.translate(sh, 0);
                    tctx.rotate(Math.PI / 2);
                    tctx.putImageData(imgData, 0, 0);
                    this.ctx.clearRect(sx, sy, sw, sh);
                    this.ctx.drawImage(tmp, sx + (sw - sh) / 2, sy + (sh - sw) / 2);
                    CONFIG.isDirty = true; window.autoSaveMgr?.onDirty();
                }
                return;
            case 'rot-ccw':
                if (obj) {
                    obj.rotation = ((obj.rotation || 0) - 90 + 360) % 360; objectLayer.render(); this._drawSelectionRect(obj.x, obj.y, obj.w, obj.h, true);
                    CONFIG.isDirty = true; window.autoSaveMgr?.onDirty();
                } else if (isPixelSel) {
                    const { x: sx, y: sy, w: sw, h: sh } = this.selection;
                    if (typeof canvasMgr !== 'undefined') canvasMgr._saveUndo();
                    const imgData = this.ctx.getImageData(sx, sy, sw, sh);
                    const tmp = document.createElement('canvas');
                    tmp.width = sh; tmp.height = sw;
                    const tctx = tmp.getContext('2d');
                    tctx.translate(0, sw);
                    tctx.rotate(-Math.PI / 2);
                    tctx.putImageData(imgData, 0, 0);
                    this.ctx.clearRect(sx, sy, sw, sh);
                    this.ctx.drawImage(tmp, sx + (sw - sh) / 2, sy + (sh - sw) / 2);
                    CONFIG.isDirty = true; window.autoSaveMgr?.onDirty();
                }
                return;
            case 'rot-180':
                if (obj) {
                    obj.rotation = ((obj.rotation || 0) + 180) % 360; objectLayer.render();
                    CONFIG.isDirty = true; window.autoSaveMgr?.onDirty();
                } else if (isPixelSel) {
                    const { x: sx, y: sy, w: sw, h: sh } = this.selection;
                    if (typeof canvasMgr !== 'undefined') canvasMgr._saveUndo();
                    const imgData = this.ctx.getImageData(sx, sy, sw, sh);
                    const tmp = document.createElement('canvas');
                    tmp.width = sw; tmp.height = sh;
                    const tctx = tmp.getContext('2d');
                    tctx.translate(sw, sh);
                    tctx.rotate(Math.PI);
                    tctx.putImageData(imgData, 0, 0);
                    this.ctx.clearRect(sx, sy, sw, sh);
                    this.ctx.drawImage(tmp, sx, sy);
                    CONFIG.isDirty = true; window.autoSaveMgr?.onDirty();
                }
                return;
            case 'restore':
                if (obj) {
                    objectLayer.resizeObject(obj.id, obj.originalW); this._drawSelectionRect(obj.x, obj.y, obj.w, obj.h, true);
                    CONFIG.isDirty = true; window.autoSaveMgr?.onDirty();
                }
                return;
            case 'download':
                if (obj) {
                    const sourceFile = obj.img?._sourceFile;
                    if (sourceFile) {
                        // Scarica il file originale (PDF o immagine nel formato originale)
                        const url = URL.createObjectURL(sourceFile);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = sourceFile.name || (obj.type === 'pdf-page' ? 'documento.pdf' : 'immagine');
                        a.click();
                        setTimeout(() => URL.revokeObjectURL(url), 2000);
                        toast('Download avviato!', 'success');
                    } else {
                        // Fallback: scarica come PNG dal canvas
                        const tmpCanvas = document.createElement('canvas');
                        tmpCanvas.width  = obj.originalW || obj.w;
                        tmpCanvas.height = obj.originalH || obj.h;
                        tmpCanvas.getContext('2d').drawImage(obj.img, 0, 0, tmpCanvas.width, tmpCanvas.height);
                        tmpCanvas.toBlob(blob => {
                            if (!blob) { toast('Errore nel download', 'error'); return; }
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = obj.type === 'pdf-page' ? 'pagina-pdf.png' : 'immagine.png';
                            a.click();
                            setTimeout(() => URL.revokeObjectURL(url), 1000);
                            toast('Download avviato!', 'success');
                        }, 'image/png');
                    }
                } else if (isPixelSel) {
                    // Scarica l'area selezionata come PNG
                    const { x: sx, y: sy, w: sw, h: sh } = this.selection;
                    const imgData = this.ctx.getImageData(sx, sy, sw, sh);
                    const tmp = document.createElement('canvas');
                    tmp.width = sw; tmp.height = sh;
                    tmp.getContext('2d').putImageData(imgData, 0, 0);
                    tmp.toBlob(blob => {
                        if (!blob) { toast('Errore nel download', 'error'); return; }
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = 'selezione.png';
                        a.click();
                        setTimeout(() => URL.revokeObjectURL(url), 1000);
                        toast('Download avviato!', 'success');
                    }, 'image/png');
                }
                return;
            case 'delete':
                if (obj) {
                    objectLayer.removeObject(obj.id);
                    this.selectedObject = null;
                    this._clearSelection();
                    this._hideContextPanel();
                } else if (this.phase === 'selected' && this.selection) {
                    if (typeof canvasMgr !== 'undefined') canvasMgr._saveUndo();
                    const { x, y, w, h } = this.selection;
                    this.ctx.save();
                    this.ctx.globalCompositeOperation = 'destination-out';
                    this.ctx.fillStyle = 'rgba(255,255,255,1)';
                    this.ctx.fillRect(x, y, w, h);
                    this.ctx.restore();
                    this._clearSelection();
                    CONFIG.isDirty = true; window.autoSaveMgr?.onDirty();
                }
                return;
            case 'copy':
                if (obj) {
                    // Copia oggetto ObjectLayer
                    this._objectClipboard = {
                        type: obj.type, img: obj.img,
                        x: obj.x, y: obj.y, w: obj.w, h: obj.h,
                        originalW: obj.originalW, originalH: obj.originalH,
                        opacity: obj.opacity, rotation: obj.rotation || 0,
                        filter: { ...(obj.filter || {}) },
                        flipH: obj.flipH || false, flipV: obj.flipV || false,
                    };
                    this._pixelClipboard = null;
                    toast('Oggetto copiato!', 'success');
                } else if (this.phase === 'selected' && this.selection) {
                    // Copia area pixel
                    const { x, y, w, h } = this.selection;
                    this._pixelClipboard = { data: this.ctx.getImageData(x, y, w, h), w, h, srcX: x, srcY: y };
                    this._objectClipboard = null;
                    toast('Area copiata!', 'success');
                }
                return;
            case 'cut':
                // Taglia = copia + elimina
                this._handleCtxAction('copy', btn);
                if (obj) {
                    objectLayer.removeObject(obj.id);
                    this.selectedObject = null;
                    this._clearSelection();
                    this._hideContextPanel();
                    CONFIG.isDirty = true; window.autoSaveMgr?.onDirty();
                } else if (this.phase === 'selected' && this.selection) {
                    if (typeof canvasMgr !== 'undefined') canvasMgr._saveUndo();
                    const { x, y, w, h } = this.selection;
                    this.ctx.save();
                    this.ctx.globalCompositeOperation = 'destination-out';
                    this.ctx.fillRect(x, y, w, h);
                    this.ctx.restore();
                    this._clearSelection();
                    CONFIG.isDirty = true; window.autoSaveMgr?.onDirty();
                    toast('Tagliato!', 'success');
                }
                return;
            case 'paste':
                if (this._objectClipboard) {
                    // Incolla oggetto (offset +20px per distinguerlo dall'originale)
                    const src = this._objectClipboard;
                    const nx = src.x + 20, ny = src.y + 20;
                    objectLayer.addObject(src.type, src.img, nx, ny, src.w, src.h);
                    const newObj = objectLayer.objects[objectLayer.objects.length - 1];
                    if (newObj) {
                        newObj.opacity = src.opacity;
                        newObj.rotation = src.rotation;
                        newObj.filter = { ...src.filter };
                        newObj.flipH = src.flipH;
                        newObj.flipV = src.flipV;
                        objectLayer.render();
                        // Seleziona il nuovo oggetto
                        this.selectedObject = newObj;
                        this.phase = 'object-selected';
                        this._drawSelectionRect(newObj.x, newObj.y, newObj.w, newObj.h, true);
                        this._showContextPanel(newObj);
                    }
                    // Sposta il clipboard per il prossimo incolla a cascata
                    this._objectClipboard = { ...this._objectClipboard, x: nx, y: ny };
                    CONFIG.isDirty = true; window.autoSaveMgr?.onDirty();
                    toast('Incollato!', 'success');
                } else if (this._pixelClipboard) {
                    // Incolla area pixel vicino alla sorgente (+20px offset, cascata)
                    if (typeof canvasMgr !== 'undefined') canvasMgr._saveUndo();
                    const { data, w: pw, h: ph } = this._pixelClipboard;
                    const srcX = this._pixelClipboard.srcX ?? 40;
                    const srcY = this._pixelClipboard.srcY ?? 40;
                    const px = Math.round(srcX + 20);
                    const py = Math.round(srcY + 20);
                    // Salva snapshot PRIMA del paste: serve per il drag senza toccare la sorgente
                    const W = this.drawCanvas.width, H = this.drawCanvas.height;
                    const preSnap = this.ctx.getImageData(0, 0, W, H);
                    // Usa drawImage (non putImageData) per preservare compositing:
                    // i pixel trasparenti non sovrascrivono il disegno esistente
                    const tmp = document.createElement('canvas');
                    tmp.width = pw; tmp.height = ph;
                    tmp.getContext('2d').putImageData(data, 0, 0);
                    this.ctx.drawImage(tmp, px, py);
                    // Salva i dati per il drag successivo (ripristina pre-paste invece di destination-out)
                    this._pastedData = { snap: preSnap, data, w: pw, h: ph };
                    // Mostra dove è finito il paste (selezione + pannello)
                    this.selection = { x: px, y: py, w: pw, h: ph };
                    this.phase = 'selected';
                    this._drawSelectionRect(px, py, pw, ph);
                    this._showContextPanel(this.selection, true);
                    // Aggiorna srcX/srcY per la cascata dei paste successivi
                    this._pixelClipboard = { ...this._pixelClipboard, srcX: px, srcY: py };
                    CONFIG.isDirty = true; window.autoSaveMgr?.onDirty();
                    toast('Incollato!', 'success');
                }
                return;
        }

        // Azioni con popup
        if (!popup) return;
        popup.dataset.action = action;

        switch (action) {
            case 'opacity': {
                const val = obj ? Math.round((obj.opacity !== undefined ? obj.opacity : 1) * 100) : 100;
                popup.innerHTML = `<label>Opacit&agrave; <input type="range" min="10" max="100" step="5" value="${val}"> <span>${val}%</span></label>`;
                popup.style.display = 'block';
                const inp = popup.querySelector('input');
                const sp = popup.querySelector('span');
                inp.addEventListener('input', () => {
                    sp.textContent = inp.value + '%';
                    const el = document.getElementById('ctx-opacity');
                    if (el) el.value = inp.value;
                    if (obj) {
                        obj.opacity = parseInt(inp.value) / 100; objectLayer.render();
                        CONFIG.isDirty = true; window.autoSaveMgr?.onDirty();
                    } else if (isPixelSel) {
                        if (typeof canvasMgr !== 'undefined') canvasMgr._saveUndo();
                        _applyPixelFilter('opacity', parseInt(inp.value) / 100, this.selection);
                    }
                });
                break;
            }
            case 'brightness': {
                const f = obj?.filter || {};
                const val = f.brightness !== undefined ? f.brightness : 100;
                popup.innerHTML = `<label>Luminosit&agrave; <input type="range" min="10" max="300" step="10" value="${val}"> <span>${val}%</span></label>`;
                popup.style.display = 'block';
                const inp = popup.querySelector('input');
                const sp = popup.querySelector('span');
                const bEl = document.getElementById('ctx-brightness');
                const cEl = document.getElementById('ctx-contrast');
                const sEl = document.getElementById('ctx-saturation');
                // Snapshot per pixel (applica relativamente allo snapshot originale)
                const _pixSnap = isPixelSel ? this.ctx.getImageData(this.selection.x, this.selection.y, this.selection.w, this.selection.h) : null;
                inp.addEventListener('input', () => {
                    sp.textContent = inp.value + '%';
                    if (bEl) bEl.value = inp.value;
                    if (obj) {
                        objectLayer.updateFilter(obj.id, parseInt(inp.value), parseInt(cEl?.value || 100), parseInt(sEl?.value || 100));
                        CONFIG.isDirty = true; window.autoSaveMgr?.onDirty();
                    } else if (isPixelSel && _pixSnap) {
                        // Ripristina snapshot e applica filtro
                        this.ctx.putImageData(_pixSnap, this.selection.x, this.selection.y);
                        _applyPixelFilter('brightness', parseInt(inp.value), this.selection);
                    }
                });
                break;
            }
            case 'contrast': {
                const f = obj?.filter || {};
                const val = f.contrast !== undefined ? f.contrast : 100;
                popup.innerHTML = `<label>Contrasto <input type="range" min="10" max="300" step="10" value="${val}"> <span>${val}%</span></label>`;
                popup.style.display = 'block';
                const inp = popup.querySelector('input');
                const sp = popup.querySelector('span');
                const bEl = document.getElementById('ctx-brightness');
                const cEl = document.getElementById('ctx-contrast');
                const sEl = document.getElementById('ctx-saturation');
                const _pixSnap = isPixelSel ? this.ctx.getImageData(this.selection.x, this.selection.y, this.selection.w, this.selection.h) : null;
                inp.addEventListener('input', () => {
                    sp.textContent = inp.value + '%';
                    if (cEl) cEl.value = inp.value;
                    if (obj) {
                        objectLayer.updateFilter(obj.id, parseInt(bEl?.value || 100), parseInt(inp.value), parseInt(sEl?.value || 100));
                        CONFIG.isDirty = true; window.autoSaveMgr?.onDirty();
                    } else if (isPixelSel && _pixSnap) {
                        this.ctx.putImageData(_pixSnap, this.selection.x, this.selection.y);
                        _applyPixelFilter('contrast', parseInt(inp.value), this.selection);
                    }
                });
                break;
            }
            case 'saturation': {
                const f = obj?.filter || {};
                const val = f.saturation !== undefined ? f.saturation : 100;
                popup.innerHTML = `<label>Saturazione <input type="range" min="0" max="300" step="10" value="${val}"> <span>${val}%</span></label>`;
                popup.style.display = 'block';
                const inp = popup.querySelector('input');
                const sp = popup.querySelector('span');
                const bEl = document.getElementById('ctx-brightness');
                const cEl = document.getElementById('ctx-contrast');
                const sEl = document.getElementById('ctx-saturation');
                const _pixSnap = isPixelSel ? this.ctx.getImageData(this.selection.x, this.selection.y, this.selection.w, this.selection.h) : null;
                inp.addEventListener('input', () => {
                    sp.textContent = inp.value + '%';
                    if (sEl) sEl.value = inp.value;
                    if (obj) {
                        objectLayer.updateFilter(obj.id, parseInt(bEl?.value || 100), parseInt(cEl?.value || 100), parseInt(inp.value));
                        CONFIG.isDirty = true; window.autoSaveMgr?.onDirty();
                    } else if (isPixelSel && _pixSnap) {
                        this.ctx.putImageData(_pixSnap, this.selection.x, this.selection.y);
                        _applyPixelFilter('saturation', parseInt(inp.value), this.selection);
                    }
                });
                break;
            }
            case 'border-color': {
                const bw = obj?.borderWidth || 0;
                const bc = obj?.borderColor || '#000000';
                popup.innerHTML = `<label>Bordo <input type="color" value="${bc}"> <input type="range" min="0" max="20" value="${bw}" style="flex:1"> <span>${bw}px</span></label>`;
                popup.style.display = 'block';
                const [colorInp, widthInp] = popup.querySelectorAll('input');
                const sp = popup.querySelector('span');
                colorInp.addEventListener('input', () => {
                    const bcEl = document.getElementById('ctx-border-color');
                    if (bcEl) bcEl.value = colorInp.value;
                    if (obj) { obj.borderColor = colorInp.value; objectLayer.render(); CONFIG.isDirty = true; window.autoSaveMgr?.onDirty(); }
                });
                widthInp.addEventListener('input', () => {
                    sp.textContent = widthInp.value + 'px';
                    const bwEl = document.getElementById('ctx-border-width');
                    if (bwEl) bwEl.value = widthInp.value;
                    if (obj) { obj.borderWidth = parseInt(widthInp.value); objectLayer.render(); CONFIG.isDirty = true; window.autoSaveMgr?.onDirty(); }
                });
                break;
            }
            case 'width': {
                const w = obj ? Math.round(obj.w) : 200;
                popup.innerHTML = `<label>Larghezza <input type="number" min="50" max="3000" value="${w}" style="width:70px"> px</label>`;
                popup.style.display = 'block';
                const inp = popup.querySelector('input');
                inp.addEventListener('change', () => {
                    const newW = parseInt(inp.value);
                    if (!obj || isNaN(newW) || newW < 50) return;
                    const wiEl = document.getElementById('ctx-width-input');
                    if (wiEl) wiEl.value = newW;
                    objectLayer.resizeObject(obj.id, newW);
                    this._drawSelectionRect(obj.x, obj.y, obj.w, obj.h, true);
                    CONFIG.isDirty = true; window.autoSaveMgr?.onDirty();
                });
                break;
            }
        }
    }

    _showContextPanel(obj, isPixelSelection = false) {
        const panel = document.getElementById('object-context-panel');
        if (!panel) return;

        if (isPixelSelection) {
            // Per selezione pixel: mostra tutte le azioni tratte da ctx-pixel-only
            // + flip/ruota/filtri/opacità/elimina/download — nascondi solo bordo, larghezza, ripristina, bring-front/send-back
            const pixelHidden = new Set(['bring-front', 'send-back', 'border-color', 'width', 'restore']);
            panel.querySelectorAll('.ctx-icon-btn[data-action]').forEach(el => {
                const act = el.dataset.action;
                if (el.classList.contains('ctx-obj-only') || el.classList.contains('ctx-pixel-only')) {
                    // Gestito sotto
                } else {
                    el.style.display = pixelHidden.has(act) ? 'none' : '';
                }
            });
            // ctx-obj-only: mostra solo quelli utili per pixel
            panel.querySelectorAll('.ctx-obj-only').forEach(el => {
                const act = el.dataset?.action;
                const isHidden = !act || pixelHidden.has(act);
                el.style.display = isHidden ? 'none' : '';
            });
            // Separatori ctx-obj-only: nascondi quelli vicini a bottoni tutti nascosti
            // Gestione semplificata: mostra tutti i sep non ctx-pixel-only, nascondi solo quelli tra pulsanti tutti nascosti
            panel.querySelectorAll('.ctx-sep.ctx-obj-only').forEach((sep, i) => {
                // Nascondi solo il sep dei pulsanti bring-front/send-back e border-color/width/restore
                // Tieni gli altri (flip/rot, filtri)
                // Identifica per posizione: 1=ordine(nascosto), 2=flip-rot(visibile), 3=stile-bordo(nascosto), 4=filtri(visibile), 5=dim(nascosto)
                // Contiamo i sep tra i pulsanti ctx-obj-only
                sep.style.display = (i === 0 || i === 2 || i === 4) ? 'none' : '';
            });
        } else {
            // Per oggetti ObjectLayer: comportamento originale
            panel.querySelectorAll('.ctx-obj-only').forEach(el => {
                el.style.display = '';
            });
        }

        // Posizionamento
        const area = document.getElementById('canvas-area');
        const rect = area.getBoundingClientRect();
        const scale = (typeof panMgr !== 'undefined' && panMgr) ? panMgr.scale : 1;

        let screenX, screenY;
        if (isPixelSelection && this.selection) {
            const sel = this.selection;
            screenX = rect.left + (sel.x + sel.w) * scale;
            screenY = rect.top + sel.y * scale;
        } else {
            screenX = rect.left + obj.x * scale;
            screenY = rect.top + obj.y * scale;
        }

        // Assicura che il pannello sia visibile nella viewport
        panel.style.left = Math.min(screenX + (isPixelSelection ? 0 : obj.w * scale) + 8, window.innerWidth - 260) + 'px';
        panel.style.top  = Math.max(Math.min(screenY, window.innerHeight - 60), 60) + 'px';
        panel.style.display = 'flex';
        // Ogni nuova selezione parte col pannello collassato (solo ingranaggio visibile)
        panel.classList.remove('ctx-panel--open');
        const gearBtn = document.getElementById('ctx-gear-btn');
        if (gearBtn) gearBtn.classList.remove('is-open');

        // Chiudi popup interno se aperto
        const popup = document.getElementById('ctx-popup');
        if (popup) { popup.style.display = 'none'; popup.dataset.action = ''; }

        if (isPixelSelection) {
            // Per selezione pixel: mostra il pulsante download sempre
            const dlBtn = document.getElementById('ctx-download-pdf');
            if (dlBtn) dlBtn.style.display = 'flex';
        } else if (obj) {
            // Aggiorna valori slider nascosti (compatibilità)
            const f = obj.filter || { brightness: 100, contrast: 100, saturation: 100 };
            const bInput = document.getElementById('ctx-brightness');
            const cInput = document.getElementById('ctx-contrast');
            const sInput = document.getElementById('ctx-saturation');
            if (bInput) bInput.value = f.brightness;
            if (cInput) cInput.value = f.contrast;
            if (sInput) sInput.value = f.saturation;
            const bw = document.getElementById('ctx-border-width');
            const bc = document.getElementById('ctx-border-color');
            if (bw) bw.value = obj.borderWidth || 0;
            if (bc) bc.value = obj.borderColor || '#3b82f6';
            const op = document.getElementById('ctx-opacity');
            if (op) op.value = Math.round((obj.opacity !== undefined ? obj.opacity : 1) * 100);
            const wi = document.getElementById('ctx-width-input');
            if (wi) wi.value = Math.round(obj.w);
            // Pulsante download — visibile per PDF e immagini
            const dlBtn = document.getElementById('ctx-download-pdf');
            if (dlBtn) {
                const canDownload = (obj.type === 'pdf-page' || obj.type === 'image');
                dlBtn.style.display = canDownload ? 'flex' : 'none';
                dlBtn.title = obj.type === 'pdf-page' ? 'Scarica PDF' : 'Scarica immagine';
            }
        }
    }

    _hideContextPanel() {
        const panel = document.getElementById('object-context-panel');
        if (panel) panel.style.display = 'none';
    }

    _updateSelectionOverlay() {
        if (!this.selectedObject) return;
        this._drawSelectionRect(
            this.selectedObject.x, this.selectedObject.y,
            this.selectedObject.w, this.selectedObject.h, true
        );
        this._showContextPanel(this.selectedObject);
    }

    // Disegna il rettangolo di selezione tratteggiato sull'overlay
    // isObject=true → colore blu acceso per oggetti ObjectLayer + handle resize più grandi
    _drawSelectionRect(x, y, w, h, isObject = false) {
        const oc  = document.getElementById('overlay-canvas');
        const ctx = oc.getContext('2d');
        ctx.clearRect(0, 0, oc.width, oc.height);
        ctx.save();
        ctx.strokeStyle = isObject ? '#22d3ee' : '#3b82f6';
        ctx.lineWidth   = isObject ? 2 : 1.5;
        ctx.setLineDash([6, 3]);
        ctx.strokeRect(x, y, w, h);
        // Handle angoli — grandi per facilitare il tocco con il dito sulla LIM
        const handleR = isObject ? 14 : 11;
        ctx.fillStyle   = 'white';
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth   = 2.5;
        ctx.setLineDash([]);
        [[x, y], [x + w, y], [x, y + h], [x + w, y + h]].forEach(([hx, hy]) => {
            ctx.beginPath();
            ctx.arc(hx, hy, handleR, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
        });
        ctx.restore();
    }

    _clearSelection() {
        const oc = document.getElementById('overlay-canvas');
        if (oc) oc.getContext('2d').clearRect(0, 0, oc.width, oc.height);
        this.selection = null;
        this.selectedObject = null;
        this.phase     = 'idle';
        this._pastedData = null;
        this._hideContextPanel();
    }

    // Deseleziona solo la selezione pixel (non l'oggetto)
    _clearPixelSelection() {
        const oc = document.getElementById('overlay-canvas');
        if (oc) oc.getContext('2d').clearRect(0, 0, oc.width, oc.height);
        this.selection = null;
    }

    onPointerDown(x, y) {
        if (!this.active) return false;
        this._pressing = true;

        // 0. Se c'è un oggetto selezionato, controlla handle resize
        if (this.phase === 'object-selected' && this.selectedObject) {
            const obj = this.selectedObject;
            const handles = [
                { corner: 'tl', hx: obj.x,       hy: obj.y },
                { corner: 'tr', hx: obj.x + obj.w, hy: obj.y },
                { corner: 'bl', hx: obj.x,       hy: obj.y + obj.h },
                { corner: 'br', hx: obj.x + obj.w, hy: obj.y + obj.h },
            ];
            const HIT_RADIUS = 22; // px — grande abbastanza per il tocco con dito su LIM
            for (const h of handles) {
                if (Math.abs(x - h.hx) < HIT_RADIUS && Math.abs(y - h.hy) < HIT_RADIUS) {
                    if (typeof canvasMgr !== 'undefined') canvasMgr._saveUndo();
                    this.phase = 'object-resizing';
                    this._resizeHandle = {
                        corner: h.corner,
                        startX: x, startY: y,
                        origX: obj.x, origY: obj.y,
                        origW: obj.w, origH: obj.h,
                    };
                    return true;
                }
            }
        }

        // 1. Selezione pixel attiva — PRIORITÀ su oggetti sotto
        // Se il click cade dentro la selezione pixel (o sui suoi handle), gestiamo qui.
        if (this.phase === 'selected' && this.selection) {
            const { x: sx, y: sy, w, h } = this.selection;

            // 1a. Hit test angoli per resize pixel (raggio grande per touch)
            const HIT_PIX = 24;
            const corners = [
                { corner: 'tl', hx: sx,     hy: sy },
                { corner: 'tr', hx: sx + w,  hy: sy },
                { corner: 'bl', hx: sx,     hy: sy + h },
                { corner: 'br', hx: sx + w,  hy: sy + h },
            ];
            for (const c of corners) {
                if (Math.abs(x - c.hx) < HIT_PIX && Math.abs(y - c.hy) < HIT_PIX) {
                    if (typeof canvasMgr !== 'undefined') canvasMgr._saveUndo();
                    const origImg = this.ctx.getImageData(sx, sy, w, h);
                    // Salva snapshot del canvas SENZA il contenuto selezionato
                    this.ctx.save();
                    this.ctx.globalCompositeOperation = 'destination-out';
                    this.ctx.fillStyle = 'rgba(0,0,0,1)';
                    this.ctx.fillRect(sx, sy, w, h);
                    this.ctx.restore();
                    const baseSnap = this.ctx.getImageData(0, 0, this.drawCanvas.width, this.drawCanvas.height);
                    this._pixelResizeData = {
                        corner: c.corner, origImg, baseSnap,
                        origX: sx, origY: sy, origW: w, origH: h,
                        startX: x, startY: y,
                    };
                    this.phase = 'pixel-resizing';
                    return true;
                }
            }

            // 1b. Dentro la selezione → inizia drag (ha priorità sugli oggetti sotto)
            if (x >= sx && x <= sx + w && y >= sy && y <= sy + h) {
                if (typeof canvasMgr !== 'undefined') canvasMgr._saveUndo();
                this.phase = 'dragging';
                if (this._pastedData) {
                    // Contenuto incollato: ripristina pre-paste così la sorgente rimane intatta
                    this.dragData = {
                        startX: x, startY: y,
                        imgData: this._pastedData.data, // il contenuto incollato
                        selX: sx, selY: sy,
                        baseSnap: this._pastedData.snap, // canvas prima dell'incolla
                    };
                    this.ctx.putImageData(this._pastedData.snap, 0, 0);
                    this._pastedData = null;
                } else {
                    // Selezione normale: cut (destination-out) e sposta
                    this.dragData = {
                        startX: x, startY: y,
                        imgData: this.ctx.getImageData(sx, sy, w, h),
                        selX: sx, selY: sy,
                    };
                    this.ctx.save();
                    this.ctx.globalCompositeOperation = 'destination-out';
                    this.ctx.fillStyle = 'rgba(255,255,255,1)';
                    this.ctx.fillRect(sx, sy, w, h);
                    this.ctx.restore();
                }
                return true;
            }

            // 1c. Click fuori dalla selezione pixel → deseleziona pixel
            this._clearPixelSelection();
            this.phase = 'idle';
        }

        // 2. Hit test su ObjectLayer
        if (typeof objectLayer !== 'undefined' && objectLayer) {
            const hit = objectLayer.hitTest(x, y);
            if (hit) {
                // Se avevo un oggetto selezionato e clicco su di lui → drag
                if (this.phase === 'object-selected' && this.selectedObject?.id === hit.id) {
                    if (typeof canvasMgr !== 'undefined') canvasMgr._saveUndo();
                    this.phase = 'object-dragging';
                    this._objDragStart = { x, y, origX: hit.x, origY: hit.y };
                    return true;
                }
                // Seleziona nuovo oggetto
                this.selectedObject = hit;
                this.phase = 'object-selected';
                this._clearPixelSelection();
                this._drawSelectionRect(hit.x, hit.y, hit.w, hit.h, true);
                this._showContextPanel(hit);
                return true;
            }
        }

        // 3. Click fuori da qualsiasi oggetto: deseleziona oggetto se c'era
        if (this.phase === 'object-selected' || this.phase === 'object-dragging') {
            this.selectedObject = null;
            this._clearSelection();
            this._hideContextPanel();
        }

        // Nuova selezione rettangolare
        this._clearPixelSelection(); // solo pulizia visuale, NON resetta phase
        this.phase  = 'selecting';
        this.startX = x;
        this.startY = y;
        return true;
    }

    onPointerMove(x, y) {
        if (!this.active) return false;

        // Resize selezione pixel (drag angolo)
        if (this.phase === 'pixel-resizing' && this._pixelResizeData) {
            const d = this._pixelResizeData;
            const dx = x - d.startX, dy = y - d.startY;
            let nx = d.origX, ny = d.origY, nw = d.origW, nh = d.origH;
            const ratio = d.origH / d.origW;
            switch (d.corner) {
                case 'br': nw = Math.max(10, d.origW + dx); nh = Math.max(10, nw * ratio); break;
                case 'bl': nw = Math.max(10, d.origW - dx); nx = d.origX + d.origW - nw; nh = Math.max(10, nw * ratio); break;
                case 'tr': nw = Math.max(10, d.origW + dx); nh = Math.max(10, nw * ratio); ny = d.origY + d.origH - nh; break;
                case 'tl': nw = Math.max(10, d.origW - dx); nx = d.origX + d.origW - nw; nh = Math.max(10, nw * ratio); ny = d.origY + d.origH - nh; break;
            }
            // Ripristina base (senza contenuto) e ridisegna scalato
            this.ctx.putImageData(d.baseSnap, 0, 0);
            const tmp = document.createElement('canvas');
            tmp.width = d.origW; tmp.height = d.origH;
            tmp.getContext('2d').putImageData(d.origImg, 0, 0);
            this.ctx.drawImage(tmp, nx, ny, nw, nh);
            this.selection = { x: Math.round(nx), y: Math.round(ny), w: Math.round(nw), h: Math.round(nh) };
            this._drawSelectionRect(nx, ny, nw, nh);
            return true;
        }

        // Resize oggetto ObjectLayer (drag handle angolo)
        if (this.phase === 'object-resizing' && this._resizeHandle && this.selectedObject) {
            const obj = this.selectedObject;
            const rh = this._resizeHandle;
            const ratio = rh.origH / rh.origW; // mantieni proporzioni

            let newW = rh.origW, newX = rh.origX, newY = rh.origY;

            if (rh.corner === 'br') {
                newW = Math.max(20, rh.origW + (x - rh.startX));
            } else if (rh.corner === 'bl') {
                newW = Math.max(20, rh.origW - (x - rh.startX));
                newX = rh.origX + rh.origW - newW;
            } else if (rh.corner === 'tr') {
                newW = Math.max(20, rh.origW + (x - rh.startX));
                newY = rh.origY + rh.origH - newW * ratio;
            } else { // tl
                newW = Math.max(20, rh.origW - (x - rh.startX));
                newX = rh.origX + rh.origW - newW;
                newY = rh.origY + rh.origH - newW * ratio;
            }

            obj.x = newX;
            obj.y = newY;
            obj.w = newW;
            obj.h = newW * ratio;
            objectLayer.render();
            this._drawSelectionRect(obj.x, obj.y, obj.w, obj.h, true);
            return true;
        }

        // Cursore: cambia quando si passa vicino a un handle (selezione pixel)
        if (this.phase === 'selected' && this.selection) {
            const { x: sx, y: sy, w, h } = this.selection;
            const HIT = 24;
            const cornerCursors = { tl: 'nwse-resize', br: 'nwse-resize', tr: 'nesw-resize', bl: 'nesw-resize' };
            const pixCorners = [
                { corner: 'tl', hx: sx,     hy: sy },
                { corner: 'tr', hx: sx + w,  hy: sy },
                { corner: 'bl', hx: sx,     hy: sy + h },
                { corner: 'br', hx: sx + w,  hy: sy + h },
            ];
            const oc = document.getElementById('overlay-canvas');
            let onCorner = false;
            for (const c of pixCorners) {
                if (Math.abs(x - c.hx) < HIT && Math.abs(y - c.hy) < HIT) {
                    if (oc) oc.style.cursor = cornerCursors[c.corner];
                    onCorner = true; break;
                }
            }
            if (!onCorner && oc) {
                oc.style.cursor = (x >= sx && x <= sx + w && y >= sy && y <= sy + h) ? 'move' : 'crosshair';
            }
        }

        // Cursore: cambia quando si passa vicino a un handle (phase object-selected)
        if (this.phase === 'object-selected' && this.selectedObject) {
            const obj = this.selectedObject;
            const HIT_RADIUS = 12;
            const handles = [
                { corner: 'tl', hx: obj.x,       hy: obj.y },
                { corner: 'tr', hx: obj.x + obj.w, hy: obj.y },
                { corner: 'bl', hx: obj.x,       hy: obj.y + obj.h },
                { corner: 'br', hx: obj.x + obj.w, hy: obj.y + obj.h },
            ];
            const oc = document.getElementById('overlay-canvas');
            let onHandle = false;
            for (const h of handles) {
                if (Math.abs(x - h.hx) < HIT_RADIUS && Math.abs(y - h.hy) < HIT_RADIUS) {
                    const diagCursors = { tl: 'nwse-resize', br: 'nwse-resize', tr: 'nesw-resize', bl: 'nesw-resize' };
                    if (oc) oc.style.cursor = diagCursors[h.corner];
                    onHandle = true;
                    break;
                }
            }
            if (!onHandle && oc) oc.style.cursor = 'move';
        }

        // Drag oggetto ObjectLayer
        if (this.phase === 'object-dragging' && this._objDragStart && this.selectedObject) {
            const dx = x - this._objDragStart.x;
            const dy = y - this._objDragStart.y;
            const newX = this._objDragStart.origX + dx;
            const newY = this._objDragStart.origY + dy;
            this.selectedObject.x = newX;
            this.selectedObject.y = newY;
            objectLayer.render();
            this._drawSelectionRect(newX, newY, this.selectedObject.w, this.selectedObject.h, true);
            this._showContextPanel(this.selectedObject);
            return true;
        }

        if (this.phase === 'selecting') {
            // Disegna il rettangolo SOLO se il tasto/stilo è ancora premuto
            if (!this._pressing) return false;
            const rx = Math.min(x, this.startX);
            const ry = Math.min(y, this.startY);
            const rw = Math.abs(x - this.startX);
            const rh = Math.abs(y - this.startY);
            this._drawSelectionRect(rx, ry, rw, rh);
            return true;
        }

        if (this.phase === 'dragging' && this.dragData) {
            const dx   = x - this.dragData.startX;
            const dy   = y - this.dragData.startY;
            const newX = this.dragData.selX + dx;
            const newY = this.dragData.selY + dy;
            const { w, h } = this.selection;

            // Preview su overlay: contenuto + rettangolo tratteggiato
            // NOTA: non chiamare _drawSelectionRect() separatamente perché fa clearRect()
            // e cancellerebbe il contenuto appena disegnato.
            const oc  = document.getElementById('overlay-canvas');
            const ctx = oc.getContext('2d');
            ctx.clearRect(0, 0, oc.width, oc.height);

            // 1. Disegna il contenuto nella nuova posizione
            const tmp = document.createElement('canvas');
            tmp.width  = w;
            tmp.height = h;
            tmp.getContext('2d').putImageData(this.dragData.imgData, 0, 0);
            ctx.drawImage(tmp, newX, newY);

            // 2. Disegna il rettangolo tratteggiato sopra il contenuto (senza clearRect)
            ctx.save();
            ctx.strokeStyle = '#3b82f6';
            ctx.lineWidth   = 1.5;
            ctx.setLineDash([6, 3]);
            ctx.strokeRect(newX, newY, w, h);
            // Handle angoli
            const handleR = 11;
            ctx.fillStyle   = 'white';
            ctx.strokeStyle = '#3b82f6';
            ctx.lineWidth   = 2.5;
            ctx.setLineDash([]);
            [[newX, newY], [newX + w, newY], [newX, newY + h], [newX + w, newY + h]].forEach(([hx, hy]) => {
                ctx.beginPath();
                ctx.arc(hx, hy, handleR, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
            });
            ctx.restore();
            return true;
        }

        return this.phase !== 'idle';
    }

    onPointerUp(x, y) {
        if (!this.active) return false;
        this._pressing = false;

        // Fine resize selezione pixel
        if (this.phase === 'pixel-resizing') {
            this.phase = 'selected';
            this._pixelResizeData = null;
            if (this.selection) {
                this._drawSelectionRect(this.selection.x, this.selection.y, this.selection.w, this.selection.h);
                this._showContextPanel(this.selection, true);
            }
            CONFIG.isDirty = true;
            window.autoSaveMgr?.onDirty();
            const oc = document.getElementById('overlay-canvas');
            if (oc) oc.style.cursor = 'crosshair';
            return true;
        }

        // Fine resize oggetto ObjectLayer
        if (this.phase === 'object-resizing') {
            this.phase = 'object-selected';
            this._resizeHandle = null;
            CONFIG.isDirty = true;
            window.autoSaveMgr?.onDirty();
            // Aggiorna il campo larghezza nel pannello
            const wi = document.getElementById('ctx-width-input');
            if (wi && this.selectedObject) wi.value = Math.round(this.selectedObject.w);
            // Ripristina cursore
            const oc = document.getElementById('overlay-canvas');
            if (oc) oc.style.cursor = 'crosshair';
            return true;
        }

        // Fine drag oggetto ObjectLayer
        if (this.phase === 'object-dragging' && this.selectedObject) {
            this.phase = 'object-selected';
            this._objDragStart = null;
            CONFIG.isDirty = true;
            window.autoSaveMgr?.onDirty();
            this._drawSelectionRect(this.selectedObject.x, this.selectedObject.y,
                this.selectedObject.w, this.selectedObject.h, true);
            this._showContextPanel(this.selectedObject);
            return true;
        }

        if (this.phase === 'selecting') {
            const rx = Math.min(x, this.startX);
            const ry = Math.min(y, this.startY);
            const rw = Math.abs(x - this.startX);
            const rh = Math.abs(y - this.startY);
            if (rw > 2 && rh > 2) {
                this.selection = { x: rx, y: ry, w: rw, h: rh };
                this.phase     = 'selected';
                this._drawSelectionRect(rx, ry, rw, rh);
                this._showContextPanel({ x: rx, y: ry, w: rw, h: rh }, true);
            } else {
                // Era un click: prova auto-selezione tratto disegnato
                const bbox = this._autoSelectAt(this.startX, this.startY);
                if (bbox) {
                    this.selection = bbox;
                    this.phase     = 'selected';
                    this._drawSelectionRect(bbox.x, bbox.y, bbox.w, bbox.h);
                    this._showContextPanel(bbox, true);
                } else {
                    this._clearSelection();
                }
            }
            return true;
        }

        if (this.phase === 'dragging' && this.dragData) {
            const dx   = x - this.dragData.startX;
            const dy   = y - this.dragData.startY;
            const newX = this.dragData.selX + dx;
            const newY = this.dragData.selY + dy;
            const { w, h } = this.selection;

            // Deposita definitivamente sul draw-canvas
            const tmp = document.createElement('canvas');
            tmp.width  = w;
            tmp.height = h;
            tmp.getContext('2d').putImageData(this.dragData.imgData, 0, 0);
            this.ctx.drawImage(tmp, newX, newY);

            // Aggiorna selezione e overlay
            this.selection = { x: newX, y: newY, w, h };
            this.phase     = 'selected';
            const oc = document.getElementById('overlay-canvas');
            oc.getContext('2d').clearRect(0, 0, oc.width, oc.height);
            this._drawSelectionRect(newX, newY, w, h);
            this.dragData = null;
            CONFIG.isDirty = true;
            window.autoSaveMgr?.onDirty();
            return true;
        }

        return false;
    }

    // Auto-selezione al click: trova il componente connesso di pixel non trasparenti
    // più vicino al punto (x,y) e ritorna il suo bounding box (con padding),
    // oppure null se il punto cade su pixel trasparenti.
    _autoSelectAt(cx, cy) {
        const W = this.canvas.width;
        const H = this.canvas.height;

        // Legge un'area limitata (±900px) per efficienza
        const AREA = 900;
        const ax = Math.max(0, cx - AREA);
        const ay = Math.max(0, cy - AREA);
        const aw = Math.min(W, cx + AREA) - ax;
        const ah = Math.min(H, cy + AREA) - ay;
        if (aw <= 0 || ah <= 0) return null;

        const imageData = this.ctx.getImageData(ax, ay, aw, ah);
        const data = imageData.data;

        // Funzione: pixel opaco?
        const isOpaque = (lx, ly) => {
            if (lx < 0 || ly < 0 || lx >= aw || ly >= ah) return false;
            return data[(ly * aw + lx) * 4 + 3] > 20;
        };

        // Cerca il seed: pixel opaco più vicino al click (raggio 16px) nello spazio locale
        const lcx = cx - ax, lcy = cy - ay;
        let seedX = -1, seedY = -1, bestDist = Infinity;
        const SR = 16;
        for (let dy = -SR; dy <= SR; dy++) {
            for (let dx = -SR; dx <= SR; dx++) {
                const lx = lcx + dx, ly = lcy + dy;
                if (isOpaque(lx, ly)) {
                    const dist = dx * dx + dy * dy;
                    if (dist < bestDist) { bestDist = dist; seedX = lx; seedY = ly; }
                }
            }
        }
        if (seedX < 0) return null;

        // DFS flood fill (pixel connessi diagonalmente inclusi) con limite 200K pixel
        const MAX_PIX = 200000;
        const visited = new Uint8Array(aw * ah);
        const stack = [seedY * aw + seedX];
        visited[seedY * aw + seedX] = 1;
        let minX = seedX, maxX = seedX, minY = seedY, maxY = seedY;
        let count = 0;

        while (stack.length > 0 && count < MAX_PIX) {
            const idx = stack.pop();
            count++;
            const px = idx % aw, py = (idx / aw) | 0;
            if (px < minX) minX = px;
            if (px > maxX) maxX = px;
            if (py < minY) minY = py;
            if (py > maxY) maxY = py;
            // 8-connessione
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    if (dx === 0 && dy === 0) continue;
                    const nx = px + dx, ny = py + dy;
                    const ni = ny * aw + nx;
                    if (isOpaque(nx, ny) && !visited[ni]) {
                        visited[ni] = 1;
                        stack.push(ni);
                    }
                }
            }
        }

        // Converti back alle coordinate canvas con padding
        const PAD = 6;
        const bx = Math.max(0, ax + minX - PAD);
        const by = Math.max(0, ay + minY - PAD);
        const bw = Math.min(W, ax + maxX + PAD) - bx;
        const bh = Math.min(H, ay + maxY + PAD) - by;
        if (bw < 2 || bh < 2) return null;
        return { x: bx, y: by, w: bw, h: bh };
    }

    // Gestisce Escape (deseleziona) e Delete/Backspace (cancella area selezionata o oggetto)
    handleKeydown(e) {
        if (!this.active) return;
        if (e.key === 'Escape') {
            this._clearSelection();
        }
        if (e.key === 'Delete' || e.key === 'Backspace') {
            // Elimina oggetto ObjectLayer selezionato
            if ((this.phase === 'object-selected') && this.selectedObject) {
                if (typeof canvasMgr !== 'undefined') canvasMgr._saveUndo();
                objectLayer.removeObject(this.selectedObject.id);
                this._clearSelection();
                return;
            }
            // Cancella selezione pixel
            if (this.phase === 'selected' && this.selection) {
                const { x, y, w, h } = this.selection;
                if (typeof canvasMgr !== 'undefined') canvasMgr._saveUndo();
                this.ctx.save();
                this.ctx.globalCompositeOperation = 'destination-out';
                this.ctx.fillStyle = 'rgba(255,255,255,1)';
                this.ctx.fillRect(x, y, w, h);
                this.ctx.restore();
                this._clearSelection();
            }
        }
    }
}

// =============================================================================
// SEZIONE 13b2 — ObjectLayer
// Gestisce gli oggetti importati (immagini/PDF) su un canvas separato.
// =============================================================================

class ObjectLayer {
    constructor() {
        this.canvas = document.getElementById('objects-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.objects = []; // Array di oggetti: {id, type, img, x, y, w, h, rotation, originalW, originalH, filter}
        this._nextId = 1;
    }

    resize(w, h) {
        this.canvas.width = w;
        this.canvas.height = h;
        this.canvas.style.width = w + 'px';
        this.canvas.style.height = h + 'px';
        this.render();
    }

    addObject(type, img, x, y, w, h) {
        const obj = {
            id: this._nextId++,
            type, // 'image' | 'pdf-page'
            img,  // HTMLImageElement o HTMLCanvasElement
            x, y, w, h,
            originalW: img.naturalWidth || img.width || w,
            originalH: img.naturalHeight || img.height || h,
            rotation: 0,
            filter: { brightness: 100, contrast: 100, saturation: 100 }
        };
        this.objects.push(obj);
        this.render();
        CONFIG.isDirty = true;
        window.autoSaveMgr?.onDirty();
        return obj;
    }

    removeObject(id) {
        this.objects = this.objects.filter(o => o.id !== id);
        this.render();
        CONFIG.isDirty = true;
        window.autoSaveMgr?.onDirty();
    }

    bringToFront(id) {
        const idx = this.objects.findIndex(o => o.id === id);
        if (idx < 0 || idx === this.objects.length - 1) return;
        const obj = this.objects.splice(idx, 1)[0];
        this.objects.push(obj);
        this.render();
    }

    sendToBack(id) {
        const idx = this.objects.findIndex(o => o.id === id);
        if (idx <= 0) return;
        const obj = this.objects.splice(idx, 1)[0];
        this.objects.unshift(obj);
        this.render();
    }

    render() {
        const ctx = this.ctx;
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        for (const obj of this.objects) {
            ctx.save();
            // Opacità
            ctx.globalAlpha = obj.opacity !== undefined ? obj.opacity : 1;
            // Applica filtri CSS canvas
            if (obj.filter) {
                ctx.filter = `brightness(${obj.filter.brightness || 100}%) contrast(${obj.filter.contrast || 100}%) saturate(${obj.filter.saturation || 100}%)`;
            } else {
                ctx.filter = 'none';
            }
            const cx = obj.x + obj.w / 2;
            const cy = obj.y + obj.h / 2;
            ctx.translate(cx, cy);
            if (obj.rotation) ctx.rotate(obj.rotation * Math.PI / 180);
            if (obj.flipH || obj.flipV) ctx.scale(obj.flipH ? -1 : 1, obj.flipV ? -1 : 1);
            ctx.drawImage(obj.img, -obj.w / 2, -obj.h / 2, obj.w, obj.h);
            // Bordo
            if (obj.borderWidth > 0) {
                ctx.filter = 'none';
                ctx.strokeStyle = obj.borderColor || '#3b82f6';
                ctx.lineWidth = obj.borderWidth;
                ctx.strokeRect(-obj.w / 2, -obj.h / 2, obj.w, obj.h);
            }
            ctx.restore();
        }
    }

    // Hit test: restituisce l'oggetto sotto (x,y) o null. Cerca dall'alto (ultimo prima)
    hitTest(x, y) {
        for (let i = this.objects.length - 1; i >= 0; i--) {
            const o = this.objects[i];
            if (x >= o.x && x <= o.x + o.w && y >= o.y && y <= o.y + o.h) return o;
        }
        return null;
    }

    // Sposta un oggetto (delta assoluto)
    moveObject(id, dx, dy) {
        const obj = this.objects.find(o => o.id === id);
        if (!obj) return;
        obj.x += dx;
        obj.y += dy;
        this.render();
    }

    // Ridimensiona un oggetto mantenendo le proporzioni
    resizeObject(id, newW) {
        const obj = this.objects.find(o => o.id === id);
        if (!obj) return;
        const ratio = obj.originalH / obj.originalW;
        obj.w = newW;
        obj.h = newW * ratio;
        this.render();
    }

    // Aggiorna filtri
    updateFilter(id, brightness, contrast, saturation) {
        const obj = this.objects.find(o => o.id === id);
        if (!obj) return;
        obj.filter = { brightness, contrast, saturation };
        this.render();
    }

    // Serializza per salvataggio
    serialize() {
        return this.objects.map(o => {
            const tmp = document.createElement('canvas');
            const srcW = o.img.naturalWidth || o.img.width || o.w;
            const srcH = o.img.naturalHeight || o.img.height || o.h;
            tmp.width = srcW;
            tmp.height = srcH;
            tmp.getContext('2d').drawImage(o.img, 0, 0);
            return {
                id: o.id, type: o.type, dataUrl: tmp.toDataURL(),
                x: o.x, y: o.y, w: o.w, h: o.h,
                rotation: o.rotation,
                originalW: o.originalW, originalH: o.originalH,
                filter: o.filter
            };
        });
    }

    // Carica da serializzato
    async loadSerialized(arr) {
        this.objects = [];
        for (const item of arr) {
            const img = new Image();
            await new Promise(r => { img.onload = r; img.src = item.dataUrl; });
            this.objects.push({ ...item, img });
        }
        this._nextId = Math.max(...this.objects.map(o => o.id), 0) + 1;
        this.render();
    }

    clear() {
        this.objects = [];
        this.render();
    }
}

// =============================================================================
// SEZIONE 13c — Sfondi da Google Drive
// Carica e mostra le miniature della cartella "Sfondi" nel bg-popup.
// =============================================================================

async function loadDriveBackgrounds() {
    const section = document.getElementById('bg-drive-section');
    const grid    = document.getElementById('bg-drive-images');
    if (!section || !grid) return;

    // Mostra sezione solo se Drive connesso
    if (typeof driveMgr === 'undefined' || !driveMgr || !driveMgr.isConnected()) {
        section.style.display = 'none';
        return;
    }

    section.style.display = 'block';

    // Inizializza upload bottone (una sola volta)
    const uploadBtn   = document.getElementById('bg-upload-btn');
    const uploadInput = document.getElementById('bg-upload-input');
    if (uploadBtn && uploadInput && !uploadBtn.dataset.init) {
        uploadBtn.dataset.init = '1';
        uploadBtn.addEventListener('click', () => uploadInput.click());
        uploadInput.addEventListener('change', async () => {
            const file = uploadInput.files[0];
            uploadInput.value = '';
            if (!file) return;
            uploadBtn.disabled = true;
            uploadBtn.textContent = 'Caricamento...';
            try {
                await driveMgr.uploadBackground(file);
                toast('Sfondo caricato!', 'success');
                await loadDriveBackgrounds();
            } catch (err) {
                toast('Errore upload: ' + err.message, 'error');
                uploadBtn.disabled = false;
                uploadBtn.textContent = '+ Carica sfondo';
            }
        });
    }
    if (uploadBtn) {
        uploadBtn.disabled = false;
        uploadBtn.textContent = '+ Carica sfondo';
    }

    grid.innerHTML = '<div class="bg-drive-loading">Caricamento...</div>';

    try {
        const images = await driveMgr.listBackgrounds();
        if (!images.length) {
            grid.innerHTML = '<div class="bg-drive-empty">Nessun sfondo nella cartella Drive</div>';
            return;
        }
        grid.innerHTML = '';
        for (const img of images) {
            const thumb = document.createElement('div');
            thumb.className = 'bg-drive-thumb';
            thumb.title = img.name;
            if (img.thumbnailLink) {
                thumb.style.backgroundImage = `url('${img.thumbnailLink}')`;
                thumb.style.backgroundSize = 'cover';
                thumb.style.backgroundPosition = 'center';
            } else {
                thumb.textContent = img.mimeType === 'application/pdf' ? '📄' : '🖼️';
            }
            // Mostra badge se PDF
            if (img.mimeType === 'application/pdf') {
                const badge = document.createElement('span');
                badge.textContent = 'PDF';
                badge.style.cssText = 'position:absolute;bottom:2px;right:2px;background:rgba(239,68,68,0.85);color:white;font-size:9px;padding:1px 3px;border-radius:2px;line-height:1.2';
                thumb.style.position = 'relative';
                thumb.appendChild(badge);
            }
            thumb.addEventListener('click', async () => {
                if (img.mimeType === 'application/pdf') {
                    toast('I PDF come sfondo non sono supportati — usa Importa per aggiungerli come oggetto', 'info');
                    return;
                }
                toast('Caricamento...', 'info');
                try {
                    const token = driveMgr.accessToken;
                    if (!token) { toast('Connetti Drive prima', 'error'); return; }
                    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${img.id}?alt=media`, {
                        headers: { Authorization: 'Bearer ' + token }
                    });
                    if (!res.ok) throw new Error('HTTP ' + res.status);
                    const blob = await res.blob();
                    const url  = URL.createObjectURL(blob);
                    const image = new Image();
                    image.onload = () => {
                        // Imposta come sfondo su bg-canvas (sotto i tratti)
                        bgMgr.setImage(image);
                        CONFIG.currentBg = 'image';
                        CONFIG.isDirty = true;
                        window.autoSaveMgr?.onDirty();
                        const popup = document.getElementById('bg-popup');
                        if (popup) popup.style.display = 'none';
                        toast('Sfondo impostato! Scrivi sopra liberamente.', 'success');
                        URL.revokeObjectURL(url);
                    };
                    image.onerror = () => toast('Errore caricamento immagine', 'error');
                    image.src = url;
                } catch (err) {
                    toast('Errore: ' + err.message, 'error');
                }
            });
            grid.appendChild(thumb);
        }
    } catch (err) {
        grid.innerHTML = `<div class="bg-drive-empty" style="color:#ef4444">Errore: ${err.message}</div>`;
    }
}

// =============================================================================
// SEZIONE 13d — Import Media (immagini e PDF come oggetti sul canvas)
// =============================================================================

/**
 * Calcola il centro del viewport visibile in coordinate canvas
 * (tenendo conto del pan e dello zoom corrente).
 */
function getViewportCenter() {
    const vw = window.innerWidth;
    const headerH = document.body.classList.contains('fullscreen-mode') ? 0 : 56;
    const vh = window.innerHeight - headerH;
    const area = document.getElementById('canvas-area');
    const rect = area.getBoundingClientRect();
    const scale = (typeof panMgr !== 'undefined' && panMgr) ? panMgr.scale : 1;
    const cx = (vw / 2 - rect.left) / scale;
    const cy = (vh / 2 - rect.top) / scale;
    return { x: cx, y: cy };
}

/**
 * Importa un file immagine come oggetto sul canvas.
 * @param {File} file
 * @param {number} [clientX] - posizione X del drop (opzionale, usa centro se omesso)
 * @param {number} [clientY] - posizione Y del drop (opzionale, usa centro se omesso)
 */
async function importImageFile(file, clientX, clientY) {
    const url = URL.createObjectURL(file);
    const img = new Image();
    return new Promise((resolve) => {
        img.onload = () => {
            let x, y;
            if (clientX !== undefined && clientY !== undefined) {
                // Drop position: usa la stessa funzione di conversione usata dal resto del codice
                const coords = (typeof panMgr !== 'undefined' && panMgr)
                    ? panMgr.getCanvasCoords(clientX, clientY)
                    : (() => {
                        const area = document.getElementById('canvas-area');
                        const rect = area.getBoundingClientRect();
                        return { x: clientX - rect.left, y: clientY - rect.top };
                    })();
                x = coords.x - img.naturalWidth / 2;
                y = coords.y - img.naturalHeight / 2;
            } else {
                const center = getViewportCenter();
                x = center.x - img.naturalWidth / 2;
                y = center.y - img.naturalHeight / 2;
            }
            // Non clampare a 0: il canvas è 3× il viewport e il centro visibile è a (W/2, H/2),
            // non all'origine. Il clamp a 0 sposterebbe le immagini grandi fuori dal foglio A4.
            img._sourceFile = file; // salva file originale per download
            objectLayer.addObject('image', img, x, y,
                img.naturalWidth, img.naturalHeight);
            URL.revokeObjectURL(url);
            toast('Immagine importata! Usa Seleziona per spostarla.', 'success');
            resolve();
        };
        img.onerror = () => {
            toast('Errore nel caricare l\'immagine', 'error');
            URL.revokeObjectURL(url);
            resolve();
        };
        img.src = url;
    });
}

/**
 * Importa un PDF (tutte le pagine) come oggetti sul canvas tramite PDF.js.
 * @param {File} file
 * @param {number} [clientX]
 * @param {number} [clientY]
 */
async function importPdfFile(file, clientX, clientY) {
    if (typeof pdfjsLib === 'undefined') {
        toast('PDF.js non disponibile — riprova tra un momento', 'error');
        return;
    }
    toast('Conversione PDF in corso...', 'info');
    try {
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const numPages = pdf.numPages;

        // Scala: fattore per renderizzare a buona risoluzione (1.5 = 150% DPI)
        const scale = 1.5;

        // Calcola posizione iniziale — usa la stessa conversione coordinate del resto del codice
        let baseX, baseY;
        if (clientX !== undefined && clientY !== undefined) {
            const coords = (typeof panMgr !== 'undefined' && panMgr)
                ? panMgr.getCanvasCoords(clientX, clientY)
                : (() => {
                    const area = document.getElementById('canvas-area');
                    const rect = area.getBoundingClientRect();
                    return { x: clientX - rect.left, y: clientY - rect.top };
                })();
            baseX = coords.x;
            baseY = coords.y;
        } else {
            const center = getViewportCenter();
            baseX = center.x;
            baseY = center.y;
        }

        // Renderizza tutte le pagine come immagini separate
        for (let pageNum = 1; pageNum <= numPages; pageNum++) {
            const page = await pdf.getPage(pageNum);
            const viewport = page.getViewport({ scale });

            const tmpCanvas = document.createElement('canvas');
            tmpCanvas.width  = viewport.width;
            tmpCanvas.height = viewport.height;
            const tmpCtx = tmpCanvas.getContext('2d');

            await page.render({ canvasContext: tmpCtx, viewport }).promise;

            // Converti in Image per ObjectLayer
            const imgEl = new Image();
            await new Promise(r => { imgEl.onload = r; imgEl.src = tmpCanvas.toDataURL('image/png'); });
            imgEl._sourceFile = file;      // salva file originale per download
            imgEl._sourcePage  = pageNum;  // numero di pagina

            // Aggiungi come oggetto (una pagina sotto l'altra, offset di 20px)
            const offsetY = baseY + (pageNum - 1) * (viewport.height / scale + 20);
            // Non clampare a 0: il canvas è 3× il viewport, il centro visibile non è all'origine
            objectLayer.addObject('pdf-page', imgEl, baseX, offsetY, viewport.width / scale, viewport.height / scale);
        }

        toast(`PDF importato! ${numPages} pagina${numPages > 1 ? 'e' : ''} — usa Seleziona per spostarle`, 'success');
    } catch (err) {
        console.error('PDF import error:', err);
        toast('Errore importazione PDF: ' + err.message, 'error');
    }
}

// =============================================================================
// SEZIONE 13e — PageManager
// Gestisce più pagine (slide) nella lavagna.
// =============================================================================

class PageManager {
    constructor(canvasManager, objectLayerRef, backgroundManager) {
        this.pages = [];
        this.currentIndex = 0;
        this.canvasManager = canvasManager;
        this.objectLayerRef = objectLayerRef;
        this.backgroundManager = backgroundManager;
        this._init();
    }

    _init() {
        this.pages.push(this._captureCurrentPage());
        this._renderPageBar();
    }

    _captureCurrentPage() {
        const drawCanvas = document.getElementById('draw-canvas');
        const W = drawCanvas?.width || 0;
        const H = drawCanvas?.height || 0;
        // Salva SOLO il ritaglio del foglio A4 (non l'intero canvas).
        // Al ripristino viene disegnato alla posizione corrente del foglio →
        // nessuno spostamento indipendentemente dalle dimensioni del canvas.
        let drawImageData = null;
        if (drawCanvas && W > 0 && typeof bgMgr !== 'undefined') {
            const r = bgMgr._getPageRect(W, H);
            const off = document.createElement('canvas');
            off.width  = r.pw;
            off.height = r.ph;
            off.getContext('2d').drawImage(drawCanvas, -r.px, -r.py);
            drawImageData = off.toDataURL('image/png');
        }
        // Calcola offset foglio per salvare coordinate oggetti come frazione del foglio A4.
        // Questo rende le coordinate indipendenti dalla risoluzione canvas (schermo diverso = stessa posizione).
        const objR = (W > 0 && typeof bgMgr !== 'undefined') ? bgMgr._getPageRect(W, H) : { px: 0, py: 0, pw: W || 1, ph: H || 1 };
        return {
            canvasWidth: W,
            pagePx: null,   // non più necessario (mantenuto per retrocompatibilità)
            pagePy: null,
            drawFormat: 'page',      // drawImageData è il ritaglio del foglio A4
            objectFormat: 'page-fraction',  // coordinate oggetti come frazione del foglio A4 (risoluzione-indipendente)
            drawImageData,
            objects: JSON.parse(JSON.stringify(this.objectLayerRef.objects.map(o => {
                // Serializza l'immagine come dataUrl per il salvataggio in memoria.
                // Coordinate e dimensioni salvate come frazione del foglio A4 (0.0–1.0)
                // così si ripristinano correttamente su qualsiasi schermo/risoluzione.
                try {
                    const tmp = document.createElement('canvas');
                    const srcW = o.img.naturalWidth || o.img.width || o.w;
                    const srcH = o.img.naturalHeight || o.img.height || o.h;
                    tmp.width = srcW;
                    tmp.height = srcH;
                    tmp.getContext('2d').drawImage(o.img, 0, 0);
                    // Tutte le coordinate normalizzate per pw (unico fattore).
                    // Garantisce proporzioni corrette indipendentemente da schermo e orientamento.
                    return { ...o, img: null, dataUrl: tmp.toDataURL(),
                        x: (o.x - objR.px) / objR.pw,
                        y: (o.y - objR.py) / objR.pw,
                        w: o.w / objR.pw,
                        h: o.h / objR.pw };
                } catch (_) {
                    return { ...o, img: null, dataUrl: null };
                }
            }))),
            background: {
                type: this.backgroundManager.currentBg,
                color: this.backgroundManager.bgColor,
                orientation: this.backgroundManager.orientation
            }
        };
    }

    _restorePage(pageData) {
        this._restoring = true;

        // ── 0. Ripristina orientamento/sfondo PRIMA di qualsiasi _getPageRect ──
        // CRITICO: _getPageRect usa bgMgr.orientation. Se fosse ancora impostato
        // sull'orientamento della pagina precedente, disegno e oggetti sarebbero
        // posizionati con pw/px/py SBAGLIATI → oggetti spostati/ridimensionati.
        if (pageData.background && typeof bgMgr !== 'undefined') {
            bgMgr.orientation = pageData.background.orientation || 'landscape';
        }

        const drawCanvas = document.getElementById('draw-canvas');
        const ctx = drawCanvas.getContext('2d');
        ctx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);

        const allRestorePromises = [];

        if (pageData.drawImageData) {
            const img = new Image();
            if (pageData.drawFormat === 'page' && typeof bgMgr !== 'undefined') {
                // Formato corrente: drawImageData è il ritaglio del foglio A4.
                // Disegna SCALANDO alla dimensione corrente del foglio → funziona su qualsiasi schermo.
                const r = bgMgr._getPageRect(drawCanvas.width, drawCanvas.height);
                allRestorePromises.push(new Promise(res => {
                    img.onload = () => { ctx.drawImage(img, r.px, r.py, r.pw, r.ph); res(); };
                    img.onerror = res;
                }));
            } else {
                // Vecchio formato: drawImageData è l'intero canvas.
                let offsetX = 0, offsetY = 0;
                if (pageData.pagePx != null && typeof bgMgr !== 'undefined') {
                    const curr = bgMgr._getPageRect(drawCanvas.width, drawCanvas.height);
                    offsetX = curr.px - pageData.pagePx;
                    offsetY = curr.py - pageData.pagePy;
                }
                allRestorePromises.push(new Promise(res => {
                    img.onload = () => { ctx.drawImage(img, offsetX, offsetY); res(); };
                    img.onerror = res;
                }));
            }
            img.src = pageData.drawImageData;
        }
        // Ripristina objects
        this.objectLayerRef.objects = [];
        const r2 = (typeof bgMgr !== 'undefined') ? bgMgr._getPageRect(drawCanvas.width, drawCanvas.height) : { px: 0, py: 0, pw: drawCanvas.width, ph: drawCanvas.height };
        const loadPromises = (pageData.objects || []).map(o => new Promise(resolve => {
            if (!o.dataUrl) { resolve(); return; }
            const img = new Image();
            img.onload = () => {
                let x, y, w, h;
                if (pageData.objectFormat === 'page-fraction') {
                    // Formato corrente: tutte le coordinate come frazione di pw (unico fattore).
                    // Moltiplica per pw corrente → risoluzione e orientamento indipendenti.
                    x = o.x * r2.pw + r2.px;
                    y = o.y * r2.pw + r2.py;
                    w = o.w * r2.pw;
                    h = o.h * r2.pw;
                } else if (pageData.objectFormat === 'page-relative') {
                    // Vecchio formato: coordinate in pixel-canvas relative all'origine del foglio.
                    x = o.x + r2.px;
                    y = o.y + r2.py;
                    w = o.w; h = o.h;
                } else {
                    x = o.x; y = o.y; w = o.w; h = o.h;
                }
                this.objectLayerRef.objects.push({ ...o, img, x, y, w, h });
                resolve();
            };
            img.onerror = resolve;
            img.src = o.dataUrl;
        }));
        Promise.all([...allRestorePromises, ...loadPromises]).then(() => {
            this.objectLayerRef.render();
            this._restoring = false;
        });

        // Ripristina sfondo (orientamento già impostato sopra — aggiorna solo il resto dell'UI)
        if (pageData.background) {
            this.backgroundManager.currentBg = pageData.background.type || 'white';
            this.backgroundManager.bgColor = pageData.background.color || '#ffffff';
            this.backgroundManager.orientation = pageData.background.orientation || 'landscape';
            this.backgroundManager.uploadedImage = null;
            this.backgroundManager.render();
            // Aggiorna UI colore/orientamento
            const colorEl = document.getElementById('bg-page-color');
            if (colorEl) colorEl.value = this.backgroundManager.bgColor;
            const swatch = document.getElementById('bg-page-color-swatch');
            if (swatch) swatch.style.background = this.backgroundManager.bgColor;
            const oL = document.getElementById('bg-orient-landscape');
            const oP = document.getElementById('bg-orient-portrait');
            if (oL && oP) {
                oL.classList.toggle('active', this.backgroundManager.orientation === 'landscape');
                oP.classList.toggle('active', this.backgroundManager.orientation === 'portrait');
            }
        }
    }

    goToPage(index) {
        if (index < 0 || index >= this.pages.length) return;
        // Non sovrascrivere la pagina corrente se è ancora in fase di ripristino
        // (race condition: capture avverrebbe su canvas ancora vuoto/parziale)
        if (!this._restoring) {
            this.pages[this.currentIndex] = this._captureCurrentPage();
        }
        this.currentIndex = index;
        this._restorePage(this.pages[this.currentIndex]);
        this._updatePageBar();
        // Aggiorna la pagina corrente in localStorage per il ripristino auto-open
        try {
            const raw = localStorage.getItem('eduboard_last_lesson');
            if (raw) {
                const d = JSON.parse(raw);
                d.lastPage = this.currentIndex;
                localStorage.setItem('eduboard_last_lesson', JSON.stringify(d));
            }
        } catch (_) {}
    }

    addPage() {
        this.pages[this.currentIndex] = this._captureCurrentPage();
        // FIX PAGINE A: eredita sfondo (tipo, colore, orientamento) dalla pagina corrente
        const currentBg = this.pages[this.currentIndex].background;
        this.pages.push({
            drawImageData: null,
            objects: [],
            background: {
                type: currentBg.type || 'white',
                color: currentBg.color || '#ffffff',
                orientation: currentBg.orientation || 'landscape'
            }
        });
        this.currentIndex = this.pages.length - 1;
        this._restorePage(this.pages[this.currentIndex]);
        this._updatePageBar();
        CONFIG.isDirty = true;
        window.autoSaveMgr?.onDirty();
    }

    deletePage(index) {
        if (this.pages.length <= 1) return;
        if (!confirm(`Eliminare la pagina ${index + 1}?`)) return;
        this.pages.splice(index, 1);
        const newIndex = Math.min(this.currentIndex, this.pages.length - 1);
        this.currentIndex = newIndex;
        this._restorePage(this.pages[this.currentIndex]);
        this._updatePageBar();
        CONFIG.isDirty = true;
        window.autoSaveMgr?.onDirty();
    }

    serialize() {
        this.pages[this.currentIndex] = this._captureCurrentPage();
        return this.pages;
    }

    deserialize(pagesData, startPage = 0) {
        if (!pagesData || !pagesData.length) return;
        this.pages = pagesData;
        const idx = (startPage > 0 && startPage < pagesData.length) ? startPage : 0;
        this.currentIndex = idx;
        this._restorePage(this.pages[idx]);
        this._renderPageBar();
    }

    _renderPageBar() {
        let bar = document.getElementById('page-bar');
        if (!bar) {
            bar = document.createElement('div');
            bar.id = 'page-bar';
            // Inserisci sotto il canvas-area (dopo il main#canvas-area)
            const canvasArea = document.getElementById('canvas-area');
            if (canvasArea && canvasArea.parentNode) {
                canvasArea.parentNode.insertBefore(bar, canvasArea.nextSibling);
            } else {
                document.body.appendChild(bar);
            }
        }
        this._updatePageBar();
    }

    _updatePageBar() {
        const bar = document.getElementById('page-bar');
        if (!bar) return;
        bar.innerHTML = '';

        // Pulsante sfondo rapido (prima dei numeri di pagina)
        const bgBtn = document.createElement('button');
        bgBtn.className = 'page-bar-icon-btn';
        bgBtn.title = 'Cambia sfondo';
        bgBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="15" height="15">
            <rect x="2" y="4" width="20" height="16" rx="3"/>
            <circle cx="8.5" cy="9.5" r="1.5"/>
            <polyline points="2,19 8,13 12,17 16,12 22,19"/>
        </svg>`;
        bgBtn.addEventListener('click', () => {
            // Simula click sul pulsante sfondo nella toolbar (id: bg-tool-btn)
            const bgModalBtn = document.getElementById('bg-tool-btn');
            if (bgModalBtn) bgModalBtn.click();
        });
        bar.appendChild(bgBtn);

        this.pages.forEach((p, i) => {
            // FIX PAGINE B: container con pulsante X visibile (touch-friendly, niente contextmenu)
            const pageContainer = document.createElement('div');
            pageContainer.className = 'page-container';

            const btn = document.createElement('button');
            btn.className = 'page-btn' + (i === this.currentIndex ? ' page-btn--active' : '');
            btn.textContent = i + 1;
            btn.title = `Pagina ${i + 1}`;
            btn.addEventListener('click', () => this.goToPage(i));

            if (this.pages.length > 1) {
                const delBtn = document.createElement('button');
                delBtn.className = 'page-del-btn';
                delBtn.textContent = '×';
                delBtn.title = `Elimina pagina ${i + 1}`;
                delBtn.addEventListener('click', (e) => { e.stopPropagation(); this.deletePage(i); });
                pageContainer.appendChild(delBtn);
            }

            pageContainer.appendChild(btn);
            bar.appendChild(pageContainer);
        });
        const addBtn = document.createElement('button');
        addBtn.className = 'page-btn page-btn--add';
        addBtn.textContent = '+';
        addBtn.title = 'Aggiungi pagina';
        addBtn.addEventListener('click', () => this.addPage());
        bar.appendChild(addBtn);

        // La larghezza della page-bar è cambiata (pagina aggiunta/rimossa): ricentra il menu
        if (typeof toolbarMgr !== 'undefined' && toolbarMgr) {
            requestAnimationFrame(() => toolbarMgr._updateBounds());
        }
    }
}

// =============================================================================
// SEZIONE 14 — MINI COLOR BAR
// Barra colori rapida persistente, visibile solo con strumenti di scrittura.
// =============================================================================

const MAX_RECENT_MINI = 4;
const DEFAULT_COLORS_MINI = ['#000000', '#dc2626', '#1d4ed8', '#16a34a'];

// Colori recenti della SESSIONE CORRENTE (reset ad ogni ricaricamento, mai su localStorage)
let _miniSessionColors = [];

function setupMiniColorBar() {
    const bar = document.getElementById('mini-color-bar');
    if (!bar) return;

    let _toolbarOpen = false;

    function _applyColor(color) {
        CONFIG.currentColor = color;
        if (typeof brush !== 'undefined' && brush) brush.color = color;
        // Sincronizza toolbar principale
        document.querySelectorAll('.color-swatch').forEach(b => b.classList.remove('active'));
        const match = document.querySelector(`.color-swatch[data-color="${CSS.escape ? CSS.escape(color) : color}"]`);
        if (match) { match.classList.add('active'); }
        else {
            const custom = document.getElementById('color-custom');
            if (custom) { custom.style.background = color; custom.classList.add('active'); }
        }
        // Aggiorna recenti sessione (prepend, no duplicati, max 4)
        _miniSessionColors = [color, ..._miniSessionColors.filter(c => c !== color)].slice(0, MAX_RECENT_MINI);
        renderBar();
    }

    function getDisplayColors() {
        return [...new Set([..._miniSessionColors, ...DEFAULT_COLORS_MINI])].slice(0, MAX_RECENT_MINI);
    }

    function renderBar() {
        bar.querySelectorAll('.mini-color-dot').forEach(d => d.remove());
        getDisplayColors().forEach(color => {
            const dot = document.createElement('button');
            dot.className = 'mini-color-dot' + (color === CONFIG.currentColor ? ' active' : '');
            dot.style.background = color;
            dot.title = color;
            dot.addEventListener('click', () => _applyColor(color));
            bar.appendChild(dot);
        });
    }

    function updateVisibility() {
        const drawTools = ['pen', 'pencil', 'pastel', 'marker'];
        const isDrawTool = drawTools.includes(CONFIG.currentTool);
        // Nascondi se toolbar grande aperta O se non è uno strumento di scrittura
        const show = isDrawTool && !_toolbarOpen;
        bar.style.display = show ? 'flex' : 'none';
        if (show) renderBar();
    }

    // Nascondi quando il menu grande si apre
    document.addEventListener('toolbar:opened', () => { _toolbarOpen = true; updateVisibility(); });
    document.addEventListener('toolbar:closed',  () => { _toolbarOpen = false; updateVisibility(); });

    // Aggiorna pallino attivo quando il colore cambia dal menu principale
    document.addEventListener('minicolor:update', (e) => {
        const color = e.detail?.color;
        if (!color) return;
        _miniSessionColors = [color, ..._miniSessionColors.filter(c => c !== color)].slice(0, MAX_RECENT_MINI);
        if (bar.style.display !== 'none') renderBar();
    });

    // Aggiorna visibilità quando cambia strumento
    document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
        btn.addEventListener('click', () => setTimeout(updateVisibility, 50));
    });

    updateVisibility(); // stato iniziale
}

// =============================================================================
// SEZIONE 14b — MINI SIZE BAR
// Barra dimensioni tratto a destra della freccia toolbar, icone linea SVG.
// =============================================================================

function setupMiniSizeBar() {
    const bar = document.getElementById('mini-size-bar');
    if (!bar) return;

    // Dimensioni esposte: include extra-small (1px)
    const SIZES = [1, 3, 6, 10, 16];
    // SVG stroke-width proporzionale per l'icona
    const SIZE_SW = [0.8, 1.5, 3, 5, 8];

    let _toolbarOpen = false;

    function _applySize(size) {
        CONFIG.currentSize = size;
        // Sincronizza toolbar principale
        document.querySelectorAll('.size-btn').forEach(b => {
            b.classList.toggle('active', parseInt(b.dataset.size) === size);
        });
        renderBar();
    }

    function renderBar() {
        bar.innerHTML = '';
        SIZES.forEach((size, i) => {
            const btn = document.createElement('button');
            btn.className = 'mini-size-btn' + (CONFIG.currentSize === size ? ' active' : '');
            btn.title = `Dimensione ${size}`;
            btn.dataset.size = size;
            // Icona: linea orizzontale con spessore crescente
            btn.innerHTML = `<svg viewBox="0 0 24 24" width="24" height="24" fill="none">
                <line x1="3" y1="12" x2="21" y2="12" stroke="currentColor" stroke-width="${SIZE_SW[i]}" stroke-linecap="round"/>
            </svg>`;
            btn.addEventListener('click', () => _applySize(size));
            bar.appendChild(btn);
        });
    }

    function updateVisibility() {
        const drawTools = ['pen', 'pencil', 'pastel', 'marker', 'eraser'];
        const isDrawTool = drawTools.includes(CONFIG.currentTool);
        const show = isDrawTool && !_toolbarOpen;
        bar.style.display = show ? 'flex' : 'none';
        if (show) renderBar();
    }

    // Nascondi quando il menu grande si apre
    document.addEventListener('toolbar:opened', () => { _toolbarOpen = true; updateVisibility(); });
    document.addEventListener('toolbar:closed',  () => { _toolbarOpen = false; updateVisibility(); });

    // Aggiorna quando cambia strumento
    document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
        btn.addEventListener('click', () => setTimeout(updateVisibility, 50));
    });

    // Sincronizza se la dimensione cambia dalla toolbar principale
    document.querySelectorAll('.size-btn').forEach(btn => {
        btn.addEventListener('click', () => setTimeout(() => {
            if (bar.style.display !== 'none') renderBar();
        }, 60));
    });

    updateVisibility();
}

// =============================================================================
// SEZIONE 13f — Overlay Tools: Timer, Spotlight, Tendina didattica
// =============================================================================

// ─────────────────────────────────────────────────────────────────────────────
// TIMER — Cronometro / Conto alla rovescia draggabile sul canvas
// ─────────────────────────────────────────────────────────────────────────────

class TimerWidget {
    constructor() {
        this.el        = null;
        this.visible   = false;
        this._interval = null;
        this._seconds  = 0;       // secondi rimasti (countdown) o trascorsi (stopwatch)
        this._running  = false;
        this._mode     = 'countdown'; // 'countdown' | 'stopwatch'
        this._drag     = { on: false, startX: 0, startY: 0, origX: 0, origY: 0 };
        this._x        = 40;
        this._y        = 100;
    }

    create() {
        const el = document.createElement('div');
        el.id = 'timer-widget';
        el.innerHTML = `
            <div class="timer-drag-bar" id="timer-drag-bar" title="Trascina">⠿</div>
            <div class="timer-display" id="timer-display">00:00</div>
            <div class="timer-custom-row" id="timer-custom-row" title="Imposta minuti e secondi">
                <input class="timer-input" id="timer-input-min" type="number" min="0" max="99" value="0" placeholder="mm">
                <span class="timer-colon">:</span>
                <input class="timer-input" id="timer-input-sec" type="number" min="0" max="59" value="0" placeholder="ss">
                <button class="timer-set-btn" id="timer-set-btn" title="Imposta tempo">✓</button>
            </div>
            <div class="timer-controls">
                <button class="timer-btn" id="timer-start" title="Avvia / Pausa">▶</button>
                <button class="timer-btn" id="timer-reset" title="Reset">↺</button>
                <button class="timer-mode" id="timer-mode-btn" title="Cambia modalità">⏱</button>
            </div>
            <div class="timer-presets" id="timer-presets">
                <button class="timer-preset" data-sec="60">1'</button>
                <button class="timer-preset" data-sec="120">2'</button>
                <button class="timer-preset" data-sec="180">3'</button>
                <button class="timer-preset" data-sec="300">5'</button>
                <button class="timer-preset" data-sec="600">10'</button>
            </div>
            <button class="timer-close" id="timer-close" title="Chiudi">×</button>`;
        el.style.display = 'none';
        document.body.appendChild(el);
        this.el = el;

        this._setupDrag();

        el.querySelector('#timer-start').addEventListener('click', () => this._toggleRun());
        el.querySelector('#timer-reset').addEventListener('click', () => this._reset());
        el.querySelector('#timer-close').addEventListener('click', () => this.hide());
        el.querySelector('#timer-mode-btn').addEventListener('click', () => this._toggleMode());

        // Input manuale minuti:secondi
        el.querySelector('#timer-set-btn').addEventListener('click', () => this._setCustomTime());
        el.querySelector('#timer-input-min').addEventListener('keydown', e => { if (e.key === 'Enter') this._setCustomTime(); });
        el.querySelector('#timer-input-sec').addEventListener('keydown', e => { if (e.key === 'Enter') this._setCustomTime(); });

        el.querySelectorAll('.timer-preset').forEach(btn => {
            btn.addEventListener('click', () => {
                this._mode = 'countdown';
                this._seconds = parseInt(btn.dataset.sec);
                this._running = false;
                clearInterval(this._interval);
                this._updateDisplay();
                el.querySelector('#timer-start').textContent = '▶';
                el.querySelector('#timer-mode-btn').textContent = '⏱';
            });
        });
    }

    _setCustomTime() {
        const m = parseInt(this.el.querySelector('#timer-input-min').value) || 0;
        const s = parseInt(this.el.querySelector('#timer-input-sec').value) || 0;
        const total = m * 60 + Math.min(s, 59);
        if (total <= 0) return;
        clearInterval(this._interval);
        this._running = false;
        this._mode = 'countdown';
        this._seconds = total;
        this._updateDisplay();
        this.el.querySelector('#timer-start').textContent = '▶';
        this.el.querySelector('#timer-mode-btn').textContent = '⏱';
        this.el.querySelector('#timer-presets').style.display = 'flex';
        this.el.classList.remove('timer-finished');
        this.el.classList.remove('timer-low');
    }

    _toggleRun() {
        if (this._running) {
            clearInterval(this._interval);
            this._running = false;
            this.el.querySelector('#timer-start').textContent = '▶';
        } else {
            this._running = true;
            this.el.querySelector('#timer-start').textContent = '⏸';
            this._interval = setInterval(() => {
                if (this._mode === 'countdown') {
                    if (this._seconds <= 0) {
                        clearInterval(this._interval);
                        this._running = false;
                        this.el.querySelector('#timer-start').textContent = '▶';
                        this.el.classList.remove('timer-low');
                        this.el.classList.add('timer-finished');
                        this._playBeep();
                        setTimeout(() => this.el.classList.remove('timer-finished'), 3000);
                        return;
                    }
                    this._seconds--;
                    if (this._seconds > 0 && this._seconds <= 10) {
                        this.el.classList.add('timer-low');
                    } else {
                        this.el.classList.remove('timer-low');
                    }
                } else {
                    this._seconds++;
                }
                this._updateDisplay();
            }, 1000);
        }
    }

    _reset() {
        clearInterval(this._interval);
        this._running = false;
        this._seconds = 0;
        this._updateDisplay();
        this.el.querySelector('#timer-start').textContent = '▶';
        this.el.classList.remove('timer-finished');
        this.el.classList.remove('timer-low');
    }

    _toggleMode() {
        this._reset();
        this._mode = this._mode === 'countdown' ? 'stopwatch' : 'countdown';
        this.el.querySelector('#timer-mode-btn').textContent =
            this._mode === 'countdown' ? '⏱' : '⏲';
        this.el.querySelector('#timer-presets').style.display =
            this._mode === 'countdown' ? 'flex' : 'none';
    }

    _updateDisplay() {
        const m = Math.floor(this._seconds / 60);
        const s = this._seconds % 60;
        const txt = String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
        this.el.querySelector('#timer-display').textContent = txt;
        // Cambia colore quando il tempo sta per scadere
        if (this._mode === 'countdown' && this._seconds <= 10 && this._seconds > 0) {
            this.el.querySelector('#timer-display').style.color = '#ef4444';
        } else {
            this.el.querySelector('#timer-display').style.color = '';
        }
    }

    _setupDrag() {
        const bar = this.el.querySelector('#timer-drag-bar');
        bar.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            e.stopPropagation();
            bar.setPointerCapture(e.pointerId);
            this._drag = { on: true, startX: e.clientX, startY: e.clientY,
                           origX: this._x, origY: this._y };
        });
        window.addEventListener('pointermove', (e) => {
            if (!this._drag.on) return;
            this._x = this._drag.origX + (e.clientX - this._drag.startX);
            this._y = this._drag.origY + (e.clientY - this._drag.startY);
            this.el.style.left = this._x + 'px';
            this.el.style.top  = this._y + 'px';
        });
        window.addEventListener('pointerup', () => { this._drag.on = false; });
    }

    _playBeep() {
        try {
            const ac = new (window.AudioContext || window.webkitAudioContext)();
            [0, 0.35, 0.7].forEach(t => {
                const osc  = ac.createOscillator();
                const gain = ac.createGain();
                osc.connect(gain);
                gain.connect(ac.destination);
                osc.type = 'sine';
                osc.frequency.value = 880;
                gain.gain.setValueAtTime(0.5, ac.currentTime + t);
                gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + t + 0.3);
                osc.start(ac.currentTime + t);
                osc.stop(ac.currentTime + t + 0.3);
            });
            setTimeout(() => ac.close(), 2500);
        } catch(e) { /* AudioContext non disponibile */ }
    }

    show() {
        this.el.style.display = 'flex';
        this.el.style.left = this._x + 'px';
        this.el.style.top  = this._y + 'px';
        this.visible = true;
    }

    hide() {
        clearInterval(this._interval);
        this._running = false;
        this.el.style.display = 'none';
        this.visible = false;
        const btn = document.getElementById('btn-timer');
        if (btn) btn.classList.remove('active');
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// SPOTLIGHT — Overlay scuro con foro circolare draggabile (focalizza attenzione)
// ─────────────────────────────────────────────────────────────────────────────

class SpotlightTool {
    constructor() {
        this.el        = null;
        this.visible   = false;
        this._x        = window.innerWidth  / 2;
        this._y        = window.innerHeight / 2;
        this._r        = 120;
        this._shape    = 'circle'; // 'circle' | 'rect'
        this._opacity  = 0.80;
        this._pointers = new Map();
    }

    create() {
        const el = document.createElement('canvas');
        el.id = 'spotlight-canvas';
        el.style.cssText = 'position:fixed;top:0;left:0;pointer-events:none;z-index:160;display:none;';
        document.body.appendChild(el);
        this.el = el;

        // Pannello controlli — pill verticale
        const ctrl = document.createElement('div');
        ctrl.id = 'spotlight-ctrl';
        ctrl.className = 'overlay-pill';
        ctrl.style.display = 'none';
        ctrl.innerHTML = `
            <button class="overlay-pill-btn active" id="spotlight-circle" title="Cerchio">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/></svg>
            </button>
            <button class="overlay-pill-btn" id="spotlight-rect" title="Rettangolo">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="6" width="18" height="12" rx="2"/></svg>
            </button>
            <div class="overlay-pill-sep"></div>
            <button class="overlay-pill-btn" id="spotlight-opacity-btn" title="Oscurità">
                <svg viewBox="0 0 24 24" width="18" height="18"><path d="M12 3a9 9 0 1 0 0 18A9 9 0 0 0 12 3z" fill="currentColor" opacity="0.25"/><path d="M12 3a9 9 0 0 1 0 18V3z" fill="currentColor"/></svg>
            </button>
            <button class="overlay-pill-btn" id="spotlight-close" title="Chiudi Focus">
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
            <div class="overlay-opacity-popup" id="spotlight-opacity-popup" style="display:none">
                <svg viewBox="0 0 24 24" width="15" height="15" style="flex-shrink:0"><path d="M12 3a9 9 0 1 0 0 18A9 9 0 0 0 12 3z" fill="currentColor" opacity="0.25"/><path d="M12 3a9 9 0 0 1 0 18V3z" fill="currentColor"/></svg>
                <input type="range" id="spotlight-opacity-input" min="40" max="97" value="80" style="width:110px">
            </div>`;
        document.body.appendChild(ctrl);
        this._ctrl = ctrl;

        ctrl.querySelector('#spotlight-circle').addEventListener('click', () => {
            this._shape = 'circle';
            ctrl.querySelector('#spotlight-circle').classList.add('active');
            ctrl.querySelector('#spotlight-rect').classList.remove('active');
            this._render();
        });
        ctrl.querySelector('#spotlight-rect').addEventListener('click', () => {
            this._shape = 'rect';
            ctrl.querySelector('#spotlight-rect').classList.add('active');
            ctrl.querySelector('#spotlight-circle').classList.remove('active');
            this._render();
        });
        ctrl.querySelector('#spotlight-opacity-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            const p = document.getElementById('spotlight-opacity-popup');
            p.style.display = p.style.display === 'none' ? 'flex' : 'none';
        });
        ctrl.querySelector('#spotlight-opacity-input').addEventListener('input', (e) => {
            this._opacity = e.target.value / 100;
            this._render();
        });
        ctrl.querySelector('#spotlight-close').addEventListener('click', () => this.hide());

        // Drag area — 1 dito: sposta; 2 dita: ridimensiona (pinch)
        const dragArea = document.createElement('div');
        dragArea.id = 'spotlight-drag-area';
        dragArea.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:161;display:none;cursor:none;touch-action:none;';
        document.body.appendChild(dragArea);
        this._dragArea = dragArea;

        dragArea.addEventListener('pointerdown', (e) => {
            dragArea.setPointerCapture(e.pointerId);
            this._pointers.set(e.pointerId, {x: e.clientX, y: e.clientY});
        });
        dragArea.addEventListener('pointermove', (e) => {
            if (!this._pointers.has(e.pointerId)) return;
            const evts = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
            for (const ev of evts) {
                const prev = this._pointers.get(ev.pointerId);
                if (!prev) continue;
                if (this._pointers.size === 1) {
                    this._x = ev.clientX;
                    this._y = ev.clientY;
                } else if (this._pointers.size === 2) {
                    const otherId = [...this._pointers.keys()].find(id => id !== ev.pointerId);
                    const other   = this._pointers.get(otherId);
                    const prevD   = Math.hypot(prev.x - other.x, prev.y - other.y);
                    const newD    = Math.hypot(ev.clientX - other.x, ev.clientY - other.y);
                    if (prevD > 10) this._r = Math.max(40, Math.min(400, this._r * (newD / prevD)));
                }
                this._pointers.set(ev.pointerId, {x: ev.clientX, y: ev.clientY});
            }
            this._render();
        });
        dragArea.addEventListener('pointerup',     (e) => this._pointers.delete(e.pointerId));
        dragArea.addEventListener('pointercancel', (e) => this._pointers.delete(e.pointerId));
    }

    _render() {
        const W = window.innerWidth;
        const H = window.innerHeight;
        this.el.width  = W;
        this.el.height = H;
        const ctx = this.el.getContext('2d');
        ctx.clearRect(0, 0, W, H);

        ctx.fillStyle = `rgba(0,0,0,${this._opacity})`;
        ctx.fillRect(0, 0, W, H);

        ctx.save();
        ctx.globalCompositeOperation = 'destination-out';
        if (this._shape === 'circle') {
            const grad = ctx.createRadialGradient(this._x, this._y, this._r * 0.7, this._x, this._y, this._r);
            grad.addColorStop(0, 'rgba(0,0,0,1)');
            grad.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(this._x, this._y, this._r, 0, Math.PI * 2);
            ctx.fill();
        } else {
            const hw = this._r * 1.4, hh = this._r * 0.9;
            ctx.fillStyle = 'rgba(0,0,0,1)';
            ctx.beginPath();
            const rx = this._x - hw, ry = this._y - hh, rw = hw * 2, rh = hh * 2, rad = 18;
            ctx.moveTo(rx + rad, ry);
            ctx.arcTo(rx + rw, ry,      rx + rw, ry + rh, rad);
            ctx.arcTo(rx + rw, ry + rh, rx,      ry + rh, rad);
            ctx.arcTo(rx,      ry + rh, rx,      ry,      rad);
            ctx.arcTo(rx,      ry,      rx + rw, ry,      rad);
            ctx.closePath();
            ctx.fill();
        }
        ctx.restore();

        // Posiziona pill a destra del foro
        if (this._ctrl) {
            this._ctrl.style.left = Math.min(this._x + this._r + 12, W - 58) + 'px';
            this._ctrl.style.top  = Math.max(this._y - 80, 10) + 'px';
        }
    }

    show() {
        this._x = window.innerWidth  / 2;
        this._y = window.innerHeight / 2;
        this.el.style.display        = 'block';
        this._dragArea.style.display = 'block';
        if (this._ctrl) this._ctrl.style.display = 'flex';
        this._render();
        this.visible = true;
    }

    hide() {
        this.el.style.display        = 'none';
        this._dragArea.style.display = 'none';
        if (this._ctrl) this._ctrl.style.display = 'none';
        this._pointers.clear();
        this.visible = false;
        const btn = document.getElementById('btn-spotlight');
        if (btn) btn.classList.remove('active');
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// TENDINA — Rettangolo scorrevole che copre il canvas per rivelare a poco a poco
// ─────────────────────────────────────────────────────────────────────────────

class TendinaTool {
    constructor() {
        this.el         = null;
        this.visible    = false;
        this._h         = 0;
        this._drag      = { on: false, startY: 0, origH: 0 };
        this._bgOpacity = 0.93;
        this._imgUrl    = null;
    }

    _applyBg() {
        if (this._imgUrl) {
            this.el.style.background = `linear-gradient(rgba(0,0,0,${(this._bgOpacity * 0.65).toFixed(2)}),rgba(0,0,0,${(this._bgOpacity * 0.65).toFixed(2)})),url(${this._imgUrl}) top center/cover no-repeat`;
        } else {
            this.el.style.background = `rgba(15,15,20,${this._bgOpacity})`;
        }
    }

    create() {
        const el = document.createElement('div');
        el.id = 'tendina-cover';
        el.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:0;z-index:155;display:none;transition:none;';
        document.body.appendChild(el);
        this.el = el;
        this._applyBg();

        // Etichetta sopra la barra
        const label = document.createElement('div');
        label.id = 'tendina-label';
        label.textContent = 'trascina per aprire / chiudere';
        el.appendChild(label);

        // Barra di trascinamento con bottoni integrati
        const handle = document.createElement('div');
        handle.id = 'tendina-handle';
        handle.innerHTML = `
            <div class="tendina-drag-zone">
                <div class="tendina-bar-dot"></div>
            </div>
            <div class="tendina-actions">
                <button class="tendina-action-btn" id="tendina-opacity-btn" title="Opacità tendina">
                    <svg viewBox="0 0 24 24" width="16" height="16"><path d="M12 3a9 9 0 1 0 0 18A9 9 0 0 0 12 3z" fill="currentColor" opacity="0.3"/><path d="M12 3a9 9 0 0 1 0 18V3z" fill="currentColor"/></svg>
                </button>
                <button class="tendina-action-btn" id="tendina-import-btn" title="Importa immagine">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" stroke="none"/><polyline points="21 15 16 10 5 21"/></svg>
                </button>
                <button class="tendina-action-btn" id="tendina-close" title="Chiudi tendina">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
            </div>
            <div class="tendina-opacity-popup" id="tendina-opacity-popup" style="display:none">
                <svg viewBox="0 0 24 24" width="14" height="14" style="flex-shrink:0"><path d="M12 3a9 9 0 1 0 0 18A9 9 0 0 0 12 3z" fill="currentColor" opacity="0.3"/><path d="M12 3a9 9 0 0 1 0 18V3z" fill="currentColor"/></svg>
                <input type="range" id="tendina-opacity-input" min="20" max="100" value="93" style="width:100px">
            </div>`;
        el.appendChild(handle);

        // File input nascosto per importare foto
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'image/*';
        fileInput.style.display = 'none';
        document.body.appendChild(fileInput);

        handle.querySelector('#tendina-opacity-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            const p = document.getElementById('tendina-opacity-popup');
            p.style.display = p.style.display === 'none' ? 'flex' : 'none';
        });
        handle.querySelector('#tendina-opacity-input').addEventListener('input', (e) => {
            this._bgOpacity = e.target.value / 100;
            this._applyBg();
        });
        handle.querySelector('#tendina-import-btn').addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            if (this._imgUrl) URL.revokeObjectURL(this._imgUrl);
            this._imgUrl = URL.createObjectURL(file);
            this._applyBg();
            fileInput.value = '';
        });
        handle.querySelector('#tendina-close').addEventListener('click', () => this.hide());

        // Drag — solo sulla zona centrale
        const dragZone = handle.querySelector('.tendina-drag-zone');
        dragZone.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            e.stopPropagation();
            dragZone.setPointerCapture(e.pointerId);
            this._drag = { on: true, startY: e.clientY, origH: this._h };
        });
        window.addEventListener('pointermove', (e) => {
            if (!this._drag.on) return;
            this._h = Math.max(0, Math.min(window.innerHeight - 44, this._drag.origH + (e.clientY - this._drag.startY)));
            this._applyHeight();
        });
        window.addEventListener('pointerup', () => { this._drag.on = false; });
    }

    _applyHeight() {
        this.el.style.height = this._h + 'px';
    }

    show() {
        this._h = Math.round(window.innerHeight * 0.3);
        this._applyBg();
        this.el.style.display = 'block';
        this._applyHeight();
        this.visible = true;
    }

    hide() {
        this.el.style.display = 'none';
        this.visible = false;
        const btn = document.getElementById('btn-tendina');
        if (btn) btn.classList.remove('active');
    }
}

// Istanze globali (create nell'INIT)
let timerWidget, spotlightTool, tendinaTool;

function setupOverlayTools() {
    timerWidget   = new TimerWidget();
    spotlightTool = new SpotlightTool();
    tendinaTool   = new TendinaTool();
    timerWidget.create();
    spotlightTool.create();
    tendinaTool.create();

    const btnTimer     = document.getElementById('btn-timer');
    const btnSpotlight = document.getElementById('btn-spotlight');
    const btnTendina   = document.getElementById('btn-tendina');

    if (btnTimer) btnTimer.addEventListener('click', () => {
        if (timerWidget.visible) { timerWidget.hide(); btnTimer.classList.remove('active'); }
        else { timerWidget.show(); btnTimer.classList.add('active'); }
    });
    if (btnSpotlight) btnSpotlight.addEventListener('click', () => {
        if (spotlightTool.visible) { spotlightTool.hide(); btnSpotlight.classList.remove('active'); }
        else { spotlightTool.show(); btnSpotlight.classList.add('active'); }
    });
    if (btnTendina) btnTendina.addEventListener('click', () => {
        if (tendinaTool.visible) { tendinaTool.hide(); btnTendina.classList.remove('active'); }
        else { tendinaTool.show(); btnTendina.classList.add('active'); }
    });
}

// =============================================================================
// SEZIONE 14 — INIT
// Istanziazione globale dei manager e avvio dell'applicazione.
// =============================================================================

let bgMgr, brush, laserMgr, canvasMgr, toolbarMgr, textMgr, projectMgr, selectMgr, panMgr, objectLayer, pageManager;

document.addEventListener('DOMContentLoaded', () => {
    // 1. Inizializza i manager nell'ordine corretto (le dipendenze prima)
    bgMgr      = new BackgroundManager();
    brush      = new BrushEngine();
    laserMgr   = new LaserManager(document.getElementById('overlay-canvas'));
    canvasMgr  = new CanvasManager(bgMgr, brush, laserMgr);
    objectLayer = new ObjectLayer();
    window.objectLayer = objectLayer; // esposto per drive.js (EduBoardConnect._addPhotoToCanvas)
    selectMgr  = new SelectManager(
        document.getElementById('draw-canvas'),
        document.getElementById('bg-canvas')
    );
    panMgr     = new PanManager();
    panMgr.centerView();
    toolbarMgr = new ToolbarManager();
    textMgr    = new TextManager();
    projectMgr = new ProjectManager();
    new PWAManager();
    setupKeyboard();
    setupFullscreen();    // Feature 5
    setupProjectName();   // Feature 6
    setupMiniColorBar();  // Mini barra colori rapida (sinistra freccia, solo toolbar chiusa)
    setupMiniSizeBar();   // Mini barra dimensioni tratto (destra freccia, solo toolbar chiusa)
    setupOverlayTools();  // Feature: Timer, Spotlight, Tendina didattica

    // PageManager — pagine multiple
    pageManager = new PageManager(canvasMgr, objectLayer, bgMgr);
    window.pageManager = pageManager; // esposto globalmente per drive.js
    document.body.classList.add('has-page-bar');

    // 2. Pulsanti header
    document.getElementById('btn-save').addEventListener('click',   () => projectMgr.save());
    document.getElementById('btn-export').addEventListener('click', () => handlePrint());
    document.getElementById('btn-new-board-header')?.addEventListener('click', () => projectMgr.newBoard());

    // Installa EduBoard come PWA sul PC
    document.getElementById('btn-install-pwa')?.addEventListener('click', async () => {
        if (!_pwaInstallPrompt) return;
        await _pwaInstallPrompt.prompt();
        const { outcome } = await _pwaInstallPrompt.userChoice;
        if (outcome === 'accepted') _pwaInstallPrompt = null;
    });

    // 3. Avviso modifiche non salvate alla chiusura finestra/tab
    window.addEventListener('beforeunload', (e) => {
        // Blocca chiusura se auto-save in corso o in attesa
        if (window.autoSaveMgr?.isSaving() || window.autoSaveMgr?.hasPending()) {
            e.preventDefault();
            e.returnValue = 'Salvataggio automatico in corso. Attendere qualche secondo prima di chiudere.';
            return e.returnValue;
        }
        // Blocca chiusura solo se dirty E non connessi al Drive (nessun auto-save possibile)
        if (CONFIG.isDirty && !libraryMgr?.currentFileId) {
            e.preventDefault();
            e.returnValue = 'Hai modifiche non salvate. Vuoi davvero uscire?';
        }
    });

    // Quick Action Strip — undo/redo
    document.getElementById('qab-undo')?.addEventListener('click', () => canvasMgr.undo());
    document.getElementById('qab-redo')?.addEventListener('click', () => canvasMgr.redo());

    // Pulsanti zoom nella barra basso destra
    document.getElementById('zoom-in-btn')?.addEventListener('click', () => panMgr.zoomIn());
    document.getElementById('zoom-out-btn')?.addEventListener('click', () => panMgr.zoomOut());
    // Il click su #zoom-display è già gestito da _setupZoomBadge() nel costruttore di PanManager

    console.log('EduBoard v2 \u2014 pronto!');
    setTimeout(() => toast('Benvenuto in EduBoard! Clicca \u25b2 per gli strumenti', 'info'), 800);
});

// =============================================================================
// SEZIONE 14 — STAMPA PDF
// Apre finestra di stampa con l'intera lavagna (come OneNote).
// v15: supporto multi-pagina con selezione pagine + footer pubblicitario.
// =============================================================================

function handlePrint() {
    // Se c'è solo 1 pagina (o niente pageManager), stampa direttamente
    if (!window.pageManager || window.pageManager.pages.length <= 1) {
        _doPrint([0]);
        return;
    }

    // Mostra modal selezione pagine
    const modal = document.getElementById('print-modal');
    document.getElementById('print-current-num').textContent = window.pageManager.currentIndex + 1;
    document.getElementById('print-total-num').textContent   = window.pageManager.pages.length;
    modal.style.display = 'flex';

    // Gestisci conferma
    document.getElementById('print-confirm-btn').onclick = () => {
        modal.style.display = 'none';
        const range = document.querySelector('input[name="print-range"]:checked').value;
        let pagesToPrint = [];

        if (range === 'current') {
            pagesToPrint = [window.pageManager.currentIndex];
        } else if (range === 'all') {
            pagesToPrint = Array.from({ length: window.pageManager.pages.length }, (_, i) => i);
        } else {
            const input = document.getElementById('print-range-input').value;
            pagesToPrint = parsePageRange(input, window.pageManager.pages.length);
            if (pagesToPrint.length === 0) {
                toast('Nessuna pagina valida selezionata.', 'error');
                return;
            }
        }

        if (pagesToPrint.length > 0) _doPrint(pagesToPrint);
    };

    document.getElementById('print-cancel-btn').onclick = () => {
        modal.style.display = 'none';
    };
}

function parsePageRange(input, totalPages) {
    const pages = new Set();
    const parts = input.split(',');
    parts.forEach(part => {
        part = part.trim();
        if (part.includes('-')) {
            const [start, end] = part.split('-').map(n => parseInt(n.trim()) - 1);
            for (let i = start; i <= Math.min(end, totalPages - 1); i++) {
                if (i >= 0) pages.add(i);
            }
        } else {
            const n = parseInt(part) - 1;
            if (n >= 0 && n < totalPages) pages.add(n);
        }
    });
    return [...pages].sort((a, b) => a - b);
}

function _buildPageDataURL(pageIndex) {
    // Componi bg + draw + objects per la pagina indicata,
    // ritagliando all'area del "foglio" (senza lo sfondo grigio infinito)
    const pm = window.pageManager;
    const pageData = pm ? pm.pages[pageIndex] : null;

    // Dimensioni del canvas principale (3× viewport)
    const W = canvasMgr.canvas.width;
    const H = canvasMgr.canvas.height;

    // Determina orientamento per la pagina
    const orientation = (pageData?.background?.orientation) || bgMgr.orientation || 'landscape';

    // Calcola rect del "foglio" (stessa logica di bgMgr._getPageRect)
    // Per bg 'white' (nessun foglio visibile) usiamo tutta l'area del canvas
    const currentBgType = (pageIndex === (pm ? pm.currentIndex : 0))
        ? bgMgr.currentBg
        : (pageData?.background?.type || 'white');
    const hasBgPage = (currentBgType !== 'white' && currentBgType !== 'color' && currentBgType !== 'image');

    let cropX = 0, cropY = 0, cropW = W, cropH = H;
    if (hasBgPage) {
        // Ritaglia al foglio A4 calcolato da bgMgr
        const { px, py, pw, ph } = bgMgr._getPageRect(W, H);
        cropX = Math.round(px);
        cropY = Math.round(py);
        cropW = Math.round(pw);
        cropH = Math.round(ph);
    }

    const tmp = document.createElement('canvas');
    tmp.width  = cropW;
    tmp.height = cropH;
    const ctx  = tmp.getContext('2d');

    if (pageIndex === (pm ? pm.currentIndex : 0)) {
        // Pagina corrente: usa i canvas live, ritagliati all'area del foglio
        const bgCvs = document.getElementById('bg-canvas');
        if (bgCvs) ctx.drawImage(bgCvs, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
        ctx.drawImage(canvasMgr.canvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
        const objCvs = document.getElementById('objects-canvas');
        if (objCvs) ctx.drawImage(objCvs, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
    } else if (pageData) {
        // Altra pagina: ricostruiamo da drawImageData
        ctx.fillStyle = pageData.background ? (pageData.background.color || '#ffffff') : '#ffffff';
        ctx.fillRect(0, 0, cropW, cropH);
        if (pageData.drawImageData) {
            return new Promise(resolve => {
                const img = new Image();
                img.onload = () => {
                    // Ritaglia all'area del foglio anche per le pagine non correnti
                    ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
                    resolve(tmp.toDataURL('image/png'));
                };
                img.onerror = () => resolve(tmp.toDataURL('image/png'));
                img.src = pageData.drawImageData;
            });
        }
    } else {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, cropW, cropH);
    }

    return Promise.resolve(tmp.toDataURL('image/png'));
}

async function _doPrint(pageIndices) {
    // Salva la pagina corrente prima di raccogliere i dataURL
    if (window.pageManager) {
        window.pageManager.pages[window.pageManager.currentIndex] =
            window.pageManager._captureCurrentPage();
    }

    // Raccoglie dataURL per tutte le pagine richieste
    const dataURLs = await Promise.all(pageIndices.map(i => _buildPageDataURL(i)));

    const win = window.open('', '_blank');
    if (!win) { toast('Popup bloccato — abilita i popup per stampare.', 'error'); return; }

    const totalStampa  = pageIndices.length;
    const showPageNums = totalStampa > 1;
    const footerText   = 'EduBoard \u00A9 EduTechLab di Rizzotto Fabio \u2014 edutechlab-ita.github.io/lavagna';

    // Costruisci pagine HTML
    const pagesHTML = dataURLs.map((url, idx) => {
        const pageLabel = showPageNums ? `Pagina ${idx + 1} di ${totalStampa}` : '';
        return `
<div class="print-page">
    <img src="${url}" class="board-img">
    <div class="page-footer">
        <span class="footer-pub">${footerText}</span>
        ${showPageNums ? `<span class="footer-pagenum">${pageLabel}</span>` : ''}
    </div>
</div>`;
    }).join('');

    win.document.write(`<!DOCTYPE html><html><head><title>EduBoard \u2014 Stampa</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#fff}
@page{margin:0;size:auto}
.print-page{
    position:relative;
    width:100vw;
    height:100vh;
    overflow:hidden;
    page-break-after:always;
}
.print-page:last-child{page-break-after:avoid}
.board-img{
    display:block;
    width:100%;
    height:calc(100vh - 22px);
    object-fit:fill;
}
.page-footer{
    position:absolute;
    bottom:4px;
    left:8mm;
    right:8mm;
    height:18px;
    display:flex;
    align-items:center;
    justify-content:space-between;
    font-size:7pt;
    color:#94a3b8;
    font-family:Arial,sans-serif;
}
.footer-pub{flex:1;text-align:center}
.footer-pagenum{flex-shrink:0;margin-left:8px;white-space:nowrap}
</style></head><body>
${pagesHTML}
<script>window.onload=function(){window.print();setTimeout(function(){window.close();},1500)}<\/script>
</body></html>`);
    win.document.close();
}

// ===== PANNELLO IMPOSTAZIONI & GUIDA =====
window.addEventListener('load', function() {
    const PREFS_KEY = 'eduboard-prefs-v1';

    function loadPrefs() {
        try { return JSON.parse(localStorage.getItem(PREFS_KEY) || '{}'); } catch(e) { return {}; }
    }
    function savePrefs(p) { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); }

    const modal = document.getElementById('settings-modal');
    const btnClose = document.getElementById('settings-close');
    if (!modal) return;

    // Funzione globale chiamabile da drive.js
    window.openSettingsModal = function() {
        modal.style.display = 'flex';
        initPrefsUI();
    };

    btnClose.addEventListener('click', () => modal.style.display = 'none');
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.style.display = 'none'; });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && modal.style.display !== 'none') modal.style.display = 'none'; });

    modal.querySelectorAll('.settings-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            modal.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'));
            modal.querySelectorAll('.settings-panel').forEach(p => p.classList.remove('active'));
            tab.classList.add('active');
            const panel = document.getElementById('tab-' + tab.dataset.tab);
            if (panel) panel.classList.add('active');
        });
    });

    function initPrefsUI() {
        const prefs = loadPrefs();
        const bgSel = document.getElementById('pref-default-bg');
        const toolSel = document.getElementById('pref-default-tool');
        if (bgSel && prefs.defaultBg) bgSel.value = prefs.defaultBg;
        if (toolSel && prefs.defaultTool) toolSel.value = prefs.defaultTool;
        const savedColor = prefs.defaultColor || '#000000';
        modal.querySelectorAll('.pref-color-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.color === savedColor);
            btn.onclick = () => {
                modal.querySelectorAll('.pref-color-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            };
        });
    }

    const saveBtn = document.getElementById('pref-save-btn');
    const saveFeedback = document.getElementById('pref-save-feedback');
    if (saveBtn) {
        saveBtn.addEventListener('click', () => {
            const prefs = {};
            const bgSel = document.getElementById('pref-default-bg');
            const toolSel = document.getElementById('pref-default-tool');
            const activeColor = modal.querySelector('.pref-color-btn.active');
            if (bgSel) prefs.defaultBg = bgSel.value;
            if (toolSel) prefs.defaultTool = toolSel.value;
            if (activeColor) prefs.defaultColor = activeColor.dataset.color;
            savePrefs(prefs);
            if (saveFeedback) {
                saveFeedback.style.display = 'inline';
                setTimeout(() => saveFeedback.style.display = 'none', 2000);
            }
        });
    }
});
