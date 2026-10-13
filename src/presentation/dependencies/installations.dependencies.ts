import { InstallationsController } from "../routes/installations/installations.controller";
import { InstallationsService } from "../services/installations/installations.service";
import { buildInstallationsRepository } from "./repositories.dependencies";

export const buildInstallationsController = (): InstallationsController => {
  const repository = buildInstallationsRepository();
  return new InstallationsController(new InstallationsService(repository), repository);
};
