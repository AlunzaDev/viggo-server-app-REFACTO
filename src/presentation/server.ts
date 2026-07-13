import express, { Router } from "express";
import cors from "cors";
import { createServer, Server as HttpServer } from "http";
import { envs } from "../config/plugins/envs.plugin";
import { MongoDatabase } from "../data/mongo";
import { requestLoggingMiddleware } from "./middlewares/request-logging.middleware";
import { SocketServerPlugin } from "./sockets/socket-server";

interface ServerOptions {
  host?: string;
  port: number;
  publicPath?: string;
  routes: Router;
}

export class Server {
  private readonly app = express();
  private readonly httpServer: HttpServer;
  private readonly host: string;
  private readonly port: number;
  private readonly publicPath: string;
  private readonly routes: Router;

  constructor({
    host = "0.0.0.0",
    port,
    publicPath = "public",
    routes,
  }: ServerOptions) {
    this.host = host;
    this.port = port;
    this.publicPath = publicPath;
    this.routes = routes;
    this.httpServer = createServer(this.app);
  }

  async start() {
    await MongoDatabase.connect({
      mongoUrl: envs.MONGO_URL,
      dbName: envs.MONGO_DB_NAME,
    });

    this.app.use(cors());
    this.app.use(express.json());
    this.app.use(express.static(this.publicPath));
    this.app.use((_req, res, next) => {
      res.header("Access-Control-Allow-Origin", "*");
      res.header(
        "Access-Control-Allow-Headers",
        "Authorization, X-API-KEY, Origin, X-Requested-With, Content-Type, Accept, Access-Control-Allow-Request-Method",
      );
      res.header(
        "Access-Control-Allow-Methods",
        "GET, POST, OPTIONS, PUT, PATCH, DELETE",
      );
      res.header("Allow", "GET, POST, OPTIONS, PUT, PATCH, DELETE");

      next();
    });
    this.app.use(requestLoggingMiddleware);
    this.app.use(this.routes);

    SocketServerPlugin.init(this.httpServer);

    this.httpServer.listen(this.port, this.host, () => {
      console.log(`Server running on ${this.host}:${this.port}`);
    });
  }
}
