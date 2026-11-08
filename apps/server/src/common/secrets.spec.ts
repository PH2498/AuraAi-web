import { describe, expect, it } from 'vitest';
import { decryptSecret, encryptSecret, hashPassword, keyHint, verifyPassword } from './secrets';

const key = 'replace-with-32-byte-key-placeholder';

describe('secrets', () => {
  it('stores a password so the original cannot be read back', async () => {
    const stored = await hashPassword('correct-horse');
    expect(stored).not.toContain('correct-horse');
    expect(await verifyPassword('correct-horse', stored)).toBe(true);
    expect(await verifyPassword('wrong-horse', stored)).toBe(false);
  });

  it('round-trips a provider secret and only exposes the last four characters', () => {
    const secret = 'sk-test-secret-value';
    const stored = encryptSecret(secret, key);
    expect(stored.startsWith('v1$')).toBe(true);
    expect(stored).not.toContain(secret);
    expect(decryptSecret(stored, key)).toBe(secret);
    expect(keyHint(secret)).toBe('alue');
  });
});
