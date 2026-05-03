import { useState, useEffect } from 'react';
import { Key, TestTube, Save, AlertCircle, CheckCircle } from 'lucide-react';
import { getSettings, saveSettings, idb } from '../../lib/storage';
import { testApiKey } from '../../lib/api';

const MODELS = [
  { value: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash (fastest)' },
  { value: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro' },
  { value: 'kimi-k2.6', label: 'Kimi K2.6 (best quality)' },
  { value: 'kimi-k2.5', label: 'Kimi K2.5' },
  { value: 'qwen3.5-plus', label: 'Qwen 3.5 Plus' },
  { value: 'qwen3.6-plus', label: 'Qwen 3.6 Plus' },
  { value: 'glm-5', label: 'GLM-5' },
  { value: 'glm-5.1', label: 'GLM-5.1' },
];

export function SettingsTab() {
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [model, setModel] = useState('deepseek-v4-flash');
  const [apiBaseUrl, setApiBaseUrl] = useState('https://opencode.ai/zen/go/v1/chat/completions');
  const [linkedinLimit, setLinkedinLimit] = useState(70);
  const [delayMs, setDelayMs] = useState(8000);
  const [maxAppsPerCompany, setMaxAppsPerCompany] = useState(3);
  const [maxJobsPerScrape, setMaxJobsPerScrape] = useState(25);
  const [autoSubmit, setAutoSubmit] = useState(false);
  const [requireConfirm, setRequireConfirm] = useState(true);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getSettings().then((s) => {
      setApiKey(s.apiKey || '');
      setModel(s.apiModel || 'deepseek-v4-flash');
      setApiBaseUrl(s.apiBaseUrl || 'https://opencode.ai/zen/go/v1/chat/completions');
      setLinkedinLimit(s.linkedinDailyLimit || 70);
      setDelayMs(s.delayBetweenRequests || 8000);
      setMaxAppsPerCompany(s.maxApplicationsPerCompany || 3);
      setMaxJobsPerScrape(s.maxJobsPerScrape || 25);
      setAutoSubmit(s.autoSubmitEnabled || false);
      setRequireConfirm(s.requireConfirmBeforeSubmit !== false);
    });
  }, []);

  const handleTest = async () => {
    setTestResult(null);
    const result = await testApiKey(apiKey);
    setTestResult(result);
  };

  const handleSave = async () => {
    await saveSettings({
      apiKey,
      apiModel: model,
      apiBaseUrl,
      linkedinDailyLimit: linkedinLimit,
      delayBetweenRequests: delayMs,
      maxApplicationsPerCompany: maxAppsPerCompany,
      maxJobsPerScrape: maxJobsPerScrape,
      autoSubmitEnabled: autoSubmit,
      requireConfirmBeforeSubmit: requireConfirm,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleExport = async () => {
    const data = await chrome.storage.local.get();
    if (data.settings?.apiKey) {
      data.settings = { ...data.settings, apiKey: '[REDACTED]' };
    }
    if (data.parsedResume) {
      data.parsedResume = { ...data.parsedResume, rawText: '[REDACTED]', htmlContent: '[REDACTED]' };
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `aja-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleClear = async () => {
    if (window.confirm('Are you sure you want to clear ALL data? This cannot be undone.')) {
      await idb.clearAll();
      await chrome.storage.local.clear();
      window.alert('All data cleared.');
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-xl font-bold text-text-primary mb-1">Settings</h3>
        <p className="text-sm text-text-secondary">Configure your API keys and preferences.</p>
      </div>

      {/* API Configuration */}
      <section className="bg-surface border border-border rounded-xl p-6 space-y-4">
        <h4 className="text-sm font-semibold text-text-primary uppercase tracking-wide">API Configuration</h4>

        <div>
          <label className="block text-sm font-medium text-text-primary mb-1">OpenCode Go API Key</label>
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary" />
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="opencode-go-..."
                className="w-full pl-10 pr-4 py-2 bg-surface-muted border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent-teal"
              />
            </div>
            <button
              onClick={() => setShowKey(!showKey)}
              className="px-3 py-2 text-sm text-text-secondary hover:text-text-primary border border-border rounded-lg"
            >
              {showKey ? 'Hide' : 'Show'}
            </button>
            <button
              onClick={handleTest}
              className="flex items-center gap-2 px-4 py-2 bg-surface-muted border border-border rounded-lg text-sm text-text-primary hover:bg-border transition-colors"
            >
              <TestTube className="w-4 h-4" />
              Test
            </button>
          </div>
          {testResult && (
            <div className={`mt-2 flex items-center gap-2 text-sm ${testResult.success ? 'text-accent-lime' : 'text-accent-red'}`}>
              {testResult.success ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
              {testResult.message}
            </div>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-text-primary mb-1">Model</label>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="w-full px-4 py-2 bg-surface-muted border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent-teal"
          >
            {MODELS.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-text-primary mb-1">API Base URL</label>
          <input
            type="url"
            value={apiBaseUrl}
            onChange={(e) => setApiBaseUrl(e.target.value)}
            placeholder="https://opencode.ai/zen/go/v1/chat/completions"
            className="w-full px-4 py-2 bg-surface-muted border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent-teal"
          />
          <p className="text-xs text-text-secondary mt-1">Change only if using a custom OpenAI-compatible endpoint.</p>
        </div>
      </section>

      {/* Scraping Limits */}
      <section className="bg-surface border border-border rounded-xl p-6 space-y-4">
        <h4 className="text-sm font-semibold text-text-primary uppercase tracking-wide">Scraping Limits</h4>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">LinkedIn Daily Suggestion</label>
            <input
              type="number"
              value={linkedinLimit}
              onChange={(e) => setLinkedinLimit(Number(e.target.value))}
              className="w-full px-4 py-2 bg-surface-muted border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent-teal"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">Delay Between Requests (ms)</label>
            <input
              type="number"
              value={delayMs}
              onChange={(e) => setDelayMs(Number(e.target.value))}
              className="w-full px-4 py-2 bg-surface-muted border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent-teal"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">Max Apps Per Company</label>
            <input
              type="number"
              value={maxAppsPerCompany}
              onChange={(e) => setMaxAppsPerCompany(Number(e.target.value))}
              className="w-full px-4 py-2 bg-surface-muted border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent-teal"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">Max Jobs Per Scrape</label>
            <input
              type="number"
              value={maxJobsPerScrape}
              onChange={(e) => setMaxJobsPerScrape(Number(e.target.value))}
              className="w-full px-4 py-2 bg-surface-muted border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent-teal"
            />
          </div>
        </div>
      </section>

      {/* Autofill */}
      <section className="bg-surface border border-border rounded-xl p-6 space-y-4">
        <h4 className="text-sm font-semibold text-text-primary uppercase tracking-wide">Application Autofill</h4>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-text-primary">Enable Application Autofill <span className="text-xs text-text-secondary">(Coming Soon)</span></p>
            <p className="text-xs text-text-secondary">Automatically fill out application forms</p>
          </div>
          <button
            onClick={() => setAutoSubmit(!autoSubmit)}
            className={`w-12 h-6 rounded-full transition-colors ${autoSubmit ? 'bg-accent-teal' : 'bg-border'} opacity-50 cursor-not-allowed`}
            disabled
          >
            <div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${autoSubmit ? 'translate-x-7' : 'translate-x-1'}`} />
          </button>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-text-primary">Require Confirmation Before Submit <span className="text-xs text-text-secondary">(Coming Soon)</span></p>
            <p className="text-xs text-text-secondary">Always ask before submitting an application</p>
          </div>
          <button
            onClick={() => setRequireConfirm(!requireConfirm)}
            className={`w-12 h-6 rounded-full transition-colors ${requireConfirm ? 'bg-accent-teal' : 'bg-border'} opacity-50 cursor-not-allowed`}
            disabled
          >
            <div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${requireConfirm ? 'translate-x-7' : 'translate-x-1'}`} />
          </button>
        </div>
      </section>

      {/* Data Management */}
      <section className="bg-surface border border-border rounded-xl p-6 space-y-4">
        <h4 className="text-sm font-semibold text-text-primary uppercase tracking-wide">Data Management</h4>
        <div className="flex gap-3">
          <button
            onClick={handleExport}
            className="px-4 py-2 bg-surface-muted border border-border rounded-lg text-sm text-text-primary hover:bg-border transition-colors"
          >
            Export All Data
          </button>
          <button
            onClick={handleClear}
            className="px-4 py-2 bg-accent-red-light border border-accent-red text-accent-red rounded-lg text-sm hover:bg-accent-red hover:text-white transition-colors"
          >
            Clear All Data
          </button>
        </div>
      </section>

      <div className="flex justify-end">
        <button
          onClick={handleSave}
          className="flex items-center gap-2 px-6 py-2.5 bg-accent-teal text-white rounded-lg text-sm font-medium hover:bg-opacity-90 transition-colors"
        >
          <Save className="w-4 h-4" />
          {saved ? 'Saved!' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
}
