export function GET(req: Req) {
    req.set.status = 200;
    return "Hello World!";
}
