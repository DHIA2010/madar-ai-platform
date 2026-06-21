import type {
  CampaignDetailsDto,
  CampaignDetailsReadModel,
  CampaignDetailsViewModel,
  CampaignListReadModel,
  CampaignListResponseDto,
  CampaignListViewModel,
} from "../contracts"
import { createReadModel } from "../read-models"

export function mapCampaignListDtoToReadModel(
  payload: CampaignListResponseDto
): CampaignListReadModel {
  return createReadModel({
    id: `campaign-list:${payload.page}:${payload.pageSize}`,
    owner: "campaigns",
    sourceDomains: ["campaigns"],
    payload,
  })
}

export function mapCampaignListReadModelToViewModel(
  readModel: CampaignListReadModel
): CampaignListViewModel {
  return {
    id: readModel.id,
    freshness: readModel.freshness,
    payload: readModel.payload,
  }
}

export function mapCampaignDetailsDtoToReadModel(
  payload: CampaignDetailsDto
): CampaignDetailsReadModel {
  return createReadModel({
    id: `campaign-details:${payload.id}`,
    owner: "campaigns",
    sourceDomains: ["campaigns"],
    payload,
  })
}

export function mapCampaignDetailsReadModelToViewModel(
  readModel: CampaignDetailsReadModel
): CampaignDetailsViewModel {
  return {
    id: readModel.id,
    freshness: readModel.freshness,
    payload: readModel.payload,
  }
}
