import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import { Toaster } from "react-hot-toast";

export const metadata: Metadata = {
  title: "AI Pulse - Content Engine",
  description: "Discover funded AI startups and generate content scripts.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body className="antialiased bg-gray-50">
        <Toaster position="top-right" toastOptions={{ style: { background: "#fff", color: "#1a1a2e", border: "1px solid #e5e7eb", fontSize: "13px" } }} />
        <Sidebar />
        <main className="ml-60 min-h-screen bg-gray-50">{children}</main>
      </body>
    </html>
  );
}
