import { pgTableCreator } from "drizzle-orm/pg-core";

/**
 * 多项目共用一个 PG 实例时靠前缀归属。改前缀 = 改表名，要走迁移。
 * ⚠️ 它只管表名：pgEnum、索引、约束、触发器函数的名字是 schema 级全局的，各处手写 `ticketodo_` 前缀。
 */
export const createTable = pgTableCreator((name) => `ticketodo_${name}`);
