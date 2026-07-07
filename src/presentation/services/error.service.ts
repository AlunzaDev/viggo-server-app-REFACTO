import { Response } from "express";
import { CustomError } from "../../domain/errors/custom.error";

export class ErrorService {
    static handleApiError(error: unknown, res: Response) {
        const customError = CustomError.fromUnknown(error);

        return res.status(customError.statusCode).json({
            error: customError.message,
            code: customError.code,
            details: customError.details,
        });
    }
}
