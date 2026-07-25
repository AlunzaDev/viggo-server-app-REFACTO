import { InstallationsMongoDatasource } from "../../infrastructure/datasources/installations/installations.datasource.mongo";
import { InstallationsRepositoryImpl } from "../../infrastructure/repositories/installations/installations.repository.impl";
import { InstallationsController } from "../routes/installations/installations.controller";
import { InstallationsService } from "../services/installations/installations.service";

export const buildInstallationsController = (): InstallationsController => {
  const repository = new InstallationsRepositoryImpl(
    new InstallationsMongoDatasource(),
  );
  return new InstallationsController(new InstallationsService(repository));
};
