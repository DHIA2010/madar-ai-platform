import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto"

import type { SecretCipher } from "../../application/ports"

export class AesSecretCipher implements SecretCipher {
  private readonly key: Buffer

  constructor(secret: string) {
    this.key = createHash("sha256").update(secret).digest()
  }

  encrypt(plainText: string): string {
    const iv = randomBytes(12)
    const cipher = createCipheriv("aes-256-gcm", this.key, iv)
    const ciphertext = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()])
    const authTag = cipher.getAuthTag()
    return [iv.toString("hex"), authTag.toString("hex"), ciphertext.toString("hex")].join(":")
  }

  decrypt(cipherText: string): string {
    const [ivHex, authTagHex, payloadHex] = cipherText.split(":")
    if (!ivHex || !authTagHex || !payloadHex) {
      throw new Error("Invalid encrypted payload.")
    }
    const decipher = createDecipheriv("aes-256-gcm", this.key, Buffer.from(ivHex, "hex"))
    decipher.setAuthTag(Buffer.from(authTagHex, "hex"))
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(payloadHex, "hex")),
      decipher.final(),
    ])
    return decrypted.toString("utf8")
  }
}
