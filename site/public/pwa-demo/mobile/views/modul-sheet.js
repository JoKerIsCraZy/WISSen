/* ============================================================
   WISSen — Modul-Detail bottom sheet (popup)

   Opens the same content as the /modul/<id> route in an overlay sheet
   instead of routing away from the Noten list. Tapped from a note card.

   Lifecycle (single path):
     openModulSheet(id, code) → attach() with loading body → fetch →
     swapBody() with full content. Close via:
       - tap on backdrop
       - close button
       - Escape key
       - history.back (pushState entry)
       - Tab/Shift-Tab cycles inside the sheet (focus trap).

   Shares helpers with views/modul.js (computeWeighted, pruefungCard).

   Depends on globals from mobile.js shell:
     - apiFetch
     - gradeClass, buildTitle
   And from views/modul.js:
     - computeWeighted, pruefungCard
   ============================================================ */
'use strict';

(function () {
  let activeSheet = null;          // { overlay, sheet, close, prevFocus, titleId }
  let titleIdCounter = 0;

  function nextTitleId() {
    titleIdCounter += 1;
    return 'm-sheet-title-' + titleIdCounter;
  }

  /* Build the persistent overlay + sheet shell (head + empty body). The body
   * gets filled via swapBody() so loading → success/error swap doesn't
   * remount the overlay (and doesn't lose focus state). */
  function buildShell(initialTitle) {
    const titleId = nextTitleId();
    const overlay = document.createElement('div');
    overlay.className = 'm-sheet-overlay';

    const sheet = document.createElement('div');
    sheet.className = 'm-sheet';
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    sheet.setAttribute('aria-labelledby', titleId);

    sheet.innerHTML =
      '<header class="m-sheet__head">' +
        '<div class="m-sheet__handle" aria-hidden="true"></div>' +
        '<h2 class="m-sheet__title"></h2>' +
        '<button type="button" class="m-sheet__close" aria-label="Schließen">' +
          '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
            '<line x1="18" y1="6" x2="6" y2="18"></line>' +
            '<line x1="6" y1="6" x2="18" y2="18"></line>' +
          '</svg>' +
        '</button>' +
      '</header>' +
      '<div class="m-sheet__body"></div>';

    const titleEl = sheet.querySelector('.m-sheet__title');
    titleEl.id = titleId;
    titleEl.textContent = initialTitle || 'Modul';

    overlay.append(sheet);
    return { overlay, sheet, titleId };
  }

  function fillLoadingBody(sheet) {
    const body = sheet.querySelector('.m-sheet__body');
    body.replaceChildren();
    body.innerHTML = '<div class="m-loading"><div class="m-spinner"></div>Lade Modul …</div>';
  }

  function fillErrorBody(sheet, msg) {
    const body = sheet.querySelector('.m-sheet__body');
    body.replaceChildren();
    const err = document.createElement('div');
    err.className = 'm-error';
    err.setAttribute('role', 'alert');
    err.textContent = msg;
    body.append(err);
  }

  function fillSuccessBody(sheet, data) {
    sheet.querySelector('.m-sheet__title').textContent =
      buildTitle(data.kuerzelCode, data.fachName);
    const body = sheet.querySelector('.m-sheet__body');
    body.replaceChildren();

    const rows = (data && data.rows) || [];
    const computed = computeWeighted(rows);

    const stats = document.createElement('div');
    stats.className = 'm-stats-card';
    stats.innerHTML =
      '<div class="m-stat"><div class="m-stat__value ' + gradeClass(data.modulNote) + '">' +
        (data.modulNote != null ? data.modulNote.toFixed(1) : '—') +
      '</div><div class="m-stat__label">Modulnote</div></div>' +
      '<div class="m-stat"><div class="m-stat__value ' + gradeClass(computed) + '">' +
        (computed != null ? computed.toFixed(2) : '—') +
      '</div><div class="m-stat__label">Berechnet</div></div>';
    body.append(stats);

    if (!rows.length) {
      const empty = document.createElement('div');
      empty.className = 'm-empty';
      empty.textContent = 'Für dieses Modul sind noch keine ZP/LB-Noten erfasst.';
      body.append(empty);
      return;
    }

    const groups = [
      { label: 'Zwischenprüfungen', filter: (r) => r.pruefung_typ === 'ZP' },
      { label: 'Lernbeurteilungen', filter: (r) => r.pruefung_typ === 'LB' },
      { label: 'Weitere',           filter: (r) => r.pruefung_typ !== 'ZP' && r.pruefung_typ !== 'LB' }
    ];
    groups.forEach((g) => {
      const items = rows.filter(g.filter);
      if (!items.length) return;
      const h = document.createElement('h3');
      h.className = 'm-section-h';
      h.innerHTML = '<span>' + g.label + '</span><span class="m-section-h__count">' + items.length + '</span>';
      body.append(h);
      const list = document.createElement('div');
      list.className = 'm-list';
      items.forEach((p) => list.append(pruefungCard(p)));
      body.append(list);
    });
  }

  /* Focus-trap: Tab from last focusable wraps to first, Shift-Tab from first
   * wraps to last. Keeps keyboard users inside the dialog while it's open. */
  const FOCUSABLE_SEL =
    'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), ' +
    'select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  function focusables(sheet) {
    return Array.from(sheet.querySelectorAll(FOCUSABLE_SEL))
      .filter((el) => !el.hasAttribute('hidden'));
  }

  function trapTab(sheet, e) {
    if (e.key !== 'Tab') return;
    const list = focusables(sheet);
    if (list.length === 0) {
      e.preventDefault();
      sheet.focus();
      return;
    }
    const first = list[0];
    const last = list[list.length - 1];
    const active = document.activeElement;
    if (e.shiftKey) {
      if (active === first || !sheet.contains(active)) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (active === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  /* Drag-to-dismiss — folgt dem Sonner/Vaul-Pattern + Emils Animations-
   * Framework:
   *   - Greift auf der Sheet-Header-Area (Handle + Title). Body bleibt
   *     scrollbar. Click auf den X-Button wird ausgeschlossen.
   *   - DOWN: 1:1 mit dem Finger (transform translateY = dy).
   *   - UP:  gedämpft (rubber-band, factor 0.2). Emil: "things in real life
   *     don't suddenly stop; they slow down first" — kein harter Stop.
   *   - Release-Entscheidung: Distanz > 100px ODER velocity > 0.11 px/ms
   *     (Emils Empfehlung — ein schneller Flick reicht auch ohne Distanz).
   *   - Multi-touch-Protection: zweite Geste während aktivem Drag wird
   *     ignoriert (Emil: "switching fingers mid-drag causes the element to
   *     jump to the new position").
   *   - Entry-Animation während Drag deaktiviert; CSS-Token --ease
   *     (cubic-bezier(.2,.7,.2,1)) wird für sowohl Snap-Back als auch
   *     Dismiss-Out genutzt — konsistent zum bestehenden sheetOut-Keyframe. */
  function attachDragToDismiss(sheet, doClose) {
    const head = sheet.querySelector('.m-sheet__head');
    if (!head) return;

    const DISMISS_PX = 100;
    const VELOCITY_THRESHOLD = 0.11; // px / ms — Emil-Default für momentum-dismiss

    let dragging = false;
    let pointerId = null;
    let startY = 0;
    let lastY = 0;
    let lastTime = 0;

    function setTransform(dy) {
      sheet.style.transform = dy === 0 ? '' : 'translateY(' + dy + 'px)';
    }

    head.addEventListener('pointerdown', (e) => {
      // Multi-touch-Protection: laufender Drag → zweite Geste ignorieren
      if (dragging) return;
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      // Close-Button hat eigenen Click-Handler — nicht als Drag werten
      if (e.target.closest('.m-sheet__close')) return;
      dragging = true;
      pointerId = e.pointerId;
      startY = lastY = e.clientY;
      lastTime = performance.now();
      try { head.setPointerCapture(pointerId); } catch (_) {}
      // Entry-Animation pausieren — sheetIn kollidiert sonst mit unserem
      // inline-transform während die Animation noch läuft (frische Sheets)
      sheet.style.animation = 'none';
      sheet.style.transition = 'none';
    });

    head.addEventListener('pointermove', (e) => {
      if (!dragging || e.pointerId !== pointerId) return;
      const dy = e.clientY - startY;
      lastY = e.clientY;
      lastTime = performance.now();
      // Hochziehen wird komplett geclampt — sonst würde der Hintergrund
      // unter dem Sheet sichtbar (Sheet sitzt am unteren Viewport-Rand,
      // jede UP-Bewegung schiebt es ÜBER den unteren Rand). Nur DOWN
      // bewegt das Sheet.
      setTransform(dy < 0 ? 0 : dy);
    });

    function onPointerEnd(e) {
      if (!dragging || e.pointerId !== pointerId) return;
      dragging = false;
      try { head.releasePointerCapture(pointerId); } catch (_) {}
      pointerId = null;
      const totalDy = e.clientY - startY;
      const recentDt = Math.max(performance.now() - lastTime, 1);
      const recentDy = e.clientY - lastY;
      const velocity = Math.abs(recentDy) / recentDt;
      // Emil-Pattern: Distance ODER Velocity reicht (ein langsamer Drag mit
      // schnellem Flick-Off am Ende soll auch dismiss-würdig sein)
      const shouldDismiss = totalDy > DISMISS_PX
        || (totalDy > 20 && recentDy >= 0 && velocity > VELOCITY_THRESHOLD);

      if (shouldDismiss) {
        // Match bestehenden sheetOut: 220ms + projekt-Default-ease
        sheet.style.transition = 'transform 220ms var(--ease)';
        sheet.style.transform = 'translateY(100%)';
        // doClose schaltet die Backdrop-Out-Animation an und entfernt das
        // Overlay nach 220ms — passt zur transform-Dauer
        setTimeout(doClose, 200);
      } else {
        // Snap-zurück mit gleichem ease-Token. Emil: response-side animation
        // soll snappy sein → 220ms ist innerhalb des "modal/drawer"-Bereichs
        sheet.style.transition = 'transform 220ms var(--ease)';
        sheet.style.transform = '';
        const cleanup = () => {
          sheet.style.transition = '';
          sheet.removeEventListener('transitionend', cleanup);
        };
        sheet.addEventListener('transitionend', cleanup);
      }
    }
    head.addEventListener('pointerup', onPointerEnd);
    head.addEventListener('pointercancel', onPointerEnd);
  }

  function attach(initialTitle) {
    // Tear down any previous sheet so we never have two stacked.
    if (activeSheet) close(activeSheet);

    const { overlay, sheet, titleId } = buildShell(initialTitle);
    fillLoadingBody(sheet);

    document.body.append(overlay);

    const prevFocus = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    /* Auto-focus the close button so screen-reader users (and keyboard
     * users) land *inside* the dialog. Using the close button as the
     * default landing point follows iOS/Material sheet conventions. */
    requestAnimationFrame(() => {
      const closeBtn = sheet.querySelector('.m-sheet__close');
      if (closeBtn) closeBtn.focus({ preventScroll: true });
    });

    const handle = {
      overlay,
      sheet,
      titleId,
      prevFocus,
      prevOverflow,
      close: null
    };

    function doClose() {
      if (activeSheet !== handle) return;
      activeSheet = null;
      document.body.style.overflow = prevOverflow;
      overlay.classList.add('is-closing');
      setTimeout(() => { try { overlay.remove(); } catch (_) {} }, 220);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('popstate', onPop);
      // Restore focus to whatever opened the sheet.
      if (prevFocus && typeof prevFocus.focus === 'function') {
        try { prevFocus.focus({ preventScroll: true }); } catch (_) {}
      }
      // Pop the history entry we pushed on open (so Back doesn't double-fire).
      try { if (history.state && history.state.sheet) history.back(); } catch (_) {}
    }
    handle.close = doClose;

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) doClose();
    });
    sheet.querySelector('.m-sheet__close').addEventListener('click', doClose);

    /* Drag-to-dismiss — Sonner/Vaul-Pattern. Pointer-Capture auf den Header
     * (Handle + Title-Area) damit der Sheet bei einer DOWN-Geste der Hand
     * folgt; loslassen entscheidet via Distanz-+Velocity-Threshold ob
     * geschlossen wird oder zurück snappt. UP-Drag ist gedämpft (rubber-band)
     * statt blockiert — fühlt sich natürlicher an als ein harter Stop.
     *
     * Reduced-motion respektieren: kein Drag, dann reicht Schließen-Button +
     * Esc + Backdrop für Dismissal-Pfade. */
    const reduceMotion = (() => {
      try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
      catch (_) { return false; }
    })();
    if (!reduceMotion) attachDragToDismiss(sheet, doClose);

    function onKey(e) {
      if (e.key === 'Escape') { doClose(); return; }
      trapTab(sheet, e);
    }
    document.addEventListener('keydown', onKey);

    history.pushState({ sheet: true }, '', location.href);
    function onPop() { doClose(); }
    window.addEventListener('popstate', onPop);

    activeSheet = handle;
    return handle;
  }

  function close(handle) {
    if (handle && handle.close) handle.close();
  }

  async function openModulSheet(kuerzelId, kuerzelCode) {
    if (!kuerzelId) return;
    const handle = attach(kuerzelCode || 'Modul');
    try {
      const data = await apiFetch(
        '/api/noten/' + encodeURIComponent(kuerzelId) + '/pruefungen'
      );
      // If user closed it during the fetch, abandon the result.
      if (activeSheet !== handle) return;
      fillSuccessBody(handle.sheet, data);
    } catch (e) {
      if (e && e.silent) return;
      if (activeSheet !== handle) return;
      fillErrorBody(handle.sheet, (e && e.message) || 'Fehler beim Laden');
    }
  }

  function closeActive() {
    if (activeSheet) activeSheet.close();
  }

  // Expose
  window.openModulSheet = openModulSheet;
  window.closeModulSheet = closeActive;
})();
