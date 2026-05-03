import { useState, useEffect } from 'react';
import { List, ArrowUpDown, Filter, Download, FileText, Mail, ExternalLink } from 'lucide-react';
import { idb, getSettings } from '../../lib/storage';
import { rankJob, optimizeResume, generateCoverLetter } from '../../lib/api';
import { generateResumeDocx, generateCoverLetterDocx } from '../../lib/resume-generator';
import type { JobListing } from '../../types';

export function RankingsTab() {
  const [jobs, setJobs] = useState<JobListing[]>([]);
  const [sortBy, setSortBy] = useState<'score' | 'company' | 'date'>('score');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [filterSite, setFilterSite] = useState('all');
  const [filterCompany, setFilterCompany] = useState('');
  const [companyAppCounts, setCompanyAppCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    loadJobs();
  }, []);

  const loadJobs = async () => {
    const all = await idb.getJobs();
    setJobs(all.filter(j => j.score !== undefined));
    const apps = await idb.getApplications();
    const counts: Record<string, number> = {};
    apps.forEach(a => {
      if (['applied', 'interviewing', 'offer'].includes(a.status)) {
        counts[a.company] = (counts[a.company] || 0) + 1;
      }
    });
    setCompanyAppCounts(counts);
  };

  const sortedJobs = [...jobs].sort((a, b) => {
    let cmp = 0;
    if (sortBy === 'score') cmp = (a.score || 0) - (b.score || 0);
    else if (sortBy === 'company') cmp = a.company.localeCompare(b.company);
    else cmp = (a.scrapedAt || 0) - (b.scrapedAt || 0);
    return sortDir === 'asc' ? cmp : -cmp;
  }).filter(j => {
    if (filterSite !== 'all' && j.source !== filterSite) return false;
    if (filterCompany && !j.company.toLowerCase().includes(filterCompany.toLowerCase())) return false;
    return true;
  });

  const handleExportCSV = () => {
    const headers = ['Company', 'Title', 'Site', 'Score', 'Reason', 'URL'];
    const rows = sortedJobs.map(j => [
      j.company,
      j.title,
      j.source,
      String(j.score || ''),
      j.scoreReason || '',
      j.applicationUrl
    ]);
    const csv = [headers, ...rows].map(r => r.map(x => `"${String(x).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `job-rankings-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const sites = Array.from(new Set(jobs.map(j => j.source)));

  const handleRankJob = async (job: JobListing) => {
    if (!job.description || job.description.trim().length < 20) {
      alert('This job has no description to rank against. Re-scrape with the detail scraper first.');
      return;
    }
    const stored = await chrome.storage.local.get('parsedResume');
    const parsed = stored.parsedResume;
    if (!parsed?.rawText) {
      alert('Please upload and parse your resume in the Resume tab first.');
      return;
    }
    const result = await rankJob(parsed.rawText, job.description);
    const updated = { ...job, score: result.score, scoreReason: result.reason };
    await idb.saveJob(updated);
    await loadJobs();
  };

  const handleOptimizeResume = async (job: JobListing) => {
    const stored = await chrome.storage.local.get('parsedResume');
    const parsed = stored.parsedResume;
    if (!parsed) {
      alert('Please upload and parse your resume in the Resume tab first.');
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
      await loadJobs();
    } catch (e: any) {
      alert('Failed to generate resume: ' + e.message);
    }
  };

  const handleOptimizeCoverLetter = async (job: JobListing) => {
    const stored = await chrome.storage.local.get('parsedResume');
    const parsed = stored.parsedResume;
    if (!parsed?.rawText) {
      alert('Please upload and parse your resume in the Resume tab first.');
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
      await loadJobs();
    } catch (e: any) {
      alert('Failed to generate cover letter: ' + e.message);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-bold text-text-primary mb-1">Rankings</h3>
        <p className="text-sm text-text-secondary">View and sort your ranked job listings.</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 bg-surface border border-border rounded-xl p-4">
        <div className="flex items-center gap-2">
          <ArrowUpDown className="w-4 h-4 text-text-secondary" />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="px-3 py-1.5 bg-surface-muted border border-border rounded-lg text-sm"
          >
            <option value="score">Score</option>
            <option value="company">Company</option>
            <option value="date">Date</option>
          </select>
          <button
            onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')}
            className="px-3 py-1.5 bg-surface-muted border border-border rounded-lg text-sm text-text-secondary hover:text-text-primary"
          >
            {sortDir === 'asc' ? 'ASC' : 'DESC'}
          </button>
        </div>

        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-text-secondary" />
          <select
            value={filterSite}
            onChange={(e) => setFilterSite(e.target.value)}
            className="px-3 py-1.5 bg-surface-muted border border-border rounded-lg text-sm"
          >
            <option value="all">All Sites</option>
            {sites.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        <input
          type="text"
          value={filterCompany}
          onChange={(e) => setFilterCompany(e.target.value)}
          placeholder="Filter by company..."
          className="px-3 py-1.5 bg-surface-muted border border-border rounded-lg text-sm"
        />

        <button
          onClick={handleExportCSV}
          className="flex items-center gap-2 px-3 py-1.5 bg-surface-muted border border-border rounded-lg text-sm text-text-primary hover:bg-border ml-auto"
        >
          <Download className="w-4 h-4" />
          Export CSV
        </button>
      </div>

      {/* Rankings List */}
      <div className="space-y-3">
        {sortedJobs.length === 0 ? (
          <div className="bg-surface border border-border rounded-xl p-12 text-center">
            <List className="w-10 h-10 text-border mx-auto mb-3" />
            <p className="text-sm text-text-secondary">No ranked jobs yet. Go to the Scraper tab and rank some jobs first.</p>
          </div>
        ) : (
          sortedJobs.map(job => (
            <div key={job.id} className="bg-surface border border-border rounded-xl p-5 hover:border-accent-teal/30 transition-colors">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-1">
                    <h4 className="text-base font-semibold text-text-primary">{job.title}</h4>
                    <span className="px-2 py-0.5 bg-surface-muted text-text-secondary text-xs rounded-md uppercase">{job.source}</span>
                  </div>
                  <p className="text-sm text-text-secondary mb-2">{job.company}{job.location ? ` · ${job.location}` : ''}{job.salary && job.salary !== 'Unsure' ? ` · ${job.salary}` : ''}</p>
                  {job.scoreReason && (
                    <p className="text-xs text-text-secondary italic">"{job.scoreReason}"</p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-2">
                  {job.score ? (
                    <span className={`inline-flex items-center justify-center w-10 h-10 rounded-full text-sm font-bold ${
                      job.score >= 9 ? 'bg-accent-lime-light text-accent-lime' :
                      job.score >= 7 ? 'bg-accent-teal-light text-accent-teal' :
                      'bg-accent-orange-light text-accent-orange'
                    }`}>
                      {job.score}
                    </span>
                  ) : (
                    <button
                      onClick={() => handleRankJob(job)}
                      className="inline-flex items-center justify-center w-10 h-10 rounded-full text-xs font-medium bg-surface-muted text-accent-teal hover:bg-accent-teal-light"
                    >
                      Rank
                    </button>
                  )}
                  <div className="flex items-center gap-1">
                    <button onClick={() => handleOptimizeResume(job)} className="p-1.5 text-accent-teal hover:bg-accent-teal-light rounded" title="Optimize Resume">
                      <FileText className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleOptimizeCoverLetter(job)} className="p-1.5 text-accent-teal hover:bg-accent-teal-light rounded" title="Optimize Cover Letter">
                      <Mail className="w-4 h-4" />
                    </button>
                    {(companyAppCounts[job.company] || 0) >= 3 ? (
                      <span className="p-1.5 text-accent-orange rounded cursor-not-allowed" title="Max 3 applications reached">
                        <ExternalLink className="w-4 h-4" />
                      </span>
                    ) : (
                      <a
                        href={job.applicationUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="p-1.5 text-accent-lime hover:bg-accent-lime-light rounded"
                        title="Apply"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
