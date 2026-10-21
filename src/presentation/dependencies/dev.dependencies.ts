import { TicketLabController } from "../routes/dev/ticket-lab.controller";
import { TicketLabService } from "../services/dev/ticket-lab.service";
import { buildTicketLabRepository } from "./repositories.dependencies";

export const buildTicketLabController = () => new TicketLabController(new TicketLabService(buildTicketLabRepository()));
