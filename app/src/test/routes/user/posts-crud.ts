import * as bcrypt from "bcrypt";
import * as process from "process";
import "reflect-metadata";

import test from "ava";
import * as HTTPStatus from "http-status";
import { v4 as uuidv4 } from "uuid";

import { User } from "../../../entities/user";
import { getLogger } from "../../../lib/logger";
import { getTestHelper, setup } from "../../../lib/test-helper";
import { UserLevel } from "../../../types/entities";

const helper = async () => {
    const { request, dbConn } = await setup({
        dbHost: process.env["DB_HOST"] as string,
        logger: getLogger(),
        natsHost: process.env["NATS_HOST"] as string,
        natsPort: process.env["NATS_PORT"] as string,
    });
    const { createUser, requestPost, createPost } = getTestHelper(request);

    return { request, createUser, requestPost, createPost, dbConn };
};

test("Posts crud endpoint Should fail on unauthenticated", async t => {
    const { request } = await helper();

    const res = await request.post("/user/posts").send({ title: "Test" });
    t.is(res.status, HTTPStatus.UNAUTHORIZED);
});

test("Posts crud endpoint Should fail on unauthorized", async t => {
    const { request, createUser } = await helper();

    const password = "testtest";
    const user = await createUser(t, {
        email: `create-post-unauthorized+${uuidv4()}@test.com`,
        password,
    });
    let res = await request.post("/login").send({ email: user.email, password });
    t.is(res.status, HTTPStatus.OK);
    const { token } = res.body;

    res = await request
        .post("/user/posts")
        .set("Authorization", `Bearer ${token}`)
        .send({ title: "test" });
    t.is(res.status, HTTPStatus.UNAUTHORIZED);
});

test("Posts crud endpoint Should create a post", async t => {
    const { request, createPost, dbConn } = await helper();

    const password = "testtest";
    const user = await (async () => {
        const out = new User();
        out.email = `create-profession-pricelists+${uuidv4()}@test.com`;
        out.hashedPassword = await bcrypt.hash(password, 10);
        out.level = UserLevel.Admin;

        return dbConn.manager.save(out);
    })();
    const res = await request.post("/login").send({ email: user.email, password });
    t.is(res.status, HTTPStatus.OK);
    const { token } = res.body;

    const { post } = await createPost(t, token, {
        title: "test",
    });
    const isValidPost = post.id > -1;
    t.true(isValidPost);
    t.is(post.title, "test");
});