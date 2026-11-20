/* ========================================================
   BLUEPRINT PORTFOLIO JAVASCRIPT ENGINE
   Türker Kıvılcım — Blueprint Edition
   ======================================================== */

(function () {
  "use strict";

  // 1. Ensure Canvas and Pencil Cursor exist in the DOM
  function ensureCanvasAndCursor() {
    if (!document.getElementById("inkCanvas")) {
      const c = document.createElement("canvas");
      c.id = "inkCanvas";
      document.body.insertBefore(c, document.body.firstChild);
    }

    if (!document.getElementById("pencilCursor")) {
      const p = document.createElement("div");
      p.id = "pencilCursor";
      p.className = "pencil-cursor";
      p.setAttribute("aria-hidden", "true");
      p.innerHTML = `
        <svg viewBox="0 0 32 32" width="32" height="32" style="filter: drop-shadow(1px 2px 2px rgba(0,0,0,0.35));" fill="none" xmlns="http://www.w3.org/2000/svg">
          <polygon points="2,30 3.5,26.5 5.5,28.5" fill="#285bc4" />
          <polygon points="3.5,26.5 5.5,28.5 9,25 7,23" fill="#e8c79c" stroke="#182430" stroke-width="0.6" />
          <polygon points="7,23 9,25 21,13 19,11" fill="#285bc4" stroke="#182430" stroke-width="0.6" />
          <polygon points="9,25 11,27 23,15 21,13" fill="#4d79c7" stroke="#182430" stroke-width="0.6" />
          <polygon points="19,11 23,15 25,13 21,9" fill="#a5b8ca" stroke="#182430" stroke-width="0.6" />
          <polygon points="21,9 25,13 27,11 23,7" fill="#c85252" stroke="#182430" stroke-width="0.6" />
        </svg>
      `;
      document.body.appendChild(p);
    }
  }

  ensureCanvasAndCursor();

  const canvas = document.getElementById("inkCanvas");
  const ctx = canvas ? canvas.getContext("2d") : null;
  const pencilCursor = document.getElementById("pencilCursor");

  const STORAGE_KEY = "blueprint_sketch_strokes";
  let isDrawing = false;
  let isDrawingEnabled = true;
  let lastToggleTime = 0;
  let isAnimatingClick = false;
  const activeColor = "#285bc4";
  const activeWidth = 2.2;
  let strokes = [];
  let currentStroke = null;
  let dpr = Math.min(window.devicePixelRatio || 1, 2);

  let pointerDownPos = { x: 0, y: 0 };
  let hasDragged = false;
  let targetClickable = null;
  let lastPointer = { x: window.innerWidth / 2, y: window.innerHeight / 2 };

  function isTouchOrMobile() {
    return window.matchMedia("(max-width: 860px)").matches ||
      window.matchMedia("(hover: none) and (pointer: coarse)").matches ||
      ("ontouchstart" in window && window.innerWidth <= 860);
  }

  function setDrawingEnabled(enabled) {
    isDrawingEnabled = !!enabled;
    document.body.classList.toggle("drawing-enabled", isDrawingEnabled);
    document.body.classList.toggle("drawing-disabled", !isDrawingEnabled);

    const toggleButtons = document.querySelectorAll(".nav-draw-toggle");
    toggleButtons.forEach(btn => {
      btn.classList.toggle("active", isDrawingEnabled);
      btn.innerHTML = isDrawingEnabled
        ? '<span>✏️</span> ÇİZİM: AÇIK'
        : '<span>✏️</span> ÇİZ';
      btn.setAttribute("title", isDrawingEnabled ? "Kalem Modunu Kapat (Kaydırma Modu)" : "Kalem Modunu Aç (Çizim Modu)");
      btn.setAttribute("aria-pressed", isDrawingEnabled ? "true" : "false");
    });

    if (canvas) {
      canvas.style.pointerEvents = isDrawingEnabled ? "auto" : "none";
      canvas.style.touchAction = isDrawingEnabled ? "none" : "auto";
    }

    const floatingNav = document.getElementById("floatingNav");
    if (floatingNav && isTouchOrMobile()) {
      const currentScrollY = Math.max(0, window.scrollY || window.pageYOffset || 0);
      if (currentScrollY > 70) {
        floatingNav.classList.add("visible");
      } else {
        floatingNav.classList.remove("visible");
      }
    }

    if (pencilCursor) {
      if (!isDrawingEnabled) {
        isDrawing = false;
        currentStroke = null;
        pencilCursor.classList.remove("drawing");
        pencilCursor.style.opacity = "0";
        redraw();
      } else {
        pencilCursor.style.opacity = isTouchOrMobile() ? "0" : "1";
      }
    }
  }

  function toggleDrawing() {
    const now = Date.now();
    if (now - lastToggleTime < 250) return;
    lastToggleTime = now;
    setDrawingEnabled(!isDrawingEnabled);
  }

  window.blueprintDrawing = {
    isEnabled: () => isDrawingEnabled,
    setEnabled: setDrawingEnabled
  };

  function updateFloatingNav() {
    const floatingNav = document.getElementById("floatingNav");
    if (!floatingNav) return;

    if (!isTouchOrMobile()) {
      floatingNav.classList.remove("visible");
      return;
    }

    const currentScrollY = Math.max(0, window.scrollY || window.pageYOffset || 0);
    if (currentScrollY <= 70) {
      floatingNav.classList.remove("visible");
    } else {
      floatingNav.classList.add("visible");
    }
  }
  window.addEventListener("scroll", updateFloatingNav, { passive: true });

  function loadStrokes() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        strokes = JSON.parse(saved);
        redraw();
      }
    } catch (err) {
      console.warn("Çizimler yüklenirken hata:", err);
    }
  }

  function saveStrokes() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(strokes));
    } catch (err) {
      console.warn("Çizimler kaydedilirken hata:", err);
    }
  }

  function clearStrokes() {
    strokes = [];
    currentStroke = null;
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (err) { }
    redraw();
  }

  function undoStroke() {
    if (strokes.length > 0) {
      strokes.pop();
      saveStrokes();
      redraw();
    }
  }

  function resize() {
    if (!canvas || !ctx) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
    canvas.style.width = window.innerWidth + "px";
    canvas.style.height = window.innerHeight + "px";
    redraw();
  }
  window.addEventListener("resize", resize);

  function renderStrokeOnCtx(targetCtx, stroke) {
    const pts = stroke.points;
    if (!pts || pts.length === 0) return;

    targetCtx.strokeStyle = stroke.color || "#285bc4";
    targetCtx.fillStyle = stroke.color || "#285bc4";
    targetCtx.lineWidth = stroke.width || 2.2;
    targetCtx.lineCap = "round";
    targetCtx.lineJoin = "round";

    if (pts.length === 1) {
      targetCtx.beginPath();
      targetCtx.arc(pts[0].x, pts[0].y, (stroke.width || 2.2) / 1.5, 0, Math.PI * 2);
      targetCtx.fill();
      return;
    }

    targetCtx.beginPath();
    targetCtx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length - 1; i++) {
      const midX = (pts[i].x + pts[i + 1].x) / 2;
      const midY = (pts[i].y + pts[i + 1].y) / 2;
      targetCtx.quadraticCurveTo(pts[i].x, pts[i].y, midX, midY);
    }
    targetCtx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
    targetCtx.stroke();
  }

  function redraw() {
    if (!canvas || !ctx) return;
    const scrollX = window.scrollX || window.pageXOffset || 0;
    const scrollY = window.scrollY || window.pageYOffset || 0;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    ctx.translate(-scrollX, -scrollY);

    for (let i = 0; i < strokes.length; i++) {
      renderStrokeOnCtx(ctx, strokes[i]);
    }
    if (currentStroke && currentStroke.points.length > 0) {
      renderStrokeOnCtx(ctx, currentStroke);
    }
  }
  window.addEventListener("scroll", redraw, { passive: true });

  function updatePencilPosition(clientX, clientY) {
    if (!pencilCursor) return;
    pencilCursor.style.left = clientX + "px";
    pencilCursor.style.top = clientY + "px";
  }

  window.addEventListener("pointermove", e => {
    lastPointer.x = e.clientX;
    lastPointer.y = e.clientY;
    if (!isAnimatingClick) {
      updatePencilPosition(e.clientX, e.clientY);
    }
  });

  document.addEventListener("pointerleave", () => {
    if (pencilCursor) pencilCursor.style.opacity = "0";
  });
  document.addEventListener("pointerenter", () => {
    if (pencilCursor && isDrawingEnabled && !isTouchOrMobile()) {
      pencilCursor.style.opacity = "1";
    }
  });

  function getClickableElement(clientX, clientY) {
    const elements = document.elementsFromPoint(clientX, clientY);
    for (const el of elements) {
      if (el === canvas || el === pencilCursor || el.closest("#pencilCursor")) continue;
      const clickable = el.closest("a, button, .project, .project-card, .btn, .nav-btn, .close");
      if (clickable) return clickable;
    }
    return null;
  }

  function generateBoxPoints(rect) {
    const pad = 6;
    const x = rect.left + (window.scrollX || window.pageXOffset || 0) - pad;
    const y = rect.top + (window.scrollY || window.pageYOffset || 0) - pad;
    const w = rect.width + pad * 2;
    const h = rect.height + pad * 2;

    const pts = [];
    const steps = 7;
    pts.push({ x: x + 6, y: y });

    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const wobble = Math.sin(t * Math.PI) * 1.5;
      pts.push({ x: x + 6 + t * (w - 3), y: y - wobble });
    }
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const wobble = Math.sin(t * Math.PI) * 1.5;
      pts.push({ x: x + w + 3 + wobble, y: y + t * (h + 3) });
    }
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const wobble = Math.sin(t * Math.PI) * 1.5;
      pts.push({ x: x + w + 3 - t * (w + 6), y: y + h + 3 + wobble });
    }
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const wobble = Math.sin(t * Math.PI) * 1.5;
      pts.push({ x: x - 3 - wobble, y: y + h + 3 - t * (h + 5) });
    }
    const overshootLen = Math.min(w * 0.35, 28);
    for (let i = 1; i <= 4; i++) {
      const t = i / 4;
      pts.push({ x: x - 3 + t * overshootLen, y: y - 2 + t * 1.5 });
    }
    return pts;
  }

  function animateSketchAround(element, onComplete) {
    const targetToCircle = element.classList.contains("project") || element.classList.contains("project-card")
      ? (element.querySelector("h3") || element)
      : element;

    const rect = targetToCircle.getBoundingClientRect();
    const allPts = generateBoxPoints(rect);

    const animStroke = {
      color: activeColor,
      width: 2.2,
      points: []
    };

    isAnimatingClick = true;
    if (pencilCursor) pencilCursor.classList.add("drawing");

    const startTime = performance.now();
    const duration = 210;

    function step(now) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const targetIdx = Math.floor(progress * (allPts.length - 1));

      animStroke.points = allPts.slice(0, targetIdx + 1);

      if (animStroke.points.length > 0) {
        const latest = animStroke.points[animStroke.points.length - 1];
        updatePencilPosition(
          latest.x - (window.scrollX || window.pageXOffset || 0),
          latest.y - (window.scrollY || window.pageYOffset || 0)
        );
      }

      currentStroke = animStroke;
      redraw();

      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        currentStroke = null;
        strokes.push(animStroke);
        saveStrokes();
        redraw();

        if (pencilCursor) pencilCursor.classList.remove("drawing");
        isAnimatingClick = false;
        updatePencilPosition(lastPointer.x, lastPointer.y);

        if (onComplete) onComplete();
      }
    }

    requestAnimationFrame(step);
  }

  function executeClick(el) {
    if (!el) return;

    if (el.classList.contains("nav-draw-toggle") || el.closest(".nav-draw-toggle")) {
      toggleDrawing();
      return;
    }

    if (el.classList.contains("nav-clear-btn") || el.closest(".nav-clear-btn")) {
      clearStrokes();
      const btn = el.closest(".nav-clear-btn") || el;
      const orig = btn.textContent;
      btn.textContent = "TEMİZLENDİ ⌫";
      setTimeout(() => { btn.textContent = orig; }, 1200);
      return;
    }

    if (el.classList.contains("nav-export-btn") || el.closest(".nav-export-btn")) {
      captureAndDownloadBlueprint();
      return;
    }

    const projectCard = el.closest(".project, .project-card");
    if (projectCard) {
      const href = projectCard.getAttribute("href") || projectCard.dataset.href;
      if (href) {
        window.location.href = href;
      } else {
        projectCard.click();
      }
      return;
    }

    const link = el.closest("a");
    if (link) {
      const href = link.getAttribute("href") || "";
      if (href.startsWith("#")) {
        const target = document.querySelector(href);
        if (target) {
          target.scrollIntoView({ behavior: "smooth" });
        }
      } else if (link.target === "_blank") {
        window.open(link.href, "_blank");
      } else if (href && !href.startsWith("javascript:")) {
        window.location.href = link.href;
      }
      return;
    }

    if (el.tagName.toLowerCase() === "button") {
      el.click();
    }
  }

  async function captureAndDownloadBlueprint() {
    const exportBtn = document.querySelector(".nav-export-btn");
    const origText = exportBtn ? exportBtn.textContent : "ÇIKTI AL ⤓";
    if (exportBtn) exportBtn.textContent = "HAZIRLANIYOR... ⏳";

    if (canvas) canvas.style.display = "none";
    if (pencilCursor) pencilCursor.style.display = "none";
    const floatingNav = document.getElementById("floatingNav");
    if (floatingNav) floatingNav.style.display = "none";

    try {
      if (!window.html2canvas) {
        await new Promise((res, rej) => {
          const s = document.createElement("script");
          s.src = "https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js";
          s.onload = res;
          s.onerror = rej;
          document.head.appendChild(s);
        });
      }

      const prevScrollX = window.scrollX || window.pageXOffset || 0;
      const prevScrollY = window.scrollY || window.pageYOffset || 0;
      window.scrollTo(0, 0);

      await new Promise(r => setTimeout(r, 80));

      const fullCanvas = await window.html2canvas(document.documentElement, {
        backgroundColor: "#e8eef3",
        scale: 1,
        useCORS: true,
        logging: false
      });

      window.scrollTo(prevScrollX, prevScrollY);

      const exportCtx = fullCanvas.getContext("2d");
      for (const stroke of strokes) {
        renderStrokeOnCtx(exportCtx, stroke);
      }

      fullCanvas.toBlob(blob => {
        if (!blob) throw new Error("Görüntü oluşturulamadı.");
        const a = document.createElement("a");
        const dateStr = new Date().toISOString().slice(0, 10);
        a.download = `turker-kivilcim-blueprint-${dateStr}.png`;
        a.href = URL.createObjectURL(blob);
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(a.href);

        if (exportBtn) {
          exportBtn.textContent = "İNDİRİLDİ! ✓";
          setTimeout(() => { exportBtn.textContent = origText; }, 2000);
        }
      }, "image/png");

    } catch (err) {
      console.error("Çıktı alınırken hata:", err);
      if (exportBtn) {
        exportBtn.textContent = "HATA OLUŞTU!";
        setTimeout(() => { exportBtn.textContent = origText; }, 2000);
      }
    } finally {
      if (canvas) canvas.style.display = "block";
      if (pencilCursor) {
        pencilCursor.style.display = (isDrawingEnabled && !isTouchOrMobile()) ? "block" : "none";
      }
      if (floatingNav) floatingNav.style.display = "";
      redraw();
    }
  }

  if (canvas) {
    canvas.addEventListener("pointerdown", e => {
      if (!isDrawingEnabled) return;
      if (e.button !== 0 || isAnimatingClick) return;
      e.preventDefault();
      canvas.setPointerCapture(e.pointerId);

      isDrawing = true;
      hasDragged = false;
      pointerDownPos = { x: e.clientX, y: e.clientY };
      targetClickable = getClickableElement(e.clientX, e.clientY);

      if (pencilCursor) pencilCursor.classList.add("drawing");

      const ptX = Math.round(e.pageX ?? (e.clientX + (window.scrollX || window.pageXOffset || 0)));
      const ptY = Math.round(e.pageY ?? (e.clientY + (window.scrollY || window.pageYOffset || 0)));

      currentStroke = {
        color: activeColor,
        width: activeWidth,
        points: [{ x: ptX, y: ptY }]
      };
      redraw();
    });

    canvas.addEventListener("pointermove", e => {
      if (!isDrawingEnabled || !isDrawing || !currentStroke || isAnimatingClick) return;
      e.preventDefault();

      const dist = Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y);
      if (dist > 7) {
        hasDragged = true;
        targetClickable = null;
      }

      const ptX = Math.round(e.pageX ?? (e.clientX + (window.scrollX || window.pageXOffset || 0)));
      const ptY = Math.round(e.pageY ?? (e.clientY + (window.scrollY || window.pageYOffset || 0)));
      const lastPt = currentStroke.points[currentStroke.points.length - 1];

      const dx = ptX - lastPt.x;
      const dy = ptY - lastPt.y;
      if (dx * dx + dy * dy >= 4) {
        currentStroke.points.push({ x: ptX, y: ptY });
        redraw();
      }
    });

    function finishDrawing() {
      if (!isDrawing) return;
      isDrawing = false;
      if (pencilCursor) pencilCursor.classList.remove("drawing");

      if (!hasDragged && targetClickable) {
        const clicked = targetClickable;
        currentStroke = null;
        targetClickable = null;
        redraw();

        if (clicked.classList.contains("nav-draw-toggle") || clicked.closest(".nav-draw-toggle")) {
          toggleDrawing();
          return;
        }

        animateSketchAround(clicked, () => {
          executeClick(clicked);
        });
        return;
      }

      if (currentStroke && currentStroke.points.length > 0) {
        strokes.push(currentStroke);
        saveStrokes();
      }
      currentStroke = null;
      redraw();
    }

    canvas.addEventListener("pointerup", finishDrawing);
    canvas.addEventListener("pointercancel", finishDrawing);
  }

  // Keyboard Shortcuts
  document.addEventListener("keydown", e => {
    if ((e.ctrlKey || e.metaKey) && (e.key === "z" || e.key === "Z")) {
      e.preventDefault();
      undoStroke();
    }
    if ((e.key === "c" || e.key === "C") && !e.ctrlKey && !e.metaKey) {
      const tag = document.activeElement ? document.activeElement.tagName.toLowerCase() : "";
      if (tag !== "input" && tag !== "textarea") {
        clearStrokes();
      }
    }
  });

  // Direct Button Listeners
  document.querySelectorAll(".nav-draw-toggle").forEach(btn => {
    btn.addEventListener("click", e => {
      e.preventDefault();
      toggleDrawing();
    });
  });

  document.querySelectorAll(".nav-clear-btn").forEach(btn => {
    btn.addEventListener("click", e => {
      e.preventDefault();
      clearStrokes();
      const orig = btn.textContent;
      btn.textContent = "TEMİZLENDİ ⌫";
      setTimeout(() => { btn.textContent = orig; }, 1200);
    });
  });

  const exportButtons = document.querySelectorAll(".nav-export-btn");
  exportButtons.forEach(btn => {
    btn.addEventListener("click", e => {
      e.preventDefault();
      captureAndDownloadBlueprint();
    });
  });

  const floatLogo = document.getElementById("floatNavLogo");
  if (floatLogo) {
    floatLogo.addEventListener("click", e => {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  // Active Link Highlight
  const currentPath = window.location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll(".nav-link").forEach(link => {
    const linkPath = link.getAttribute("href") || "";
    if (linkPath === currentPath || (currentPath === "index.html" && linkPath === "./")) {
      link.classList.add("active");
    }
  });

  // Init
  setDrawingEnabled(!isTouchOrMobile());
  updateFloatingNav();

  window.matchMedia("(max-width: 860px)").addEventListener("change", e => {
    setDrawingEnabled(!e.matches);
    updateFloatingNav();
  });

  resize();
  loadStrokes();

  window.Blueprint = {
    toggleDrawing,
    clearStrokes,
    undoStroke,
    captureAndDownloadBlueprint,
    redraw
  };
})();
