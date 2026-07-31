"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { useTotalUnread } from "@/hooks/use-total-unread";
import {
  Home,
  LogOut,
  Megaphone,
  MessageSquare,
  PlugZap,
  Settings,
  Shield,
  Users,
  X,
  Zap,
} from "lucide-react";

interface NavItem {
  href: string;
  label: string;
  icon: typeof Home;
}

const navItems: NavItem[] = [
  { href: "/home", label: "Home", icon: Home },
  { href: "/automations", label: "Automations", icon: Zap },
  { href: "/inbox", label: "Inbox", icon: MessageSquare },
  { href: "/contacts", label: "Customers", icon: Users },
  { href: "/broadcasts", label: "Campaigns", icon: Megaphone },
  { href: "/connect", label: "Connect", icon: PlugZap },
];

interface SidebarProps {
  open?: boolean;
  onClose?: () => void;
}

export function Sidebar({ open = false, onClose }: SidebarProps) {
  const pathname = usePathname();
  const { account, profile, signOut, user, isPlatformAdmin } = useAuth();
  const totalUnread = useTotalUnread();
  const canSignOut =
    (process.env.NEXT_PUBLIC_AUTH_PROVIDER || "google").toLowerCase() !==
    "none";

  useEffect(() => {
    onClose?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  return (
    <>
      <button
        type="button"
        aria-label="Close menu"
        onClick={onClose}
        className={cn(
          "fixed inset-0 z-30 bg-[#111827]/40 transition-opacity lg:hidden",
          open
            ? "pointer-events-auto opacity-100"
            : "pointer-events-none opacity-0",
        )}
      />

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex h-full w-64 flex-col border-r border-sidebar-border bg-sidebar",
          "transition-transform duration-200 ease-out will-change-transform",
          open ? "translate-x-0" : "-translate-x-full",
          "lg:static lg:z-0 lg:w-60 lg:translate-x-0 lg:transition-none",
        )}
        aria-label="Primary"
      >
        <div className="flex h-16 shrink-0 items-center justify-between gap-2 border-b border-sidebar-border px-4">
          <Link href="/home" className="flex min-w-0 items-center gap-2.5">
            <Image
              src="/brand/vsmart-mark.png"
              alt="Vsmart"
              width={36}
              height={36}
              className="h-9 w-9 object-contain"
              priority
            />
            <div className="min-w-0 leading-tight">
              <p className="font-heading text-sm font-semibold tracking-tight text-foreground">
                Vsmart
              </p>
              <p className="truncate text-[11px] text-muted-foreground">
                WhatsApp Studio
              </p>
            </div>
          </Link>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <ul className="flex flex-col gap-1">
            {navItems.map((item) => {
              const isActive =
                pathname === item.href ||
                (item.href !== "/home" && pathname.startsWith(item.href));
              const showUnreadDot =
                item.href === "/inbox" && totalUnread > 0 && !isActive;

              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                      isActive
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    <span className="flex-1">{item.label}</span>
                    {showUnreadDot && (
                      <span className="h-2 w-2 rounded-full bg-brand-orange" />
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>

          <div className="my-4 border-t border-sidebar-border" />

          <Link
            href="/settings"
            className={cn(
              "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
              pathname.startsWith("/settings")
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Settings className="h-4 w-4" />
            Settings
          </Link>

          {isPlatformAdmin ? (
            <Link
              href="/admin"
              className={cn(
                "mt-1 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                pathname.startsWith("/admin")
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Shield className="h-4 w-4" />
              Admin
            </Link>
          ) : null}
        </nav>

        <div className="shrink-0 space-y-2 border-t border-sidebar-border p-4">
          <div>
            <p className="truncate text-sm font-medium text-foreground">
              {account?.name ?? "My Business"}
            </p>
            <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
              {profile?.email || user?.email || "Taking future ahead"}
            </p>
          </div>
          {canSignOut ? (
            <button
              type="button"
              onClick={() => void signOut()}
              className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign out
            </button>
          ) : null}
        </div>
      </aside>
    </>
  );
}
