import type { ReactNode } from "react";
import {
  Outlet,
  createRootRoute,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import "@/app/globals.css";
import { GlobalAutoScanner } from "@/components/email/GlobalAutoScanner";
import { OrderEmailNotificationPrompt } from "@/components/email/OrderEmailNotificationPrompt";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "StockOS Sales Order AI" },
      {
        name: "description",
        content: "Create sales orders from images and emails using AI",
      },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "icon", type: "image/x-icon", href: "/favicon.ico" },
      { rel: "apple-touch-icon", href: "/favicon.svg" },
    ],
  }),
  component: RootComponent,
  notFoundComponent: () => (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6">
      <h2 className="text-2xl font-bold text-slate-800 mb-2">Page Not Found</h2>
      <p className="text-slate-500 mb-4">The requested page or resource could not be found.</p>
      <a
        href="/"
        className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 transition"
      >
        Return to Dashboard
      </a>
    </div>
  ),
});

function RootComponent() {
  return (
    <RootDocument>
      <Outlet />
      <GlobalAutoScanner />
      <OrderEmailNotificationPrompt />
    </RootDocument>
  );
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body className="min-h-screen bg-gray-50">
        {children}
        <Scripts />
      </body>
    </html>
  );
}
