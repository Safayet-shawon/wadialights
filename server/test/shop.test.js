import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalisePhone, newOrderCode, priceOrder } from '../lib/shop.js';

test('normalisePhone: Bangladeshi formats collapse to 01XXXXXXXXX', () => {
  assert.equal(normalisePhone('+880 1701-777913'), '01701777913');
  assert.equal(normalisePhone('01701777913'), '01701777913');
  assert.equal(normalisePhone('abc'), null);
});

test('newOrderCode: WD- plus six characters, unique', () => {
  const a = newOrderCode(), b = newOrderCode();
  assert.match(a, /^WD-[A-Z0-9]{6}$/); assert.notEqual(a, b);
});

test('priceOrder: server prices, stock check, unpriced items', () => {
  const cat = new Map([['a', { slug: 'a', name: 'A', price_bdt: 1000, stock: 2 }], ['b', { slug: 'b', name: 'B', price_bdt: null, stock: null }]]);
  const r = priceOrder([{ slug: 'a', qty: 2 }], cat);
  assert.equal(r.subtotal, 2000);
  assert.throws(() => priceOrder([{ slug: 'a', qty: 3 }], cat));
  assert.throws(() => priceOrder([{ slug: 'zzz', qty: 1 }], cat));
  assert.equal(priceOrder([{ slug: 'b', qty: 1 }], cat).subtotal, null);
});
