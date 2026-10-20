import { MobileOperationAdminController } from "../routes/mobile/mobile-operation-admin.controller";
import { MobileOperationController } from "../routes/mobile/mobile-operation.controller";
import {
  buildInstallationsRepository,
  buildMobileOperationRepository,
  buildModuloRepository,
  buildPaymentRepository,
  buildPensionPassRepository,
  buildPensionRepository,
  buildUsuarioRepository,
} from "./repositories.dependencies";

export const buildMobileOperationController = (): MobileOperationController =>
  new MobileOperationController(
    buildMobileOperationRepository(),
    buildPaymentRepository(),
    buildModuloRepository(),
    buildInstallationsRepository(),
    buildUsuarioRepository(),
    buildPensionPassRepository(),
    buildPensionRepository(),
  );

export const buildMobileOperationAdminController = (): MobileOperationAdminController =>
  new MobileOperationAdminController(buildMobileOperationRepository());
