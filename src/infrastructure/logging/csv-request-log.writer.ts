import fs from "fs";
import path from "path";

export class CsvRequestLogWriter {
  private static instance: CsvRequestLogWriter | null = null;

  private readonly logDir: string;
  private readonly logFilePath: string;
  private readonly logBuffer: string[] = [];
  private readonly writeIntervalMs: number;
  private intervalId?: NodeJS.Timeout;

  private constructor(logDir: string, fileName: string, writeIntervalMs = 60_000) {
    this.logDir = logDir;
    this.logFilePath = path.join(logDir, fileName);
    this.writeIntervalMs = writeIntervalMs;

    this.ensureLogFile();
    this.startFlushInterval();
    this.registerProcessHooks();
  }

  static getInstance() {
    if (!this.instance) {
      this.instance = new CsvRequestLogWriter(
        path.join(process.cwd(), "data"),
        "requests_log.csv",
      );
    }

    return this.instance;
  }

  append(entry: string) {
    this.logBuffer.push(entry);
  }

  flush() {
    if (this.logBuffer.length === 0) return;

    const logsToWrite = this.logBuffer.join("");
    fs.appendFileSync(this.logFilePath, logsToWrite, "utf8");
    this.logBuffer.length = 0;
  }

  private ensureLogFile() {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }

    if (!fs.existsSync(this.logFilePath)) {
      fs.writeFileSync(
        this.logFilePath,
        "endpoint,date,tda,tiempo_de_respuesta,statusCode\n",
        "utf8",
      );
    }
  }

  private startFlushInterval() {
    if (this.intervalId) return;

    this.intervalId = setInterval(() => {
      this.flush();
    }, this.writeIntervalMs);

    this.intervalId.unref();
  }

  private registerProcessHooks() {
    process.once("beforeExit", () => this.flush());
    process.once("SIGINT", () => {
      this.flush();
      process.exit(0);
    });
    process.once("SIGTERM", () => {
      this.flush();
      process.exit(0);
    });
  }
}
