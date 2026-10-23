import { HealthController } from "../routes/health/health.controller";
import { HeartbeatOverviewController } from "../routes/heartbeat/heartbeat-overview.controller";
import { ConnectionHistoryController } from "../routes/heartbeat/connection-history.controller";
import { OccupancyOverviewController } from "../routes/occupancy/occupancy-overview.controller";
import { OccupancyOverviewService } from "../services/occupancy/occupancy-overview.service";
import { ConnectionHistoryService } from "../services/heartbeat/connection-history.service";
import { HeartbeatOverviewService } from "../services/heartbeat/heartbeat-overview.service";
import { OperationalIncidentController } from "../routes/incidents/operational-incident.controller";
import { InstallationPresenceMonitor } from "../services/installations/installation-presence.monitor";
import {
  buildConnectionHistoryRepository,
  buildOccupancyOverviewRepository,
  buildHeartbeatOverviewRepository,
  buildInstallationsRepository,
  buildJobLockRepository,
  buildMobileOperationRepository,
  buildOperationalIncidentRepository,
} from "./repositories.dependencies";

export const buildHealthController = (): HealthController =>
  new HealthController(buildInstallationsRepository(), buildMobileOperationRepository());

export const buildOperationalIncidentController = (): OperationalIncidentController =>
  new OperationalIncidentController(buildOperationalIncidentRepository());

export const buildHeartbeatOverviewController = (): HeartbeatOverviewController =>
  new HeartbeatOverviewController(new HeartbeatOverviewService(buildHeartbeatOverviewRepository()));

export const buildInstallationPresenceMonitor = (): InstallationPresenceMonitor =>
  new InstallationPresenceMonitor(
    buildInstallationsRepository(),
    buildOperationalIncidentRepository(),
    buildJobLockRepository(),
    buildConnectionHistoryRepository(),
  );

export const buildConnectionHistoryController = (): ConnectionHistoryController =>
  new ConnectionHistoryController(new ConnectionHistoryService(buildConnectionHistoryRepository()));

export const buildOccupancyOverviewController = (): OccupancyOverviewController =>
  new OccupancyOverviewController(new OccupancyOverviewService(buildOccupancyOverviewRepository()));
