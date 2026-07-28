import type {
  ProviderRecordsQueryDto,
  ProviderSyncRequestDto,
} from "../integrations/provider-dtos"
import type {
  IntegrationRecordView,
  IntegrationSyncRunView,
} from "../integrations/provider-models"
import type { GoogleAdsEntityType } from "./models"

export interface GoogleAdsSyncRequest extends ProviderSyncRequestDto {}

export interface GoogleAdsSyncRunView extends IntegrationSyncRunView {}

export interface GoogleAdsRecordView extends IntegrationRecordView {
  entityType: GoogleAdsEntityType
}

export interface GoogleAdsRecordQuery extends ProviderRecordsQueryDto {
  entityType?: GoogleAdsEntityType
}
