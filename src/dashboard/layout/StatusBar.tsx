import { useEffect, useState } from 'react';
import { Activity, AlertTriangle } from 'lucide-react';
import { getCounterForSite, idb, getSettings } from '../../lib/storage';

export function StatusBar() {
  const [linkedinCount, setLinkedinCount] = useState(0);
  const [linkedinLimit, setLinkedinLimit] = useState(70);
  const [antiBotAlert, setAntiBotAlert] = useState<{ site: string; detectedAt: number } | null>(null);
  const [runningTasks, setRunningTasks] = useState(0);

  useEffect(() => {
    const load = async () => {
      const counter = await getCounterForSite('linkedin');
      setLinkedinCount(counter.count);
      const settings = await getSettings();
      setLinkedinLimit(settings.linkedinDailyLimit);
      const alert = await chrome.storage.local.get('antiBotAlert');
      if (alert.antiBotAlert) setAntiBotAlert(alert.antiBotAlert as { site: string; detectedAt: number });
      const tasks = await idb.getTasks();
      setRunningTasks(tasks.filter(t => t.status === 'running').length);
    };
    load();

    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, []);

  const linkedinOverLimit = linkedinCount >= linkedinLimit;

  return (
    <div className="h-12 bg-surface border-b border-border flex items-center px-6 gap-6 sticky top-0 z-40">
      {antiBotAlert && (
        <div className="flex items-center gap-2 text-accent-red bg-accent-red-light px-3 py-1 rounded-md text-xs font-medium">
          <AlertTriangle className="w-3 h-3" />
          Anti-bot detected on {antiBotAlert.site}
        </div>
      )}

      {runningTasks > 0 && (
        <div className="flex items-center gap-2 text-accent-teal text-xs font-medium">
          <Activity className="w-3 h-3 animate-pulse" />
          {runningTasks} task{runningTasks > 1 ? 's' : ''} running
        </div>
      )}

      <div className={`flex items-center gap-2 text-xs font-medium ${linkedinOverLimit ? 'text-accent-orange' : 'text-text-secondary'}`}>
        <span>LinkedIn:</span>
        <span className={linkedinOverLimit ? 'font-bold' : ''}>{linkedinCount}/{linkedinLimit} today</span>
        {linkedinOverLimit && <span className="text-accent-orange">(suggestion reached)</span>}
      </div>
    </div>
  );
}