import { wrap } from "async-middleware";
import { Request, Response, Router } from "express";
import * as HTTPStatus from "http-status";

import { ItemId } from "../../lib/auction";
import { Messenger } from "../../lib/messenger";
import { auth } from "../../lib/session";
import { PricelistRequestBodyRules } from "../../lib/validator-rules";
import { IModels } from "../../models";
import { withoutEntries } from "../../models/pricelist";
import { IPricelistEntryInstance } from "../../models/pricelist-entry";
import { IUserInstance } from "../../models/user";

interface IPricelistRequestBody {
    pricelist: {
        name: string;
    };
    entries: Array<{
        id?: number;
        item_id: number;
        quantity_modifier: number;
    }>;
}

export const getRouter = (models: IModels, messenger: Messenger) => {
    const router = Router();
    const { Pricelist, PricelistEntry, ProfessionPricelist } = models;

    router.post(
        "/",
        auth,
        wrap(async (req: Request, res: Response) => {
            const user = req.user as IUserInstance;
            let result: IPricelistRequestBody | null = null;
            try {
                result = (await PricelistRequestBodyRules.validate(req.body)) as IPricelistRequestBody;
            } catch (err) {
                res.status(HTTPStatus.BAD_REQUEST).json(err.errors);

                return;
            }

            const pricelist = await Pricelist.create({ ...result!.pricelist, user_id: user.id });
            const entries = await Promise.all(
                result.entries.map(v =>
                    PricelistEntry.create({
                        pricelist_id: pricelist.id,
                        ...v,
                    }),
                ),
            );
            res.status(HTTPStatus.CREATED).json({
                entries: entries.map(v => v.toJSON()),
                pricelist: withoutEntries(pricelist),
            });
        }),
    );

    router.get(
        "/",
        auth,
        wrap(async (req: Request, res: Response) => {
            const user = req.user as IUserInstance;

            // gathering pricelists associated with this user
            let pricelists = await Pricelist.findAll({
                include: [PricelistEntry, ProfessionPricelist],
                where: { user_id: user.id },
            });

            // filtering out profession-pricelists
            pricelists = pricelists.filter(v => !!v.get("profession_pricelist") === false);

            // gathering related items
            const itemIds: ItemId[] = pricelists.reduce((pricelistsItemIds: ItemId[], pricelist) => {
                return pricelist
                    .get("pricelist_entries")
                    .reduce((entriesItemIds: ItemId[], entry: IPricelistEntryInstance) => {
                        const entryJson = entry.toJSON();
                        if (entriesItemIds.indexOf(entryJson.item_id) === -1) {
                            entriesItemIds.push(entryJson.item_id);
                        }

                        return entriesItemIds;
                    }, pricelistsItemIds);
            }, []);
            const items = (await messenger.getItems(itemIds)).data!.items;

            // dumping out a response
            res.json({ pricelists: pricelists.map(v => v.toJSON()), items });
        }),
    );

    router.get(
        "/:id",
        auth,
        wrap(async (req: Request, res: Response) => {
            const user = req.user as IUserInstance;
            const pricelist = await Pricelist.findOne({
                include: [PricelistEntry],
                where: { id: req.params["id"], user_id: user.id },
            });
            if (pricelist === null) {
                res.status(HTTPStatus.NOT_FOUND);

                return;
            }

            res.json({ pricelist: pricelist.toJSON() });
        }),
    );

    router.put(
        "/:id",
        auth,
        wrap(async (req: Request, res: Response) => {
            // resolving the pricelist
            const user = req.user as IUserInstance;
            const pricelist = await Pricelist.findOne({
                include: [PricelistEntry],
                where: { id: req.params["id"], user_id: user.id },
            });
            if (pricelist === null) {
                res.status(HTTPStatus.NOT_FOUND);

                return;
            }

            // validating the request body
            let result: IPricelistRequestBody | null = null;
            try {
                result = (await PricelistRequestBodyRules.validate(req.body)) as IPricelistRequestBody;
            } catch (err) {
                res.status(HTTPStatus.BAD_REQUEST).json(err.errors);

                return;
            }

            // saving the pricelist
            pricelist.setAttributes({ ...result.pricelist });
            pricelist.save();

            // misc
            const entries = pricelist.get("pricelist_entries") as IPricelistEntryInstance[];

            // creating new entries
            const newRequestEntries = result.entries.filter(v => !!v.id === false);
            const newEntries = await Promise.all(
                newRequestEntries.map(v => PricelistEntry.create({ ...v, pricelist_id: pricelist.id })),
            );

            // updating existing entries
            const receivedRequestEntries = result.entries.filter(v => !!v.id);
            const receivedEntries = await PricelistEntry.findAll({
                where: { id: receivedRequestEntries.map(v => v.id!) },
            });
            receivedEntries.map((v, i) => v.setAttributes({ ...receivedRequestEntries[i] }));
            await Promise.all(receivedEntries.map(v => v.save()));

            // gathering removed entries and deleting them
            const receivedEntryIds = receivedEntries.map(v => v.id);
            const removedEntries = entries.filter(v => receivedEntryIds.indexOf(v.id) === -1);
            await Promise.all(removedEntries.map(v => v.destroy()));

            // dumping out a response
            res.json({
                entries: [...receivedEntries, ...newEntries].map(v => v.toJSON()),
                pricelist: withoutEntries(pricelist),
            });
        }),
    );

    router.delete(
        "/:id",
        auth,
        wrap(async (req: Request, res: Response) => {
            // resolving the pricelist
            const user = req.user as IUserInstance;
            const pricelist = await Pricelist.findOne({
                include: [PricelistEntry],
                where: { id: req.params["id"], user_id: user.id },
            });
            if (pricelist === null) {
                res.status(HTTPStatus.NOT_FOUND);

                return;
            }

            await Promise.all(pricelist.get("pricelist_entries").map((v: IPricelistEntryInstance) => v.destroy()));
            await pricelist.destroy();
            res.json({});
        }),
    );

    return router;
};
