import { describe, expect, it, vi } from "vitest"

const sendMock = vi.fn().mockResolvedValue({})

vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: class {
    send = sendMock
  },
  PutObjectCommand: class {
    constructor(public input: unknown) {}
  },
}))

import { loadIdentityPlatformConfig } from "../configuration"
import { S3ObjectStorageGateway } from "../infrastructure/object-storage/s3-object-storage-gateway"

describe("S3ObjectStorageGateway", () => {
  it("builds a virtual-hosted-style URL for real AWS S3 (no custom endpoint)", async () => {
    const config = loadIdentityPlatformConfig({
      jwtSecret: "test-secret-test-secret",
      tokenHashSecret: "test-token-secret-secret",
      postgresUrl: "postgresql://unused",
      redisUrl: "redis://unused",
      storagePath: ".tmp-identity-tests",
      emailFrom: "identity@test.local",
      objectStorageBucket: "madar-stage-avatars",
      objectStorageRegion: "eu-central-1",
      objectStorageEndpoint: undefined,
      objectStoragePublicEndpoint: undefined,
    })
    const gateway = new S3ObjectStorageGateway(config)

    const url = await gateway.uploadPublicObject({
      key: "avatars/user-1/photo.png",
      body: Buffer.from("fake"),
      contentType: "image/png",
    })

    expect(url).toBe(
      "https://madar-stage-avatars.s3.eu-central-1.amazonaws.com/avatars/user-1/photo.png"
    )
  })

  it("builds a path-style URL with the bucket appended when a custom endpoint (MinIO) is set", async () => {
    const config = loadIdentityPlatformConfig({
      jwtSecret: "test-secret-test-secret",
      tokenHashSecret: "test-token-secret-secret",
      postgresUrl: "postgresql://unused",
      redisUrl: "redis://unused",
      storagePath: ".tmp-identity-tests",
      emailFrom: "identity@test.local",
      objectStorageBucket: "madar-local",
      objectStorageEndpoint: "http://minio:9000",
      objectStoragePublicEndpoint: "http://localhost:9000",
    })
    const gateway = new S3ObjectStorageGateway(config)

    const url = await gateway.uploadPublicObject({
      key: "avatars/user-1/photo.png",
      body: Buffer.from("fake"),
      contentType: "image/png",
    })

    expect(url).toBe("http://localhost:9000/madar-local/avatars/user-1/photo.png")
  })
})
