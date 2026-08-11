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
    const region = config.objectStorageRegion ?? "us-east-1"
    // A custom endpoint (MinIO, or any S3-compatible host) always needs the bucket appended
    // to build a path-style URL. Real AWS S3 has no custom endpoint, so build the standard
    // virtual-hosted-style URL instead — it already embeds the bucket name in the host.
    this.publicBaseUrl = config.objectStorageEndpoint
      ? `${(config.objectStoragePublicEndpoint ?? config.objectStorageEndpoint).replace(/\/$/, "")}/${this.bucket}`
      : `https://${this.bucket}.s3.${region}.amazonaws.com`
    this.client = new S3Client({
      endpoint: config.objectStorageEndpoint,
      region,
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
