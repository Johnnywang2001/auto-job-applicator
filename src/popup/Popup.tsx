import { Briefcase, ExternalLink } from 'lucide-react';

export function Popup() {
  const openDashboard = () => {
    const dashboardUrl = chrome.runtime.getURL('dashboard.html');
    chrome.tabs.create({ url: dashboardUrl });
  };

  return (
    <div className="w-80 p-4 bg-background">
      <div className="flex items-center gap-2 mb-4">
        <Briefcase className="w-5 h-5 text-accent-teal" />
        <h1 className="text-lg font-bold text-text-primary">Auto Job Applicator</h1>
      </div>

      <p className="text-sm text-text-secondary mb-4">
        Scrape, rank, and apply to jobs automatically.
      </p>

      <button
        onClick={openDashboard}
        className="w-full flex items-center justify-center gap-2 bg-accent-teal text-white py-2 px-4 rounded-lg hover:bg-opacity-90 transition-colors"
      >
        <ExternalLink className="w-4 h-4" />
        Open Dashboard
      </button>

      <div className="mt-4 pt-3 border-t border-border text-center">
        <p className="text-xs text-text-secondary">Auto Job Applicator v1.0.0</p>
      </div>
    </div>
  );
}
