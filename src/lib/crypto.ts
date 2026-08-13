import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Symmetric encryption for secrets we must store and later reuse.
 *
 * A Gmail refresh token is a long-lived key to someone's entire inbox. Storing
 * it in plain text means a single database dump hands over every connected
 * account, so it is encrypted at rest with AES-256-GCM.
 *
 * GCM rather than CBC because it authenticates as well as encrypts: tampering
 * with the stored value makes decryption fail loudly instead of silently
 * yielding garbage.
 */

function key(): Buffer {
  const secret = process.env.TOKEN_ENCRYPTION_KEY ?? process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error(
      "TOKEN_ENCRYPTION_KEY (or SESSION_SECRET) must be set to store connected accounts."
    );
  }
  // Hashing gives a 32-byte key from a secret of any length.
  return createHash("sha256").update(secret).digest();
}

/** Returns `iv:authTag:ciphertext`, all hex. */
export function encrypt(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);

  return [iv.toString("hex"), cipher.getAuthTag().toString("hex"), encrypted.toString("hex")].join(":");
}

export function decrypt(payload: string): string {
  const [ivHex, tagHex, dataHex] = payload.split(":");
  if (!ivHex || !tagHex || !dataHex) throw new Error("Malformed encrypted value.");

  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));

  return Buffer.concat([
    decipher.update(Buffer.from(dataHex, "hex")),
    decipher.final(),
  ]).toString("utf8");
}
