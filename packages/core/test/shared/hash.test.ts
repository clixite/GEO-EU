import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalJson, fingerprint, newId, sha256 } from '../../src/shared/hash.ts';

test('canonicalJson sorts keys recursively and drops undefined', () => {
  const a = canonicalJson({ b: 1, a: { d: undefined, c: [3, { z: 1, y: 2 }] } });
  const b = canonicalJson({ a: { c: [3, { y: 2, z: 1 }] }, b: 1 });
  assert.equal(a, b);
  assert.equal(a, '{"a":{"c":[3,{"y":2,"z":1}]},"b":1}');
});

test('fingerprint is stable for equivalent objects and differs for different ones', () => {
  assert.equal(fingerprint({ x: 1, y: 2 }), fingerprint({ y: 2, x: 1 }));
  assert.notEqual(fingerprint({ x: 1 }), fingerprint({ x: 2 }));
  assert.equal(sha256('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});

test('newId yields unique UUIDs', () => {
  const ids = new Set(Array.from({ length: 500 }, () => newId()));
  assert.equal(ids.size, 500);
});
