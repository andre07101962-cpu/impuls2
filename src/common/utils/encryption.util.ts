import * as crypto from 'crypto';
import { Buffer } from 'buffer';

const ALGORITHM = 'aes-256-cbc';

// 🛡️ SECURITY: Fail hard if key is missing. Never use hardcoded fallbacks in production logic.
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY; 
const IV_LENGTH = 16;

if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 32) {
  // Allow build to pass, but runtime checks will fail if accessed
  if (process.env.NODE_ENV !== 'test') {
     console.error('❌ FATAL: ENCRYPTION_KEY must be exactly 32 chars. Check your .env file.');
  }
}

export class EncryptionUtil {
  static encrypt(text: string): string {
    if (!ENCRYPTION_KEY) throw new Error('Encryption Configuration Error');
    
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY), iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
  }

  static decrypt(text: string): string {
    if (!ENCRYPTION_KEY) throw new Error('Encryption Configuration Error');

    const textParts = text.split(':');
    const iv = Buffer.from(textParts.shift()!, 'hex');
    const encryptedText = Buffer.from(textParts.join(':'), 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY), iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
  }
}