import { Elysia, type AnyElysia, type HTTPMethod } from "elysia";
import { staticPlugin } from "@elysiajs/static";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import dotenv from "dotenv";
import wcmatch from "wildcard-match";
import cron from "node-cron";
import { internalIpV4 } from "internal-ip";
import config from "./config.ts";
import Logger from "./modules/logger.ts";
import ApiError from "./modules/error.ts";

const IS_DEV = process.argv.includes("--dev");
const logger = new Logger("API");
type RouteHandler = (req: Req) => unknown | Promise<unknown>;
type MiddlewareModule = { Middleware: RouteHandler; matches: string };
const methods = new Set(["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"]);

function parseTime(milliseconds: number): string {
    if (milliseconds >= 1000) return Math.round(milliseconds / 1000) + "s";
    if (milliseconds >= 1) return Math.round(milliseconds) + "ms";
    return Math.round(milliseconds * 1000) + "μs";
}

function authorize(req: Req, settings: ServerConfig, route: string) {
    if (!settings.id || !settings.pw || settings.bypassAuthorize?.includes(route)) return;
    const authorization = req.headers.authorization;
    if (!authorization) {
        if (settings.browserLogin) req.set.headers["WWW-Authenticate"] = 'Basic realm="Check", charset="UTF-8"';
        return ApiError(req.set, 401);
    }
    const match = /^Basic\s+([A-Za-z0-9+/]+={0,2})$/i.exec(authorization);
    if (!match) return ApiError(req.set, 403);
    const credentials = Buffer.from(match[1], "base64").toString("utf8");
    const separator = credentials.indexOf(":");
    if (separator < 0 || credentials.slice(0, separator) !== settings.id || credentials.slice(separator + 1) !== settings.pw) return ApiError(req.set, 403);
}

async function addRoutes(app: AnyElysia, directory: string, settings: ServerConfig, root = directory): Promise<void> {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
        const filename = path.join(directory, entry.name);
        if (entry.isDirectory()) {
            await addRoutes(app, filename, settings, root);
            continue;
        }
        if (!entry.isFile() || !entry.name.endsWith(".ts") || /\.(?:d|test|spec)\.ts$/.test(entry.name)) continue;
        const segments = path.relative(root, filename).replaceAll("\\", "/").slice(0, -3).split("/");
        if (segments.at(-1) === "index") segments.pop();
        const route = "/" + segments.map(segment => segment.startsWith("$") ? ":" + segment.slice(1) : segment).join("/");
        const imported = await import(pathToFileURL(filename).href) as Record<string, unknown>;
        const availableMethods: string[] = [];
        for (const [name, callback] of Object.entries(imported)) {
            const method = name.toUpperCase();
            if (!methods.has(method) || typeof callback !== "function") continue;
            app.route(method as HTTPMethod, route, async (context) => {
                const error = authorize(context as Req, settings, route);
                if (error) return error;
                return await (callback as RouteHandler)(context as Req);
            });
            availableMethods.push(method);
        }
        logger.log(`Loaded ${route} [${availableMethods.join(", ")}]`);
    }
}

export async function createApp(settings: ServerConfig = config, root = import.meta.dir) {
    let middleware: MiddlewareModule | undefined;
    const middlewarePath = path.join(root, "middleware.ts");
    if (existsSync(middlewarePath)) {
        const imported = await import(pathToFileURL(middlewarePath).href);
        if (typeof imported.Middleware !== "function" || typeof imported.matches !== "string") throw new Error("middleware.ts was corrupt. Check README.md");
        middleware = imported as MiddlewareModule;
    }
    const matches = middleware ? wcmatch(middleware.matches) : undefined;
    const startTimes = new WeakMap<Request, number>();
    const app = new Elysia()
        .onRequest(({ request }) => {
            startTimes.set(request, performance.now());
        })
        .onBeforeHandle(async (context) => {
            if (middleware && matches?.(context.path)) return await middleware.Middleware(context as Req);
        })
        .onError(({ code, error, set }) => {
            if (code === "NOT_FOUND") return ApiError(set, 404);
            if (code === "PARSE") return ApiError(set, 400);
            if (code === "VALIDATION") return ApiError(set, 422);
            const message = error instanceof Error ? error.message : String(error);
            logger.error(message);
            return ApiError(set, 500, message);
        })
        .onAfterResponse(({ request, set }) => {
            const started = startTimes.get(request);
            const status = typeof set.status === "number" ? set.status : 200;
            const url = new URL(request.url);
            logger.log(`${request.method} ${url.pathname}${url.search} ${status} [${parseTime(performance.now() - (started ?? performance.now()))}]`);
            startTimes.delete(request);
        });
    if (settings.staticPath) {
        const assets = path.resolve(root, settings.staticPath);
        logger.log("Static path set to: " + assets);
        app.use(await staticPlugin({ assets, prefix: "/" }));
    }
    await addRoutes(app, path.join(root, "routes"), settings);
    return app;
}

async function loadSchedules(root: string) {
    logger.log("Loading schedules...");
    const directory = path.join(root, "schedules");
    if (!existsSync(directory)) {
        logger.warn("schedules directory not found!");
        return;
    }
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
        if (!entry.isFile() || !entry.name.endsWith(".ts") || entry.name.endsWith(".d.ts")) continue;
        try {
            const schedule = await import(pathToFileURL(path.join(directory, entry.name)).href);
            if (typeof schedule.Schedule !== "function" || typeof schedule.interval !== "string") throw new Error("Schedule and interval exports are required. Check README.md");
            cron.schedule(schedule.interval, async () => {
                try {
                    await schedule.Schedule();
                } catch (error) {
                    logger.error(`Schedule ${entry.name}: ${error instanceof Error ? error.message : String(error)}`);
                }
            });
            logger.log("Scheduled schedules/" + entry.name);
            await schedule.Schedule();
        } catch (error) {
            logger.error(`An error occurred when loading schedules/${entry.name}`);
            logger.error(error instanceof Error ? error.message : String(error));
        }
    }
}

if (import.meta.main) {
    console.log("Booting...");
    dotenv.config({ debug: IS_DEV, quiet: !IS_DEV });
    try {
        logger.log(`Starting ${config.name}...`);
        const app = await createApp();
        await loadSchedules(import.meta.dir);
        app.listen(config.port);
        logger.log("Server listening on port " + config.port);
        logger.log("- http://127.0.0.1:" + config.port);
        const ip = await internalIpV4();
        if (ip) logger.log("- http://" + ip + ":" + config.port);
    } catch (error) {
        logger.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
    }
}
