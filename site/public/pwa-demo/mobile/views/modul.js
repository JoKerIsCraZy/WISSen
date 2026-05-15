/* ============================================================
   WISSen — View: Modul-Detail
   Shows module overall grade + computed weighted average + sectioned
   list of Pruefungen (ZP / LB / others).

   Depends on globals from mobile.js shell:
     - titleEl, main, apiFetch, loadingShell, errorShell
     - gradeClass, buildTitle
   ============================================================ */
'use strict';

async function renderModul(kuerzelId, kuerzelCodeHint) {
  titleEl.textContent = 'Modul';
  loadingShell();
  try {
    const data = await apiFetch('/api/noten/' + encodeURIComponent(kuerzelId) + '/pruefungen');
    titleEl.textContent = buildTitle(data.kuerzelCode || kuerzelCodeHint, data.fachName);
    drawModul(data);
  } catch (e) {
    if (e.silent) return;
    errorShell(e.message || 'Fehler beim Laden des Moduls');
  }
}
function computeWeighted(rows) {
  const scored = rows.filter(r => r.bewertung != null);
  if (!scored.length) return null;
  let totalW = 0, totalGrade = 0;
  scored.forEach((r) => {
    const w = (r.gewicht_pct != null) ? r.gewicht_pct : 1.0;
    totalW += w;
    totalGrade += w * r.bewertung;
  });
  if (totalW <= 0) return null;
  return totalGrade / totalW;
}
function drawModul(data) {
  main.replaceChildren();
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
  main.append(stats);

  if (!rows.length) {
    const empty = document.createElement('div');
    empty.className = 'm-empty';
    empty.textContent = 'Für dieses Modul sind noch keine ZP/LB-Noten erfasst.';
    main.append(empty);
    return;
  }

  const groups = [
    { label: 'Zwischenprüfungen', filter: r => r.pruefung_typ === 'ZP' },
    { label: 'Lernbeurteilungen',  filter: r => r.pruefung_typ === 'LB' },
    { label: 'Weitere',            filter: r => r.pruefung_typ !== 'ZP' && r.pruefung_typ !== 'LB' }
  ];
  groups.forEach((g) => {
    const items = rows.filter(g.filter);
    if (!items.length) return;
    const h = document.createElement('h3');
    h.className = 'm-section-h';
    h.innerHTML = '<span>' + g.label + '</span><span class="m-section-h__count">' + items.length + '</span>';
    main.append(h);
    const list = document.createElement('div');
    list.className = 'm-list';
    items.forEach((p) => list.append(pruefungCard(p)));
    main.append(list);
  });
}
function pruefungCard(p) {
  const card = document.createElement('div');
  card.className = 'm-card';
  const inner = document.createElement('div');
  inner.className = 'm-pruefung';

  const tag = document.createElement('div');
  tag.className = 'm-pruefung__tag';
  tag.textContent = (p.pruefung_typ || '') + (p.pruefung_nr != null ? p.pruefung_nr : '');

  const main_ = document.createElement('div');
  main_.className = 'm-pruefung__body';
  if (p.bezeichnung) {
    const t = document.createElement('div');
    t.className = 'm-card__title m-card__title--sm';
    t.textContent = p.bezeichnung;
    main_.append(t);
  }
  const w = (p.gewicht != null) ? p.gewicht
            : (p.gewicht_pct != null ? p.gewicht_pct.toFixed(0) + '%' : null);
  if (w) {
    const s = document.createElement('div');
    s.className = 'm-card__sub';
    s.textContent = 'Gewicht: ' + w;
    main_.append(s);
  }

  const grade = document.createElement('div');
  grade.className = 'm-card__grade ' + gradeClass(p.bewertung);
  // Prev → curr Diff anzeigen falls die ZP/LB ihren Wert geändert hat.
  // prev_bewertung kommt aus pruefungen_history (siehe getPruefungen-Query).
  const hasDiff = p.prev_bewertung != null
    && p.bewertung != null
    && p.prev_bewertung !== p.bewertung;
  if (hasDiff) {
    const prev = document.createElement('span');
    prev.className = 'm-card__grade-prev ' + gradeClass(p.prev_bewertung);
    prev.title = 'Vorheriger Wert';
    prev.textContent = p.prev_bewertung.toFixed(1);
    const arrow = document.createElement('span');
    arrow.className = 'm-card__grade-arrow';
    arrow.textContent = '→';
    arrow.setAttribute('aria-hidden', 'true');
    const curr = document.createElement('span');
    curr.className = 'm-card__grade-curr';
    curr.textContent = p.bewertung.toFixed(1);
    grade.append(prev, arrow, curr);
  } else {
    grade.textContent = (p.bewertung != null) ? p.bewertung.toFixed(1)
                      : (p.bewertung_raw || '—');
  }

  inner.append(tag, main_, grade);
  card.append(inner);
  return card;
}
