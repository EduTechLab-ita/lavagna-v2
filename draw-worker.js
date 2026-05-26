// =============================================================================
// draw-worker.js — OffscreenCanvas Worker per EduBoard (LAVAGNA-V2)
// Riceve messaggi dal main thread, gestisce disegno, undo/redo e vettori.
// =============================================================================

'use strict';

// --- Stato interno ---
let canvas = null;
let ctx    = null;

const undoStack     = [];   // array di ImageData (max MAX_UNDO)
const redoStack     = [];   // array di ImageData
const vectorStrokes = [];   // array di { tool, color, size, opacity, points[] }

let currentStroke = null;   // { tool, color, size, opacity, points[] }

// Variabili di stato per il tratto corrente (Bézier smoothing)
let lastX     = 0;
let lastY     = 0;
let smoothMidX = 0;
let smoothMidY = 0;

const MAX_UNDO = 30;

// =============================================================================
// BrushEngine — funzioni standalone (copiate da app.js BrushEngine)
// =============================================================================

const brush = {

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
    },

    // Matita HB — tratto granuloso, leggermente irregolare
    pencil(ctx, x0, y0, cpX, cpY, x1, y1, size, color) {
        // Lunghezza approssimativa lungo la curva Bézier
        const dist  = Math.hypot(cpX - x0, cpY - y0) + Math.hypot(x1 - cpX, y1 - cpY);
        const steps = Math.max(1, Math.ceil(dist * 1.5));
        ctx.save();
        ctx.fillStyle = color;
        ctx.globalCompositeOperation = 'source-over';
        for (let i = 0; i <= steps; i++) {
            const t  = i / steps;
            const mt = 1 - t;
            // Valuta curva Bézier quadratica: B(t) = mt²·P0 + 2·mt·t·CP + t²·P1
            const x = mt * mt * x0 + 2 * mt * t * cpX + t * t * x1;
            const y = mt * mt * y0 + 2 * mt * t * cpY + t * t * y1;
            // 4-6 punti per step, dispersi casualmente
            const numDots = Math.floor(size * 0.7) + 3;
            for (let d = 0; d < numDots; d++) {
                const spread = size * 0.45;
                const dx     = (Math.random() - 0.5) * spread;
                const dy     = (Math.random() - 0.5) * spread;
                const dotR   = Math.random() * size * 0.11 + size * 0.04;
                ctx.globalAlpha = Math.random() * 0.45 + 0.2;
                ctx.beginPath();
                ctx.arc(x + dx, y + dy, dotR, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        ctx.restore();
    },

    // Pastello morbido — sfumato con strati multipli
    pastel(ctx, x0, y0, cpX, cpY, x1, y1, size, color) {
        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = color;
        ctx.globalCompositeOperation = 'source-over';
        const layers = [
            { w: size * 3.5,  a: 0.022 },
            { w: size * 2.5,  a: 0.035 },
            { w: size * 1.8,  a: 0.055 },
            { w: size * 1.2,  a: 0.08  },
            { w: size * 0.7,  a: 0.12  },
            { w: size * 0.35, a: 0.18  },
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
    },

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
    },

    // Gomma — cancella usando destination-out
    eraser(ctx, x, y, size) {
        ctx.save();
        ctx.globalCompositeOperation = 'destination-out';
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    },
};

// =============================================================================
// Helpers interni
// =============================================================================

function _saveUndoInternal() {
    if (!canvas) return;
    const snap = ctx.getImageData(0, 0, canvas.width, canvas.height);
    undoStack.push(snap);
    if (undoStack.length > MAX_UNDO) undoStack.shift();
    // Ogni volta che salviamo un nuovo stato, redo non ha più senso
    redoStack.length = 0;
    _notifyUndoState();
}

function _notifyUndoState() {
    self.postMessage({
        type:    'undoStateChanged',
        canUndo: undoStack.length > 0,
        canRedo: redoStack.length > 0,
    });
}

// Disegna un singolo segmento con Bézier smoothing (usato in addPoints)
function _drawSegment(x0, y0, cpX, cpY, x1, y1, tool, color, size) {
    switch (tool) {
        case 'pen':    brush.pen   (ctx, x0, y0, cpX, cpY, x1, y1, size, color); break;
        case 'pencil': brush.pencil(ctx, x0, y0, cpX, cpY, x1, y1, size, color); break;
        case 'pastel': brush.pastel(ctx, x0, y0, cpX, cpY, x1, y1, size, color); break;
        case 'marker': brush.marker(ctx, x0, y0, cpX, cpY, x1, y1, size, color); break;
    }
}

// Ridisegna un tratto vettoriale completo (replay da vectorStrokes)
function _replayStroke(stroke) {
    const { tool, color, size, points } = stroke;
    if (!points || points.length === 0) return;

    if (tool === 'eraser') {
        for (const { x, y } of points) {
            brush.eraser(ctx, x, y, size * 2);
        }
        return;
    }

    // Dot iniziale
    _drawSegment(
        points[0].x, points[0].y,
        points[0].x, points[0].y,
        points[0].x, points[0].y,
        tool, color, size
    );

    if (points.length === 1) return;

    // Ripeti il Bézier smoothing esatto usato durante la registrazione
    let smX = points[0].x;
    let smY = points[0].y;
    let prevX = points[0].x;
    let prevY = points[0].y;

    for (let i = 1; i < points.length; i++) {
        const x    = points[i].x;
        const y    = points[i].y;
        const midX = (prevX + x) / 2;
        const midY = (prevY + y) / 2;
        _drawSegment(smX, smY, prevX, prevY, midX, midY, tool, color, size);
        smX   = midX;
        smY   = midY;
        prevX = x;
        prevY = y;
    }
}

// =============================================================================
// Gestore messaggi
// =============================================================================

self.onmessage = function (e) {
    const msg = e.data;

    switch (msg.type) {

        // ------------------------------------------------------------------
        case 'init': {
            canvas = msg.canvas; // OffscreenCanvas trasferito
            ctx    = canvas.getContext('2d');
            break;
        }

        // ------------------------------------------------------------------
        case 'resize': {
            if (!canvas) break;
            const { width, height } = msg;
            // Salva contenuto corrente
            let saved = null;
            try {
                saved = ctx.getImageData(0, 0, canvas.width, canvas.height);
            } catch (_) { /* canvas vuoto o dimensioni 0 */ }
            // Ridimensiona
            canvas.width  = width;
            canvas.height = height;
            // Ripristina contenuto (clampato alle nuove dimensioni)
            if (saved) {
                try {
                    ctx.putImageData(saved, 0, 0);
                } catch (_) { /* le dimensioni salvate eccedono il nuovo canvas */ }
            }
            break;
        }

        // ------------------------------------------------------------------
        case 'startStroke': {
            if (!canvas) break;
            const { tool, color, size, opacity } = msg;
            // Salva undo prima di iniziare
            _saveUndoInternal();
            currentStroke = { tool, color, size, opacity, points: [] };
            // Reset stato Bézier
            lastX      = 0;
            lastY      = 0;
            smoothMidX = 0;
            smoothMidY = 0;
            break;
        }

        // ------------------------------------------------------------------
        case 'addPoints': {
            if (!canvas || !currentStroke) break;
            const { points } = msg;
            const { tool, color, size } = currentStroke;

            for (const pt of points) {
                const x = pt.x;
                const y = pt.y;

                currentStroke.points.push({ x, y });

                if (currentStroke.points.length === 1) {
                    // Primo punto: inizializza stato Bézier e disegna dot
                    lastX      = x;
                    lastY      = y;
                    smoothMidX = x;
                    smoothMidY = y;

                    if (tool === 'eraser') {
                        brush.eraser(ctx, x, y, size * 2);
                    } else {
                        _drawSegment(x, y, x, y, x, y, tool, color, size);
                    }
                } else {
                    if (tool === 'eraser') {
                        brush.eraser(ctx, x, y, size * 2);
                    } else {
                        // Bézier smoothing: midpoint come endpoint, lastX/Y come control point
                        const midX = (lastX + x) / 2;
                        const midY = (lastY + y) / 2;
                        _drawSegment(smoothMidX, smoothMidY, lastX, lastY, midX, midY, tool, color, size);
                        smoothMidX = midX;
                        smoothMidY = midY;
                    }
                    lastX = x;
                    lastY = y;
                }
            }
            break;
        }

        // ------------------------------------------------------------------
        case 'endStroke': {
            if (!canvas || !currentStroke) break;
            // Registra il tratto completato nei vector strokes
            vectorStrokes.push({
                tool:    currentStroke.tool,
                color:   currentStroke.color,
                size:    currentStroke.size,
                opacity: currentStroke.opacity,
                points:  [...currentStroke.points],
            });
            currentStroke = null;
            break;
        }

        // ------------------------------------------------------------------
        case 'clear': {
            if (!canvas) break;
            _saveUndoInternal();
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            vectorStrokes.length = 0;
            _notifyUndoState();
            break;
        }

        // ------------------------------------------------------------------
        case 'saveUndo': {
            if (!canvas) break;
            _saveUndoInternal();
            break;
        }

        // ------------------------------------------------------------------
        case 'undo': {
            if (!canvas || undoStack.length === 0) break;
            // Salva stato corrente nel redo stack
            const current = ctx.getImageData(0, 0, canvas.width, canvas.height);
            redoStack.push(current);
            // Ripristina stato precedente
            const prev = undoStack.pop();
            ctx.putImageData(prev, 0, 0);
            _notifyUndoState();
            break;
        }

        // ------------------------------------------------------------------
        case 'redo': {
            if (!canvas || redoStack.length === 0) break;
            // Salva stato corrente nell'undo stack
            const current = ctx.getImageData(0, 0, canvas.width, canvas.height);
            undoStack.push(current);
            if (undoStack.length > MAX_UNDO) undoStack.shift();
            // Ripristina stato successivo
            const next = redoStack.pop();
            ctx.putImageData(next, 0, 0);
            _notifyUndoState();
            break;
        }

        // ------------------------------------------------------------------
        case 'getDataURL': {
            if (!canvas) break;
            const { reqId } = msg;
            // OffscreenCanvas supporta convertToBlob; per restituire dataURL
            // convertiamo via Blob → FileReader
            canvas.convertToBlob({ type: 'image/png' }).then(blob => {
                const reader = new FileReaderSync();
                const dataURL = reader.readAsDataURL(blob);
                self.postMessage({ type: 'dataURL', reqId, data: dataURL });
            }).catch(() => {
                // Fallback: usa toDataURL se disponibile (non standard su OffscreenCanvas)
                try {
                    const dataURL = canvas.toDataURL('image/png');
                    self.postMessage({ type: 'dataURL', reqId, data: dataURL });
                } catch (err) {
                    self.postMessage({ type: 'dataURL', reqId, data: null });
                }
            });
            break;
        }

        // ------------------------------------------------------------------
        case 'putDataURL': {
            if (!canvas) break;
            const { dataURL } = msg;
            fetch(dataURL)
                .then(r  => r.blob())
                .then(b  => createImageBitmap(b))
                .then(bmp => {
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                    ctx.drawImage(bmp, 0, 0);
                    bmp.close();
                })
                .catch(() => { /* dataURL non valido o fetch non disponibile nel worker */ });
            break;
        }

        // ------------------------------------------------------------------
        case 'vectorEraseStroke': {
            if (!canvas) break;
            const { strokeIndex } = msg;
            // 1. Salva undo
            _saveUndoInternal();
            // 2. Cancella tutto il canvas
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            // 3. Ridisegna tutti i tratti eccetto quello indicato
            for (let i = 0; i < vectorStrokes.length; i++) {
                if (i === strokeIndex) continue;
                _replayStroke(vectorStrokes[i]);
            }
            // 4. Rimuovi il tratto dall'array vettoriale
            vectorStrokes.splice(strokeIndex, 1);
            // 5. Notifica undo state
            _notifyUndoState();
            break;
        }

        // ------------------------------------------------------------------
        case 'drawCircle': {
            if (!canvas) break;
            const { cx, cy, radius, color, lineWidth } = msg;
            ctx.save();
            ctx.strokeStyle = color;
            ctx.lineWidth   = lineWidth;
            ctx.lineCap     = 'round';
            ctx.beginPath();
            ctx.arc(cx, cy, radius, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
            break;
        }

        // ------------------------------------------------------------------
        default:
            // Messaggio sconosciuto: ignora silenziosamente
            break;
    }
};
