import type { TabId } from '../Dashboard';
import { Search, List, FileText, Briefcase, Settings } from 'lucide-react';

const tabs: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: 'scraper', label: 'Scraper', icon: Search },
  { id: 'rankings', label: 'Rankings', icon: List },
  { id: 'resume', label: 'Resume', icon: FileText },
  { id: 'applications', label: 'Applications', icon: Briefcase },
  { id: 'settings', label: 'Settings', icon: Settings },
];

interface SidebarProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
}

export function Sidebar({ activeTab, onTabChange }: SidebarProps) {
  return (
    <aside className="fixed left-0 top-0 h-full w-64 bg-surface border-r border-border flex flex-col z-50">
      <div className="p-6 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-accent-teal rounded-lg flex items-center justify-center">
            <Briefcase className="w-4 h-4 text-white" />
          </div>
          <h1 className="text-lg font-bold text-text-primary">Job Applicator</h1>
        </div>
      </div>

      <nav className="flex-1 p-4 space-y-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-accent-teal-light text-accent-teal'
                  : 'text-text-secondary hover:bg-surface-muted hover:text-text-primary'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </nav>

      <div className="p-4 border-t border-border">
        <p className="text-xs text-text-secondary">v1.0.0</p>
      </div>
    </aside>
  );
}
