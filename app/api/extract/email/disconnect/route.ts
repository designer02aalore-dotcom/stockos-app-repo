import { NextResponse } from "@/lib/response";
import { disconnectGmail } from "@/lib/email/gmailClient";

export async function POST() {
  try {
    await disconnectGmail();
    return NextResponse.json({ success: true, message: "Gmail disconnected successfully" });
  } catch (err: any) {
    console.error("[Email Disconnect API] Error:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to disconnect Gmail" },
      { status: 500 }
    );
  }
}
