import axios, { AxiosRequestConfig } from 'axios';
import Logger from './logger';

export type RequesterConfig<D = any> = AxiosRequestConfig<D> & Omit<{
    "url": string;
    /**
     * 기본값 true
     */
    "handle429"?: boolean;
    "isSuccess"?: (status: number, body: any) => boolean;
}, "validateStatus">;
export type RequesterSuccessResponse<T = any> = RequesterBaseResponse<T, true>;
export type RequesterErrorResponse<T = any> = RequesterBaseResponse<T, false>;

export interface RequesterBaseResponse<T = any, Success = boolean> {
    "status": number;
    "data": T;
    "success": Success;
}

export type RequesterResponse<S = any, E = any> = RequesterSuccessResponse<S> | RequesterErrorResponse<E>;

/**
 * 429 처리가 되는 axios
 * @param config 
 */
export async function Request<SuccessBody = any, ErrBody = any, D = any>(config: RequesterConfig<D>): Promise<RequesterResponse<SuccessBody, ErrBody>> {
    const logger = new Logger("Requester");

    let params = new URLSearchParams(config.params).toString();

    logger.log("Requesting to " +
        config.url
        + "?" + params);
    const r = await axios({
        ...config,
        "validateStatus": () => true
    });
    const status = r.status;
    const firstStatus = Math.floor(status / 100);
    if ((firstStatus !== 2) || (config.isSuccess && !(config.isSuccess(status, r.data)))) {
        if (status === 429 && (config.handle429 ?? true)) {
            const retry_after = (r.data["retry_after"] * 1000) + 100;
            await new Promise((v) => setTimeout(v, retry_after));
            return Request<SuccessBody, ErrBody, D>(config);
        }

        return {
            status,
            "data": r.data,
            "success": false
        };
    }

    return {
        status,
        "data": r.data,
        "success": true
    };
}