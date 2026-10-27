import { NextResponse } from "@/lib/response";

export async function GET() {
  return NextResponse.json({ status: "ok" });
}
