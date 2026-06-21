import type {
  AccessToken,
  AuthorizeConnectorRequestDto,
  Connection,
  RefreshToken,
} from "@/application/contracts/integration.contracts"
import { ValidationError } from "@/infrastructure/data/errors"

import { ZidGateway } from "./zid.gateway"

export class ZidAuthentication {
  constructor(private readonly gateway: ZidGateway) {}

  async authorize(
    connection: Connection,
    input: AuthorizeConnectorRequestDto
  ): Promise<{ accessToken: AccessToken; refreshToken: RefreshToken }> {
    if (!input.authorizationCode) {
      throw new ValidationError({ message: "Zid OAuth authorizationCode is required." })
    }

    return this.handleCallback(connection.connectionId, input.authorizationCode)
  }

  async handleCallback(
    connectionId: string,
    authorizationCode: string
  ): Promise<{ accessToken: AccessToken; refreshToken: RefreshToken }> {
    const tokenResponse = await this.gateway.exchangeAuthorizationCode(
      connectionId,
      authorizationCode
    )

    return {
      accessToken: {
        value: tokenResponse.access_token,
        expiresAt: new Date(Date.now() + tokenResponse.expires_in * 1000).toISOString(),
      },
      refreshToken: {
        value: tokenResponse.refresh_token,
      },
    }
  }

  async refresh(
    connection: Connection
  ): Promise<{ accessToken: AccessToken; refreshToken: RefreshToken }> {
    const tokenResponse = await this.gateway.refreshAccessToken(
      connection.connectionId,
      connection.refreshToken
    )

    return {
      accessToken: {
        value: tokenResponse.access_token,
        expiresAt: new Date(Date.now() + tokenResponse.expires_in * 1000).toISOString(),
      },
      refreshToken: {
        value: tokenResponse.refresh_token,
      },
    }
  }

  async validateToken(connection: Connection): Promise<boolean> {
    return this.gateway.validateToken(connection.accessToken)
  }

  async disconnect(): Promise<void> {
    return Promise.resolve()
  }
}
