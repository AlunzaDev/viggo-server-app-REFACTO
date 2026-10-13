import { SyncMongoDatasource } from "../../infrastructure/datasources/sync/sync.datasource.mongo";
import { SyncRepositoryImpl } from "../../infrastructure/repositories/sync/sync.repository.impl";
import { SyncController } from "../routes/sync/sync.controller";
import { SyncService } from "../services/sync/sync.service";
import {
  buildInstallationsRepository,
  buildMobileOperationRepository,
} from "./repositories.dependencies";

export const buildSyncController = (): SyncController => {
  const repository = new SyncRepositoryImpl(new SyncMongoDatasource());
  return new SyncController(
    new SyncService(repository),
    buildMobileOperationRepository(),
    buildInstallationsRepository(),
  );
};
