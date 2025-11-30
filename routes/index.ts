import { Request, Response } from "express";

export async function GET(req: Request, res: Response) {
    return res.status(200).send("Hello World!");
}