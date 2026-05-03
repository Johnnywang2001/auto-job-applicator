import { useState, useEffect } from 'react';
import { Sidebar } from './layout/Sidebar';
import { StatusBar } from './layout/StatusBar';
import { TopBar } from './layout/TopBar';
import { ScraperTab } from './tabs/ScraperTab';
import { RankingsTab } from './tabs/RankingsTab';
import { ResumeTab } from './tabs/ResumeTab';
import { ApplicationsTab } from './tabs/ApplicationsTab';
import { SettingsTab } from './tabs/SettingsTab';
import { ToastProvider } from '../components/Toast';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { OnboardingWizard } from '../components/OnboardingWizard';
import { getSettings } from '../lib/storage';

export type TabId = 'scraper' | 'rankings' | 'resume' | 'applications' | 'settings';

export function Dashboard() {
  const [activeTab, setActiveTab] = useState<TabId>('scraper');
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    getSettings().then(s => {
      if (!s.onboardingComplete) {
        setShowOnboarding(true);
      }
    });
  }, []);

  const renderTab = () => {
    switch (activeTab) {
      case 'scraper': return <ScraperTab />;
      case 'rankings': return <RankingsTab />;
      case 'resume': return <ResumeTab />;
      case 'applications': return <ApplicationsTab />;
      case 'settings': return <SettingsTab />;
      default: return <ScraperTab />;
    }
  };

  return (
    <ErrorBoundary>
      <ToastProvider>
        <div className="min-h-screen bg-background flex">
          <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />
          <div className="flex-1 flex flex-col ml-64">
            <StatusBar />
            <TopBar />
            <main className="flex-1 p-6 overflow-auto scrollbar-thin">
              <div className="max-w-6xl mx-auto">
                {renderTab()}
              </div>
            </main>
          </div>
        </div>
        {showOnboarding && <OnboardingWizard onComplete={() => setShowOnboarding(false)} />}
      </ToastProvider>
    </ErrorBoundary>
  );
}
