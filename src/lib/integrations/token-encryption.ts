import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGO = "aes-256-gcm";

/**
 * Separate from EIN_ENCRYPTION_KEY on purpose — calendar OAuth tokens are
 * a different sensitivity class from a client's EIN, with their own
 * rotation needs.
 */
function getKey(): Buffer {
  const key = process.env.CALENDAR_TOKEN_ENCRYPTION_KEY;
  if (!key) {
    throw new Error(
      "CALENDAR_TOKEN_ENCRYPTION_KEY missing — generate one with " +
        "`openssl rand -base64 32` and set it before connecting any calendar.",
    );
  }
  const buf = Buffer.from(key, "base64");
  if (buf.length !== 32) {
    throw new Error(
      "CALENDAR_TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key",
    );
  }
  return buf;
}

/** iv:authTag:ciphertext, each base64, colon-joined so it stores as one text value. */
export function encryptToken(token: string): string {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString("base64"), authTag.toString("base64"), ciphertext.toString("base64")].join(
    ":",
  );
}

export function decryptToken(encrypted: string): string {
  const key = getKey();
  const [ivB64, tagB64, ciphertextB64] = encrypted.split(":");
  if (!ivB64 || !tagB64 || !ciphertextB64) {
    throw new Error("Malformed encrypted token value");
  }
  const decipher = createDecipheriv(ALGO, key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextB64, "base64")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}
