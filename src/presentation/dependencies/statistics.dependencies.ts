import { DashboardController } from "../routes/dashboard/dashboard.controller";
import { StatisticsController } from "../routes/statistics/statistics.controller";
import { DashboardService } from "../services/dashboard/dashboard.service";
import { StatisticsService } from "../services/statistics/statistics.service";
import { buildMetricsReader, buildOperationalIncidentRepository } from "./repositories.dependencies";

export const buildStatisticsService = () => new StatisticsService(buildMetricsReader());

export const buildDashboardService = () => new DashboardService(buildStatisticsService(), buildOperationalIncidentRepository());

export const buildStatisticsController = () => new StatisticsController(buildStatisticsService());

export const buildDashboardController = () => new DashboardController(buildDashboardService(), buildStatisticsService());
