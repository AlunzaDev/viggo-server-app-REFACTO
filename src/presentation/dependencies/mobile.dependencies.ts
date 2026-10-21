import { MobileOperationAdminController } from "../routes/mobile/mobile-operation-admin.controller";
import { MobileOperationController } from "../routes/mobile/mobile-operation.controller";
import { MobileOperationService } from "../services/mobile/mobile-operation.service";
import {
  buildInstallationsRepository,
  buildMobileOperationRepository,
  buildModuloRepository,
  buildPaymentRepository,
  buildPensionPassRepository,
  buildPensionRepository,
  buildUsuarioRepository,
} from "./repositories.dependencies";

export const buildMobileOperationService = (): MobileOperationService =>
  new MobileOperationService(
    buildMobileOperationRepository(),
    buildPaymentRepository(),
    buildModuloRepository(),
    buildInstallationsRepository(),
    buildUsuarioRepository(),
    buildPensionPassRepository(),
    buildPensionRepository(),
  );

export const buildMobileOperationController = (): MobileOperationController =>
  new MobileOperationController(buildMobileOperationService());

export const buildMobileOperationAdminController = (): MobileOperationAdminController =>
  new MobileOperationAdminController(buildMobileOperationRepository());
