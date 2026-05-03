import { useState, useEffect } from 'react';
import { Upload, FileText, RefreshCw, Download, Eye, Trash2, X, AlertCircle, CheckCircle, Loader2, Palette, LayoutList } from 'lucide-react';
import { saveSettings, idb } from '../../lib/storage';
import { extractTemplateStyle } from '../../lib/template-extractor';
import type { ExtractedTemplateStyle } from '../../lib/template-extractor';
import type { JobListing } from '../../types';

// Lazy-load mammoth to reduce initial bundle size
const mammothPromise = import('mammoth');

interface FileMeta {
  name: string;
  size: number;
  date: number;
}

interface GeneratedFile {
  id: string;
  createdAt: number;
  job?: JobListing;
  type: 'resume' | 'coverLetter';
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleString();
}

export function ResumeTab() {
  const [resumeFile, setResumeFile] = useState<FileMeta | null>(null);
  const [coverLetterFile, setCoverLetterFile] = useState<FileMeta | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [resumeText, setResumeText] = useState('');
  const [parsedSkills, setParsedSkills] = useState<string[]>([]);
  const [parsedExperience, setParsedExperience] = useState<string[]>([]);
  const [parsedEducation, setParsedEducation] = useState<string[]>([]);
  const [extractedStyle, setExtractedStyle] = useState<ExtractedTemplateStyle | null>(null);
  const [generatedFiles, setGeneratedFiles] = useState<GeneratedFile[]>([]);
  const [isLoadingGenerated, setIsLoadingGenerated] = useState(false);

  useEffect(() => {
    loadAllData();
  }, []);

  const loadAllData = async () => {
    await loadTemplateData();
    await loadGeneratedFiles();
  };

  const loadTemplateData = async () => {
    const storedMeta = await chrome.storage.local.get(['resumeFileMeta', 'coverLetterFileMeta', 'extractedStyle']);

    if (storedMeta.resumeFileMeta) {
      setResumeFile(storedMeta.resumeFileMeta);
    }
    if (storedMeta.coverLetterFileMeta) {
      setCoverLetterFile(storedMeta.coverLetterFileMeta);
    }
    if (storedMeta.extractedStyle) {
      setExtractedStyle(storedMeta.extractedStyle);
    }

    // Also check if we have parsed text already, avoiding unnecessary re-parse
    if (storedMeta.resumeFileMeta && !resumeText) {
      const storedParsed = await chrome.storage.local.get('parsedResume');
      if (storedParsed.parsedResume?.rawText) {
        setResumeText(storedParsed.parsedResume.rawText);
        setParsedSkills(storedParsed.parsedResume.skills || []);
        setParsedExperience(storedParsed.parsedResume.experience || []);
        setParsedEducation(storedParsed.parsedResume.education || []);
      } else {
        const blob = await idb.getTemplateBlob('resume-template');
        if (blob) {
          await parseDocx(blob, false);
        }
      }
    }
  };

  const loadGeneratedFiles = async () => {
    setIsLoadingGenerated(true);
    try {
      const [resumeBlobs, clBlobs, jobs] = await Promise.all([
        idb.getAllBlobs('resumes'),
        idb.getAllBlobs('coverLetters'),
        idb.getJobs()
      ]);

      const jobMap = new Map(jobs.map(j => [j.id, j]));

      const files: GeneratedFile[] = [
        ...resumeBlobs.map(b => ({
          id: b.id,
          createdAt: b.createdAt,
          job: jobMap.get(b.id.replace('resume-', '')),
          type: 'resume' as const
        })),
        ...clBlobs.map(b => ({
          id: b.id,
          createdAt: b.createdAt,
          job: jobMap.get(b.id.replace('cl-', '')),
          type: 'coverLetter' as const
        }))
      ];

      files.sort((a, b) => b.createdAt - a.createdAt);
      setGeneratedFiles(files);
    } finally {
      setIsLoadingGenerated(false);
    }
  };

  const parseDocx = async (arrayBuffer: ArrayBuffer, showLoading = true) => {
    if (showLoading) setIsParsing(true);
    setParseError(null);
    try {
      const { default: mammoth } = await mammothPromise;
      const result = await mammoth.convertToHtml({ arrayBuffer });
      const text = result.value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      setResumeText(text);

      const skillsMatch = text.match(/skills?[\s:]*([^\n]+)/i);
      const skills = skillsMatch ? skillsMatch[1].split(/[,;|]/).map(s => s.trim()).filter(Boolean) : [];
      setParsedSkills(skills);

      const expMatches = text.match(/experience[\s\S]*?(education|skills|$)/i);
      setParsedExperience(expMatches ? [expMatches[0].slice(0, 500)] : []);

      const eduMatches = text.match(/education[\s\S]*?(experience|skills|$)/i);
      setParsedEducation(eduMatches ? [eduMatches[0].slice(0, 300)] : []);

      // Extract template style from mammoth HTML
      const style = extractTemplateStyle(result.value);
      setExtractedStyle(style);

      await Promise.all([
        chrome.storage.local.set({
          parsedResume: {
            rawText: text,
            htmlContent: result.value,
            skills,
            experience: expMatches ? [expMatches[0].slice(0, 500)] : [],
            education: eduMatches ? [eduMatches[0].slice(0, 300)] : []
          },
          extractedStyle: style
        }),
        saveSettings({ templateStyle: style })
      ]);
    } catch (e: any) {
      setParseError(e.message || 'Failed to parse .docx file');
    } finally {
      if (showLoading) setIsParsing(false);
    }
  };

  const handleResumeUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (!file.name.endsWith('.docx')) {
      setParseError('Please upload a .docx file');
      return;
    }

    setParseError(null);
    const arrayBuffer = await file.arrayBuffer();

    const meta: FileMeta = {
      name: file.name,
      size: file.size,
      date: Date.now()
    };

    try {
      await idb.saveTemplateBlob('resume-template', arrayBuffer);
      await chrome.storage.local.set({ resumeFileMeta: meta });
      setResumeFile(meta);
      await parseDocx(arrayBuffer);
    } catch (e: any) {
      setParseError('Failed to save resume: ' + e.message);
    }
  };

  const handleCoverLetterUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (!file.name.endsWith('.docx')) {
      setParseError('Please upload a .docx file');
      return;
    }

    setParseError(null);
    const arrayBuffer = await file.arrayBuffer();

    const meta: FileMeta = {
      name: file.name,
      size: file.size,
      date: Date.now()
    };

    try {
      await idb.saveTemplateBlob('coverletter-template', arrayBuffer);
      await chrome.storage.local.set({ coverLetterFileMeta: meta });
      setCoverLetterFile(meta);
    } catch (e: any) {
      setParseError('Failed to save cover letter: ' + e.message);
    }
  };

  const handleRemoveResume = async () => {
    await idb.deleteTemplateBlob('resume-template');
    await chrome.storage.local.remove(['resumeFileMeta', 'parsedResume', 'extractedStyle']);
    await saveSettings({ templateStyle: undefined });
    setResumeFile(null);
    setResumeText('');
    setParsedSkills([]);
    setParsedExperience([]);
    setParsedEducation([]);
    setExtractedStyle(null);
  };

  const handleRemoveCoverLetter = async () => {
    await idb.deleteTemplateBlob('coverletter-template');
    await chrome.storage.local.remove('coverLetterFileMeta');
    setCoverLetterFile(null);
  };

  const handleReparse = async () => {
    const blob = await idb.getTemplateBlob('resume-template');
    if (blob) {
      await parseDocx(blob);
    }
  };

  const handlePreview = async (file: GeneratedFile) => {
    const store = file.type === 'resume' ? 'resumes' : 'coverLetters';
    const blob = await idb.getBlob(store, file.id);
    if (!blob) return;

    if (file.type === 'resume') {
      try {
        const { default: mammoth } = await mammothPromise;
        const result = await mammoth.convertToHtml({ arrayBuffer: blob });
        const html = `
          <!DOCTYPE html>
          <html><head><meta charset="utf-8"><title>Preview</title>
          <style>body{font-family:system-ui,sans-serif;max-width:800px;margin:40px auto;padding:20px;line-height:1.6}</style>
          </head><body>${result.value}</body></html>`;
        const previewBlob = new Blob([html], { type: 'text/html' });
        const url = URL.createObjectURL(previewBlob);
        window.open(url, '_blank');
        return;
      } catch {
        // Fall through to raw download
      }
    }

    const mime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    const b = new Blob([blob], { type: mime });
    const url = URL.createObjectURL(b);
    window.open(url, '_blank');
  };

  const handleDownload = async (file: GeneratedFile) => {
    const store = file.type === 'resume' ? 'resumes' : 'coverLetters';
    const blob = await idb.getBlob(store, file.id);
    if (!blob) return;

    const job = file.job;
    const prefix = job ? `${job.company}-${job.title}` : file.type;
    const filename = `${prefix}-${file.type === 'resume' ? 'Resume' : 'CoverLetter'}.docx`.replace(/[^a-zA-Z0-9\-_]/g, '_');

    const mime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    const b = new Blob([blob], { type: mime });
    const url = URL.createObjectURL(b);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDeleteGenerated = async (file: GeneratedFile) => {
    const store = file.type === 'resume' ? 'resumes' : 'coverLetters';
    await idb.deleteBlob(store, file.id);
    await loadGeneratedFiles();
  };

  const FileCard = ({ meta, onReplace, onRemove, icon: Icon }: { meta: FileMeta; onReplace: (e: React.ChangeEvent<HTMLInputElement>) => void; onRemove: () => void; icon: React.ElementType }) => (
    <div className="flex items-center gap-3 p-4 bg-surface-muted border border-border rounded-lg">
      <div className="w-10 h-10 bg-accent-teal-light rounded-lg flex items-center justify-center shrink-0">
        <Icon className="w-5 h-5 text-accent-teal" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-text-primary truncate">{meta.name}</p>
        <p className="text-xs text-text-secondary">{formatBytes(meta.size)} · Uploaded {formatDate(meta.date)}</p>
      </div>
      <div className="flex items-center gap-2">
        <label className="px-3 py-1.5 text-xs text-accent-teal hover:bg-accent-teal-light rounded-md cursor-pointer transition-colors">
          Replace
          <input type="file" accept=".docx" className="hidden" onChange={onReplace} />
        </label>
        <button
          onClick={onRemove}
          className="p-1.5 text-text-secondary hover:text-accent-red hover:bg-accent-red-light rounded-md transition-colors"
          title="Remove"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );

  const UploadZone = ({ onUpload, label }: { onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void; label: string }) => (
    <label className="flex flex-col items-center justify-center gap-2 w-full px-4 py-8 border-2 border-dashed border-border rounded-lg cursor-pointer hover:border-accent-teal hover:bg-accent-teal-light/10 transition-colors">
      <Upload className="w-8 h-8 text-text-secondary" />
      <span className="text-sm text-text-secondary">{label}</span>
      <span className="text-xs text-text-secondary/60">.docx files only</span>
      <input type="file" accept=".docx" className="hidden" onChange={onUpload} />
    </label>
  );

  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-xl font-bold text-text-primary mb-1">Resume & Cover Letter</h3>
        <p className="text-sm text-text-secondary">Upload your base templates and manage generated files.</p>
      </div>

      {parseError && (
        <div className="flex items-center gap-2 p-4 bg-accent-red-light border border-accent-red/20 rounded-lg text-accent-red text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span className="flex-1">{parseError}</span>
          <button onClick={() => setParseError(null)} className="p-1 hover:bg-accent-red/10 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column - Upload & Parse */}
        <div className="space-y-6">
          <section className="bg-surface border border-border rounded-xl p-6 space-y-4">
            <h4 className="text-sm font-semibold text-text-primary uppercase tracking-wide">Upload Templates</h4>

            {/* Resume Upload */}
            <div>
              <label className="block text-sm font-medium text-text-primary mb-2">Base Resume (.docx)</label>
              {resumeFile ? (
                <FileCard
                  meta={resumeFile}
                  onReplace={handleResumeUpload}
                  onRemove={handleRemoveResume}
                  icon={FileText}
                />
              ) : (
                <UploadZone onUpload={handleResumeUpload} label="Drop resume or click to browse" />
              )}
            </div>

            {/* Cover Letter Upload */}
            <div>
              <label className="block text-sm font-medium text-text-primary mb-2">Cover Letter Template (.docx)</label>
              {coverLetterFile ? (
                <FileCard
                  meta={coverLetterFile}
                  onReplace={handleCoverLetterUpload}
                  onRemove={handleRemoveCoverLetter}
                  icon={FileText}
                />
              ) : (
                <UploadZone onUpload={handleCoverLetterUpload} label="Drop cover letter or click to browse" />
              )}
            </div>
          </section>

          {/* Extracted Style Info */}
          {extractedStyle && (
            <section className="bg-surface border border-border rounded-xl p-6 space-y-3">
              <div className="flex items-center gap-2">
                <Palette className="w-4 h-4 text-accent-teal" />
                <h4 className="text-sm font-semibold text-text-primary uppercase tracking-wide">Detected Style</h4>
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-text-secondary">Font:</span>
                  <span className="text-text-primary font-medium">{extractedStyle.fontFamily}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-text-secondary">Heading:</span>
                  <span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: '#' + extractedStyle.headingColor }} />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-text-secondary">Body:</span>
                  <span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: '#' + extractedStyle.bodyColor }} />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-text-secondary">Accent:</span>
                  <span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: '#' + extractedStyle.accentColor }} />
                </div>
              </div>
              <div className="flex items-center gap-2 pt-2 border-t border-border">
                <LayoutList className="w-3 h-3 text-text-secondary" />
                <span className="text-xs text-text-secondary">Section order: {extractedStyle.sectionOrder.map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' → ')}</span>
              </div>
            </section>
          )}

          {/* Parsed Preview */}
          {isParsing && (
            <div className="flex items-center gap-3 p-4 bg-surface-muted border border-border rounded-lg">
              <Loader2 className="w-5 h-5 text-accent-teal animate-spin" />
              <span className="text-sm text-text-secondary">Parsing resume...</span>
            </div>
          )}

          {resumeText && !isParsing && (
            <section className="bg-surface border border-border rounded-xl p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-accent-lime" />
                  <h4 className="text-sm font-semibold text-text-primary uppercase tracking-wide">Parsed Preview</h4>
                </div>
                <button
                  onClick={handleReparse}
                  className="flex items-center gap-1 text-xs text-accent-teal hover:underline"
                >
                  <RefreshCw className="w-3 h-3" />
                  Re-parse
                </button>
              </div>

              <div className="space-y-3">
                <details className="group">
                  <summary className="flex items-center gap-2 text-sm font-medium text-text-primary cursor-pointer">
                    <FileText className="w-4 h-4 text-accent-teal" />
                    Skills ({parsedSkills.length})
                  </summary>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {parsedSkills.map((skill, i) => (
                      <span key={i} className="px-2 py-1 bg-accent-teal-light text-accent-teal text-xs rounded-md">{skill}</span>
                    ))}
                    {parsedSkills.length === 0 && <p className="text-xs text-text-secondary">No skills detected automatically.</p>}
                  </div>
                </details>

                <details className="group">
                  <summary className="flex items-center gap-2 text-sm font-medium text-text-primary cursor-pointer">
                    <FileText className="w-4 h-4 text-accent-teal" />
                    Experience
                  </summary>
                  <div className="mt-2 text-xs text-text-secondary whitespace-pre-wrap">
                    {parsedExperience.join('\n\n') || 'No experience detected.'}
                  </div>
                </details>

                <details className="group">
                  <summary className="flex items-center gap-2 text-sm font-medium text-text-primary cursor-pointer">
                    <FileText className="w-4 h-4 text-accent-teal" />
                    Education
                  </summary>
                  <div className="mt-2 text-xs text-text-secondary whitespace-pre-wrap">
                    {parsedEducation.join('\n\n') || 'No education detected.'}
                  </div>
                </details>
              </div>
            </section>
          )}
        </div>

        {/* Right Column - Generated Files */}
        <div className="space-y-6">
          <section className="bg-surface border border-border rounded-xl p-6 space-y-4">
            <h4 className="text-sm font-semibold text-text-primary uppercase tracking-wide">Generated Files</h4>

            {isLoadingGenerated ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 text-accent-teal animate-spin" />
              </div>
            ) : generatedFiles.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <FileText className="w-10 h-10 text-border mb-3" />
                <p className="text-sm text-text-secondary">No generated files yet.</p>
                <p className="text-xs text-text-secondary mt-1">Go to the Scraper tab and click "Resume" or "CL" to generate tailored documents.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {generatedFiles.map(file => (
                  <div key={file.id} className="flex items-center gap-3 p-4 bg-surface-muted border border-border rounded-lg hover:border-accent-teal/30 transition-colors">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                      file.type === 'resume' ? 'bg-accent-teal-light' : 'bg-accent-orange-light'
                    }`}>
                      <FileText className={`w-5 h-5 ${
                        file.type === 'resume' ? 'text-accent-teal' : 'text-accent-orange'
                      }`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-text-primary truncate">
                        {file.job ? `${file.job.company} — ${file.job.title}` : file.id}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded uppercase font-medium ${
                          file.type === 'resume'
                            ? 'bg-accent-teal-light text-accent-teal'
                            : 'bg-accent-orange-light text-accent-orange'
                        }`}>
                          {file.type === 'resume' ? 'Resume' : 'Cover Letter'}
                        </span>
                        {file.job?.score && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                            file.job.score >= 9 ? 'bg-accent-lime-light text-accent-lime' :
                            file.job.score >= 7 ? 'bg-accent-teal-light text-accent-teal' :
                            'bg-accent-orange-light text-accent-orange'
                          }`}>
                            {file.job.score}/10
                          </span>
                        )}
                        <span className="text-xs text-text-secondary">{formatDate(file.createdAt)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handlePreview(file)}
                        className="p-1.5 text-text-secondary hover:text-accent-teal hover:bg-accent-teal-light rounded-md transition-colors"
                        title="Preview in new tab"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDownload(file)}
                        className="p-1.5 text-text-secondary hover:text-accent-teal hover:bg-accent-teal-light rounded-md transition-colors"
                        title="Download"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteGenerated(file)}
                        className="p-1.5 text-text-secondary hover:text-accent-red hover:bg-accent-red-light rounded-md transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
