import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign in · WhatsApp Studio",
  description: "Sign in to Vsmart WhatsApp Studio",
};

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="login-scene relative flex min-h-screen flex-col overflow-hidden">
      {/* Atmosphere */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="login-orb login-orb-a" />
        <div className="login-orb login-orb-b" />
        <div className="login-orb login-orb-c" />
        <div className="login-grid" />
      </div>

      <div className="relative z-10 flex flex-1 flex-col">{children}</div>
    </div>
  );
}
