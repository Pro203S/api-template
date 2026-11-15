# API

개인용 Elysia + Bun API 템플릿입니다. 파일 기반 라우팅, dotenv, Basic 인증, 정적 파일 제공, 스케줄, 미들웨어를 지원합니다.

## 시작하기

[Bun](https://bun.sh)이 필요합니다.

```sh
git clone https://github.com/Pro203S/api-template apiname
cd apiname
bun install
bun run start
```

개발 서버는 `bun run dev`로 실행합니다. TypeScript 파일 변경 시 서버를 재시작하며 dotenv 디버그 로그를 활성화합니다.

```sh
bun test
bun run typecheck
```

## config.ts

```ts
interface ServerConfig {
    name: string;
    port: number;
    id?: string;
    pw?: string;
    browserLogin?: boolean;
    staticPath?: string;
    bypassAuthorize?: string[];
}
```

| 설정 | 설명 |
| --- | --- |
| name | 로그에 표시할 서버 이름 |
| port | 서버 포트 |
| id, pw | 둘 다 설정하면 API 라우트에 Basic 인증 적용 |
| browserLogin | 인증 헤더가 없을 때 브라우저 로그인용 WWW-Authenticate 헤더 반환 |
| staticPath | 프로젝트 디렉토리 기준 정적 파일 폴더. URL의 `/` 아래에 공개 |
| bypassAuthorize | 인증을 생략할 라우트 경로 목록. 기본값은 빈 목록 |

인증 헤더가 없으면 401, 형식이 잘못되었거나 인증 정보가 틀리면 403을 반환합니다. 비밀번호에 `:`를 포함할 수 있습니다.
`bypassAuthorize`에는 `/items/:id`처럼 등록된 라우트 경로를 지정합니다. 정적 파일은 API 인증 없이 공개됩니다.

## API 라우트

`routes` 폴더의 TypeScript 파일을 재귀적으로 불러옵니다.

```text
routes/
├── index.ts          → /
├── route.ts          → /route
└── items/
    ├── index.ts      → /items
    └── $id.ts        → /items/:id
```

`GET`, `POST`, `PUT`, `DELETE`, `PATCH`, `HEAD`, `OPTIONS` 함수를 export합니다. `.d.ts`, `.test.ts`, `.spec.ts` 파일은 라우트로 불러오지 않습니다.

핸들러는 `req: Req`를 받고 응답할 값을 반환합니다. 객체는 JSON으로 변환됩니다. `Req`는 `declaration.d.ts`에 선언된 전역 타입으로, Elysia의 요청 컨텍스트를 확장하며 별도 import 없이 사용할 수 있습니다. 공용 쿠키 타입도 이 선언에서 확장할 수 있습니다.

```ts
export function GET(req: Req) {
    return { id: req.params.id, search: req.query.search };
}

export async function POST(req: Req) {
    req.set.status = 201;
    return { created: req.body };
}
```

요청은 `req.request`, 파싱된 본문은 `req.body`, 경로 파라미터는 `req.params`, 쿼리는 `req.query`, 헤더는 `req.headers`로 접근합니다.
응답 상태와 헤더는 `req.set.status`, `req.set.headers`로 설정합니다. `Response`를 직접 반환할 수도 있습니다.

### 오류 응답

```ts
import ApiError from "../modules/error.ts";

export function GET(req: Req) {
    return ApiError(req.set, 400, "잘못된 요청입니다.");
}
```

오류 형식은 `{ code: number, message: string }`입니다. 처리되지 않은 예외는 500, 존재하지 않는 경로는 404, 본문 파싱 오류는 400을 반환합니다.

## 미들웨어

프로젝트 루트에 `middleware.ts`를 만들고 `Middleware` 함수와 `matches` 문자열을 export합니다.

```ts
export async function Middleware(req: Req) {
    if (req.query.block) {
        req.set.status = 403;
        return { code: 403, message: "Forbidden" };
    }
    req.set.headers["x-api"] = "template";
}

export const matches = "/items/*";
```

`matches`는 wildcard 패턴입니다. 미들웨어는 본문 파싱 후, 라우트 인증 및 핸들러 실행 전에 동작합니다.
응답 값을 반환하면 처리를 종료하고, 아무 값도 반환하지 않으면 다음 단계로 진행합니다. `next()` 호출은 필요하지 않습니다.
미들웨어 모듈은 서버 시작 시 불러오며 변경 사항은 재시작 후 적용됩니다.

## 스케줄

`schedules` 폴더의 TypeScript 파일에서 `Schedule` 함수와 `interval` 문자열을 export합니다.

```ts
import Logger from "../modules/logger.ts";

export async function Schedule() {
    new Logger("Schedule").log("Schedule");
}

export const interval = "* 5 * * * *";
```

서버 시작 시 한 번 실행한 후 [node-cron 문법](https://github.com/node-cron/node-cron#cron-syntax)에 따라 반복합니다.
