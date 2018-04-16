import * as zlib from "zlib";
import * as nats from "nats";
import { LoggerInstance } from "winston";

import { regionName, IRegion, IStatus } from "./region";
import { realmSlug } from "./realm";
import { IAuctions } from "./auction";

const DEFAULT_TIMEOUT = 5 * 1000;

export const gunzip = (data: Buffer): Promise<Buffer> => {
  return new Promise<Buffer>((reslove, reject) => {
    zlib.gunzip(data, (err, result) => {
      if (err) {
        reject(err);

        return;
      }

      reslove(result);
    });
  });
};

export enum subjects {
  status = "status",
  regions = "regions",
  genericTestErrors = "genericTestErrors",
  auctions = "auctions"
}

export enum code {
  ok = 1,
  genericError = -1,
  msgJsonParseError = -2,
  notFound = -3
}

export class MessageError {
  message: string;
  code: code;

  constructor(message: string, code: code) {
    this.message = message;
    this.code = code;
  }
}

export class Message<T> {
  error: Error | null;
  rawData?: string;
  data?: T;
  code: code;

  constructor(msg: IMessage, parseData: boolean) {
    this.error = null;
    if (msg.error.length > 0) {
      this.error = new Error(msg.error);
    }

    this.rawData = msg.data;
    if (parseData) {
      this.data = JSON.parse(msg.data);
    }

    this.code = msg.code;
  }
}

interface IMessage {
  data: string;
  error: string;
  code: number;
}

type RequestOptions = {
  body?: string
  parseData?: boolean
};

type DefaultRequestOptions = {
  body: string
  parseData: boolean
};

export class Messenger {
  client: nats.Client;
  logger: LoggerInstance;

  constructor(client: nats.Client, logger: LoggerInstance) {
    this.client = client;
    this.logger = logger;
  }

  request<T>(subject: string, opts?: RequestOptions): Promise<Message<T>> {
    return new Promise<Message<T>>((resolve, reject) => {
      const tId = setTimeout(() => reject(new Error("Timed out!")), DEFAULT_TIMEOUT);

      const defaultOptions: DefaultRequestOptions = {
        body: "",
        parseData: true
      };
      let settings = defaultOptions;
      if (opts) {
        settings = {
          ...settings,
          ...opts
        };
      }
      const { body, parseData } = settings;

      this.logger.debug("Sending messenger request", { subject, body });
      this.client.request(subject, body, (natsMsg: string) => {
        (async () => {
          clearTimeout(tId);
          const parsedMsg: IMessage = JSON.parse(natsMsg.toString());
          const msg = new Message<T>(parsedMsg, parseData);
          if (msg.error !== null && msg.code === code.genericError) {
            reject(new MessageError(msg.error.message, msg.code));

            return;
          }

          resolve(msg);
        })();
      });
    });
  }

  getStatus(regionName: regionName): Promise<Message<IStatus>> {
    return this.request(subjects.status, { body: JSON.stringify({ region_name: regionName }) });
  }

  getRegions(): Promise<Message<IRegion[]>> {
    return this.request(subjects.regions);
  }

  async getAuctions(regionName: regionName, realmSlug: realmSlug): Promise<Message<IAuctions>> {
    const message = await this.request<string>(
      subjects.auctions,
      { body: JSON.stringify({ region_name: regionName, realm_slug: realmSlug }), parseData: false }
    );
    if (message.code !== code.ok) {
      return { code: message.code, error: message.error };
    }

    return {
      code: code.ok,
      data: JSON.parse((await gunzip(Buffer.from(message.rawData!, "base64"))).toString()),
      error: null,
    };
  }
}
