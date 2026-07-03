export {
  createInMemoryIdentityDataStore as createInMemoryIdentityRepository,
  newId,
  nowIso,
} from "./infrastructure/storage/in-memory"
export type { InMemoryIdentityDataStore as IdentityRepository } from "./infrastructure/storage/in-memory"
