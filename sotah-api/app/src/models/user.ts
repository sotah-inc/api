import * as SequelizeStatic from "sequelize";
import { Instance, Sequelize, STRING } from "sequelize";
import * as jwt from "jsonwebtoken";

import { JwtPayload, jwtOptions } from "../lib/session";
import { PreferenceModel } from "./preference";
import { PricelistModel } from "./pricelist";

export type UserAttributes = {
  id?: number
  email: string
  hashed_password: string
};

export interface UserInstance extends Instance<UserAttributes> {
  id: number;
}

export type UserModel = SequelizeStatic.Model<UserInstance, UserAttributes>;

export const createModel = (sequelize: Sequelize): UserModel => {
  return sequelize.define<UserInstance, UserAttributes>("user", {
    email: { type: STRING, allowNull: false },
    hashed_password: { type: STRING, allowNull: false }
  });
};

export const appendRelationships = (
  User: UserModel,
  Preference: PreferenceModel,
  Pricelist: PricelistModel
): UserModel => {
  User.hasOne(Preference, { foreignKey: "user_id" });
  User.hasMany(Pricelist, { foreignKey: "user_id" });

  return User;
};

export const withoutPassword = (user: UserInstance): UserAttributes => {
  const data = user.toJSON();
  delete data["hashed_password"];

  return data;
};

export const generateJwtToken = (user: UserInstance): string => {
  return jwt.sign(
    <JwtPayload>{ data: user.get("id") },
    jwtOptions.secret,
    { issuer: jwtOptions.issuer, audience: jwtOptions.audience }
  );
};