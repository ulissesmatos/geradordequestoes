export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <main className="grid min-h-screen place-items-center bg-[var(--background)] px-4 py-10">{children}</main>;
}
