import "server-only";

import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";

export type FaceVerificationMode = "check-in" | "check-out" | "break-in" | "break-out";

type FaceVerificationPayload = jwt.JwtPayload & {
  purpose?: string;
  mode?: FaceVerificationMode;
};

function getSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is required for face verification tokens");
  return secret;
}

export function createFaceVerificationToken(userId: string, mode: FaceVerificationMode) {
  return jwt.sign(
    { purpose: "face-verification", mode },
    getSecret(),
    {
      subject: userId,
      audience: "face-verification",
      expiresIn: "2m",
      jwtid: randomUUID(),
    },
  );
}

export function verifyFaceVerificationToken(
  token: unknown,
  userId: string,
  mode: FaceVerificationMode,
) {
  if (typeof token !== "string" || !token) return false;
  try {
    const payload = jwt.verify(token, getSecret(), {
      audience: "face-verification",
      subject: userId,
    }) as FaceVerificationPayload;
    return payload.purpose === "face-verification" && payload.mode === mode;
  } catch {
    return false;
  }
}
