import { createCallerFactory, createTRPCRouter } from "~/server/api/trpc";

import { itemRouter } from "./routers/item";
import {
	adminRouter,
	commentRouter,
	notificationRouter,
	tagRouter,
	userRouter,
} from "./routers/misc";

export const appRouter = createTRPCRouter({
	item: itemRouter,
	comment: commentRouter,
	tag: tagRouter,
	user: userRouter,
	notification: notificationRouter,
	admin: adminRouter,
});

export type AppRouter = typeof appRouter;

/** 服务端直接调用（RSC 预取、测试） */
export const createCaller = createCallerFactory(appRouter);
