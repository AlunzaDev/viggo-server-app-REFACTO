import { LocalProjectsController } from "../routes/local-projects/local-projects.controller";
import { LocalProjectsService } from "../services/local-projects/local-projects.service";
import { buildLocalProjectsRepository } from "./repositories.dependencies";

export const buildLocalProjectsController = (): LocalProjectsController =>
  new LocalProjectsController(new LocalProjectsService(buildLocalProjectsRepository()));
