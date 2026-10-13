import { HealthController } from "../routes/health/health.controller";
import { OperationalIncidentController } from "../routes/incidents/operational-incident.controller";
import {
  buildInstallationsRepository,
  buildMobileOperationRepository,
  buildOperationalIncidentRepository,
} from "./repositories.dependencies";

export const buildHealthController = (): HealthController =>
  new HealthController(buildInstallationsRepository(), buildMobileOperationRepository());

export const buildOperationalIncidentController = (): OperationalIncidentController =>
  new OperationalIncidentController(buildOperationalIncidentRepository());
