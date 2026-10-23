import { HealthController } from "../routes/health/health.controller";
import { HeartbeatOverviewController } from "../routes/heartbeat/heartbeat-overview.controller";
import { ConnectionHistoryController } from "../routes/heartbeat/connection-history.controller";
import { OccupancyOverviewController } from "../routes/occupancy/occupancy-overview.controller";
import { PushController } from "../routes/push/push.controller";
import { DataRetentionJob, retentionPlan } from "../services/system/data-retention.job";
import { PushNoticeService } from "../services/push/push-notice.service";
import { WebPushSender } from "../../infrastructure/push/web-push.sender";
import { envs } from "../../config";
import { OccupancyOverviewService } from "../services/occupancy/occupancy-overview.service";
import { ConnectionHistoryService } from "../services/heartbeat/connection-history.service";
import { HeartbeatOverviewService } from "../services/heartbeat/heartbeat-overview.service";
import { OperationalIncidentController } from "../routes/incidents/operational-incident.controller";
import { InstallationPresenceMonitor } from "../services/installations/installation-presence.monitor";
import {
  buildDataRetentionRepository,
  buildPushRepository,
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

// One instance: it remembers the last notice per parking to keep the cooldown.
let pushNoticeService: PushNoticeService | undefined;
export const buildPushNoticeService = (): PushNoticeService =>
  (pushNoticeService ??= new PushNoticeService(
    buildPushRepository(),
    new WebPushSender(envs.WEB_PUSH_PUBLIC_KEY, envs.WEB_PUSH_PRIVATE_KEY, envs.WEB_PUSH_SUBJECT),
    envs.WEB_PUSH_COOLDOWN_MS,
  ));

export const buildPushController = (): PushController => new PushController(buildPushNoticeService());

export const buildInstallationPresenceMonitor = (): InstallationPresenceMonitor =>
  new InstallationPresenceMonitor(
    buildInstallationsRepository(),
    buildOperationalIncidentRepository(),
    buildJobLockRepository(),
    buildConnectionHistoryRepository(),
    buildPushNoticeService(),
  );

export const buildConnectionHistoryController = (): ConnectionHistoryController =>
  new ConnectionHistoryController(new ConnectionHistoryService(buildConnectionHistoryRepository()));

export const buildOccupancyOverviewController = (): OccupancyOverviewController =>
  new OccupancyOverviewController(new OccupancyOverviewService(buildOccupancyOverviewRepository()));

export const buildDataRetentionJob = (): DataRetentionJob =>
  new DataRetentionJob(buildDataRetentionRepository(), buildJobLockRepository(), retentionPlan({
    financial: envs.RETENTION_FINANCIAL_DAYS,
    operational: envs.RETENTION_OPERATIONAL_DAYS,
    inbox: envs.RETENTION_INBOX_DAYS,
    mobileOperations: envs.RETENTION_MOBILE_OPERATIONS_DAYS,
    incidents: envs.RETENTION_INCIDENTS_DAYS,
    connectionEvents: envs.RETENTION_CONNECTION_EVENTS_DAYS,
    pushSubscriptions: envs.RETENTION_PUSH_SUBSCRIPTIONS_DAYS,
  }));
