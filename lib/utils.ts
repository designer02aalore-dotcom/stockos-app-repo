import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Formats a numeric amount in Indian Rupee (INR) format (e.g., ₹1,23,456.00)
 */
export function formatINR(amount: number | null | undefined): string {
  const val = typeof amount === "number" && !isNaN(amount) ? amount : 0;
  return `₹${val.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}