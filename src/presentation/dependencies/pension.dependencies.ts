import { PensionPassController } from "../routes/pension/pension-pass.controller";
import { PensionController } from "../routes/pension/pension.controller";
import { PensionPassService } from "../services/pension/pension-pass.service";
import { PensionService } from "../services/pension/pension.service";
import {
  buildPaymentRepository,
  buildPensionPassRepository,
  buildPensionRepository,
  buildProyectoRepository,
} from "./repositories.dependencies";

export const buildPensionPassService = (): PensionPassService =>
  new PensionPassService(buildPensionPassRepository(), buildPensionRepository());

export const buildPensionController = (): PensionController =>
  new PensionController(
    new PensionService(buildPensionRepository(), buildProyectoRepository()),
  );

export const buildPensionPassController = (): PensionPassController =>
  new PensionPassController(
    buildPensionPassService(),
    buildPaymentRepository(),
    buildPensionPassRepository(),
    buildPensionRepository(),
  );
