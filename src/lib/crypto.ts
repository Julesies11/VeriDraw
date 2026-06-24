/**
 * Cryptographic utility functions.
 */

/**
 * Generates a cryptographically secure random alphanumeric code.
 * Modulo bias is avoided by rejecting values >= 252.
 */
export function generateSecureCode(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  const tempArray = new Uint8Array(1);
  while (result.length < length) {
    globalThis.crypto.getRandomValues(tempArray);
    const val = tempArray[0];
    if (val < 252) {
      result += chars.charAt(val % 36);
    }
  }
  return result;
}
