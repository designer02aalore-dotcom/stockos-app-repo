import { NextRequest, NextResponse } from "@/lib/response";
import { fetchUnreadOrderEmails } from "@/lib/email/fetchEmails";

export async function GET(request: NextRequest) {
  // Verify cron secret if set
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await fetchUnreadOrderEmails({
      maxResults: 10,
      query: "is:unread",
      markAsRead: true,
    });

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      result,
    });
  } catch (err: any) {
    console.error("[Cron Poll Email] Error:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to poll emails" },
      { status: 500 }
    );
  }
}
