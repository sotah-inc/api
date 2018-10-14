import * as nats from "nats";
import * as zlib from "zlib";

import {
    IAuctionsQueryResponse,
    IAuctionsRequest,
    IAuctionsResponse,
    IItemClassesResponse,
    IItemsQueryResponse,
    IItemsResponse,
    IOwnersQueryByItemsRequest,
    IOwnersQueryByItemsResponse,
    IOwnersQueryRequest,
    IOwnersRequest,
    IOwnersResponse,
    ItemId,
} from "../auction";
import { IBootResponse } from "../boot";
import {
    IPricelistHistoryRequest,
    IPricelistHistoryResponse,
    IPriceListRequest,
    IPriceListResponse,
} from "../price-list";
import { IRegion, IStatus, regionName } from "../region";
import { ISessionSecretResponse } from "../session";
import { Message } from "./message";

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
    auctions = "auctions",
    owners = "owners",
    ownersQuery = "ownersQuery",
    itemsQuery = "itemsQuery",
    auctionsQuery = "auctionsQuery",
    itemClasses = "itemClasses",
    priceList = "priceList",
    priceListHistory = "priceListHistory",
    items = "items",
    boot = "boot",
    sessionSecret = "sessionSecret",
    ownersQueryByItems = "ownersQueryByItems",
}

export enum code {
    ok = 1,
    genericError = -1,
    msgJsonParseError = -2,
    notFound = -3,
    userError = -4,
}

export interface IMessageError {
    message: string;
    code: code;
}

export interface IMessage {
    data: string;
    error: string;
    code: number;
}

interface IRequestOptions {
    body?: string;
    parseData?: boolean;
}

interface IDefaultRequestOptions {
    body: string;
    parseData: boolean;
}

export class Messenger {
    private client: nats.Client;

    constructor(client: nats.Client) {
        this.client = client;
    }

    public getStatus(regionNameValue: regionName): Promise<Message<IStatus>> {
        return this.request(subjects.status, { body: JSON.stringify({ region_name: regionNameValue }) });
    }

    public getRegions(): Promise<Message<IRegion[]>> {
        return this.request(subjects.regions);
    }

    public async getAuctions(request: IAuctionsRequest): Promise<Message<IAuctionsResponse>> {
        const message = await this.request<string>(subjects.auctions, {
            body: JSON.stringify(request),
            parseData: false,
        });
        if (message.code !== code.ok) {
            return { code: message.code, error: message.error };
        }

        return {
            code: code.ok,
            data: JSON.parse((await gunzip(Buffer.from(message.rawData!, "base64"))).toString()),
            error: null,
        };
    }

    public getOwners(request: IOwnersRequest): Promise<Message<IOwnersResponse>> {
        return this.request(subjects.owners, { body: JSON.stringify(request) });
    }

    public queryItems(query: string): Promise<Message<IItemsQueryResponse>> {
        return this.request(subjects.itemsQuery, { body: JSON.stringify({ query }) });
    }

    public queryOwners(request: IOwnersQueryRequest): Promise<Message<IAuctionsQueryResponse>> {
        return this.request(subjects.ownersQuery, { body: JSON.stringify(request) });
    }

    public getItemClasses(): Promise<Message<IItemClassesResponse>> {
        return this.request(subjects.itemClasses);
    }

    public async getPriceList(request: IPriceListRequest): Promise<Message<IPriceListResponse>> {
        const message = await this.request<string>(subjects.priceList, {
            body: JSON.stringify(request),
            parseData: false,
        });
        if (message.code !== code.ok) {
            return { code: message.code, error: message.error };
        }

        return {
            code: code.ok,
            data: JSON.parse((await gunzip(Buffer.from(message.rawData!, "base64"))).toString()),
            error: null,
        };
    }

    public async getItems(itemIds: ItemId[]): Promise<Message<IItemsResponse>> {
        const message = await this.request<string>(subjects.items, {
            body: JSON.stringify({ itemIds }),
            parseData: false,
        });
        if (message.code !== code.ok) {
            return { code: message.code, error: message.error };
        }

        return {
            code: code.ok,
            data: JSON.parse((await gunzip(Buffer.from(message.rawData!, "base64"))).toString()),
            error: null,
        };
    }

    public getBoot(): Promise<Message<IBootResponse>> {
        return this.request(subjects.boot);
    }

    public async getPricelistHistories(req: IPricelistHistoryRequest): Promise<Message<IPricelistHistoryResponse>> {
        const message = await this.request<string>(subjects.priceListHistory, {
            body: JSON.stringify(req),
            parseData: false,
        });
        if (message.code !== code.ok) {
            return { code: message.code, error: message.error };
        }

        return {
            code: code.ok,
            data: JSON.parse((await gunzip(Buffer.from(message.rawData!, "base64"))).toString()),
            error: null,
        };
    }

    public getSessionSecret(): Promise<Message<ISessionSecretResponse>> {
        return this.request(subjects.sessionSecret);
    }

    public queryOwnerItems(request: IOwnersQueryByItemsRequest): Promise<Message<IOwnersQueryByItemsResponse>> {
        return this.request(subjects.ownersQueryByItems, { body: JSON.stringify(request) });
    }

    private request<T>(subject: string, opts?: IRequestOptions): Promise<Message<T>> {
        return new Promise<Message<T>>((resolve, reject) => {
            const tId = setTimeout(() => reject(new Error("Timed out!")), DEFAULT_TIMEOUT);

            const defaultOptions: IDefaultRequestOptions = {
                body: "",
                parseData: true,
            };
            let settings = defaultOptions;
            if (opts) {
                settings = {
                    ...settings,
                    ...opts,
                };
            }
            const { body, parseData } = settings;

            this.client.request(subject, body, (natsMsg: string) => {
                (async () => {
                    clearTimeout(tId);
                    const parsedMsg: IMessage = JSON.parse(natsMsg.toString());
                    const msg = new Message<T>(parsedMsg, parseData);
                    if (msg.error !== null && msg.code === code.genericError) {
                        const reason: IMessageError = {
                            code: msg.code,
                            message: msg.error.message,
                        };
                        reject(reason);

                        return;
                    }

                    resolve(msg);
                })();
            });
        });
    }
}