import { test } from 'node:test';
import assert from 'node:assert';
import { encrypt, decrypt, sha256, md5 } from '../lib/cryptoBox.js';
import { createHash, randomBytes } from 'crypto';

test('encrypt/decrypt roundtrip', () => {
  const plaintext = 'Hello, AegisMemory!';
  const key = randomBytes(32); // 256-bit key
  
  const encrypted = encrypt(plaintext, key);
  const decrypted = decrypt(encrypted, key);
  
  assert.strictEqual(decrypted, plaintext, 'Decrypted text should match original');
});

test('encrypt produces different ciphertext each time', () => {
  const plaintext = 'Same message';
  const key = randomBytes(32);
  
  const encrypted1 = encrypt(plaintext, key);
  const encrypted2 = encrypt(plaintext, key);
  
  assert.notStrictEqual(encrypted1, encrypted2, 'Different IV should produce different ciphertext');
});

test('decrypt fails with wrong key', () => {
  const plaintext = 'Secret message';
  const key1 = randomBytes(32);
  const key2 = randomBytes(32);
  
  const encrypted = encrypt(plaintext, key1);
  
  assert.throws(() => {
    decrypt(encrypted, key2);
  }, 'Decryption with wrong key should fail');
});

test('sha256 produces correct hash', () => {
  const data = 'test data';
  const expected = createHash('sha256').update(data, 'utf8').digest('hex');
  
  const result = sha256(data);
  
  assert.strictEqual(result, expected, 'SHA256 hash should match');
});

test('sha256 is deterministic', () => {
  const data = 'deterministic test';
  
  const hash1 = sha256(data);
  const hash2 = sha256(data);
  
  assert.strictEqual(hash1, hash2, 'Same input should produce same hash');
});

test('md5 produces correct hash', () => {
  const data = 'test data';
  const expected = createHash('md5').update(data, 'utf8').digest('hex');
  
  const result = md5(data);
  
  assert.strictEqual(result, expected, 'MD5 hash should match');
});
