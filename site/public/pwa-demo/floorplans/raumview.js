'use strict';

/* Shared, framework-less floorplan view for WISS rooms.
 * Used by the legacy /mobile/ PWA (RaumView.create() returning {element, destroy})
 * and the standalone editors in raumpläne/. */

var ROOM_DOTTED_RE = /(\d)\.(\d{1,2})/;
var ROOM_TRIDIGIT_RE = /(?<![.\d])(\d)(\d{2})(?!\d)/;
var FLOOR_LABELS = { og4: '4. OG', og2: '2. OG' };
var FLOOR_ALT = { og4: '4. Obergeschoss', og2: '2. Obergeschoss' };

function isOnlineRoom(raum) {
  if (raum === null || raum === undefined) return false;
  return /online/i.test(String(raum));
}

function _toDottedRoom(raum) {
  if (raum === null || raum === undefined) return '';
  return String(raum).replace(ROOM_TRIDIGIT_RE, '$1.$2');
}

/* Canonical normalized form: "XYY" (no dot). Floor digit + 2-digit room
 * number, e.g. "208", "403". This is what data.js / FloorplanData stores
 * and what hotspot lookups match against. Inputs like "ZH 208", "2.08",
 * "208", "ZH 2.8" all collapse to "208". Utility names pass through. */
function normalizeRoom(raum) {
  if (raum === null || raum === undefined) return '';
  var converted = _toDottedRoom(raum).trim();
  var match = converted.match(ROOM_DOTTED_RE);
  if (match) {
    var num = match[2];
    if (num.length === 1) num = '0' + num;
    return match[1] + num;
  }
  // Already in dotless form? Pad single-digit numbers to two digits so
  // "28" becomes "208" — keeps the contract consistent.
  var m2 = converted.match(/^(\d)(\d{1,2})$/);
  if (m2) {
    var n = m2[2];
    return m2[1] + (n.length === 1 ? '0' + n : n);
  }
  return converted;
}

function roomToFloor(raum) {
  if (raum === null || raum === undefined) return null;
  if (isOnlineRoom(raum)) return null;
  var converted = _toDottedRoom(raum);
  var match = converted.match(ROOM_DOTTED_RE);
  if (!match) return null;
  var digit = match[1];
  if (digit === '4') return 'og4';
  if (digit === '2') return 'og2';
  return null;
}

function getFloorplanData() {
  if (typeof window !== 'undefined' && window.FloorplanData) return window.FloorplanData;
  if (typeof globalThis !== 'undefined' && globalThis.FloorplanData) return globalThis.FloorplanData;
  return null;
}

function findHotspot(floor, raum) {
  var data = getFloorplanData();
  if (!data || !floor || !data[floor]) return null;
  var hotspots = data[floor].hotspots || [];
  var needle = normalizeRoom(raum);
  if (!needle) return null;
  for (var i = 0; i < hotspots.length; i++) {
    if (hotspots[i].room === needle) {
      return {
        left: hotspots[i].left,
        top: hotspots[i].top,
        width: hotspots[i].width,
        height: hotspots[i].height
      };
    }
  }
  return null;
}

function buildEmpty(raum, mode, onClose) {
  var el = document.createElement('div');
  el.className = 'raumview raumview--empty';
  el.setAttribute('data-mode', mode);
  var msg = document.createElement('div');
  msg.className = 'raumview__empty-msg';
  msg.textContent = 'Raum ' + (raum ? String(raum) : '') + ' ist nicht im Plan verfügbar';
  el.appendChild(msg);
  var cleanups = [];
  if (mode === 'sheet') {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'raumview__close';
    btn.setAttribute('aria-label', 'Schließen');
    btn.textContent = '×';
    var handler = function () { if (typeof onClose === 'function') onClose(); };
    btn.addEventListener('click', handler);
    cleanups.push(function () { btn.removeEventListener('click', handler); });
    el.appendChild(btn);
  }
  return { element: el, cleanups: cleanups };
}

function create(raum, options) {
  if (typeof document === 'undefined') {
    throw new Error('RaumView.create requires a DOM environment');
  }
  var opts = options || {};
  var mode = opts.mode === 'sheet' ? 'sheet' : 'inline';
  var onClose = typeof opts.onClose === 'function' ? opts.onClose : null;

  var floor = roomToFloor(raum);
  var hotspot = floor ? findHotspot(floor, raum) : null;
  var data = getFloorplanData();
  var floorEntry = floor && data ? data[floor] : null;

  if (!floor || !hotspot || !floorEntry) {
    var empty = buildEmpty(raum, mode, onClose);
    return {
      element: empty.element,
      destroy: function () {
        for (var i = 0; i < empty.cleanups.length; i++) empty.cleanups[i]();
      }
    };
  }

  var normalized = normalizeRoom(raum);
  var dotLeft = hotspot.left + hotspot.width / 2;
  var dotTop = hotspot.top + hotspot.height / 2;

  var root = document.createElement('div');
  root.className = 'raumview';
  root.setAttribute('data-mode', mode);
  root.setAttribute('data-floor', floor);

  var stage = document.createElement('div');
  stage.className = 'raumview__stage';
  stage.style.aspectRatio = floorEntry.aspectRatio.replace('/', ' / ');
  stage.setAttribute('role', 'img');
  stage.setAttribute('aria-label', (FLOOR_ALT[floor] || '') + ' — Raum ' + normalized);

  var hotspots = floorEntry.hotspots || [];
  // After data.js dropped dots, hotspot rooms are 3-digit codes ("403"). */
  var classroomRe = /^\d{3}$/;

  // Two passes so utilities render below numbered rooms; active draws last.
  var ordered = [];
  for (var u = 0; u < hotspots.length; u++) if (!classroomRe.test(hotspots[u].room)) ordered.push(hotspots[u]);
  for (var c = 0; c < hotspots.length; c++) if (classroomRe.test(hotspots[c].room) && hotspots[c].room !== normalized) ordered.push(hotspots[c]);
  for (var a = 0; a < hotspots.length; a++) if (hotspots[a].room === normalized) ordered.push(hotspots[a]);

  for (var i = 0; i < ordered.length; i++) {
    var h = ordered[i];
    var isActive = h.room === normalized;
    var isUtility = !classroomRe.test(h.room);
    var roomEl = document.createElement('div');
    var cls = 'raumview__room';
    if (isActive) cls += ' raumview__room--active';
    if (isUtility) cls += ' raumview__room--utility';
    roomEl.className = cls;
    roomEl.style.left = h.left + '%';
    roomEl.style.top = h.top + '%';
    roomEl.style.width = h.width + '%';
    roomEl.style.height = h.height + '%';
    var label = document.createElement('span');
    label.className = 'raumview__room-label';
    label.textContent = h.room;
    roomEl.appendChild(label);
    stage.appendChild(roomEl);
  }

  var dot = document.createElement('div');
  dot.className = 'raumview__dot';
  dot.style.left = dotLeft + '%';
  dot.style.top = dotTop + '%';
  dot.setAttribute('aria-hidden', 'true');

  var pulse = document.createElement('span');
  pulse.className = 'raumview__dot-pulse';
  pulse.setAttribute('aria-hidden', 'true');
  dot.appendChild(pulse);

  var core = document.createElement('span');
  core.className = 'raumview__dot-core';
  core.setAttribute('aria-hidden', 'true');
  dot.appendChild(core);

  stage.appendChild(dot);
  root.appendChild(stage);

  var caption = document.createElement('div');
  caption.className = 'raumview__caption';
  var floorTag = document.createElement('span');
  floorTag.className = 'raumview__floor-tag';
  floorTag.textContent = FLOOR_LABELS[floor] || '';
  caption.appendChild(floorTag);
  var roomName = document.createElement('span');
  roomName.className = 'raumview__room-name';
  roomName.textContent = normalized;
  caption.appendChild(roomName);
  root.appendChild(caption);

  var cleanups = [];

  if (mode === 'sheet') {
    var closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'raumview__close';
    closeBtn.setAttribute('aria-label', 'Schließen');
    closeBtn.textContent = '×';
    var closeHandler = function () { if (onClose) onClose(); };
    closeBtn.addEventListener('click', closeHandler);
    cleanups.push(function () { closeBtn.removeEventListener('click', closeHandler); });
    root.appendChild(closeBtn);
  }

  var rafId = null;
  if (typeof requestAnimationFrame === 'function') {
    rafId = requestAnimationFrame(function () {
      rafId = requestAnimationFrame(function () {
        rafId = null;
        root.setAttribute('data-mounted', 'true');
      });
    });
  } else {
    root.setAttribute('data-mounted', 'true');
  }

  return {
    element: root,
    destroy: function () {
      if (rafId !== null && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      for (var i = 0; i < cleanups.length; i++) cleanups[i]();
    }
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { isOnlineRoom: isOnlineRoom, roomToFloor: roomToFloor, normalizeRoom: normalizeRoom, findHotspot: findHotspot, create: create };
} else if (typeof window !== 'undefined') {
  window.RaumView = {
    isOnlineRoom: isOnlineRoom,
    roomToFloor: roomToFloor,
    normalizeRoom: normalizeRoom,
    findHotspot: findHotspot,
    create: create
  };
}
