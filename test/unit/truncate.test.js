'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { truncate } = require('../../src/bot/telegram');

const SUFFIX = '\n\n<i>… (gekürzt)</i>';

test('truncate: short text returned unchanged', () => {
  const text = 'hello world';
  assert.equal(truncate(text), text);
});

test('truncate: text exactly at limit returned unchanged', () => {
  const text = 'a'.repeat(4000);
  assert.equal(truncate(text), text);
});

test('truncate: long text gets gekürzt suffix', () => {
  const long = 'a'.repeat(5000);
  const result = truncate(long);
  assert.ok(result.endsWith(SUFFIX), 'should end with gekürzt suffix');
  assert.ok(result.length < long.length + SUFFIX.length, 'should be shorter than original + suffix');
});

test('truncate: result stays under byte limit', () => {
  const long = 'a'.repeat(5000);
  const result = truncate(long);
  assert.ok(Buffer.byteLength(result, 'utf8') <= 4000, 'result must fit in 4000 bytes');
});

test('truncate: emoji text cut at character boundary, not byte', () => {
  // Each rocket emoji is 4 bytes UTF-8.
  const emoji = '🚀';
  const text = emoji.repeat(2000); // 8000 bytes — way over 4000.
  const result = truncate(text);
  // Strip suffix and verify the body has no broken emoji.
  assert.ok(result.endsWith(SUFFIX));
  const body = result.slice(0, result.length - SUFFIX.length);
  // Body should be a valid string of full emojis.
  assert.doesNotThrow(() => Buffer.from(body, 'utf8'));
  assert.ok(Buffer.byteLength(result, 'utf8') <= 4000);
  // Should still contain at least one rocket.
  assert.ok(body.includes(emoji));
});

test('truncate: German umlauts cut at character boundary', () => {
  // ä is 2 bytes UTF-8.
  const text = 'ä'.repeat(3000); // 6000 bytes
  const result = truncate(text);
  assert.ok(result.endsWith(SUFFIX));
  assert.ok(Buffer.byteLength(result, 'utf8') <= 4000);
  // No replacement chars / mojibake.
  const body = result.slice(0, result.length - SUFFIX.length);
  assert.ok(!body.includes('�'), 'no replacement characters');
});

test('truncate: open <b> without close — auto-closes before suffix', () => {
  const html = '<b>' + 'a'.repeat(5000) + '</b>';
  const result = truncate(html);
  assert.ok(result.endsWith(SUFFIX));
  // Strip suffix, the body should end with </b> (auto-closed since the </b> in source got cut).
  const body = result.slice(0, result.length - SUFFIX.length);
  assert.ok(body.endsWith('</b>'), `expected body to end with </b>, got: ...${body.slice(-20)}`);
});

test('truncate: multiple nested tags close in correct order', () => {
  const html = '<b><i>' + 'a'.repeat(5000) + '</i></b>';
  const result = truncate(html);
  assert.ok(result.endsWith(SUFFIX));
  const body = result.slice(0, result.length - SUFFIX.length);
  // Nested <b><i>…  → must close </i></b> in that order (innermost first).
  assert.ok(body.endsWith('</i></b>'), `expected </i></b> close, got: ...${body.slice(-20)}`);
});

test('truncate: incomplete tag at cut — strips the <', () => {
  // Construct: 3998 a's + "<b" — truncate budget should leave "<b" dangling.
  // Rather than precise crafting, we check with a contrived unclosed tag that gets truncated.
  // Use letter padding so cut lands inside the <
  const padding = 'a'.repeat(4000);
  const text = padding + '<incomplete';
  const result = truncate(text);
  // The incomplete tag fragment must NOT appear in the output before suffix.
  const body = result.slice(0, result.length - SUFFIX.length);
  // No dangling '<' immediately before suffix.
  assert.ok(!body.endsWith('<'), 'must not end with dangling <');
  // Should not contain a dangling <incomplete fragment.
  assert.ok(!/<incomplet?$/.test(body), 'must not contain truncated tag');
});

test('truncate: unsupported tag <custom> is left alone, not auto-closed', () => {
  // Build a long text with an open <custom> tag that survives the cut.
  const html = '<custom>' + 'a'.repeat(5000);
  const result = truncate(html);
  assert.ok(result.endsWith(SUFFIX));
  const body = result.slice(0, result.length - SUFFIX.length);
  // <custom> is unsupported — not in [b,i,u,s,code,pre,a]. So no </custom> should be added.
  assert.ok(!body.includes('</custom>'), 'unsupported tag must not be auto-closed');
});

test('truncate: stack-based — balanced <b> not re-closed, only open <i>', () => {
  // Balanced <b>x</b> followed by an unclosed <i> + lots of content.
  const html = '<b>x</b><i>' + 'a'.repeat(5000);
  const result = truncate(html);
  assert.ok(result.endsWith(SUFFIX));
  const body = result.slice(0, result.length - SUFFIX.length);
  // Only </i> auto-added; no extra </b>.
  assert.ok(body.endsWith('</i>'), `expected </i> auto-close, got ...${body.slice(-20)}`);
  // Count: only the original </b> appears once.
  const closeBCount = (body.match(/<\/b>/g) || []).length;
  assert.equal(closeBCount, 1, 'only the original </b> should appear');
});

test('truncate: closing tag without matching open — does not crash', () => {
  // Defensive: stray </b> should not throw.
  const html = '</b>' + 'a'.repeat(5000);
  assert.doesNotThrow(() => truncate(html));
  const result = truncate(html);
  assert.ok(result.endsWith(SUFFIX));
});

test('truncate: short HTML stays unchanged', () => {
  const html = '<b>hello</b>';
  assert.equal(truncate(html), html);
});
