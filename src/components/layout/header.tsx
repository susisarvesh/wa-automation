"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Settings as SettingsIcon } from "lucide-react";
import { ModeToggle } from "@/components/layout/mode-toggle";

const pageTitles: Record<string, string> = {
  "/home": "Home",
  "/inbox": "Inbox",
  "/contacts": "Customers",
  "/automations": "Automations",
  "/connect": "Connect WhatsApp",
  "/settings": "Settings",
};

function getPageTitle(pathname: string): string {
  if (pageTitles[pathname]) return pageTitles[pathname];
  if (pathname.startsWith("/automations/setup")) return "Set up automation";
  if (pathname.startsWith("/automations")) return "Automations";
  if (pathname.startsWith("/contacts")) return "Customers";
  if (pathname.startsWith("/inbox")) return "Inbox";
  if (pathname.startsWith("/settings")) return "Settings";
  if (pathname.startsWith("/connect")) return "Connect WhatsApp";
  return "Vsmart";
}

interface HeaderProps {
  onOpenSidebar?: () => void;
}

export function Header({ onOpenSidebar }: HeaderProps) {
  const pathname = usePathname();
  const title = getPageTitle(pathname);

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border bg-card/80 px-4 backdrop-blur-sm lg:px-6">
      <div className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          onClick={onOpenSidebar}
          aria-label="Open menu"
          className="flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>
        <h1 className="font-heading truncate text-lg font-semibold tracking-tight text-foreground">
          {title}
        </h1>
      </div>

      <div className="flex items-center gap-1 sm:gap-2">
        <ModeToggle />
        <Link
          href="/settings"
          aria-label="Settings"
          className="flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <SettingsIcon className="h-4 w-4" />
        </Link>
      </div>
    </header>
  );
}
