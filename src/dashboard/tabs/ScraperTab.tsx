import { useState, useEffect } from 'react';
import { Search, Play, Pause, Trash2, Plus, Globe, CheckCircle, XCircle, HelpCircle, ExternalLink, FileText, Mail, HelpCircle as QuestionIcon, Download, X } from 'lucide-react';
import { idb, getSiteConfigs, addCustomSite, removeCustomSite, getLoginStatuses, getSettings } from '../../lib/storage';
import { rankJob, optimizeResume, generateCoverLetter } from '../../lib/api';
import { generateResumeDocx, generateCoverLetterDocx } from '../../lib/resume-generator';
import { useToast } from '../../components/Toast';
import type { JobListing, SiteConfig } from '../../types';

export function ScraperTab() {
  const { showToast } = useToast();
  const [jobs, setJobs] = useState<JobListing[]>([]);
  const [sites, setSites] = useState<SiteConfig[]>([]);
  const [customUrls, setCustomUrls] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [currentTaskId, setCurrentTaskId] = useState<string | null>(null);
  const [minScore, setMinScore] = useState(5);
  const [loginStatuses, setLoginStatuses] = useState<Record<string, boolean>>({});
  const [selectedSite, setSelectedSite] = useState<string>('all');
  const [companyAppCounts, setCompanyAppCounts] = useState<Record<string, number>>({});
  const [questionJob, setQuestionJob] = useState<JobListing | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [keywords, setKeywords] = useState('');

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 3000);
    return () => clearInterval(interval);
  }, []);

  const loadData = async () => {
    const allJobs = await idb.getJobs();
    setJobs(allJobs.sort((a, b) => (b.score || 0) - (a.score || 0)));
    const configs = await getSiteConfigs();
    setSites(configs);
    const statuses = await getLoginStatuses();
    const map: Record<string, boolean> = {};
    statuses.forEach(s => { map[s.site] = s.isLoggedIn; });
    setLoginStatuses(map);

    const apps = await idb.getApplications();
    const counts: Record<string, number> = {};
    apps.forEach(a => {
      if (['applied', 'interviewing', 'offer'].includes(a.status)) {
        counts[a.company] = (counts[a.company] || 0) + 1;
      }
    });
    setCompanyAppCounts(counts);
  };

  useEffect(() => {
    if (!currentTaskId) return;
    const interval = setInterval(async () => {
      const tasks = await idb.getTasks();
      const task = tasks.find(t => t.id === currentTaskId);
      if (!task || task.status === 'done' || task.status === 'error' || task.status === 'paused') {
        setIsRunning(false);
        setCurrentTaskId(null);
        await loadData();
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [currentTaskId]);

  const handleStartScraping = async () => {
    setIsRunning(true);
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'START_BACKGROUND_SCRAPE',
        payload: {
          siteId: selectedSite === 'all' ? 'linkedin' : selectedSite,
          keywords: keywords.split(',').map(k => k.trim()).filter(Boolean)
        }
      });
      if (response?.taskId) {
        setCurrentTaskId(response.taskId);
      } else {
        setIsRunning(false);
      }
    } catch (e: any) {
      setIsRunning(false);
      showToast('Failed to start scraping: ' + e.message, 'error');
    }
  };

  const handleStopScraping = async () => {
    try {
      await chrome.runtime.sendMessage({ type: 'STOP_BACKGROUND_SCRAPE' });
    } catch (e: any) {
      console.error('Failed to stop scraping:', e);
    }
    setIsRunning(false);
    setCurrentTaskId(null);
  };

  const handleRankJob = async (job: JobListing) => {
    if (!job.description || job.description.trim().length < 20) {
      showToast('This job has no description to rank against. Re-scrape with the detail scraper first.', 'warning');
      return;
    }
    const stored = await chrome.storage.local.get('parsedResume');
    const resumeText = stored.parsedResume?.rawText || '';
    if (!resumeText) {
      showToast('Please upload and parse your resume in the Resume tab first.', 'warning');
      return;
    }
    const result = await rankJob(resumeText, job.description);
    const updated = { ...job, score: result.score, scoreReason: result.reason };
    await idb.saveJob(updated);
    await loadData();
  };

  const handleAddCustomSites = async () => {
    const urls = customUrls.split('\n').map(u => u.trim()).filter(Boolean);
    const existingUrls = new Set(sites.map(s => s.urlPattern));
    for (const url of urls) {
      try {
        new URL(url);
      } catch {
        showToast(`Invalid URL: ${url}`, 'error');
        continue;
      }
      if (existingUrls.has(url)) {
        showToast(`Site already added: ${url}`, 'warning');
        continue;
      }
      const id = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      await addCustomSite({ id, name: new URL(url).hostname, urlPattern: url, adapter: 'generic', enabled: true });
      existingUrls.add(url);
    }
    setCustomUrls('');
    await loadData();
  };

  const handleCheckLogin = async (site: SiteConfig) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (chrome.runtime.sendMessage as any)({ type: 'CHECK_LOGIN_STATUS', payload: { url: site.urlPattern.replace('/*', '') } });
    setTimeout(loadData, 5000);
  };

  const handleDeleteJob = async (job: JobListing) => {
    await idb.deleteJob(job.id);
    if (job.resumeBlobId) await idb.deleteBlob('resumes', job.resumeBlobId);
    if (job.coverLetterBlobId) await idb.deleteBlob('coverLetters', job.coverLetterBlobId);
    showToast('Job deleted', 'success');
    await loadData();
  };

  const handleOptimizeResume = async (job: JobListing) => {
    const stored = await chrome.storage.local.get('parsedResume');
    const parsed = stored.parsedResume;
    if (!parsed) {
      showToast('Please upload and parse your resume in the Resume tab first.', 'warning');
      return;
    }
    try {
      const settings = await getSettings();
      const optimized = await optimizeResume(parsed, job.description);
      const blob = await generateResumeDocx(optimized, settings.templateStyle);
      const arrayBuffer = await blob.arrayBuffer();
      const blobId = `resume-${job.id}`;
      await idb.saveBlob('resumes', blobId, arrayBuffer);
      const updated = { ...job, resumeBlobId: blobId };
      await idb.saveJob(updated);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${job.company}-${job.title}-Resume.docx`.replace(/[^a-zA-Z0-9\-_]/g, '_');
      a.click();
      URL.revokeObjectURL(url);
      showToast('Resume generated and downloaded', 'success');
      await loadData();
    } catch (e: any) {
      showToast('Failed to generate resume: ' + e.message, 'error');
    }
  };

  const handleOptimizeCoverLetter = async (job: JobListing) => {
    const stored = await chrome.storage.local.get('parsedResume');
    const parsed = stored.parsedResume;
    if (!parsed?.rawText) {
      showToast('Please upload and parse your resume in the Resume tab first.', 'warning');
      return;
    }
    try {
      const settings = await getSettings();
      const letterText = await generateCoverLetter(parsed.rawText, job.description, job.company, job.title);
      const blob = await generateCoverLetterDocx(letterText, job.company, job.title, settings.templateStyle);
      const arrayBuffer = await blob.arrayBuffer();
      const blobId = `cl-${job.id}`;
      await idb.saveBlob('coverLetters', blobId, arrayBuffer);
      const updated = { ...job, coverLetterBlobId: blobId };
      await idb.saveJob(updated);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${job.company}-${job.title}-CoverLetter.docx`.replace(/[^a-zA-Z0-9\-_]/g, '_');
      a.click();
      URL.revokeObjectURL(url);
      showToast('Cover letter generated and downloaded', 'success');
      await loadData();
    } catch (e: any) {
      showToast('Failed to generate cover letter: ' + e.message, 'error');
    }
  };

  const filteredJobs = jobs.filter(j => {
    if (selectedSite !== 'all' && j.source !== selectedSite) return false;
    if ((j.score || 0) < minScore) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return j.title.toLowerCase().includes(q) || j.company.toLowerCase().includes(q);
    }
    return true;
  });

  const getLoginIcon = (siteId: string) => {
    const status = loginStatuses[siteId];
    if (status === true) return <CheckCircle className="w-4 h-4 text-accent-lime" />;
    if (status === false) return <XCircle className="w-4 h-4 text-accent-red" />;
    return <HelpCircle className="w-4 h-4 text-text-secondary" />;
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-bold text-text-primary mb-1">Scraper</h3>
        <p className="text-sm text-text-secondary">Scrape jobs, rank them, and generate tailored resumes.</p>
      </div>

      {/* Controls Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Job Sites */}
        <section className="bg-surface border border-border rounded-xl p-5 space-y-4">
          <h4 className="text-sm font-semibold text-text-primary uppercase tracking-wide">Job Sites</h4>
          <div className="space-y-2">
            {sites.filter(s => s.isBuiltIn).map(site => (
              <div key={site.id} className="flex items-center justify-between p-2 bg-surface-muted rounded-lg">
                <div className="flex items-center gap-2">
                  <Globe className="w-4 h-4 text-text-secondary" />
                  <span className="text-sm text-text-primary">{site.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  {getLoginIcon(site.id)}
                  <button
                    onClick={() => handleCheckLogin(site)}
                    className="text-xs text-accent-teal hover:underline"
                  >
                    Check
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Custom Sites */}
        <section className="bg-surface border border-border rounded-xl p-5 space-y-4">
          <h4 className="text-sm font-semibold text-text-primary uppercase tracking-wide">Custom Sites</h4>
          <textarea
            value={customUrls}
            onChange={(e) => setCustomUrls(e.target.value)}
            placeholder="Paste career page URLs, one per line..."
            className="w-full h-24 px-3 py-2 bg-surface-muted border border-border rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-accent-teal"
          />
          <button
            onClick={handleAddCustomSites}
            className="flex items-center gap-2 px-4 py-2 bg-accent-teal text-white rounded-lg text-sm hover:bg-opacity-90"
          >
            <Plus className="w-4 h-4" />
            Add Sites
          </button>
          <div className="space-y-1 max-h-32 overflow-auto">
            {sites.filter(s => !s.isBuiltIn).map(site => (
              <div key={site.id} className="flex items-center justify-between p-2 bg-surface-muted rounded-lg">
                <span className="text-xs text-text-secondary truncate">{site.urlPattern}</span>
                <button onClick={() => removeCustomSite(site.id).then(loadData)} className="text-accent-red hover:bg-accent-red-light p-1 rounded">
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* Run Controls */}
        <section className="bg-surface border border-border rounded-xl p-5 space-y-4">
          <h4 className="text-sm font-semibold text-text-primary uppercase tracking-wide">Run Controls</h4>
          <div className="flex gap-2">
            <button
              onClick={handleStartScraping}
              disabled={isRunning}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-accent-teal text-white rounded-lg text-sm hover:bg-opacity-90 disabled:opacity-50"
            >
              <Play className="w-4 h-4" />
              {isRunning ? 'Running...' : 'Start Scraping'}
            </button>
            <button
              onClick={handleStopScraping}
              disabled={!isRunning}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-accent-orange text-white rounded-lg text-sm hover:bg-opacity-90 disabled:opacity-50"
            >
              <Pause className="w-4 h-4" />
            </button>
          </div>
          <div>
            <label className="block text-xs text-text-secondary mb-1">Minimum Score: {minScore}</label>
            <input
              type="range"
              min={5}
              max={10}
              step={1}
              value={minScore}
              onChange={(e) => setMinScore(Number(e.target.value))}
              className="w-full accent-accent-teal"
            />
          </div>
          <select
            value={selectedSite}
            onChange={(e) => setSelectedSite(e.target.value)}
            className="w-full px-3 py-2 bg-surface-muted border border-border rounded-lg text-sm"
          >
            <option value="all">All Sites</option>
            {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <div>
            <label className="block text-xs text-text-secondary mb-1">Search Keywords (comma-separated)</label>
            <input
              type="text"
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              placeholder="e.g. software engineer, remote"
              className="w-full px-3 py-2 bg-surface-muted border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent-teal"
            />
          </div>
        </section>
      </div>

      {/* Results Table */}
      <section className="bg-surface border border-border rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between gap-4">
          <h4 className="text-sm font-semibold text-text-primary">Scraped Jobs ({filteredJobs.length})</h4>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search jobs..."
              className="pl-9 pr-4 py-1.5 bg-surface-muted border border-border rounded-lg text-sm w-64 focus:outline-none focus:ring-2 focus:ring-accent-teal"
            />
          </div>
        </div>

        {filteredJobs.length === 0 ? (
          <div className="p-12 text-center">
            <Search className="w-10 h-10 text-border mx-auto mb-3" />
            <p className="text-sm text-text-secondary">No jobs yet. Start scraping or browse LinkedIn to see jobs here.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-surface-muted text-left text-xs text-text-secondary uppercase">
                  <th className="px-6 py-3 font-medium">Company</th>
                  <th className="px-6 py-3 font-medium">Title</th>
                  <th className="px-6 py-3 font-medium">Salary</th>
                  <th className="px-6 py-3 font-medium">Site</th>
                  <th className="px-6 py-3 font-medium">Score</th>
                  <th className="px-6 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredJobs.map(job => (
                  <tr key={job.id} className="hover:bg-surface-muted/50 transition-colors">
                    <td className="px-6 py-4 text-sm text-text-primary font-medium">{job.company}</td>
                    <td className="px-6 py-4 text-sm text-text-secondary">{job.title}</td>
                    <td className="px-6 py-4 text-sm text-text-secondary">{job.salary && job.salary !== 'Unsure' && job.salary !== '' ? job.salary : <span className="text-text-secondary/50">—</span>}</td>
                    <td className="px-6 py-4">
                      <span className="px-2 py-1 bg-surface-muted text-text-secondary text-xs rounded-md uppercase">{job.source}</span>
                    </td>
                    <td className="px-6 py-4">
                      {job.score ? (
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          job.score >= 9 ? 'bg-accent-lime-light text-accent-lime' :
                          job.score >= 7 ? 'bg-accent-teal-light text-accent-teal' :
                          'bg-accent-orange-light text-accent-orange'
                        }`}>
                          {job.score}/10
                        </span>
                      ) : (
                        <button
                          onClick={() => handleRankJob(job)}
                          className="text-xs text-accent-teal hover:underline"
                        >
                          Rank
                        </button>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleOptimizeResume(job)}
                          className="flex items-center gap-1 px-2 py-1 bg-accent-teal text-white text-xs rounded hover:bg-opacity-90"
                          title="Optimize Resume"
                        >
                          <FileText className="w-3 h-3" />
                          Resume
                        </button>
                        <button
                          onClick={() => handleOptimizeCoverLetter(job)}
                          className="flex items-center gap-1 px-2 py-1 border border-accent-teal text-accent-teal text-xs rounded hover:bg-accent-teal-light"
                          title="Optimize Cover Letter"
                        >
                          <Mail className="w-3 h-3" />
                          CL
                        </button>
                        {(companyAppCounts[job.company] || 0) >= 3 ? (
                          <span className="flex items-center gap-1 px-2 py-1 bg-accent-orange-light text-accent-orange text-xs rounded cursor-not-allowed" title="Max 3 applications reached for this company">
                            <ExternalLink className="w-3 h-3" />
                            Limit
                          </span>
                        ) : (
                          <a
                            href={job.applicationUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-1 px-2 py-1 bg-accent-lime text-white text-xs rounded hover:bg-opacity-90"
                          >
                            <ExternalLink className="w-3 h-3" />
                            Apply
                          </a>
                        )}
                         <button
                           onClick={() => handleDeleteJob(job)}
                           className="p-1 text-text-secondary hover:text-accent-red"
                         >
                           <Trash2 className="w-3 h-3" />
                         </button>
                        {job.questions && job.questions.length > 0 && (
                          <button
                            onClick={() => setQuestionJob(job)}
                            className="flex items-center gap-1 px-2 py-1 bg-surface-muted border border-border text-text-secondary text-xs rounded hover:bg-border hover:text-text-primary"
                            title={`${job.questions.length} question(s) scraped`}
                          >
                            <QuestionIcon className="w-3 h-3" />
                            {job.questions.length}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Question Export Modal */}
      {questionJob && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-surface border border-border rounded-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
            <div className="px-6 py-4 border-b border-border flex items-center justify-between">
              <div>
                <h4 className="text-lg font-bold text-text-primary">Application Questions</h4>
                <p className="text-xs text-text-secondary">{questionJob.company} — {questionJob.title} ({questionJob.questions?.length || 0} questions)</p>
              </div>
              <button
                onClick={() => setQuestionJob(null)}
                className="p-1.5 text-text-secondary hover:text-text-primary hover:bg-surface-muted rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-auto p-6">
              {(!questionJob.questions || questionJob.questions.length === 0) ? (
                <div className="text-center py-8">
                  <QuestionIcon className="w-8 h-8 text-border mx-auto mb-2" />
                  <p className="text-sm text-text-secondary">No questions found. Visit the application page to scrape.</p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-text-secondary uppercase border-b border-border">
                      <th className="py-2 font-medium">Page</th>
                      <th className="py-2 font-medium">Field</th>
                      <th className="py-2 font-medium">Type</th>
                      <th className="py-2 font-medium">Req</th>
                      <th className="py-2 font-medium">Options</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {questionJob.questions.map((q, i) => (
                      <tr key={i}>
                        <td className="py-2 text-text-secondary">{q.pageIndex + 1}</td>
                        <td className="py-2 text-text-primary font-medium">{q.fieldLabel}</td>
                        <td className="py-2">
                          <span className="px-1.5 py-0.5 bg-surface-muted text-text-secondary text-[10px] rounded uppercase">{q.fieldType}</span>
                        </td>
                        <td className="py-2">{q.required ? <span className="text-accent-red">*</span> : <span className="text-text-secondary">—</span>}</td>
                        <td className="py-2 text-text-secondary text-xs">{q.options?.join(', ') || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="px-6 py-4 border-t border-border flex items-center justify-end gap-3">
              <button
                onClick={() => {
                  if (!questionJob.questions) return;
                  const data = {
                    jobId: questionJob.id,
                    company: questionJob.company,
                    title: questionJob.title,
                    url: questionJob.applicationUrl,
                    questions: questionJob.questions,
                    exportedAt: new Date().toISOString()
                  };
                  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `${questionJob.company}-questions.json`.replace(/[^a-zA-Z0-9\-_]/g, '_');
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                disabled={!questionJob.questions || questionJob.questions.length === 0}
                className="flex items-center gap-2 px-4 py-2 bg-surface-muted border border-border rounded-lg text-sm text-text-primary hover:bg-border disabled:opacity-50"
              >
                <Download className="w-4 h-4" />
                Export JSON
              </button>
              <button
                onClick={() => {
                  if (!questionJob.questions) return;
                  const headers = ['Page', 'Field Label', 'Type', 'Required', 'Options', 'Selector'];
                  const rows = questionJob.questions.map(q => [
                    String(q.pageIndex + 1),
                    q.fieldLabel,
                    q.fieldType,
                    q.required ? 'Yes' : 'No',
                    (q.options || []).join('; '),
                    q.selector
                  ]);
                  const csv = [headers, ...rows].map(r => r.map(x => `"${String(x).replace(/"/g, '""')}"`).join(',')).join('\n');
                  const blob = new Blob([csv], { type: 'text/csv' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `${questionJob.company}-questions.csv`.replace(/[^a-zA-Z0-9\-_]/g, '_');
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                disabled={!questionJob.questions || questionJob.questions.length === 0}
                className="flex items-center gap-2 px-4 py-2 bg-accent-teal text-white rounded-lg text-sm hover:bg-opacity-90 disabled:opacity-50"
              >
                <Download className="w-4 h-4" />
                Export CSV
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
