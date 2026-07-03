import type {
  Ad,
  AdGroup,
  AdGroupMetric,
  AdMetric,
  Campaign,
  CampaignMetric,
  ConversionAction,
  CustomerAccount,
  DeviceMetric,
  GeoMetric,
  Keyword,
  KeywordMetric,
  SearchTerm,
} from "./models"

function asString(value: unknown, fallback = "") {
  if (typeof value === "string") {
    return value
  }

  if (typeof value === "number") {
    return String(value)
  }

  return fallback
}

function asNumber(value: unknown) {
  if (typeof value === "number") {
    return value
  }

  if (typeof value === "string") {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }

  return 0
}

function rowValue(row: Record<string, unknown>, path: string) {
  return path.split(".").reduce<unknown>((cursor, segment) => {
    if (!cursor || typeof cursor !== "object") {
      return undefined
    }

    return (cursor as Record<string, unknown>)[segment]
  }, row)
}

export class GoogleAdsCustomerService {
  constructor(private readonly client: { queryAllRows(input: { connectionId: string; customerId: string; query: string }): Promise<Record<string, unknown>[]> }) {}

  async listCustomerAccounts(input: { connectionId: string; customerId: string }): Promise<CustomerAccount[]> {
    const rows = await this.client.queryAllRows({
      connectionId: input.connectionId,
      customerId: input.customerId,
      query: `
        SELECT
          customer_client.id,
          customer_client.descriptive_name,
          customer_client.currency_code,
          customer_client.time_zone,
          customer_client.manager,
          customer_client.level,
          customer_client.manager_customer
        FROM customer_client
      `,
    })

    return rows.map((row) => ({
      id: asString(rowValue(row, "customerClient.id")),
      name: asString(rowValue(row, "customerClient.descriptiveName"), "Unknown Customer"),
      currencyCode: asString(rowValue(row, "customerClient.currencyCode"), "") || null,
      timeZone: asString(rowValue(row, "customerClient.timeZone"), "") || null,
      manager: Boolean(rowValue(row, "customerClient.manager")),
      level: asNumber(rowValue(row, "customerClient.level")),
      parentCustomerId: asString(rowValue(row, "customerClient.managerCustomer"), "") || null,
    }))
  }
}

export class GoogleAdsCampaignService {
  constructor(private readonly client: { queryAllRows(input: { connectionId: string; customerId: string; query: string }): Promise<Record<string, unknown>[]> }) {}

  async listCampaigns(input: { connectionId: string; customerId: string }): Promise<Campaign[]> {
    const rows = await this.client.queryAllRows({
      connectionId: input.connectionId,
      customerId: input.customerId,
      query: `
        SELECT
          campaign.id,
          campaign.name,
          campaign.status,
          campaign_budget.amount_micros,
          campaign.bidding_strategy_type
        FROM campaign
      `,
    })

    return rows.map((row) => ({
      id: asString(rowValue(row, "campaign.id")),
      customerId: input.customerId,
      name: asString(rowValue(row, "campaign.name"), "Unnamed Campaign"),
      status: asString(rowValue(row, "campaign.status"), "UNKNOWN"),
      budgetMicros: asNumber(rowValue(row, "campaignBudget.amountMicros")) || null,
      biddingStrategyType: asString(rowValue(row, "campaign.biddingStrategyType"), "") || null,
    }))
  }

  async listCampaignMetrics(input: { connectionId: string; customerId: string; startDate: string; endDate: string }): Promise<CampaignMetric[]> {
    const rows = await this.client.queryAllRows({
      connectionId: input.connectionId,
      customerId: input.customerId,
      query: `
        SELECT
          campaign.id,
          segments.date,
          metrics.cost_micros,
          metrics.clicks,
          metrics.impressions,
          metrics.ctr,
          metrics.average_cpc,
          metrics.average_cpm,
          metrics.conversions,
          metrics.conversions_value
        FROM campaign
        WHERE segments.date BETWEEN '${input.startDate}' AND '${input.endDate}'
      `,
    })

    return rows.map((row) => {
      const costMicros = asNumber(rowValue(row, "metrics.costMicros"))
      const conversionValue = asNumber(rowValue(row, "metrics.conversionsValue"))
      return {
        campaignId: asString(rowValue(row, "campaign.id")),
        customerId: input.customerId,
        date: asString(rowValue(row, "segments.date"), input.startDate),
        costMicros,
        clicks: asNumber(rowValue(row, "metrics.clicks")),
        impressions: asNumber(rowValue(row, "metrics.impressions")),
        ctr: asNumber(rowValue(row, "metrics.ctr")),
        cpcMicros: asNumber(rowValue(row, "metrics.averageCpc")),
        cpmMicros: asNumber(rowValue(row, "metrics.averageCpm")),
        conversions: asNumber(rowValue(row, "metrics.conversions")),
        conversionValue,
        roas: costMicros > 0 ? conversionValue / (costMicros / 1_000_000) : 0,
      }
    })
  }
}

export class GoogleAdsAdGroupService {
  constructor(private readonly client: { queryAllRows(input: { connectionId: string; customerId: string; query: string }): Promise<Record<string, unknown>[]> }) {}

  async listAdGroups(input: { connectionId: string; customerId: string }): Promise<AdGroup[]> {
    const rows = await this.client.queryAllRows({
      connectionId: input.connectionId,
      customerId: input.customerId,
      query: "SELECT ad_group.id, ad_group.name, ad_group.status, campaign.id FROM ad_group",
    })

    return rows.map((row) => ({
      id: asString(rowValue(row, "adGroup.id")),
      campaignId: asString(rowValue(row, "campaign.id")),
      customerId: input.customerId,
      name: asString(rowValue(row, "adGroup.name"), "Unnamed Ad Group"),
      status: asString(rowValue(row, "adGroup.status"), "UNKNOWN"),
    }))
  }

  async listAdGroupMetrics(input: { connectionId: string; customerId: string; startDate: string; endDate: string }): Promise<AdGroupMetric[]> {
    const rows = await this.client.queryAllRows({
      connectionId: input.connectionId,
      customerId: input.customerId,
      query: `
        SELECT ad_group.id, campaign.id, segments.date, metrics.cost_micros, metrics.clicks, metrics.impressions, metrics.conversions
        FROM ad_group
        WHERE segments.date BETWEEN '${input.startDate}' AND '${input.endDate}'
      `,
    })

    return rows.map((row) => ({
      adGroupId: asString(rowValue(row, "adGroup.id")),
      campaignId: asString(rowValue(row, "campaign.id")),
      customerId: input.customerId,
      date: asString(rowValue(row, "segments.date"), input.startDate),
      costMicros: asNumber(rowValue(row, "metrics.costMicros")),
      clicks: asNumber(rowValue(row, "metrics.clicks")),
      impressions: asNumber(rowValue(row, "metrics.impressions")),
      conversions: asNumber(rowValue(row, "metrics.conversions")),
    }))
  }
}

export class GoogleAdsAdService {
  constructor(private readonly client: { queryAllRows(input: { connectionId: string; customerId: string; query: string }): Promise<Record<string, unknown>[]> }) {}

  async listAds(input: { connectionId: string; customerId: string }): Promise<Ad[]> {
    const rows = await this.client.queryAllRows({
      connectionId: input.connectionId,
      customerId: input.customerId,
      query: "SELECT ad_group_ad.ad.id, ad_group.id, campaign.id, ad_group_ad.status, ad_group_ad.ad.type, ad_group_ad.ad.responsive_search_ad.headlines FROM ad_group_ad",
    })

    return rows.map((row) => {
      const headline = rowValue(row, "adGroupAd.ad.responsiveSearchAd.headlines")
      return {
        id: asString(rowValue(row, "adGroupAd.ad.id")),
        adGroupId: asString(rowValue(row, "adGroup.id")),
        campaignId: asString(rowValue(row, "campaign.id")),
        customerId: input.customerId,
        status: asString(rowValue(row, "adGroupAd.status"), "UNKNOWN"),
        type: asString(rowValue(row, "adGroupAd.ad.type"), "UNKNOWN"),
        headline: Array.isArray(headline) ? asString(headline[0]) : null,
      }
    })
  }

  async listAdMetrics(input: { connectionId: string; customerId: string; startDate: string; endDate: string }): Promise<AdMetric[]> {
    const rows = await this.client.queryAllRows({
      connectionId: input.connectionId,
      customerId: input.customerId,
      query: `
        SELECT ad_group_ad.ad.id, ad_group.id, campaign.id, segments.date, metrics.cost_micros, metrics.clicks, metrics.impressions, metrics.conversions
        FROM ad_group_ad
        WHERE segments.date BETWEEN '${input.startDate}' AND '${input.endDate}'
      `,
    })

    return rows.map((row) => ({
      adId: asString(rowValue(row, "adGroupAd.ad.id")),
      adGroupId: asString(rowValue(row, "adGroup.id")),
      campaignId: asString(rowValue(row, "campaign.id")),
      customerId: input.customerId,
      date: asString(rowValue(row, "segments.date"), input.startDate),
      costMicros: asNumber(rowValue(row, "metrics.costMicros")),
      clicks: asNumber(rowValue(row, "metrics.clicks")),
      impressions: asNumber(rowValue(row, "metrics.impressions")),
      conversions: asNumber(rowValue(row, "metrics.conversions")),
    }))
  }
}

export class GoogleAdsKeywordService {
  constructor(private readonly client: { queryAllRows(input: { connectionId: string; customerId: string; query: string }): Promise<Record<string, unknown>[]> }) {}

  async listKeywords(input: { connectionId: string; customerId: string }): Promise<Keyword[]> {
    const rows = await this.client.queryAllRows({
      connectionId: input.connectionId,
      customerId: input.customerId,
      query: "SELECT ad_group_criterion.criterion_id, ad_group.id, campaign.id, ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, ad_group_criterion.status FROM keyword_view",
    })

    return rows.map((row) => ({
      id: asString(rowValue(row, "adGroupCriterion.criterionId")),
      adGroupId: asString(rowValue(row, "adGroup.id")),
      campaignId: asString(rowValue(row, "campaign.id")),
      customerId: input.customerId,
      text: asString(rowValue(row, "adGroupCriterion.keyword.text"), ""),
      matchType: asString(rowValue(row, "adGroupCriterion.keyword.matchType"), "UNSPECIFIED"),
      status: asString(rowValue(row, "adGroupCriterion.status"), "UNKNOWN"),
    }))
  }

  async listKeywordMetrics(input: { connectionId: string; customerId: string; startDate: string; endDate: string }): Promise<KeywordMetric[]> {
    const rows = await this.client.queryAllRows({
      connectionId: input.connectionId,
      customerId: input.customerId,
      query: `
        SELECT ad_group_criterion.criterion_id, segments.date, metrics.cost_micros, metrics.clicks, metrics.impressions, metrics.conversions
        FROM keyword_view
        WHERE segments.date BETWEEN '${input.startDate}' AND '${input.endDate}'
      `,
    })

    return rows.map((row) => ({
      keywordId: asString(rowValue(row, "adGroupCriterion.criterionId")),
      customerId: input.customerId,
      date: asString(rowValue(row, "segments.date"), input.startDate),
      costMicros: asNumber(rowValue(row, "metrics.costMicros")),
      clicks: asNumber(rowValue(row, "metrics.clicks")),
      impressions: asNumber(rowValue(row, "metrics.impressions")),
      conversions: asNumber(rowValue(row, "metrics.conversions")),
    }))
  }
}

export class GoogleAdsInsightsService {
  constructor(private readonly client: { queryAllRows(input: { connectionId: string; customerId: string; query: string }): Promise<Record<string, unknown>[]> }) {}

  async listSearchTerms(input: { connectionId: string; customerId: string; startDate: string; endDate: string }): Promise<SearchTerm[]> {
    const rows = await this.client.queryAllRows({
      connectionId: input.connectionId,
      customerId: input.customerId,
      query: `
        SELECT search_term_view.search_term, ad_group_criterion.criterion_id, segments.date, metrics.clicks, metrics.impressions, metrics.conversions, metrics.cost_micros
        FROM search_term_view
        WHERE segments.date BETWEEN '${input.startDate}' AND '${input.endDate}'
      `,
    })

    return rows.map((row, index) => ({
      id: `${asString(rowValue(row, "searchTermView.searchTerm"), "term")}:${asString(rowValue(row, "segments.date"), input.startDate)}:${index}`,
      keywordId: asString(rowValue(row, "adGroupCriterion.criterionId"), "") || null,
      customerId: input.customerId,
      term: asString(rowValue(row, "searchTermView.searchTerm"), ""),
      date: asString(rowValue(row, "segments.date"), input.startDate),
      clicks: asNumber(rowValue(row, "metrics.clicks")),
      impressions: asNumber(rowValue(row, "metrics.impressions")),
      conversions: asNumber(rowValue(row, "metrics.conversions")),
      costMicros: asNumber(rowValue(row, "metrics.costMicros")),
    }))
  }

  async listGeoMetrics(input: { connectionId: string; customerId: string; startDate: string; endDate: string }): Promise<GeoMetric[]> {
    const rows = await this.client.queryAllRows({
      connectionId: input.connectionId,
      customerId: input.customerId,
      query: `
        SELECT geographic_view.location_type, geographic_view.country_criterion_id, segments.date, metrics.clicks, metrics.impressions, metrics.conversions, metrics.cost_micros
        FROM geographic_view
        WHERE segments.date BETWEEN '${input.startDate}' AND '${input.endDate}'
      `,
    })

    return rows.map((row, index) => ({
      id: `${asString(rowValue(row, "geographicView.countryCriterionId"), "geo")}:${asString(rowValue(row, "segments.date"), input.startDate)}:${index}`,
      customerId: input.customerId,
      locationName: asString(rowValue(row, "geographicView.locationType"), "UNKNOWN"),
      date: asString(rowValue(row, "segments.date"), input.startDate),
      clicks: asNumber(rowValue(row, "metrics.clicks")),
      impressions: asNumber(rowValue(row, "metrics.impressions")),
      conversions: asNumber(rowValue(row, "metrics.conversions")),
      costMicros: asNumber(rowValue(row, "metrics.costMicros")),
    }))
  }

  async listDeviceMetrics(input: { connectionId: string; customerId: string; startDate: string; endDate: string }): Promise<DeviceMetric[]> {
    const rows = await this.client.queryAllRows({
      connectionId: input.connectionId,
      customerId: input.customerId,
      query: `
        SELECT segments.device, segments.date, metrics.clicks, metrics.impressions, metrics.conversions, metrics.cost_micros
        FROM campaign
        WHERE segments.date BETWEEN '${input.startDate}' AND '${input.endDate}'
      `,
    })

    return rows.map((row, index) => {
      const rawDevice = asString(rowValue(row, "segments.device"), "UNKNOWN").toLowerCase()
      const device = rawDevice.includes("mobile")
        ? "mobile"
        : rawDevice.includes("tablet")
          ? "tablet"
          : rawDevice.includes("desktop")
            ? "desktop"
            : "unknown"

      return {
        id: `${device}:${asString(rowValue(row, "segments.date"), input.startDate)}:${index}`,
        customerId: input.customerId,
        device,
        date: asString(rowValue(row, "segments.date"), input.startDate),
        clicks: asNumber(rowValue(row, "metrics.clicks")),
        impressions: asNumber(rowValue(row, "metrics.impressions")),
        conversions: asNumber(rowValue(row, "metrics.conversions")),
        costMicros: asNumber(rowValue(row, "metrics.costMicros")),
      }
    })
  }

  async listConversionActions(input: { connectionId: string; customerId: string }): Promise<ConversionAction[]> {
    const rows = await this.client.queryAllRows({
      connectionId: input.connectionId,
      customerId: input.customerId,
      query: "SELECT conversion_action.id, conversion_action.name, conversion_action.category, conversion_action.status, conversion_action.type FROM conversion_action",
    })

    return rows.map((row) => ({
      id: asString(rowValue(row, "conversionAction.id")),
      customerId: input.customerId,
      name: asString(rowValue(row, "conversionAction.name"), ""),
      category: asString(rowValue(row, "conversionAction.category"), "UNKNOWN"),
      status: asString(rowValue(row, "conversionAction.status"), "UNKNOWN"),
      type: asString(rowValue(row, "conversionAction.type"), "UNKNOWN"),
    }))
  }
}
