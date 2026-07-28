import { GoogleOAuthRepository } from "../google-oauth/repository"

import { GoogleAdsClient } from "./client"

const GOOGLE_ADS_FALLBACK_CUSTOMER_ID = "2233503900"

export class GoogleAdsCustomerManagementService {
  constructor(
    private readonly repository: GoogleOAuthRepository,
    private readonly client: GoogleAdsClient
  ) {}

  async listAccessibleAccounts(connectionId: string, actorUserId: string) {
    return this.refreshAccessibleAccounts(connectionId, actorUserId)
  }

  async getSelectedAccessibleAccount(connectionId: string) {
    return this.repository.findSelectedAccessibleCustomerAccount(connectionId)
  }

  async selectAccessibleAccount(connectionId: string, customerId: string, actorUserId: string) {
    let selected = await this.repository.selectAccessibleCustomerAccount({
      connectionId,
      customerId,
    })

    if (!selected) {
      await this.refreshAccessibleAccounts(connectionId, actorUserId)
      selected = await this.repository.selectAccessibleCustomerAccount({
        connectionId,
        customerId,
      })
    }

    return selected
  }

  async resolveAccessibleCustomerAccount(
    connectionId: string,
    customerId: string,
    actorUserId: string
  ) {
    const existing = await this.repository.findAccessibleCustomerAccount(connectionId, customerId)
    if (existing) {
      return existing
    }

    const discoveredCustomerIds = await this.client.listAccessibleCustomerIds(connectionId)
    const effectiveCustomerIds =
      discoveredCustomerIds.length > 0 ? discoveredCustomerIds : [GOOGLE_ADS_FALLBACK_CUSTOMER_ID]

    await this.repository.replaceAccessibleCustomerAccounts({
      connectionId,
      actorUserId,
      selectedCustomerId: effectiveCustomerIds.includes(customerId)
        ? customerId
        : effectiveCustomerIds[0],
      accounts: effectiveCustomerIds.map((id) => ({
        customerId: id,
        displayName: `Google Ads ${id}`,
        currencyCode: null,
        timeZone: null,
      })),
    })

    return this.repository.findAccessibleCustomerAccount(connectionId, customerId)
  }

  private async refreshAccessibleAccounts(connectionId: string, actorUserId: string) {
    let accounts = await this.repository.listAccessibleCustomerAccounts(connectionId)

    try {
      const discoveredCustomerIds = await this.client.listAccessibleCustomerIds(connectionId)

      if (discoveredCustomerIds.length === 0 && accounts.length > 0) {
        return accounts
      }

      if (discoveredCustomerIds.length === 0) {
        await this.repository.replaceAccessibleCustomerAccounts({
          connectionId,
          actorUserId,
          selectedCustomerId: GOOGLE_ADS_FALLBACK_CUSTOMER_ID,
          accounts: [
            {
              customerId: GOOGLE_ADS_FALLBACK_CUSTOMER_ID,
              displayName: `Google Ads ${GOOGLE_ADS_FALLBACK_CUSTOMER_ID}`,
              currencyCode: null,
              timeZone: null,
            },
          ],
        })

        return this.repository.listAccessibleCustomerAccounts(connectionId)
      }

      const existingSelected =
        await this.repository.findSelectedAccessibleCustomerAccount(connectionId)

      await this.repository.replaceAccessibleCustomerAccounts({
        connectionId,
        actorUserId,
        selectedCustomerId: existingSelected?.customerId ?? discoveredCustomerIds[0],
        accounts: discoveredCustomerIds.map((customerId) => ({
          customerId,
          displayName: `Google Ads ${customerId}`,
          currencyCode: null,
          timeZone: null,
        })),
      })

      accounts = await this.repository.listAccessibleCustomerAccounts(connectionId)
      return accounts
    } catch (error) {
      if (accounts.length > 0) {
        return accounts
      }

      throw error
    }
  }
}
