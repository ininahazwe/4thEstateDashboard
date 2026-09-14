import crypto from 'crypto';
import { env } from '../config/env';

// Encrypts documents at rest (brief §5, "chiffrement au repos"). Uses a
// self-describing file format instead of a database flag: every encrypted
// file starts with an 8-byte magic marker, so decryption can tell an
// encrypted file apart from a legacy plaintext one (uploaded before
// DOCUMENT_ENCRYPTION_KEY was set, or while it's unset) with no schema
// change and no migration needed for this part of the feature.
const MAGIC = Buffer.from('MFWAENC1', 'utf8'); // 8 bytes
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // recommended nonce size for GCM
const AUTH_TAG_LENGTH = 16;

let cachedKey: Buffer | null | undefined;

function getKey(): Buffer | null {
  if (cachedKey !== undefined) return cachedKey;
  const raw = env.DOCUMENT_ENCRYPTION_KEY;
  if (!raw) {
    cachedKey = null;
    return null;
  }
  const key = Buffer.from(raw, 'hex');
  if (key.length !== 32) {
    throw new Error(
      'DOCUMENT_ENCRYPTION_KEY must be 64 hex characters (32 bytes) for AES-256-GCM -- generate one with `openssl rand -hex 32`.'
    );
  }
  cachedKey = key;
  return key;
}

export function isDocumentEncryptionConfigured(): boolean {
  return getKey() !== null;
}

// Returns the plaintext buffer untouched when no key is configured --
// uploads keep working, just unencrypted, exactly like before this feature
// existed. This is deliberate: enabling encryption is an opt-in deployment
// step (set DOCUMENT_ENCRYPTION_KEY), not something that should block
// uploads if it's missing.
export function encryptDocumentBuffer(plain: Buffer): Buffer {
  const key = getKey();
  if (!key) return plain;

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([MAGIC, iv, authTag, ciphertext]);
}

// Detects the magic marker to decide whether a file needs decrypting at
// all -- a legacy plaintext file (or any file read while encryption is
// off) is returned as-is.
export function decryptDocumentBuffer(fileBuffer: Buffer): Buffer {
  if (fileBuffer.length < MAGIC.length || !fileBuffer.subarray(0, MAGIC.length).equals(MAGIC)) {
    return fileBuffer;
  }

  const key = getKey();
  if (!key) {
    throw new Error(
      'This file was encrypted with DOCUMENT_ENCRYPTION_KEY, but that variable is not set in this environment -- cannot decrypt it.'
    );
  }

  let offset = MAGIC.length;
  const iv = fileBuffer.subarray(offset, offset + IV_LENGTH);
  offset += IV_LENGTH;
  const authTag = fileBuffer.subarray(offset, offset + AUTH_TAG_LENGTH);
  offset += AUTH_TAG_LENGTH;
  const ciphertext = fileBuffer.subarray(offset);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}
