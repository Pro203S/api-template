import express from 'express';
import * as fs from 'fs/promises';
import * as path from 'path';
import dotenv from 'dotenv';
import wcmatch from 'wildcard-match';
import config from './config.ts';
import Logger from './modules/logger.ts';
import { existsSync } from 'fs';
import cron from 'node-cron';

const IS_DEV = process.argv[2] === "--dev";

dotenv.config({
    "debug": IS_DEV,
    "quiet": !IS_DEV
});

const app = express();
app.use(express.json());
app.use(express.text());

const logger = new Logger(config.name);
logger.log(`Starting ${config.name}...`);

function coloringStatus(status: number) {
    return [
        ``, // 000
        `${status}`.gray, // 100
        `${status}`.green, // 200
        `${status}`.cyan, // 300
        `${status}`.yellow, // 400
        `${status}`.red // 500
    ][Math.floor(status / 100)];
}

const logResponse = (path: string, method: string, status: number) => logger.log(`${method} ${path} ${coloringStatus(status)}`);

if (config.staticPath) {
    logger.log("Static path set to: " + path.join(__dirname, config.staticPath));
    app.use(express.static(path.join(__dirname, config.staticPath)));
}

if (config.expressSettings) {
    const keys = Object.keys(config.expressSettings);
    for (const key of keys) {
        const value = config.expressSettings[key];
        app.set(key, value);

        logger.log(`Set ${key} to ${value}`);
    }

    if (IS_DEV) {
        logger.log("Set etag to false");
        app.set("etag", false);
    }
}

app.use(async (req, res, next) => {
    try {
        if (!existsSync("./middleware.ts")) {
            // 미들웨어 파일 없으면 그냥 다음으로
            return next();
        }

        const middleware = await import("./middleware.ts");

        if (
            !middleware.Middleware ||
            !middleware.matches ||
            typeof middleware.Middleware !== "function" ||
            typeof middleware.matches !== "string"
        ) {
            logger.error("middleware.ts was corrupt. Check README.md");
            return res.status(500).send("middleware.ts was corrupt.");
        }

        const isMatch = wcmatch(middleware.matches);

        // 매치 안 되면 그냥 다음 라우트로 넘김
        if (!isMatch(req.path)) {
            return next();
        }

        // 매치되면 사용자 미들웨어 실행
        await middleware.Middleware(req, res, next);

        // 이미 응답이 나갔으면 로그만 찍고 끝
        if (res.headersSent || res.writableEnded) {
            const s = res.statusCode;
            logResponse(req.path, req.method, s);
            return;
        }

        return;
    } catch (err) {
        const e = err as Error;
        logger.error(e.message);
    }
});

const addRoutes = async (str: string) => {
    const routes = await fs.readdir(str, 'utf-8');

    for await (let route of routes) {
        const routePath = path.join(str, route);
        const isFile = (await fs.lstat(routePath)).isFile();

        if (!isFile) {
            await addRoutes(routePath);
            continue;
        }

        const pathName = path.basename(routePath, ".ts");
        const appRoute = path.normalize(
            path.join(
                routePath.replace(path.join(__dirname, "./routes"), ""),
                "..",
                pathName.replace("index", "").replace("...", ":")
            )
        ).replaceAll("\\", "/");

        app.use(appRoute, async (req, res) => {
            try {
                if (config.id && config.pw) {
                    if (!req.headers["authorization"]) {
                        if (config.browserLogin) return res.setHeader("WWW-Authenticate", `Basic realm="Check", charset="UTF-8"`)
                            .status(401)
                            .json({
                                "code": 401,
                                "message": "Unauthorized"
                            });

                        return res.status(401)
                            .json({
                                "code": 401,
                                "message": "Unauthorized"
                            });;
                    }

                    const [_, base64] = req.headers["authorization"].split(" ");
                    const [id, password] = atob(base64).split(":");

                    if (id !== config.id || password !== config.pw) return res.status(403).json({ "code": 403, "message": "Forbidden" });
                }

                const imported = (await import(path.join(
                    str, req.path
                )));
                const method = imported[req.method.toLocaleUpperCase()];

                if (!method) return res.status(405).json({ "code": 405, "message": "Method Not Allowed" });

                const r = await method(req, res);
                logResponse(req.originalUrl, req.method, r.statusCode);
            } catch (err: any) {
                const e = err as Error;
                if (e.message.includes("Cannot find module")) {
                    logResponse(req.originalUrl, req.method, 404);
                    res.status(404).json({
                        "code": 404,
                        "message": "Not Found"
                    });
                    return;
                }

                if (res.headersSent || res.writableEnded) {
                    const s = res.statusCode;
                    logResponse(req.originalUrl, req.method, s);
                    return;
                }
                logResponse(req.originalUrl, req.method, 500);
                res.status(500).json({
                    "code": 500,
                    "message": e.message
                });
                logger.error("An error occurred when serving " + appRoute);
                logger.error(e.message);
                return;
            }
        });
        logger.log(`Loaded ${appRoute}`);
    }
};

(async () => {
    logger.log("Loading schedules...");

    const schedules = await fs.readdir("./schedules", "utf-8");
    for await (const scheduleFile of schedules) {
        try {
            const schedule = await import(`./schedules/${scheduleFile}`);
            if (
                !schedule.Schedule ||
                !schedule.interval ||
                typeof schedule.Schedule !== "function" ||
                typeof schedule.interval !== "string"
            ) {
                logger.error("schedules/" + schedule + " was corrupt. Check README.md");
                return;
            }

            cron.schedule(schedule.interval, schedule.Schedule);
            logger.log("Scheduled schedules/" + scheduleFile);
            schedule.Schedule();
        } catch (err) {
            const e = err as Error;
            logger.error(`An error occurred when loading schedules/${scheduleFile}`);
            logger.error(e.message);
        }
    }

    //app.use((req, res) => res.status(404).json({ "code": 404, "message": "Not Found" }));

    logger.log("Loading routes...");

    await addRoutes(path.join(__dirname, "./routes"));

    app.listen(config.port, () => {
        logger.log("Server listening on port " + config.port);
        logger.log("- http://127.0.0.1:" + config.port);
    });
})();