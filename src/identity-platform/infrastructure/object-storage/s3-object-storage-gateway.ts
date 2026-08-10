import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3"

import type { ObjectStorageGateway } from "../../application/ports"
import type { IdentityPlatformConfig } from "../../configuration"

export class S3ObjectStorageGateway implements ObjectStorageGateway {
  private readonly client: S3Client
  private readonly bucket: string
  private readonly publicBaseUrl: string

  constructor(config: IdentityPlatformConfig) {
    if (!config.objectStorageBucket) {
      throw new Error("S3ObjectStorageGateway requires objectStorageBucket to be configured.")
    }

    this.bucket = config.objectStorageBucket
    this.publicBaseUrl = `${(config.objectStoragePublicEndpoint ?? "").replace(/\/$/, "")}/${this.bucket}`
    this.client = new S3Client({
      endpoint: config.objectStorageEndpoint,
      region: config.objectStorageRegion ?? "us-east-1",
      forcePathStyle: Boolean(config.objectStorageEndpoint),
      credentials:
        config.objectStorageAccessKeyId && config.objectStorageSecretAccessKey
          ? {
              accessKeyId: config.objectStorageAccessKeyId,
              secretAccessKey: config.objectStorageSecretAccessKey,
            }
          : undefined,
    })
  }

  // Relies on a bucket policy granting public GetObject on this key's prefix (e.g. "avatars/*")
  // rather than a per-object ACL: modern S3 buckets have ACLs disabled by default and reject them.
  async uploadPublicObject(input: { key: string; body: Buffer; contentType: string }) {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: input.key,
        Body: input.body,
        ContentType: input.contentType,
      })
    )
    return `${this.publicBaseUrl}/${input.key}`
  }
}
