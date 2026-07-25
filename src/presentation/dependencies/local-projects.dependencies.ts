import { LocalProjectsMongoDatasource } from "../../infrastructure/datasources/local-projects/local-projects.datasource.mongo";
import { LocalProjectsRepositoryImpl } from "../../infrastructure/repositories/local-projects/local-projects.repository.impl";
import { LocalProjectsController } from "../routes/local-projects/local-projects.controller";
import { LocalProjectsService } from "../services/local-projects/local-projects.service";

export const buildLocalProjectsController = (): LocalProjectsController => {
  const repository = new LocalProjectsRepositoryImpl(
    new LocalProjectsMongoDatasource(),
  );
  return new LocalProjectsController(new LocalProjectsService(repository));
};
