# API

- 개인용 Express.js API 템플릿
- dotenv 내장

## 시작하기

1. `git clone https://github.com/Pro203S/api-template`로 이 레포지토리를 복사합니다.
2. `npm i --save`로 필요한 모듈을 설치합니다.
3. `npm run start`로 서버를 실행하거나 `npm run dev`로 개발 서버를 실행합니다.

`개발 서버랑 프로덕션 서버의 차이점은 express의 etag 활성화 여부, dotenv debug 활성화 여부가 있습니다. 사실 별로 없어요`

## config.ts 수정

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

config.ts는 서버 환경설정 파일입니다.  
아래의 설정을 할 수 있습니다.  

|설정 이름|타입|설명|
|--------|--------|--------|
|name|string|서버의 이름입니다.|
|port|number|서버의 포트입니다.|
|id|string?|API 서버에 요청을 보낼 때 필요한 ID입니다.|
|pw|string?|API 서버에 요청을 보낼 때 필요한 비밀번호입니다.|
|browserLogin|boolean?|API 서버에 브라우저로 요청을 보낼 때 로그인 팝업을 띄울 지 여부입니다.|
|staticPath|string?|정적으로 보낼 폴더입니다. (상대 경로)|
|expressSettings|{ [key: string]: any }|Express.js의 설정입니다.|

id와 pw가 설정되어있으면 API로 요청을 보낼 때 Basic Authorization 헤더를 보내야 합니다.  
id 또는 pw가 맞지 않으면 403을 반환합니다.  
Authorization 헤더가 제공되지 않으면 401을 반환합니다.  
browserLogin이 true일 때 WWW-Authenticate 헤더를 반환합니다.  
browserLogin이 false일 때 아무 헤더도 반환하지 않습니다.  

## API 루트 생성

routes 디렉토리에 TypeScript 파일을 만들거나 폴더를 만들어 API 루트를 생성합니다.
```
routes/
├── index.ts
├── route.ts
└── folder/
    └── ...path.ts
```

생성되는 API 루트는 다음과 같습니다.  
- index.ts -> /
- route.ts -> /route.ts
- folder/...path.ts -> /folder/:path

`! Dynamic Route는 ...name.ts로 생성할 수 있으며 이 경우엔 req.params.name으로 불러올 수 있습니다.`

API 루트의 예시 코드  
```typescript
import { Request, Response } from "express";

export function GET(req: Request, res: Response) {
    return res.status(200).send("Hello GET!");
}

export async function POST(req: Request, res: Response) {
    return res.status(200).send("Hello POST!");
}
```

API 루트는 메서드 이름을 export해야 합니다. (export 하지 않으면 405 오류 발생)  
export되는 메서드는 Promise 타입을 반환할 수 있습니다.  

## Schedules

API에서 일정 주기마다 실행될 함수입니다.  

예시 폴더 구조  
```
schedules/
└── template.ts
```

예시 코드  
```typescript
import Logger from "../modules/logger";

export async function Schedule() {
    new Logger("Schedule").log("Schedule");
}

// https://github.com/node-cron/node-cron#cron-syntax
export const interval = "* 5 * * * *";
```

export되는 요소는 항상 Schedule과 interval이여야 하며,  
Schedule은 function, interval은 string이여야 합니다.  

interval의 작성법은 [node-cron 문법](https://github.com/node-cron/node-cron#cron-syntax)을 참고하세요.

`! 서버가 실행될때 한 번 실행되고 그 후 interval 간격으로 실행됩니다.`

## 미들웨어

middleware.ts는 API의 루트에 있어야 합니다.  
예시 폴더 구조
```
./
└── middleware.ts
```

예시 코드  
```typescript
import { NextFunction, Request, Response } from "express";

export async function Middleware(req: Request, res: Response, next: NextFunction) {
    next();
}

export const matches = "/*";
```

middleware.ts는 항상 Middleware와 matches를 export해야하며,  
Middleware는 function, matches는 string이여야합니다.  

matches는 wildcard가 될 수 있습니다.  
