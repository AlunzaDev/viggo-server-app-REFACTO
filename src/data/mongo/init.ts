import mongoose from "mongoose";
import { envs } from "../../config/plugins/envs.plugin";

interface MongoConnectionOptions {
    mongoUrl: string;
    dbName: string;
}

export class MongoDatabase {
    private static listenersRegistered = false;
    private static disconnectExitTimer: NodeJS.Timeout | null = null;

    private static clearDisconnectExitTimer() {
        if (this.disconnectExitTimer) {
            clearTimeout(this.disconnectExitTimer);
            this.disconnectExitTimer = null;
        }
    }

    private static scheduleDisconnectExit() {
        if (this.disconnectExitTimer) return;

        const delayMs = envs.MONGO_DISCONNECT_EXIT_DELAY_MS;
        console.error(
            `Mongo disconnected. Exiting in ${delayMs}ms if the connection is not restored.`,
        );

        this.disconnectExitTimer = setTimeout(() => {
            console.error("Mongo connection was not restored in time. Exiting process.");
            process.exit(1);
        }, delayMs);
    }

    private static registerConnectionListeners() {
        if (this.listenersRegistered) return;

        mongoose.connection.on("connected", () => {
            this.clearDisconnectExitTimer();
            console.log("Mongo connected");
        });

        mongoose.connection.on("reconnected", () => {
            this.clearDisconnectExitTimer();
            console.log("Mongo reconnected");
        });

        mongoose.connection.on("disconnected", () => {
            this.scheduleDisconnectExit();
        });

        mongoose.connection.on("error", (error) => {
            console.error("Mongo connection error", error);
        });

        this.listenersRegistered = true;
    }

    static async connect(options: MongoConnectionOptions) {
        const { mongoUrl, dbName } = options;

        try {
            this.registerConnectionListeners();
            await mongoose.connect(mongoUrl, { dbName });
        } catch (error) {
            console.log("Database Connection error");
            throw error;
        }
    }

    static isHealthy() {
        return mongoose.connection.readyState === 1;
    }

    static getHealthSnapshot() {
        return {
            status: this.isHealthy() ? "ok" : "error",
            readyState: mongoose.connection.readyState,
            database: mongoose.connection.name || null,
            host: mongoose.connection.host || null,
        };
    }
}
