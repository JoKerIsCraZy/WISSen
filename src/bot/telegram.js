'use strict';

const state = require('./state');

// ---------- Telegram API ----------
async function tg(method, body) {
  const url = `https://api.telegram.org/bot${state.token}/${method}`;
  const payload = body || {};
  try {
    // 60s deckt getUpdates (server-seitig 30s long-poll) + Netzwerk-Slack ab.
    // Node 22+ unterstützt AbortSignal.timeout nativ.
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(60000)
    });
    const json = await res.json();
    if (!json.ok) {
      // 429-Handling: bei rate-limit kurz warten und genau EINMAL retryen.
      // WISSen's Bot-Pattern (Single-User-Polling + sporadische Pushes)
      // sollte das rate-limit selten triggern, aber wenn doch: kein Endlos-Loop,
      // wir geben dem Server eine Pause und versuchen es nochmal. Mehr als ein
      // Retry würde State-Bugs maskieren (z.B. ungültiger chatId).
      const retryAfter = json.parameters && json.parameters.retry_after;
      if (retryAfter && retryAfter > 0 && retryAfter <= 30 && !payload.__retried) {
        await new Promise(r => setTimeout(r, retryAfter * 1000 + 500));
        // payload um __retried-Marker erweitern, nicht-enumerable damit Telegram
        // ihn nicht im next sendMessage als "Custom field" interpretiert.
        Object.defineProperty(payload, '__retried', { value: true, enumerable: false });
        return tg(method, payload);
      }
      throw new Error(`Telegram ${method}: ${json.description}`);
    }
    return json.result;
  } catch (e) {
    // Token-Redaktion: weder URL noch Token darf jemals in Logs landen.
    const msg = (e && e.message) ? e.message : String(e);
    const redacted = state.token ? msg.split(state.token).join('<REDACTED>') : msg;
    const err = new Error(redacted);
    err.cause = undefined; // verhindert dass e.cause durchgereicht wird
    throw err;
  }
}

// Menü-Mutex: jeder Aufruf, der `state.lastMenuMessageId` mutiert (send +
// editMessage + showScreen), wird über `state.pendingMenuOp` serialisiert.
// Das verhindert die Race wo z.B. ein Callback `editMessageText` startet,
// während ein paralleler send() das alte Menü löscht und ein neues setzt
// — sonst würde `lastMenuMessageId` auf eine bereits gelöschte Message zeigen.
// `sendPush()` (notify*) ist explizit NICHT in der Kette, weil es
// `lastMenuMessageId` nicht anfasst und Push-Nachrichten unabhängig laufen.
function chainMenuOp(fn) {
  const prev = state.pendingMenuOp || Promise.resolve();
  const next = prev.then(fn, fn);
  // Speichere den nächsten Slot — schwacher Ref-Reset, damit ein fehlerhafter
  // Op nicht die gesamte Kette für immer blockiert.
  state.pendingMenuOp = next;
  return next;
}

async function send(chatId, text, keyboard) {
  return chainMenuOp(async () => {
    // Vorheriges Menü löschen (best-effort) — nur EIN Menü-Bot-Message bleibt sichtbar
    if (state.lastMenuMessageId && chatId === state.allowedUserId) {
      tg('deleteMessage', { chat_id: chatId, message_id: state.lastMenuMessageId }).catch(() => {});
      state.lastMenuMessageId = null;
    }

    const body = {
      chat_id: chatId,
      text: truncate(text),
      parse_mode: 'HTML',
      disable_web_page_preview: true
    };
    if (keyboard) body.reply_markup = keyboard;
    const sent = await tg('sendMessage', body);
    if (sent && sent.message_id && chatId === state.allowedUserId) {
      state.lastMenuMessageId = sent.message_id;
    }
    return sent;
  });
}

// Push-Nachrichten: bleiben stehen, OK-Button zum Dismiss, löschen NICHT vorheriges Menü.
// NICHT teil der Menu-Mutex-Kette — Pushes sind unabhängig von lastMenuMessageId.
async function sendPush(chatId, text, keyboard) {
  const pushKb = keyboard ? { inline_keyboard: [...(keyboard.inline_keyboard || [])] } : { inline_keyboard: [] };
  pushKb.inline_keyboard.push([{ text: '✓ OK', callback_data: 'dismiss' }]);

  const body = {
    chat_id: chatId,
    text: truncate(text),
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    reply_markup: pushKb
  };
  return tg('sendMessage', body);
}

// Editiert das letzte Menü-Message oder sendet ein neues, falls keins existiert/editierbar ist.
// Auch in der Menu-Mutex-Kette serialisiert.
async function showScreen(chatId, screen) {
  return chainMenuOp(async () => {
    const lastId = state.lastMenuMessageId;
    if (lastId) {
      try {
        await tg('editMessageText', {
          chat_id: chatId,
          message_id: lastId,
          text: truncate(screen.text),
          parse_mode: 'HTML',
          disable_web_page_preview: true,
          ...(screen.keyboard ? { reply_markup: screen.keyboard } : {})
        });
        return lastId;
      } catch (_) {
        // Edit fehlgeschlagen → message weg/alt → fallthrough zu inline-send (nicht
        // rekursiv send() aufrufen, weil wir bereits in chainMenuOp sind und das
        // einen Deadlock verursachen würde).
        state.lastMenuMessageId = null;
      }
    }
    const body = {
      chat_id: chatId,
      text: truncate(screen.text),
      parse_mode: 'HTML',
      disable_web_page_preview: true
    };
    if (screen.keyboard) body.reply_markup = screen.keyboard;
    const sent = await tg('sendMessage', body);
    if (sent && sent.message_id && chatId === state.allowedUserId) {
      state.lastMenuMessageId = sent.message_id;
    }
    return sent ? sent.message_id : null;
  });
}

async function editMessage(chatId, messageId, text, keyboard) {
  return chainMenuOp(async () => {
    const body = {
      chat_id: chatId,
      message_id: messageId,
      text: truncate(text),
      parse_mode: 'HTML',
      disable_web_page_preview: true
    };
    if (keyboard) body.reply_markup = keyboard;
    try {
      return await tg('editMessageText', body);
    } catch (e) {
      const msg = (e && e.message) || '';
      // Nur fallback wenn die Original-Message wirklich weg oder unveränderbar
      // ist. Bei 429 / "rate limit" hingegen würde ein send() den rate-limit
      // verschlimmern, daher rethrow.
      if (/message to edit not found|message can't be edited|message is too old/i.test(msg)) {
        // Inline neu senden statt rekursiv send() — wir sind bereits in der
        // Mutex-Kette, ein erneutes chainMenuOp() würde uns selbst awaiten.
        if (state.lastMenuMessageId === messageId) {
          state.lastMenuMessageId = null;
        }
        const sendBody = {
          chat_id: chatId,
          text: truncate(text),
          parse_mode: 'HTML',
          disable_web_page_preview: true
        };
        if (keyboard) sendBody.reply_markup = keyboard;
        const sent = await tg('sendMessage', sendBody);
        if (sent && sent.message_id && chatId === state.allowedUserId) {
          state.lastMenuMessageId = sent.message_id;
        }
        return sent;
      }
      // "message is not modified" → identischer Content, kein Fehler-Fall
      if (/message is not modified/i.test(msg)) return null;
      // 429 / sonstige Fehler → bubble up, caller's retry-logic übernimmt
      throw e;
    }
  });
}

// Telegram-Limit ist 4096 Bytes UTF-8 (nicht Chars!). Naives slice() bricht
// mitten in HTML-Tags ("<b>X</b>" → "<b>X</" + suffix → Parser-Crash).
// Wir cutten byte-genau, schmeißen einen unvollständigen Tag-Rest am Ende weg
// und schließen offene Tags sauber.
function truncate(text) {
  const MAX_BYTES = 4000;
  if (Buffer.byteLength(text, 'utf8') <= MAX_BYTES) return text;

  const suffix = '\n\n<i>… (gekürzt)</i>';
  const budget = MAX_BYTES - Buffer.byteLength(suffix, 'utf8');

  let cut = '';
  let bytes = 0;
  for (const ch of text) {
    const chBytes = Buffer.byteLength(ch, 'utf8');
    if (bytes + chBytes > budget) break;
    cut += ch;
    bytes += chBytes;
  }

  // Unvollständiger Tag am Ende? "<...ohne >" → wegschneiden.
  const lastOpen = cut.lastIndexOf('<');
  const lastClose = cut.lastIndexOf('>');
  if (lastOpen > lastClose) cut = cut.slice(0, lastOpen);

  // Telegram-erlaubtes HTML: b, i, u, s, code, pre, a — wir tracken nur die,
  // die wir tatsächlich nutzen (b, i, code, s, u). Stack-basiert.
  const openStack = [];
  const tagRe = /<(\/)?([a-z]+)\b[^>]*>/gi;
  let m;
  while ((m = tagRe.exec(cut)) !== null) {
    const isClose = !!m[1];
    const name = m[2].toLowerCase();
    if (!['b', 'i', 'u', 's', 'code', 'pre', 'a'].includes(name)) continue;
    if (isClose) {
      const idx = openStack.lastIndexOf(name);
      if (idx >= 0) openStack.splice(idx, 1);
    } else {
      openStack.push(name);
    }
  }
  let closing = '';
  for (let i = openStack.length - 1; i >= 0; i--) closing += '</' + openStack[i] + '>';

  let result = cut + closing + suffix;

  // Safety-Net: falls die offen-Tags-Berechnung trotzdem über das Telegram-
  // Limit (4096 Bytes API-Limit) führt, hartes Beschneiden — lieber ein
  // optisch verkürzter Output als ein Telegram-Reject.
  if (Buffer.byteLength(result, 'utf8') > 4096) {
    result = result.slice(0, 4000) + '…';
  }

  return result;
}

module.exports = { tg, send, sendPush, showScreen, editMessage, truncate };
