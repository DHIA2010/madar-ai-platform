import type {
  AccessToken,
  AuthorizeConnectorRequestDto,
  Connection,
  RefreshToken,
} from "@/application/contracts/integration.contracts"
import { ValidationError } from "@/infrastructure/data/errors"

import { SallaGateway } from "./salla.gateway"

export class SallaAuthentication {
  constructor(private readonly gateway: SallaGateway) {}

  async authorize(
    connection: Connection,
    input: AuthorizeConnectorRequestDto
  ): Promise<{ accessToken: AccessToken; refreshToken: RefreshToken }> {
    if (!input.authorizationCode) {
      throw new ValidationError({ message: "Salla OAuth authorizationCode is required." })
    }

    const tokenResponse = await this.gateway.exchangeAuthorizationCode(
      connection.connectionId,
      input.authorizationCode
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
