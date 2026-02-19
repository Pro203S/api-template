import { IncomingMessage } from "http";
import Stream from "stream";
import { WebSocket } from "ws";

declare global {
    type InternalWebSocketFileStruct = {
        "Open"?: InternalWebSocketOpenHandler;
        "Connection"?: InternalWebSocketConnectionHandler;
        "Message"?: InternalWebSocketMessageHandler;
        "Error"?: InternalWebSocketErrorHandler;
        "Close"?: InternalWebSocketCloseHandler;
        "WsClientError"?: InternalWebSocketClientErrorHandler;
        "path": string;
    }

    type InternalWebSocketOpenHandler = (ws: WebSocket) => any;
    type InternalWebSocketConnectionHandler = (params: {
        "ws": WebSocket,
        "ip"?: string,
        "secWsKey"?: string
    }) => any;
    type InternalWebSocketMessageHandler = (params: {
        "ws": WebSocket,
        "data": Buffer | string,
        "send"?: (data: any) => any,
    }) => any;
    type InternalWebSocketErrorHandler = (err: Error) => any;
    type InternalWebSocketCloseHandler = (params: {
        "code": number,
        "reason": string
    }) => any;
    type InternalWebSocketClientErrorHandler = (params: {
        "err": Error,
        "socket": Stream.Duplex,
        "req": IncomingMessage
    }) => any;

    interface ServerConfig {
        name: string;
        port: number;

        id?: string;
        pw?: string;
        browserLogin?: boolean;

        /**
         * 현재 디렉토리의 상대 경로
         */
        staticPath?: string;
        expressSettings?: { [key: string]: any };
    }
}

export { };