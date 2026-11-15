import { STATUS_CODES } from "node:http";

export default function ApiError(set: Pick<Req["set"], "status">, status: number, msg?: string) {
    let message = msg;
    if (!message) {
        message = STATUS_CODES[String(status)];
        if (!message) {
            throw new Error("msg가 null입니다. (fallback을 찾을 수 없습니다.)");
        }
    }
    set.status = status;
    return {
        "code": status,
        message
    };
}
