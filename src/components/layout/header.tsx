"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { Menu, Settings as SettingsIcon } from "lucide-react";
import {
  Avatar,
  AvatarFallback,
} from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  if (pathname.startsWith("/home")) return "Home";
  return "WhatsApp Studio";
}

interface HeaderProps {
  onOpenSidebar?: () => void;
}

export function Header({ onOpenSidebar }: HeaderProps) {
  const pathname = usePathname();
  const { profile, account } = useAuth();
  const title = getPageTitle(pathname);

  const initial =
    account?.name?.charAt(0)?.toUpperCase() ??
    profile?.full_name?.charAt(0)?.toUpperCase() ??
    "B";

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border bg-background px-4 lg:px-6">
      <div className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          onClick={onOpenSidebar}
          aria-label="Open menu"
          className="flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>
        <h1 className="truncate text-base font-semibold text-foreground sm:text-lg">
          {title}
        </h1>
      </div>

      <div className="flex items-center gap-1 sm:gap-2">
        <ModeToggle />

        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label="Open account menu"
            className="flex h-10 w-10 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Avatar className="size-8">
              <AvatarFallback className="bg-primary/10 text-sm font-medium text-primary">
                {initial}
              </AvatarFallback>
            </Avatar>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-48">
            <DropdownMenuItem
              render={
                <Link
                  href="/settings"
                  className="text-popover-foreground focus:bg-accent focus:text-accent-foreground"
                />
              }
            >
              <SettingsIcon className="size-4" />
              Settings
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
