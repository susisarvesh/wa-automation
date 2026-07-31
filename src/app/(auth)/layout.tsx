export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="vsmart-mesh flex min-h-screen items-center justify-center p-4">
      {children}
    </div>
  );
}
