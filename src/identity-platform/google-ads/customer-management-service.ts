import { GoogleOAuthRepository } from "../google-oauth/repository"

import { GoogleAdsClient } from "./client"
import { GoogleAdsCustomerService } from "./services"

const GOOGLE_ADS_FALLBACK_CUSTOMER_ID = "2233503900"

// Real currency/time zone lookup, mirroring the same GAQL query GoogleAdsCustomerService already
// uses for account sync -- this fixes account discovery/selection previously hardcoding both to
// null (and, via replaceAccessibleCustomerAccounts' unconditional overwrite, silently reverting
// any real values a prior sync had already written). Never blocks discovery on a lookup failure.
async function lookupCurrencyAndTimeZone(
  customerService: GoogleAdsCustomerService,
  connectionId: string,
  customerId: string
): Promise<{ currencyCode: string | null; timeZone: string | null }> {
  try {
    const accounts = await customerService.listCustomerAccounts({ connectionId, customerId })
    const self = accounts.find((account) => account.id === customerId)
    return { currencyCode: self?.currencyCode ?? null, timeZone: self?.timeZone ?? null }
  } catch {
    return { currencyCode: null, timeZone: null }
  }
}

export class GoogleAdsCustomerManagementService {
  private readonly customerService: GoogleAdsCustomerService

  constructor(
    private readonly repository: GoogleOAuthRepository,
    private readonly client: GoogleAdsClient
  ) {
    this.customerService = new GoogleAdsCustomerService(this.client)
  }

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

    const accounts = await Promise.all(
      effectiveCustomerIds.map(async (id) => ({
        customerId: id,
        displayName: `Google Ads ${id}`,
        ...(await lookupCurrencyAndTimeZone(this.customerService, connectionId, id)),
      }))
    )

    await this.repository.replaceAccessibleCustomerAccounts({
      connectionId,
      actorUserId,
      selectedCustomerId: effectiveCustomerIds.includes(customerId)
        ? customerId
        : effectiveCustomerIds[0],
      accounts,
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
              ...(await lookupCurrencyAndTimeZone(
                this.customerService,
                connectionId,
                GOOGLE_ADS_FALLBACK_CUSTOMER_ID
              )),
            },
          ],
        })

        return this.repository.listAccessibleCustomerAccounts(connectionId)
      }

      const existingSelected =
        await this.repository.findSelectedAccessibleCustomerAccount(connectionId)

      const discoveredAccounts = await Promise.all(
        discoveredCustomerIds.map(async (customerId) => ({
          customerId,
          displayName: `Google Ads ${customerId}`,
          ...(await lookupCurrencyAndTimeZone(this.customerService, connectionId, customerId)),
        }))
      )

      await this.repository.replaceAccessibleCustomerAccounts({
        connectionId,
        actorUserId,
        selectedCustomerId: existingSelected?.customerId ?? discoveredCustomerIds[0],
        accounts: discoveredAccounts,
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
