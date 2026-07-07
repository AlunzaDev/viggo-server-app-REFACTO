import { LogEntity } from "../../entities";
import { LogRepository } from "../../repository";

export class LoggerService {
    private static instance: LoggerService;
    private logs: string[] = [];
    private readonly logRepository: LogRepository;

    private constructor(logRepository: LogRepository) {
        this.logRepository = logRepository;
    }
    public static createInstance(logRepository: LogRepository): LoggerService {
        if (!LoggerService.instance) {
            LoggerService.instance = new LoggerService(logRepository);
        }
        return LoggerService.instance;
    }

    public static getInstance(): LoggerService {
        if (!LoggerService.instance) {
            throw new Error("LoggerService has not been initialized. Call createInstance() first.");
        }
        return LoggerService.instance;
    }

    public log(log: LogEntity): void {
        this.logRepository.saveLog(log); // Usamos la dependencia para guardar logs
    }
}
