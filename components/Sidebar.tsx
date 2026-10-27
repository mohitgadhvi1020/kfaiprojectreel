"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Rocket, Database, Settings, Zap, BookOpen, Radio, Film } from "lucide-react";

const navItems = [
  { href: "/", label: "Content Pipeline", icon: LayoutDashboard },
  { href: "/runs", label: "Discoveries", icon: Rocket },
  { href: "/monitor", label: "Content Monitor", icon: Radio },
  { href: "/video", label: "Video Generator", icon: Film },
  { href: "/startups", label: "Startups DB", icon: Database },
  { href: "/preferences", label: "Preferences", icon: BookOpen },
  { href: "/settings", label: "Settings", icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 h-screen w-60 bg-white border-r border-gray-200 flex flex-col z-50">
      <div className="p-5 border-b border-gray-100">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
            <Zap className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-gray-900">AI Pulse</h1>
            <p className="text-[10px] text-gray-400 uppercase tracking-widest">Content Engine</p>
          </div>
        </Link>
      </div>

      <nav className="flex-1 p-3 space-y-0.5">
        {navItems.map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname === item.href || pathname.startsWith(item.href + "/");
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={isActive ? "sidebar-link-active" : "sidebar-link"}
            >
              <Icon className="w-4 h-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="p-3 border-t border-gray-100">
        <p className="text-[11px] text-gray-400 px-2">
          @mohit.builds.ai
        </p>
      </div>
    </aside>
  );
}
