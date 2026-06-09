import { AdminSidebar } from "@/components/admin-sidebar";
import { requireAdmin } from "@/lib/guards";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <div className="min-h-screen md:flex">
      <AdminSidebar />
      <main className="flex-1 px-4 py-6 md:px-8">{children}</main>
    </div>
  );
}
