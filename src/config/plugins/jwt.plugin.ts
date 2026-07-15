import jwt from "jsonwebtoken";
import { envs } from "./envs.plugin";

const SESSION_TOKEN_DURATION_SECONDS = 60 * 60 * 24 * 2;

export class JwtPlugin {
    private static getSeed() {
        if (!envs.JWT_SEED) {
            throw new Error("JWT_SEED is required to use JwtPlugin.");
        }

        return envs.JWT_SEED;
    }

    static async generateToken(
        payload: any,
        duration: number = SESSION_TOKEN_DURATION_SECONDS,
    ) {
        return new Promise((resolve) => {
            jwt.sign(payload, this.getSeed(), { expiresIn: duration }, (err, token) => {
                if (err) return resolve(null);
                resolve(token);
            });
        });
    }

    static validateToken(token: string) {
        return new Promise((resolve) => {
            jwt.verify(token, this.getSeed(), (err, decoded) => {
                if (err) return resolve(null);
                resolve(decoded);
            });
        });
    }
}
