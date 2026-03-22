'use client';

import { useState } from 'react';
import UserManagement from './UserManagement';
import RankingRefresh from './RankingRefresh';
import UnmatchedPosters from './UnmatchedPosters';
import ContentManagement from './ContentManagement';

type TabKey = 'users' | 'rankings' | 'contents';

interface Tab {
  key: TabKey;
  label: string;
}

const TABS: Tab[] = [
  { key: 'users', label: '유저 관리' },
  { key: 'rankings', label: '랭킹 관리' },
  { key: 'contents', label: '콘텐츠 관리' },
];

export default function AdminTabs() {
  const [activeTab, setActiveTab] = useState<TabKey>('users');

  return (
    <div>
      {/* 탭 네비게이션 */}
      <div className="mb-6 flex gap-1 rounded-xl border border-white/10 bg-white/[0.02] p-1">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-medium transition-all ${
              activeTab === tab.key
                ? 'bg-gradient-to-r from-fuchsia-700 to-indigo-600 text-white'
                : 'text-white/50 hover:text-white/80 hover:bg-white/5'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 탭 콘텐츠 */}
      {activeTab === 'users' && <UserManagement />}
      {activeTab === 'rankings' && (
        <div className="space-y-8">
          <RankingRefresh />
          <UnmatchedPosters />
        </div>
      )}
      {activeTab === 'contents' && <ContentManagement />}
    </div>
  );
}
