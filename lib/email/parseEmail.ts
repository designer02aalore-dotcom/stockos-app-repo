import type { gmail_v1 } from "googleapis";

export interface EmailAttachment {
  filename: string;
  mimeType: string;
  attachmentId?: string;
  size: number;
}

export interface ParsedEmailMessage {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  fromName: string;
  fromEmail: string;
  date: string;
  bodyText: string;
  bodyHtml?: string;
  snippet?: string;
  attachments: EmailAttachment[];
}

export function isAutomatedOrNonOrderEmail(from: string, subject: string): boolean {
  const f = (from || "").toLowerCase();
  const s = (subject || "").toLowerCase();

  const botSenders = [
    "noreply", "no-reply", "notification", "notifications", "marketing", "updates",
    "newsletter", "mailer-daemon", "support@", "welcome@", "changelog",
    "redditmail.com", "engage.canva.com", "canva.com", "docker.com", "lovable.dev",
    "supabase.com", "neon.tech", "openrouter.ai", "contact.elevenlabs.io", "tm.openai.com",
    "googleplay-noreply", "googleone-noreply", "accounts.google.com"
  ];
  if (botSenders.some((b) => f.includes(b))) return true;

  const nonOrderSubjects = [
    "reminder about", "we are investigating", "has been paused", "going to be paused",
    "welcome to", "getting started", "security alert", "sign-in attempt", "terms and policies",
    "changelog", "try gemini", "meet manus", "meet your", "chatgpt -", "annual creative report",
    "deprecat", "quarterly reminder", "teachers day", "invitation", "invoice paid", "payment receipt",
    "statement of account", "password reset", "verification code", "verify your email"
  ];
  if (nonOrderSubjects.some((p) => s.includes(p))) return true;

  return false;
}

function decodeBase64Url(data?: string | null): string {
  if (!data) return "";
  try {
    return Buffer.from(data, "base64url").toString("utf-8");
  } catch {
    try {
      return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8");
    } catch {
      return "";
    }
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<br\s*[\/]?>/gi, "\n")
    .replace(/<\/tr>/gi, "\n")
    .replace(/<\/td>/gi, "\t")
    .replace(/<\/div>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n\s*\n\s*\n/g, "\n\n")
    .trim();
}

function parseSender(fromHeader: string): { name: string; email: string } {
  if (!fromHeader) return { name: "", email: "" };

  const match = fromHeader.match(/^(?:['"]?([^'"]*)['"]?\s*)?<([^>]+)>/);
  if (match) {
    const name = match[1]?.trim() || "";
    const email = match[2]?.trim() || "";
    return { name, email };
  }

  // Fallback: if no brackets, might just be email or name
  if (fromHeader.includes("@")) {
    return { name: "", email: fromHeader.trim() };
  }

  return { name: fromHeader.trim(), email: "" };
}

export function parseGmailMessage(message: gmail_v1.Schema$Message): ParsedEmailMessage {
  const id = message.id || "";
  const threadId = message.threadId || "";

  const headers = message.payload?.headers || [];
  let subject = "";
  let from = "";
  let date = "";

  for (const h of headers) {
    const name = h.name?.toLowerCase();
    if (name === "subject") subject = h.value || "";
    else if (name === "from") from = h.value || "";
    else if (name === "date") date = h.value || "";
  }

  const { name: fromName, email: fromEmail } = parseSender(from);

  let plainText = "";
  let htmlText = "";
  const attachments: EmailAttachment[] = [];

  function traversePart(part?: gmail_v1.Schema$MessagePart) {
    if (!part) return;

    if (part.filename && part.body?.attachmentId) {
      attachments.push({
        filename: part.filename,
        mimeType: part.mimeType || "application/octet-stream",
        attachmentId: part.body.attachmentId,
        size: part.body.size || 0,
      });
    } else {
      const mime = part.mimeType?.toLowerCase();
      if (mime === "text/plain") {
        plainText += decodeBase64Url(part.body?.data) + "\n";
      } else if (mime === "text/html") {
        htmlText += decodeBase64Url(part.body?.data) + "\n";
      }
    }

    if (part.parts && Array.isArray(part.parts)) {
      for (const child of part.parts) {
        traversePart(child);
      }
    }
  }

  traversePart(message.payload);

  // If payload body directly had text
  if (!plainText && !htmlText && message.payload?.body?.data) {
    plainText = decodeBase64Url(message.payload.body.data);
  }

  const bodyText = plainText.trim() ? plainText.trim() : stripHtml(htmlText);

  return {
    id,
    threadId,
    subject,
    from,
    fromName,
    fromEmail,
    date,
    bodyText,
    attachments,
  };
}
