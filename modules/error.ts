import { Response } from "express";
import { STATUS_CODES } from "http";

export default function ApiError(res: Response, status: number, msg?: string) {
    let message = msg;
    if (!message) {
        message = STATUS_CODES[String(status)];
        if (!message) {
            throw new Error("msg가 null입니다. (fallback을 찾을 수 없습니다.)");
        }
    }
    return res.status(status).json({
        "code": status,
        message
    });
}