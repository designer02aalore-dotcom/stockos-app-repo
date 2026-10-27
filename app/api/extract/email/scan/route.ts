import { NextRequest, NextResponse } from "@/lib/response";
import { fetchUnreadOrderEmails } from "@/lib/email/fetchEmails";
import { logGmailApiError } from "@/lib/email/gmailClient";

export async function POST(request: NextRequest) {
  try {
    let body: any = {};
    try {
      body = await request.json();
    } catch {
      // empty body is fine
    }

    const maxResults = typeof body.maxResults === "number" ? body.maxResults : 10;
    const query = typeof body.query === "string" ? body.query : "is:unread";

    const scanResult = await fetchUnreadOrderEmails({
      maxResults,
      query,
      markAsRead: body.markAsRead !== false,
    });

    return NextResponse.json(scanResult);
  } catch (err: any) {
    logGmailApiError("[Email Scan API: POST /api/extract/email/scan]", err);
    const isInvalidGrant = Boolean(err.message?.includes("invalid_grant"));
    return NextResponse.json(
      {
        success: false,
        error: isInvalidGrant
          ? "Gmail API error: invalid_grant (Your Gmail refresh token has expired or was revoked. Please reconnect your Gmail account at /inbox)."
          : (err.message || "Failed to scan emails"),
        invalidGrant: isInvalidGrant,
      },
      { status: isInvalidGrant ? 401 : 500 }
    );
  }
}

