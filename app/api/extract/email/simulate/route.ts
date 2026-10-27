import { NextRequest, NextResponse } from "@/lib/response";
import { processEmailOrderText } from "@/lib/email/fetchEmails";
import { classifyOrderEmail } from "@/lib/email/classifyOrderEmail";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const subject = body.subject?.trim() || "Purchase Order via Email";
    const fromName = body.fromName?.trim() || "Olive Kids School";
    const fromEmail = body.fromEmail?.trim() || "orders@olivekids.edu.in";
    const emailBody = body.bodyText?.trim();

    if (!emailBody) {
      return NextResponse.json(
        { error: "Email body text is required" },
        { status: 400 }
      );
    }

    // 1. Run Multi-Signal + AI Classification
    const fakeParsed = {
      id: "sim-" + crypto.randomUUID(),
      threadId: "sim-thread-" + crypto.randomUUID(),
      subject,
      from: fromName ? `${fromName} <${fromEmail}>` : fromEmail,
      fromName,
      fromEmail,
      date: new Date().toISOString(),
      bodyText: emailBody,
      bodyHtml: "",
      snippet: emailBody.slice(0, 150),
      attachments: [],
    };

    const classification = await classifyOrderEmail(fakeParsed);

    if (!classification.isOrder) {
      return NextResponse.json(
        {
          success: false,
          category: classification.category,
          confidence: classification.confidence,
          reason: classification.explanation,
          signals: classification.signals,
          error: `Non-order email (${classification.category}): ${classification.explanation}`,
        },
        { status: 422 }
      );
    }

    const result = await processEmailOrderText({
      subject,
      fromName,
      fromEmail,
      date: new Date().toISOString(),
      bodyText: emailBody,
      classification,
    });

    if (!result) {
      return NextResponse.json(
        {
          success: false,
          category: classification.category,
          error: "No valid purchase order line items could be detected in this email.",
        },
        { status: 422 }
      );
    }

    return NextResponse.json({
      success: true,
      importId: result.importId,
      extracted: result.extracted,
      classification,
    });
  } catch (err: any) {
    console.error("[Email Simulate API] Error:", err);
    return NextResponse.json(
      {
        error: err.message || "Failed to process simulated email order",
      },
      { status: 500 }
    );
  }
}
