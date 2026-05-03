import { useState, useCallback } from 'react';
import { Upload, Key, TestTube, CheckCircle, AlertCircle, ChevronRight, ChevronLeft, Settings, FileText, Loader2 } from 'lucide-react';
import { saveSettings, idb } from '../lib/storage';
import { testApiKey } from '../lib/api';
import { extractTemplateStyle } from '../lib/template-extractor';
import { useToast } from '../components/Toast';

const mammothPromise = import('mammoth');

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

interface Props {
  onComplete: () => void;
}

export function OnboardingWizard({ onComplete }: Props) {
  const { showToast } = useToast();
  const [step, setStep] = useState(1);
  const [isParsing, setIsParsing] = useState(false);
  const [parsedResume, setParsedResume] = useState<any>(null);
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [model, setModel] = useState('deepseek-v4-flash');
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [linkedinLimit, setLinkedinLimit] = useState(70);
  const [maxAppsPerCompany, setMaxAppsPerCompany] = useState(3);
  const [maxJobsPerScrape, setMaxJobsPerScrape] = useState(25);
  const [requireConfirm, setRequireConfirm] = useState(true);

  const handleResumeUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !file.name.endsWith('.docx')) {
      showToast('Please upload a .docx file', 'warning');
      return;
    }

    setIsParsing(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      await idb.saveTemplateBlob('resume-template', arrayBuffer);
      const meta = { name: file.name, size: file.size, date: Date.now() };
      await chrome.storage.local.set({ resumeFileMeta: meta });

      const { default: mammoth } = await mammothPromise;
      const result = await mammoth.convertToHtml({ arrayBuffer });
      const text = result.value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      const skillsMatch = text.match(/skills?[\s:]*([^\n]+)/i);
      const skills = skillsMatch ? skillsMatch[1].split(/[,;|]/).map(s => s.trim()).filter(Boolean) : [];
      const expMatches = text.match(/experience[\s\S]*?(education|skills|$)/i);
      const eduMatches = text.match(/education[\s\S]*?(experience|skills|$)/i);
      const style = extractTemplateStyle(result.value);

      const parsed = {
        rawText: text,
        htmlContent: result.value,
        skills,
        experience: expMatches ? [expMatches[0].slice(0, 500)] : [],
        education: eduMatches ? [eduMatches[0].slice(0, 300)] : []
      };

      await Promise.all([
        chrome.storage.local.set({ parsedResume: parsed, extractedStyle: style }),
        saveSettings({ templateStyle: style })
      ]);

      setParsedResume(parsed);
      showToast('Resume parsed successfully', 'success');
    } catch (e: any) {
      showToast('Failed to parse resume: ' + e.message, 'error');
    } finally {
      setIsParsing(false);
    }
  }, [showToast]);

  const handleTest = async () => {
    setTestResult(null);
    const result = await testApiKey(apiKey);
    setTestResult(result);
  };

  const handleFinish = async () => {
    await saveSettings({
      apiKey,
      apiModel: model,
      apiBaseUrl: 'https://opencode.ai/zen/go/v1/chat/completions',
      linkedinDailyLimit: linkedinLimit,
      maxApplicationsPerCompany: maxAppsPerCompany,
      maxJobsPerScrape: maxJobsPerScrape,
      requireConfirmBeforeSubmit: requireConfirm,
      onboardingComplete: true,
    });
    showToast('Setup complete!', 'success');
    onComplete();
  };

  const steps = [
    { num: 1, label: 'Resume', icon: FileText },
    { num: 2, label: 'API Key', icon: Key },
    { num: 3, label: 'Preferences', icon: Settings },
  ];

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[100] p-4">
      <div className="bg-surface border border-border rounded-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-5 border-b border-border">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-text-primary">Welcome to Auto Job Applicator</h2>
            <span className="text-xs text-text-secondary">Step {step} of 3</span>
          </div>
          <div className="flex items-center gap-2">
            {steps.map((s, i) => {
              const Icon = s.icon;
              const isActive = step === s.num;
              const isDone = step > s.num;
              return (
                <div key={s.num} className="flex items-center gap-2 flex-1">
                  <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    isActive ? 'bg-accent-teal-light text-accent-teal' :
                    isDone ? 'bg-accent-lime-light text-accent-lime' :
                    'bg-surface-muted text-text-secondary'
                  }`}>
                    <Icon className="w-3 h-3" />
                    {s.label}
                  </div>
                  {i < steps.length - 1 && (
                    <ChevronRight className="w-3 h-3 text-text-secondary" />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto p-6 space-y-4">
          {step === 1 && (
            <div className="space-y-4">
              <p className="text-sm text-text-secondary">
                Upload your base resume template. We'll parse it to extract your skills, experience, and style for tailoring.
              </p>
              <label className="flex flex-col items-center justify-center gap-2 w-full px-4 py-10 border-2 border-dashed border-border rounded-xl cursor-pointer hover:border-accent-teal hover:bg-accent-teal-light/10 transition-colors">
                <Upload className="w-8 h-8 text-text-secondary" />
                <span className="text-sm text-text-secondary">Drop resume or click to browse</span>
                <span className="text-xs text-text-secondary/60">.docx files only</span>
                <input type="file" accept=".docx" className="hidden" onChange={handleResumeUpload} />
              </label>
              {isParsing && (
                <div className="flex items-center gap-2 text-sm text-text-secondary">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Parsing resume...
                </div>
              )}
              {parsedResume && (
                <div className="bg-surface-muted rounded-lg p-4 space-y-2">
                  <div className="flex items-center gap-2 text-sm text-accent-lime">
                    <CheckCircle className="w-4 h-4" />
                    <span className="font-medium">Resume parsed</span>
                  </div>
                  <div className="text-xs text-text-secondary">
                    <p>{parsedResume.skills.length} skills detected</p>
                    <p>{parsedResume.rawText.length} characters</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <p className="text-sm text-text-secondary">
                Enter your OpenCode Go API key. This is required for AI-powered job ranking, resume optimization, and cover letter generation.
              </p>
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">API Key</label>
                <div className="flex gap-2">
                  <input
                    type={showKey ? 'text' : 'password'}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="opencode-go-..."
                    className="flex-1 px-4 py-2 bg-surface-muted border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent-teal"
                  />
                  <button
                    onClick={() => setShowKey(!showKey)}
                    className="px-3 py-2 text-sm text-text-secondary border border-border rounded-lg"
                  >
                    {showKey ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>
              <button
                onClick={handleTest}
                className="flex items-center gap-2 px-4 py-2 bg-surface-muted border border-border rounded-lg text-sm text-text-primary hover:bg-border transition-colors"
              >
                <TestTube className="w-4 h-4" />
                Test Connection
              </button>
              {testResult && (
                <div className={`flex items-center gap-2 text-sm ${testResult.success ? 'text-accent-lime' : 'text-accent-red'}`}>
                  {testResult.success ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                  {testResult.message}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">Model</label>
                <select
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="w-full px-4 py-2 bg-surface-muted border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent-teal"
                >
                  {MODELS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <p className="text-sm text-text-secondary">
                Configure your scraping and application preferences.
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-text-primary mb-1">LinkedIn Daily Limit</label>
                  <input
                    type="number"
                    value={linkedinLimit}
                    onChange={(e) => setLinkedinLimit(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-surface-muted border border-border rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-text-primary mb-1">Max Apps/Company</label>
                  <input
                    type="number"
                    value={maxAppsPerCompany}
                    onChange={(e) => setMaxAppsPerCompany(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-surface-muted border border-border rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-text-primary mb-1">Max Jobs/Scrape</label>
                  <input
                    type="number"
                    value={maxJobsPerScrape}
                    onChange={(e) => setMaxJobsPerScrape(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-surface-muted border border-border rounded-lg text-sm"
                  />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-text-primary">Require Confirmation Before Submit</p>
                  <p className="text-xs text-text-secondary">Always ask before submitting an application</p>
                </div>
                <button
                  onClick={() => setRequireConfirm(!requireConfirm)}
                  className={`w-12 h-6 rounded-full transition-colors ${requireConfirm ? 'bg-accent-teal' : 'bg-border'}`}
                >
                  <div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${requireConfirm ? 'translate-x-7' : 'translate-x-1'}`} />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border flex items-center justify-between">
          <button
            onClick={() => setStep(s => Math.max(1, s - 1))}
            disabled={step === 1}
            className="flex items-center gap-1 px-4 py-2 text-sm text-text-secondary hover:text-text-primary disabled:opacity-50"
          >
            <ChevronLeft className="w-4 h-4" />
            Back
          </button>
          {step < 3 ? (
            <button
              onClick={() => setStep(s => s + 1)}
              className="flex items-center gap-1 px-4 py-2 bg-accent-teal text-white rounded-lg text-sm hover:bg-opacity-90"
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={handleFinish}
              className="flex items-center gap-2 px-6 py-2 bg-accent-teal text-white rounded-lg text-sm font-medium hover:bg-opacity-90"
            >
              <CheckCircle className="w-4 h-4" />
              Get Started
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
