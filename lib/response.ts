/**
 * Universal Response/Request adapter for TanStack Start server routes
 */
export const NextResponse = {
  json: (data: any, init?: ResponseInit) => Response.json(data, init),
  redirect: (url: string | URL, status: number = 307) => Response.redirect(url, status),
};

export type NextRequest = Request;
export default NextResponse;
