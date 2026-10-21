import { SyncController } from "../routes/sync/sync.controller";
import { MobileCommandService } from "../services/sync/mobile-command.service";
import { SyncService } from "../services/sync/sync.service";
import {
  buildInstallationsRepository,
  buildMobileOperationRepository,
  buildSyncRepository,
} from "./repositories.dependencies";

export const buildSyncController = (): SyncController =>
  new SyncController(
    new SyncService(buildSyncRepository()),
    new MobileCommandService(buildMobileOperationRepository(), buildInstallationsRepository()),
    buildInstallationsRepository(),
  );
