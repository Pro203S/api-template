import type { Context } from "elysia";

declare global {
    namespace NodeJS {
        // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- 환경 변수 타입을 추가할 확장 지점입니다.
        interface ProcessEnv {
            // readonly STRING: string;
        }
    }

    type Req = Context & {
        // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- 공용 쿠키 타입을 추가할 확장 지점입니다.
        "cookie": {
            /* 여기에 쿠키 등록 */
        };
    };
}

export { };
