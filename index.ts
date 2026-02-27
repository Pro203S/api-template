console.log("Booting...");

import express from 'express';
import * as fs from 'fs/promises';
import * as path from 'path';
import dotenv from 'dotenv';
import wcmatch from 'wildcard-match';
import config from './config.ts';
import Logger from './modules/logger.ts';
import { existsSync } from 'fs';
import cron from 'node-cron';
import us from 'microseconds';
import { RawData, WebSocketServer } from 'ws';
import { createServer } from 'net';
import { internalIpV4 } from 'internal-ip';
import ApiError from './modules/error.ts';

const IS_DEV = process.argv[2] === "--dev";

dotenv.config({
    "debug": IS_DEV,
    "quiet": !IS_DEV
});

const app = express();
app.use(express.json());
app.use(express.text());
app.use(express.urlencoded({ "extended": true }));

const logger = new Logger("API");
logger.log(`Starting ${config.name.cyan}...`);

//#region 내부 함수들
function isPortInUse(port: number): Promise<boolean> {
    return new Promise((resolve) => {
        const tester = createServer()
            .once('error', (err: any) => {
                if (err.code === 'EADDRINUSE') {
                    resolve(true); // 포트 사용 중
                } else {
                    resolve(false); // 다른 에러는 사용 가능으로 취급
                }
            })
            .once('listening', () => {
                tester.close(() => resolve(false)); // 사용 가능
            })
            .listen(port);
    });
}

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

function rawDataToBuffer(data: RawData): Buffer {
    if (Buffer.isBuffer(data)) {
        return data;
    }

    if (Array.isArray(data)) {
        // ws가 fragment를 Buffer[]로 주는 경우
        return Buffer.concat(data);
    }

    if (data instanceof ArrayBuffer) {
        return Buffer.from(data);
    }

    if (typeof data === "string") {
        return Buffer.from(data, "utf-8");
    }

    // 타입상 도달 불가하지만 안전장치
    throw new TypeError("Unsupported WebSocket RawData type");
}

const parseUs = (us: number) => {
    if (us >= 1000000) {
        return Math.round(us / 1000000) + "s";
    }

    if (us >= 1000) {
        return Math.round(us / 1000) + "ms";
    }

    return Math.round(us) + "μs";
}

const logResponse = (path: string, method: string, status: number, time: string) => logger.log(`${method} ${path} ${coloringStatus(status)} ` + time.gray);
//#endregion

app.use(async (req, res, next) => {
    try {
        if (!existsSync("./middleware.ts")) {
            // 미들웨어 파일 없으면 그냥 다음으로
            return next();
        }

        //@ts-ignore
        const middleware: any = await import("./middleware.ts");

        if (
            typeof middleware.Middleware !== "function" ||
            typeof middleware.matches !== "string"
        ) {
            logger.error("middleware.ts was corrupt. Check README.md");
            return ApiError(res, 500, "middleware.ts was corrupt.");
        }

        const isMatch = wcmatch(middleware.matches);

        // 매치 안 되면 그냥 다음 라우트로 넘김
        if (!isMatch(req.path)) {
            return next();
        }

        const date = us.now();
        // 매치되면 사용자 미들웨어 실행
        await middleware.Middleware(req, res, next);

        // 이미 응답이 나갔으면 로그만 찍고 끝
        if (res.headersSent || res.writableEnded) {
            const s = res.statusCode;
            logResponse(req.path, req.method, s, `[${parseUs(us.now() - date)}]`);
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
                pathName.replace("index", "").replace("$", ":")
            )
        ).replaceAll("\\", "/");

        const imported = (await import(path.join(
            str, pathName
        )));

        const methods = Object.keys(imported);
        const availableMethods: string[] = [];

        for (const method of methods) {
            const m = method.toLocaleLowerCase();
            if (
                m !== "get" &&
                m !== "post" &&
                m !== "put" &&
                m !== "delete"
            ) continue;

            const callback: (...params: any[]) => any = imported[method];
            availableMethods.push(m);

            app[m](appRoute, async (req, res) => {
                const date = us.now();
                try {
                    if (
                        (config.id && config.pw) &&
                        (config.bypassAuthorize && !config.bypassAuthorize.includes(appRoute))
                    ) {
                        if (!req.headers["authorization"]) {
                            if (config.browserLogin) return res.setHeader("WWW-Authenticate", `Basic realm="Check", charset="UTF-8"`)
                                .status(401)
                                .json({
                                    "code": 401,
                                    "message": "Unauthorized"
                                });

                            logResponse(req.originalUrl, req.method, 401, `[${parseUs(us.now() - date)}]`);
                            return ApiError(res, 401);
                        }

                        const [_, base64] = req.headers["authorization"].split(" ");
                        const [id, password] = atob(base64).split(":");

                        if (id !== config.id || password !== config.pw) {
                            logResponse(req.originalUrl, req.method, 403, `[${parseUs(us.now() - date)}]`);
                            return ApiError(res, 403);
                        }
                    }

                    const r = await callback(req, res);
                    logResponse(req.originalUrl, req.method, r.statusCode, `[${parseUs(us.now() - date)}]`);
                } catch (err: any) {
                    const e = err as Error;
                    if (e.message.includes("Cannot find module")) {
                        logResponse(req.originalUrl, req.method, 404, `[${parseUs(us.now() - date)}]`);
                        return ApiError(res, 404);
                    }

                    if (res.headersSent || res.writableEnded) {
                        const s = res.statusCode;
                        logResponse(req.originalUrl, req.method, s, `[${parseUs(us.now() - date)}]`);
                        return;
                    }
                    logResponse(req.originalUrl, req.method, 500, `[${parseUs(us.now() - date)}]`);
                    ApiError(res, 500, e.message);
                    logger.error("An error occurred when serving " + appRoute);
                    logger.error(e.message);
                    return;
                }
            });
        }
        logger.log(`Loaded ${appRoute} ${`[${availableMethods.map(v => v.toLocaleUpperCase()).join(", ")}]`.gray}`);
    }
};

(async () => {
    //#region 초기 설정
    if (await isPortInUse(config.port)) {
        logger.error("This port is in use: " + config.port.toString().red);
        process.exit(1);
    }

    if (config.staticPath) {
        logger.log("Static path set to: " + path.join(__dirname, config.staticPath).toString().yellow);
        app.use(express.static(path.join(__dirname, config.staticPath)));
    }

    if (config.expressSettings) {
        const keys = Object.keys(config.expressSettings);
        for (const key of keys) {
            const value = config.expressSettings[key];
            app.set(key, value);

            logger.log(`Set ${key.green} to ${String(value).green}`);
        }

        if (IS_DEV) {
            app.set("etag", false);
            logger.log(`Set ${"etag".green} to ${"false".green}`);
        }
    }
    //#endregion

    //#region 스케쥴
    logger.log("Loading schedules...");

    if (existsSync("./schedules")) {
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
                logger.log("Scheduled " + ("schedules/" + scheduleFile).green);
                schedule.Schedule();
            } catch (err) {
                const e = err as Error;
                logger.error(`An error occurred when loading schedules/${scheduleFile}`);
                logger.error(e.message);
            }
        }
    } else {
        logger.warn("schedules directory not found!");
    }
    //#endregion

    //#region 루트
    logger.log("Loading routes...");

    await addRoutes(path.join(__dirname, "./routes"));
    //#endregion

    const svr = app.listen(config.port, async () => {
        logger.log("Server listening on port " + config.port.toString().green);
        logger.log("- http://127.0.0.1:" + config.port);
        logger.log("- http://" + await internalIpV4() + ":" + config.port);
    });

    //#region 웹소켓
    const wss = new WebSocketServer({ "noServer": true });

    const isSocketAvailable = existsSync("./websocket.ts");
    let isocket: InternalWebSocketFileStruct;
    if (isSocketAvailable)
        //@ts-ignore
        isocket = await import("./websocket.ts");

    svr.on("upgrade", async (req, socket, head) => {
        if (!isSocketAvailable) {
            logger.error("websocket.ts doesn't exist.");
            socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
            socket.destroy();
            return;
        }

        //@ts-ignore
        const isocket: InternalWebSocketFileStruct = await import("./websocket.ts");

        if (
            ("Open" in isocket && typeof isocket.Open !== "function") ||
            ("Connection" in isocket && typeof isocket.Connection !== "function") ||
            ("Message" in isocket && typeof isocket.Message !== "function") ||
            ("Error" in isocket && typeof isocket.Error !== "function") ||
            ("Close" in isocket && typeof isocket.Close !== "function") ||
            typeof isocket.path !== "string"
        ) {
            logger.error("websocket.ts was corrupt. Check README.md");
            socket.write("HTTP/1.1 500 Internal Server Error\r\n\r\n");
            socket.destroy();
            return;
        }

        const { url } = req;
        if (!url?.startsWith(isocket.path)) {
            socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
            socket.destroy();
            return;
        }

        if (config.id && config.pw) {
            if (!req.headers["authorization"]) {
                logger.error(`GET ${isocket.path} ${coloringStatus(401)}`);
                socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
                socket.destroy();
                return;
            }

            const [_, base64] = req.headers["authorization"].split(" ");
            const [id, password] = atob(base64).split(":");

            if (id !== config.id || password !== config.pw) {
                logger.error(`GET ${isocket.path} ${coloringStatus(403)}`);
                socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
                socket.destroy();
                return;
            }
        }

        wss.handleUpgrade(req, socket, head, (ws) => {
            logger.log(`GET ${isocket.path} ${coloringStatus(101)}`);
            wss.emit('connection', ws, req);
        });
    });

    wss.on("connection", async (ws, req) => {
        const ip = (req.headers["x-forwarded-for"] || req.socket.remoteAddress) as string;
        const secWsKey = req.headers["sec-websocket-key"];

        isocket.Connection?.({
            ws,
            secWsKey,
            ip
        });

        ws.on("open", () => {
            isocket.Open?.(ws);
        });

        ws.on("close", (code, reason) => {
            isocket.Close?.({
                code,
                "reason": Buffer.from(reason).toString("utf-8")
            });
        });

        ws.on("message", (data) => {
            isocket.Message?.({
                ws,
                "data": rawDataToBuffer(data),
                "send": (data) => {
                    if (typeof data === "object") {
                        ws.send(JSON.stringify(data), (err) => {
                            if (!err) return;
                            isocket.Error?.(err);
                        });
                        return;
                    }

                    ws.send(data, (err) => {
                        if (!err) return;
                        isocket.Error?.(err);
                    });
                }
            })
        });

        ws.on("error", (error) => {
            isocket.Error?.(error);
        });
    });

    wss.on("wsClientError", (err, socket, req) => {
        isocket.WsClientError?.({
            err,
            socket,
            req
        });
    });
    //#endregion
})();
