import * as process from "process";
import "reflect-metadata";

import test from "ava";
import * as HTTPStatus from "http-status";
import { v4 as uuidv4 } from "uuid";

import { getLogger } from "../../../lib/logger";
import { getTestHelper, setup } from "../../../lib/test-helper";

const helper = async () => {
    const { request } = await setup({
        dbHost: process.env["DB_HOST"] as string,
        logger: getLogger(),
        natsHost: process.env["NATS_HOST"] as string,
        natsPort: process.env["NATS_PORT"] as string,
    });
    const { createUser } = getTestHelper(request);

    return { request, createUser };
};

test("User creation endpoint Should return a user", async t => {
    const { createUser, request } = await helper();

    const user = await createUser(t, {
        email: `return-new-user+${uuidv4()}@test.com`,
        password: "testtest",
    });
    const res = await request.get(`/user/${user.id}`);
    t.is(res.status, HTTPStatus.OK);
});

test("User creation endpoint Should error on fetching user by invalid id", async t => {
    const { request } = await helper();

    const res = await request.get("/user/-1");
    t.is(res.status, HTTPStatus.NOT_FOUND);
});
