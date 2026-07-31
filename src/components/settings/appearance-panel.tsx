"use client";

import { Check, Moon, Sun, SunMoon } from "lucide-react";

import { useTheme } from "@/hooks/use-theme";
import { MODES, type Mode } from "@/lib/themes";
import { cn } from "@/lib/utils";
import { SettingsPanelHead } from "./settings-panel-head";

/**
 * Appearance — light/dark only. Brand colors are fixed to Vsmart.
 */
export function AppearancePanel() {
  const { mode, setMode } = useTheme();

  return (
    <section className="max-w-3xl animate-in fade-in-50 duration-200">
      <SettingsPanelHead
        title="Appearance"
        description="Light or dark. Brand colors stay Vsmart blue & orange."
      />

      <div className="space-y-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <SunMoon className="size-4 text-muted-foreground" />
          Mode
        </h3>

        <div
          role="radiogroup"
          aria-label="Color mode"
          className="grid max-w-md grid-cols-2 gap-3"
        >
          {MODES.map((m) => (
            <ModeCard
              key={m}
              mode={m}
              isActive={m === mode}
              onPick={() => setMode(m)}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function ModeCard({
  mode,
  isActive,
  onPick,
}: {
  mode: Mode;
  isActive: boolean;
  onPick: () => void;
}) {
  const Icon = mode === "light" ? Sun : Moon;
  const label = mode === "light" ? "Light" : "Dark";

  return (
    <button
      type="button"
      role="radio"
      aria-checked={isActive}
      onClick={onPick}
      className={cn(
        "vsmart-shape relative flex flex-col items-start gap-3 border p-4 text-left transition",
        isActive
          ? "border-primary bg-primary/5 shadow-sm"
          : "border-border bg-card hover:border-primary/30",
      )}
    >
      <Icon
        className={cn(
          "size-5",
          isActive ? "text-primary" : "text-muted-foreground",
        )}
      />
      <span className="text-sm font-semibold text-foreground">{label}</span>
      {isActive && (
        <span className="absolute right-3 top-3 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Check className="size-3" />
        </span>
      )}
    </button>
  );
}
