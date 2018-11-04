import * as HTTPStatus from "http-status";
import { Connection } from "typeorm";

import { Post } from "../../entities/post";
import { IValidationErrorResponse } from "../../types/contracts";
import { ICreatePostRequest, ICreatePostResponse } from "../../types/contracts/user/post-crud";
import { UserLevel } from "../../types/entities";
import { RequestHandler } from "../index";

export class PostCrudController {
    private dbConn: Connection;

    constructor(dbConn: Connection) {
        this.dbConn = dbConn;
    }

    public createPost: RequestHandler<
        ICreatePostRequest,
        ICreatePostResponse | IValidationErrorResponse | null
    > = async req => {
        const user = req.user!;
        if (user.level < UserLevel.Admin) {
            return { data: null, status: HTTPStatus.UNAUTHORIZED };
        }

        const post = new Post();
        post.title = req.body.title;
        await this.dbConn.manager.save(post);

        return {
            data: { post: post.toJson() },
            status: HTTPStatus.CREATED,
        };
    };
}