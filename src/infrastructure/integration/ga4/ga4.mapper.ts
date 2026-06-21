import type {
  CanonicalAcquisitionMetrics,
  CanonicalEcommerceMetrics,
  CanonicalEngagementMetrics,
  CanonicalEventMetrics,
  CanonicalTrafficMetrics,
  GA4AcquisitionMetricRowDto,
  GA4EcommerceMetricRowDto,
  GA4EngagementMetricRowDto,
  GA4EventMetricRowDto,
  GA4TrafficMetricRowDto,
} from "./ga4.dtos"

export class GA4Mapper {
  static mapTraffic(input: GA4TrafficMetricRowDto): CanonicalTrafficMetrics {
    return {
      date: input.date,
      users: input.users,
      newUsers: input.new_users,
      sessions: input.sessions,
      engagedSessions: input.engaged_sessions,
      bounceRate: input.bounce_rate,
    }
  }

  static mapAcquisition(input: GA4AcquisitionMetricRowDto): CanonicalAcquisitionMetrics {
    return {
      source: input.source,
      medium: input.medium,
      campaign: input.campaign,
      channelGroup: input.channel_group,
      users: input.users,
      sessions: input.sessions,
    }
  }

  static mapEngagement(input: GA4EngagementMetricRowDto): CanonicalEngagementMetrics {
    return {
      pagePath: input.page_path,
      pageViews: input.page_views,
      landingPage: input.landing_page,
      exitPage: input.exit_page,
      averageEngagementTimeSeconds: input.average_engagement_time_seconds,
    }
  }

  static mapEcommerce(input: GA4EcommerceMetricRowDto): CanonicalEcommerceMetrics {
    return {
      itemId: input.item_id,
      itemName: input.item_name,
      productViews: input.product_views,
      addToCart: input.add_to_cart,
      beginCheckout: input.begin_checkout,
      purchases: input.purchases,
      revenue: input.revenue,
      currency: input.currency,
    }
  }

  static mapEvent(input: GA4EventMetricRowDto): CanonicalEventMetrics {
    return {
      eventName: input.event_name,
      eventCount: input.event_count,
    }
  }
}
