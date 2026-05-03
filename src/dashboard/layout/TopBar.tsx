import { Bell, User } from 'lucide-react';

export function TopBar() {
  return (
    <div className="h-14 bg-surface border-b border-border flex items-center justify-between px-6">
      <h2 className="text-lg font-semibold text-text-primary">Dashboard</h2>
      <div className="flex items-center gap-4">
        <button className="p-2 text-text-secondary hover:text-text-primary hover:bg-surface-muted rounded-lg transition-colors">
          <Bell className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-2 px-3 py-1.5 bg-surface-muted rounded-lg">
          <User className="w-4 h-4 text-text-secondary" />
          <span className="text-sm text-text-secondary">User</span>
        </div>
      </div>
    </div>
  );
}
