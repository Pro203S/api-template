declare global {
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