'use client';

import AdminGuard from '@/components/admin/AdminGuard';
import AdminTabs from '@/components/admin/AdminTabs';

export default function AdminPage() {
  return (
    <AdminGuard>
      <div className="mx-auto max-w-5xl px-4 py-8">
        <h1 className="mb-8 text-2xl font-bold text-white">관리자 대시보드</h1>
        <AdminTabs />
      </div>
    </AdminGuard>
  );
}
