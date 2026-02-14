import * as pdfjsLib from "./pdfjs/pdf.mjs.js";

pdfjsLib.GlobalWorkerOptions.workerSrc = "./pdfjs/pdf.worker.mjs.js";

/* global pdfjsLib */
(() => {
    const fileEl = document.getElementById("file");
    const pdfCanvas = document.getElementById("pdfCanvas");
    const overlay = document.getElementById("overlay");
    const ctx = pdfCanvas.getContext("2d");
    const octx = overlay.getContext("2d");

    // Magnifier elements
    const magDiv = document.getElementById("magnifier");
    const magCanvas = document.getElementById("magCanvas");
    const magCtx = magCanvas.getContext("2d");
    const MAG_SIZE = 150;
    const MAG_ZOOM = 2; // 2x magnification
    magCanvas.width = MAG_SIZE;
    magCanvas.height = MAG_SIZE;

    const prevBtn = document.getElementById("prev");
    const nextBtn = document.getElementById("next");
    const pageLabel = document.getElementById("pageLabel");
    const zoomEl = document.getElementById("zoom");

    const statusEl = document.getElementById("status");
    const resultEl = document.getElementById("result");
    const clearBtn = document.getElementById("clear");

    // Trust & Marketing Elements
    const introPanel = document.getElementById("intro-panel");
    const pdfCanvasEl = document.getElementById("pdfCanvas");
    const overlayEl = document.getElementById("overlay");
    const privacyModal = document.getElementById("privacyModal");
    const privacyBtns = document.querySelectorAll("#privacyBtn, #privacyLinkBtn, #howItWorksBtn");
    const closeModalBtn = document.getElementById("closeModal");

    // Re-assign worker source
    pdfjsLib.GlobalWorkerOptions.workerSrc = "./pdfjs/pdf.worker.mjs.js";

    let pdfDoc = null;
    let pageNum = 1;
    let scale = parseFloat(zoomEl.value) || 1.2;

    // State
    // measurements: Array of { p1: {x,y}, p2: {x,y} } in PDF coordinates
    let measurements = [];

    // tempPoint: {x,y} or null. The start point of a NEW measurement being drawn.
    let tempPoint = null;

    // Auto-calibration factor: cm per PDF point
    let cmPerPoint = 0;

    // Palette for distinct colors
    const PALETTE = [
        '#ef4444', // Red
        '#f59e0b', // Amber
        '#10b981', // Emerald
        '#3b82f6', // Blue
        '#8b5cf6', // Violet
        '#ec4899', // Pink
        '#06b6d4', // Cyan
        '#84cc16', // Lime
    ];

    function getNextColor() {
        return PALETTE[measurements.length % PALETTE.length];
    }
    let isLandscape = false;

    // Interaction state
    // draggingState: { type: 'p1'|'p2', index: number } or null
    let draggingState = null;
    const HOVER_DIST = 10; // pixels

    function setStatus(msg) { statusEl.textContent = msg; }
    function setResult(msg) { resultEl.textContent = msg; }

    // --- Coordinate Helpers ---

    function toScreen(p) {
        return { x: p.x * scale, y: p.y * scale };
    }

    function toPdf(x, y) {
        return { x: x / scale, y: y / scale };
    }

    function distPdf(p1, p2) {
        const dx = p1.x - p2.x;
        const dy = p1.y - p2.y;
        return Math.sqrt(dx * dx + dy * dy);
    }

    function getDistanceCm(p1, p2) {
        const d = distPdf(p1, p2);
        if (cmPerPoint > 0) {
            return d * cmPerPoint;
        }
        return 0;
    }

    // --- Drawing ---

    function clearOverlay() {
        octx.clearRect(0, 0, overlay.width, overlay.height);
    }

    // ghostPoint: optional {x,y} in PDF coords (for rubber banding currenly drawing line)
    function drawOverlay(ghostPoint = null) {
        clearOverlay();

        octx.lineWidth = 2;
        octx.font = "bold 14px Inter, system-ui, sans-serif";
        octx.textBaseline = "middle";
        octx.textAlign = "center";

        // 1. Draw completed measurements
        measurements.forEach(m => {
            drawMeasurement(m.p1, m.p2, m.color);
        });

        // 2. Draw temporary line (rubber band) if we are creating one
        if (tempPoint && ghostPoint) {
            const color = getNextColor();
            drawMeasurement(tempPoint, ghostPoint, color, true);
        }
    }

    function drawMeasurement(p1, p2, color = "rgba(0,0,0,0.8)", isTemporary = false) {
        const s1 = toScreen(p1);
        const s2 = toScreen(p2);

        // Line
        octx.beginPath();
        octx.moveTo(s1.x, s1.y);
        octx.lineTo(s2.x, s2.y);
        if (isTemporary) octx.setLineDash([5, 5]);
        octx.strokeStyle = isTemporary ? "rgba(0,0,0,0.5)" : color;
        octx.stroke();
        octx.setLineDash([]); // reset

        // Endpoints
        [s1, s2].forEach(s => {
            octx.beginPath();
            octx.arc(s.x, s.y, 5, 0, Math.PI * 2);
            octx.fillStyle = color;
            octx.fill();
            octx.strokeStyle = "white";
            octx.stroke();
        });

        // Label
        const midX = (s1.x + s2.x) / 2;
        const midY = (s1.y + s2.y) / 2;

        let distCm = getDistanceCm(p1, p2);
        let label = `${distCm.toFixed(2)} cm`;

        // Background for label
        const textMetrics = octx.measureText(label);
        const padding = 6;
        const w = textMetrics.width + padding * 2;
        const h = 24;

        octx.fillStyle = "white";
        octx.shadowColor = "rgba(0,0,0,0.2)";
        octx.shadowBlur = 4;
        octx.fillRect(midX - w / 2, midY - h / 2, w, h);
        octx.shadowBlur = 0; // reset

        // Border for label
        octx.strokeStyle = color;
        octx.lineWidth = 1;
        octx.strokeRect(midX - w / 2, midY - h / 2, w, h);

        // Text
        octx.fillStyle = color;
        octx.fillText(label, midX, midY);
    }

    // --- Interaction Logic Helpers ---

    function getHit(screenX, screenY) {
        // Check endpoints of all measurements
        for (let i = 0; i < measurements.length; i++) {
            const m = measurements[i];
            const s1 = toScreen(m.p1);
            const s2 = toScreen(m.p2);

            // Check p1
            if (Math.hypot(screenX - s1.x, screenY - s1.y) <= HOVER_DIST) {
                return { type: 'p1', index: i };
            }
            // Check p2
            if (Math.hypot(screenX - s2.x, screenY - s2.y) <= HOVER_DIST) {
                return { type: 'p2', index: i };
            }
        }
        return null; // No hit
    }

    function updateFloatingResult(ghostPoint = null) {
        if (tempPoint && ghostPoint) {
            const dist = getDistanceCm(tempPoint, ghostPoint);
            setResult(`Measuring: ${dist.toFixed(2)} cm`);
        } else if (measurements.length > 0) {
            // Show total or last? Let's show last created
            const last = measurements[measurements.length - 1];
            const dist = getDistanceCm(last.p1, last.p2);
            setResult(`Last: ${dist.toFixed(2)} cm`);
        } else {
            setResult("Click to measure");
        }
    }


    // --- Rendering ---

    async function renderPage(num) {
        if (!pdfDoc) return;
        setStatus("Rendering…");
        const page = await pdfDoc.getPage(num);

        // 1. Calculate A4 scaling factor
        const unscaledViewport = page.getViewport({ scale: 1.0 });
        const width = unscaledViewport.width;
        const height = unscaledViewport.height;

        // A4 Dimensions: 21.0cm x 29.7cm
        if (width >= height) {
            isLandscape = true;
            cmPerPoint = 29.7 / width;
        } else {
            isLandscape = false;
            cmPerPoint = 21.0 / width;
        }

        // 2. Render to canvas
        const viewport = page.getViewport({ scale });
        pdfCanvas.width = Math.floor(viewport.width);
        pdfCanvas.height = Math.floor(viewport.height);
        overlay.width = pdfCanvas.width;
        overlay.height = pdfCanvas.height;

        const renderContext = {
            canvasContext: ctx,
            viewport
        };

        await page.render(renderContext).promise;

        pageLabel.textContent = `${pageNum} / ${pdfDoc.numPages}`;

        updateStatusText();

        drawOverlay();
        updateFloatingResult();
    }

    function updateStatusText() {
        setStatus(`Ready (A4 Auto-Scale: 1 pt = ${cmPerPoint.toFixed(4)} cm)`);
    }

    async function loadPdfFromFile(file) {
        const buf = await file.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({ data: buf });
        pdfDoc = await loadingTask.promise;
        pageNum = 1;
        await renderPage(pageNum);
    }

    // --- Interaction ---

    function getMousePos(ev) {
        const rect = overlay.getBoundingClientRect();
        return {
            x: ev.clientX - rect.left,
            y: ev.clientY - rect.top
        };
    }

    function updateMagnifier(mx, my) {
        if (!pdfDoc) return;

        // Show magnifier
        magDiv.style.display = "block";
        magDiv.style.left = (mx + 20) + "px";
        magDiv.style.top = (my + 20) + "px";

        const srcW = MAG_SIZE / MAG_ZOOM;
        const srcH = MAG_SIZE / MAG_ZOOM;
        const srcX = mx - srcW / 2;
        const srcY = my - srcH / 2;

        magCtx.clearRect(0, 0, MAG_SIZE, MAG_SIZE);

        magCtx.drawImage(pdfCanvas,
            srcX, srcY, srcW, srcH,
            0, 0, MAG_SIZE, MAG_SIZE
        );

        // Draw points in magnifier
        const drawPoint = (p) => {
            const s = toScreen(p);
            const magX = (s.x - srcX) * MAG_ZOOM;
            const magY = (s.y - srcY) * MAG_ZOOM;

            magCtx.beginPath();
            magCtx.arc(magX, magY, 5 * MAG_ZOOM, 0, Math.PI * 2);
            magCtx.fillStyle = "rgba(0,0,0,0.5)";
            magCtx.fill();
            magCtx.strokeStyle = "white";
            magCtx.stroke();
        };

        measurements.forEach(m => {
            drawPoint(m.p1);
            drawPoint(m.p2);
        });

        if (tempPoint) {
            drawPoint(tempPoint);
        }

        magCtx.beginPath();
        magCtx.moveTo(MAG_SIZE / 2, 0);
        magCtx.lineTo(MAG_SIZE / 2, MAG_SIZE);
        magCtx.moveTo(0, MAG_SIZE / 2);
        magCtx.lineTo(MAG_SIZE, MAG_SIZE / 2);
        magCtx.strokeStyle = "rgba(255, 0, 0, 0.5)";
        magCtx.lineWidth = 1;
        magCtx.stroke();
    }

    overlay.addEventListener("mousedown", (ev) => {
        if (!pdfDoc) return;
        const { x, y } = getMousePos(ev);
        const mousePdf = toPdf(x, y);

        // 1. Check if clicking an existing point to drag
        const hit = getHit(x, y);
        if (hit) {
            draggingState = hit;
            overlay.style.cursor = "grabbing";
            return;
        }

        // 2. Not hitting existing point.
        if (!tempPoint) {
            // Start NEW measurement
            tempPoint = mousePdf;
            drawOverlay(mousePdf); // draw initial dot + ghost line to self?
            updateFloatingResult(mousePdf);
        } else {
            // Finish measurement
            const color = getNextColor();
            measurements.push({ p1: tempPoint, p2: mousePdf, color: color });
            tempPoint = null;
            drawOverlay();
            updateFloatingResult();
        }
    });

    overlay.addEventListener("mousemove", (ev) => {
        const { x, y } = getMousePos(ev);
        updateMagnifier(x, y);

        const mousePdf = toPdf(x, y);

        if (draggingState) {
            // Updating an existing point
            const m = measurements[draggingState.index];
            if (draggingState.type === 'p1') m.p1 = mousePdf;
            else m.p2 = mousePdf;

            drawOverlay();
            // Optional: update text to show the length of the line being dragged
            const dist = getDistanceCm(m.p1, m.p2);
            setResult(`Adjusting: ${dist.toFixed(2)} cm`);
            overlay.style.cursor = "grabbing";
        } else {
            // Hovering
            const hit = getHit(x, y);
            overlay.style.cursor = hit ? "grab" : "default";

            // Rubber band logic if we are creating a new line
            if (tempPoint) {
                drawOverlay(mousePdf); // Draw line from tempPoint to mouse
                updateFloatingResult(mousePdf);
            }
        }
    });

    window.addEventListener("mouseup", () => {
        draggingState = null;
        if (!tempPoint) {
            overlay.style.cursor = "default";
        }
    });

    overlay.addEventListener("mouseleave", () => {
        magDiv.style.display = "none";
        // If mid-drag or mid-measure, maybe we should cancel?
        // Let's leave it for now.
    });


    // --- UI Listeners ---

    fileEl.addEventListener("change", async (ev) => {
        const file = ev.target.files?.[0];
        if (!file) return;

        // Switch view
        introPanel.classList.add("hidden");
        pdfCanvasEl.style.display = "block";
        overlayEl.style.display = "block";

        measurements = [];
        tempPoint = null;
        setResult("Click to measure");
        await loadPdfFromFile(file);
    });

    prevBtn.addEventListener("click", async () => {
        if (!pdfDoc || pageNum <= 1) return;
        pageNum--;
        await renderPage(pageNum);
    });

    nextBtn.addEventListener("click", async () => {
        if (!pdfDoc || pageNum >= pdfDoc.numPages) return;
        pageNum++;
        await renderPage(pageNum);
    });

    zoomEl.addEventListener("change", async () => {
        const z = parseFloat(zoomEl.value);
        if (!Number.isFinite(z) || z <= 0) return;
        scale = z;
        await renderPage(pageNum);
    });

    clearBtn.addEventListener("click", () => {
        measurements = [];
        tempPoint = null;
        drawOverlay();
        setResult("Cleared");
    });

    // --- Touch Support ---

    function handleTouch(ev) {
        if (ev.target !== overlay) return;
        ev.preventDefault(); // Prevent scrolling while drawing on canvas

        const touch = ev.changedTouches[0];
        const rect = overlay.getBoundingClientRect();

        // Create a fake mouse event
        const mouseEvent = new MouseEvent(
            {
                touchstart: "mousedown",
                touchmove: "mousemove",
                touchend: "mouseup"
            }[ev.type],
            {
                bubbles: true,
                cancelable: true,
                clientX: touch.clientX,
                clientY: touch.clientY
            }
        );

        overlay.dispatchEvent(mouseEvent);
    }

    overlay.addEventListener("touchstart", handleTouch, { passive: false });
    overlay.addEventListener("touchmove", handleTouch, { passive: false });
    overlay.addEventListener("touchend", handleTouch, { passive: false });

    setStatus("Ready • Local-only • No uploads");

    // --- Modal Logic ---
    privacyBtns.forEach(btn => {
        btn.addEventListener("click", () => {
            if (privacyModal) privacyModal.showModal();
        });
    });

    if (closeModalBtn && privacyModal) {
        closeModalBtn.addEventListener("click", () => privacyModal.close());
        privacyModal.addEventListener("click", (e) => {
            if (e.target === privacyModal) privacyModal.close();
        });
    }
})();