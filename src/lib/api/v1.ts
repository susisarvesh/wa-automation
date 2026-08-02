import { NextResponse } from "next/server";
import { ApiKeyError } from "@/lib/auth/api-keys";
import { SendMessageError } from "@/lib/whatsapp/send-message";

export function v1Ok<T>(data: T, status = 200) {
  return NextResponse.json({ data }, { status });
}

export function v1Error(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export function v1FromError(err: unknown) {
  if (err instanceof ApiKeyError) {
    return v1Error(err.code, err.message, err.status);
  }
  if (err instanceof SendMessageError) {
    return v1Error(err.code, err.message, err.status);
  }
  console.error("[api/v1]", err);
  return v1Error("server_error", "Internal server error", 500);
}
