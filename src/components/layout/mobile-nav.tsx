"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  MessageSquare,
  PlugZap,
  Users,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTotalUnread } from "@/hooks/use-total-unread";

const items = [
  { href: "/home", label: "Home", icon: Home },
  { href: "/automations", label: "Autos", icon: Zap },
  { href: "/inbox", label: "Inbox", icon: MessageSquare },
  { href: "/contacts", label: "People", icon: Users },
  { href: "/connect", label: "Connect", icon: PlugZap },
] as const;

export function MobileNav() {
  const pathname = usePathname();
  const totalUnread = useTotalUnread();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
      aria-label="Primary mobile"
    >
      <ul className="grid h-16 grid-cols-5">
        {items.map((item) => {
          const active =
            pathname === item.href ||
            (item.href !== "/home" && pathname.startsWith(item.href));
          const showDot = item.href === "/inbox" && totalUnread > 0 && !active;

          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={cn(
                  "relative flex h-full flex-col items-center justify-center gap-0.5 text-[10px] font-medium",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <item.icon className="h-5 w-5" />
                <span>{item.label}</span>
                {showDot ? (
                  <span className="absolute right-[28%] top-2 h-1.5 w-1.5 rounded-full bg-brand-orange" />
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
