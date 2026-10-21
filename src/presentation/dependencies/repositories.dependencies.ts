// Repository builders shared by controllers, services and middlewares: the single place
// that decides which database implementation the API uses.
// Only infrastructure imports here, so any module can use them without import cycles.
import { AuthPostgresDatasource } from "../../infrastructure/datasources/auth/auth.datasource.postgres";
import { PermissionProfilePostgresDatasource } from "../../infrastructure/datasources/auth/permission-profile.datasource.postgres";
import { UsuarioPostgresDatasource } from "../../infrastructure/datasources/auth/usuario.datasource.postgres";
import { OperationalIncidentPostgresDatasource } from "../../infrastructure/datasources/incidents/operational-incident.datasource.postgres";
import { InstallationsPostgresDatasource } from "../../infrastructure/datasources/installations/installations.datasource.postgres";
import { LocalProjectsPostgresDatasource } from "../../infrastructure/datasources/local-projects/local-projects.datasource.postgres";
import { MobileOperationPostgresDatasource } from "../../infrastructure/datasources/mobile/mobile-operation.datasource.postgres";
import { ModuloPostgresDatasource } from "../../infrastructure/datasources/parking/modulo.datasource.postgres";
import { ProyectoPostgresDatasource } from "../../infrastructure/datasources/parking/proyecto.datasource.postgres";
import { PaymentProviderPostgresDatasource } from "../../infrastructure/datasources/parking/payment-provider.datasource.postgres";
import { PaymentPostgresDatasource } from "../../infrastructure/datasources/payments/payment.datasource.postgres";
import { StripePaymentPostgresDatasource } from "../../infrastructure/datasources/payments/stripe-payment.datasource.postgres";
import { PensionPassPostgresDatasource } from "../../infrastructure/datasources/pension/pension-pass.datasource.postgres";
import { PensionPostgresDatasource } from "../../infrastructure/datasources/pension/pension.datasource.postgres";
import { SyncPostgresDatasource } from "../../infrastructure/datasources/sync/sync.datasource.postgres";
import { JobLockPostgresDatasource } from "../../infrastructure/datasources/system/job-lock.datasource.postgres";
import { AuthRepositoryImpl } from "../../infrastructure/repositories/auth/auth.repository.impl";
import { PermissionProfileRepositoryImpl } from "../../infrastructure/repositories/auth/permission-profile.repository.impl";
import { UsuarioRepositoryImpl } from "../../infrastructure/repositories/auth/usuario.repository.impl";
import { OperationalIncidentRepositoryImpl } from "../../infrastructure/repositories/incidents/operational-incident.repository.impl";
import { InstallationsRepositoryImpl } from "../../infrastructure/repositories/installations/installations.repository.impl";
import { LocalProjectsRepositoryImpl } from "../../infrastructure/repositories/local-projects/local-projects.repository.impl";
import { MobileOperationRepositoryImpl } from "../../infrastructure/repositories/mobile/mobile-operation.repository.impl";
import { ModuloRepositoryImpl } from "../../infrastructure/repositories/parking/modulo.repository.impl";
import { ProyectoRepositoryImpl } from "../../infrastructure/repositories/parking/proyecto.repository.impl";
import { PaymentProviderRepositoryImpl } from "../../infrastructure/repositories/parking/payment-provider.repository.impl";
import { PaymentRepositoryImpl } from "../../infrastructure/repositories/payments/payment.repository.impl";
import { StripePaymentRepositoryImpl } from "../../infrastructure/repositories/payments/stripe-payment.repository.impl";
import { PensionPassRepositoryImpl } from "../../infrastructure/repositories/pension/pension-pass.repository.impl";
import { PensionRepositoryImpl } from "../../infrastructure/repositories/pension/pension.repository.impl";
import { SyncRepositoryImpl } from "../../infrastructure/repositories/sync/sync.repository.impl";
import { JobLockRepositoryImpl } from "../../infrastructure/repositories/system/job-lock.repository.impl";
import { TicketLabPostgresDatasource } from "../../infrastructure/datasources/dev/ticket-lab.datasource.postgres";
import { TicketLabRepositoryImpl } from "../../infrastructure/repositories/dev/ticket-lab.repository.impl";
import { HourlyTotalsPostgres } from "../../infrastructure/statistics/hourly-totals.postgres";
import { PostgresMetricsReader } from "../../infrastructure/statistics/metrics-reader.postgres";

export const buildAuthRepository = () =>
  new AuthRepositoryImpl(new AuthPostgresDatasource());

export const buildUsuarioRepository = () =>
  new UsuarioRepositoryImpl(new UsuarioPostgresDatasource());

export const buildPermissionProfileRepository = () =>
  new PermissionProfileRepositoryImpl(new PermissionProfilePostgresDatasource());

export const buildProyectoRepository = () =>
  new ProyectoRepositoryImpl(new ProyectoPostgresDatasource());

export const buildPaymentProviderRepository = () =>
  new PaymentProviderRepositoryImpl(new PaymentProviderPostgresDatasource());

export const buildModuloRepository = () =>
  new ModuloRepositoryImpl(new ModuloPostgresDatasource());

export const buildPensionRepository = () =>
  new PensionRepositoryImpl(new PensionPostgresDatasource());

export const buildPensionPassRepository = () =>
  new PensionPassRepositoryImpl(new PensionPassPostgresDatasource());

export const buildPaymentRepository = () =>
  new PaymentRepositoryImpl(new PaymentPostgresDatasource());

export const buildStripePaymentRepository = () =>
  new StripePaymentRepositoryImpl(new StripePaymentPostgresDatasource());

export const buildInstallationsRepository = () =>
  new InstallationsRepositoryImpl(new InstallationsPostgresDatasource());

export const buildLocalProjectsRepository = () =>
  new LocalProjectsRepositoryImpl(new LocalProjectsPostgresDatasource());

export const buildSyncRepository = () =>
  new SyncRepositoryImpl(new SyncPostgresDatasource());

export const buildMobileOperationRepository = () =>
  new MobileOperationRepositoryImpl(new MobileOperationPostgresDatasource());

export const buildOperationalIncidentRepository = () =>
  new OperationalIncidentRepositoryImpl(new OperationalIncidentPostgresDatasource());

export const buildJobLockRepository = () =>
  new JobLockRepositoryImpl(new JobLockPostgresDatasource());

/** Statistics read their metrics straight from PostgreSQL (docs/estadisticas.md §2). */
export const buildMetricsReader = () => new PostgresMetricsReader();

/** Totals per parking and hour the metrics read (docs/estadisticas-carga.md §5). */
export const buildHourlyTotalsStore = () => new HourlyTotalsPostgres();

/** Development ticket laboratory (PROD=false). */
export const buildTicketLabRepository = () =>
  new TicketLabRepositoryImpl(new TicketLabPostgresDatasource());
