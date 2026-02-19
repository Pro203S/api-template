import { Request, Response } from "express";

export async function GET(req: Request, res: Response) {
    try {
        return res.status(200).send("Hello World!");
    } catch (err) {
        const e = err as Error;
        return res.status(500).json({
            "code": 500,
            "message": e.message
        });
    }
}