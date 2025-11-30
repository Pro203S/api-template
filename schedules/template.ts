import Logger from "../modules/logger";

export async function Schedule() {
    new Logger("Schedule").log("Schedule");
}

// https://github.com/node-cron/node-cron#cron-syntax
export const interval = "* 5 * * * *";