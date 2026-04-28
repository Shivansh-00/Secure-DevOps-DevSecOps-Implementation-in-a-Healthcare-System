const { encrypt, decrypt } = require('../src/utils/encryption');

process.env.PHI_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');

describe('PHI encryption (AES-256-GCM)', () => {
  test('round-trips PHI data', () => {
    const phi = 'SSN: 123-45-6789';
    const ct = encrypt(phi);
    expect(ct).not.toContain('123-45-6789');
    expect(decrypt(ct)).toBe(phi);
  });

  test('produces different ciphertexts for same input (random IV)', () => {
    expect(encrypt('hello')).not.toEqual(encrypt('hello'));
  });

  test('handles null', () => {
    expect(encrypt(null)).toBeNull();
    expect(decrypt(null)).toBeNull();
  });
});
