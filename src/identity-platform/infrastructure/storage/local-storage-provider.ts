import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"

import type { StorageProvider } from "../../application/ports"
import type { IdentityPlatformConfig } from "../../configuration"

export class LocalStorageProvider implements StorageProvider {
  constructor(private readonly config: IdentityPlatformConfig) {}

  private resolve(key: string) {
    return join(this.config.storagePath, key)
  }

  async putObject(input: { key: string; body: string | Buffer }) {
    const target = this.resolve(input.key)
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, input.body)
  }

  async getObject(key: string) {
    try {
      return await readFile(this.resolve(key))
    } catch {
      return null
    }
  }

  async deleteObject(key: string) {
    await rm(this.resolve(key), { force: true })
  }
}
