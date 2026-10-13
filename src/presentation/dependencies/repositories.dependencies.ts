// Repository builders shared by controllers, services and middlewares.
// Only infrastructure imports here, so any module can use them without import cycles.
import { UsuarioMongoDatasource } from "../../infrastructure/datasources/auth/usuario.datasource.mongo";
import { OperationalIncidentMongoDatasource } from "../../infrastructure/datasources/incidents/operational-incident.datasource.mongo";
import { InstallationsMongoDatasource } from "../../infrastructure/datasources/installations/installations.datasource.mongo";
import { MobileOperationMongoDatasource } from "../../infrastructure/datasources/mobile/mobile-operation.datasource.mongo";
import { ModuloMongoDatasource } from "../../infrastructure/datasources/parking/modulo.datasource.mongo";
import { ProyectoMongoDatasource } from "../../infrastructure/datasources/parking/proyecto.datasource.mongo";
import { PaymentMongoDatasource } from "../../infrastructure/datasources/payments/payment.datasource.mongo";
import { PensionPassMongoDatasource } from "../../infrastructure/datasources/pension/pension-pass.datasource.mongo";
import { PensionMongoDatasource } from "../../infrastructure/datasources/pension/pension.datasource.mongo";
import { UsuarioRepositoryImpl } from "../../infrastructure/repositories/auth/usuario.repository.impl";
import { OperationalIncidentRepositoryImpl } from "../../infrastructure/repositories/incidents/operational-incident.repository.impl";
import { InstallationsRepositoryImpl } from "../../infrastructure/repositories/installations/installations.repository.impl";
import { MobileOperationRepositoryImpl } from "../../infrastructure/repositories/mobile/mobile-operation.repository.impl";
import { ModuloRepositoryImpl } from "../../infrastructure/repositories/parking/modulo.repository.impl";
import { ProyectoRepositoryImpl } from "../../infrastructure/repositories/parking/proyecto.repository.impl";
import { PaymentRepositoryImpl } from "../../infrastructure/repositories/payments/payment.repository.impl";
import { PensionPassRepositoryImpl } from "../../infrastructure/repositories/pension/pension-pass.repository.impl";
import { PensionRepositoryImpl } from "../../infrastructure/repositories/pension/pension.repository.impl";
import { JobLockMemoryDatasource } from "../../infrastructure/datasources/system/job-lock.datasource.memory";
import { JobLockRepositoryImpl } from "../../infrastructure/repositories/system/job-lock.repository.impl";

export const buildUsuarioRepository = () =>
  new UsuarioRepositoryImpl(new UsuarioMongoDatasource());

export const buildProyectoRepository = () =>
  new ProyectoRepositoryImpl(new ProyectoMongoDatasource());

export const buildModuloRepository = () =>
  new ModuloRepositoryImpl(new ModuloMongoDatasource());

export const buildPensionRepository = () =>
  new PensionRepositoryImpl(new PensionMongoDatasource());

export const buildPensionPassRepository = () =>
  new PensionPassRepositoryImpl(new PensionPassMongoDatasource());

export const buildPaymentRepository = () =>
  new PaymentRepositoryImpl(new PaymentMongoDatasource());

export const buildInstallationsRepository = () =>
  new InstallationsRepositoryImpl(new InstallationsMongoDatasource());

export const buildMobileOperationRepository = () =>
  new MobileOperationRepositoryImpl(new MobileOperationMongoDatasource());

export const buildOperationalIncidentRepository = () =>
  new OperationalIncidentRepositoryImpl(new OperationalIncidentMongoDatasource());

// One lock store per process (the in-memory one must be shared to mean anything).
const jobLockRepository = new JobLockRepositoryImpl(new JobLockMemoryDatasource());
export const buildJobLockRepository = () => jobLockRepository;
