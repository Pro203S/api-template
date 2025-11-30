import { NextFunction, Request, Response } from "express";

export async function Middleware(req: Request, res: Response, next: NextFunction) {
    next();
}

export const matches = "/*";