import * as express from "express";
import { wrap } from "async-middleware";
import * as HttpStatus from "http-status";
import { LoggerInstance } from "winston";

import { Messenger, code } from "./messenger";

export const getApp = (messenger: Messenger, logger: LoggerInstance): express.Express => {
  const app = express();

  app.use((req, res, next) => {
    logger.info("Received HTTP request", {url: req.originalUrl});

    res.set("access-control-allow-origin", "*");
    next();
  });

  app.get("/", (_, res) => res.send("Hello, world!"));
  app.get("/ping", (_, res) => res.send("Pong!"));
  app.get("/regions", wrap(async (_, res) => {
    const msg = await messenger.getRegions();
    res.send(msg.data).end();
  }));
  app.get("/status/:regionName", wrap(async (req, res) => {
    const msg = await messenger.getStatus(req.params["regionName"]);
    if (msg.code === code.notFound) {
      res.status(HttpStatus.NOT_FOUND).end();

      return;
    }

    res.send(msg.data).end();
  }));
  app.get("/internal-error", () => {
    throw new Error("Test error!");
  });
  app.use((err: Error, _: express.Request, res: express.Response, next: Function) => {
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).send(err.message);
    next();
  });

  return app;
};
