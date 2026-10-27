import { NextRequest, NextResponse } from "@/lib/response";
import { getOAuth2Client } from "@/lib/email/gmailClient";

export async function GET(request: NextRequest) {
  try {
    const oauth2Client = await getOAuth2Client();

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: [
        "https://www.googleapis.com/auth/gmail.readonly",
        "https://www.googleapis.com/auth/gmail.modify",
        "https://www.googleapis.com/auth/userinfo.email",
      ],
    });

    return NextResponse.redirect(authUrl);
  } catch (err: any) {
    console.error("[Email OAuth Start] Error:", err);
    return NextResponse.redirect(
      new URL(`/inbox?error=${encodeURIComponent(err.message || "Failed to initialize Google OAuth")}`, request.url)
    );
  }
}
