import { useState, useEffect } from 'react';
import { Plus, ExternalLink, Trash2, Building2, GripVertical } from 'lucide-react';
import { idb } from '../../lib/storage';
import type { ApplicationRecord, JobListing, ApplicationStatus } from '../../types';

const COLUMNS = [
  { id: 'saved', label: 'Saved', color: 'bg-text-secondary' },
  { id: 'applied', label: 'Applied', color: 'bg-accent-teal' },
  { id: 'interviewing', label: 'Interviewing', color: 'bg-accent-lime' },
  { id: 'rejected', label: 'Rejected', color: 'bg-accent-red' },
  { id: 'offer', label: 'Offer', color: 'bg-accent-orange' },
];

export function ApplicationsTab() {
  const [applications, setApplications] = useState<ApplicationRecord[]>([]);
  const [jobs, setJobs] = useState<Record<string, JobListing>>({});
  const [companyCounts, setCompanyCounts] = useState<Record<string, number>>({});
  const [showAddModal, setShowAddModal] = useState(false);
  const [newAppUrl, setNewAppUrl] = useState('');
  const [newAppCompany, setNewAppCompany] = useState('');
  const [newAppTitle, setNewAppTitle] = useState('');
  const [draggedAppId, setDraggedAppId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const apps = await idb.getApplications();
    const allJobs = await idb.getJobs();
    const jobMap: Record<string, JobListing> = {};
    allJobs.forEach(j => { jobMap[j.id] = j; });
    setJobs(jobMap);
    setApplications(apps);

    const counts: Record<string, number> = {};
    apps.forEach(a => {
      if (['applied', 'interviewing', 'offer'].includes(a.status)) {
        counts[a.company] = (counts[a.company] || 0) + 1;
      }
    });
    setCompanyCounts(counts);
  };

  const handleStatusChange = async (appId: string, newStatus: string) => {
    const app = applications.find(a => a.id === appId);
    if (!app) return;
    app.status = newStatus as ApplicationStatus;
    app.statusHistory.push({ status: newStatus as ApplicationStatus, at: Date.now(), source: 'manual' });
    await idb.saveApplication(app);
    await loadData();
  };

  const handleAddManual = async () => {
    if (!newAppCompany || !newAppTitle) return;
    const app: ApplicationRecord = {
      id: crypto.randomUUID(),
      jobId: 'manual-' + Date.now(),
      company: newAppCompany,
      applicationUrl: newAppUrl,
      status: 'saved',
      statusHistory: [{ status: 'saved', at: Date.now(), source: 'manual' }],
      appliedAt: undefined,
    };
    await idb.saveApplication(app);
    setShowAddModal(false);
    setNewAppUrl('');
    setNewAppCompany('');
    setNewAppTitle('');
    await loadData();
  };

  const handleDelete = async (id: string) => {
    await idb.deleteApplication(id);
    await loadData();
  };

  const getAppsForColumn = (status: string) =>
    applications.filter(a => a.status === status);

  // Drag and Drop handlers
  const onDragStart = (e: React.DragEvent, appId: string) => {
    setDraggedAppId(appId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', appId);
    // Add a slight delay so the drag image is captured before opacity changes
    setTimeout(() => {
      const el = document.querySelector(`[data-app-id="${appId}"]`);
      if (el) el.classList.add('dragging');
    }, 0);
  };

  const onDragEnd = (_e: React.DragEvent, appId: string) => {
    setDraggedAppId(null);
    setDragOverColumn(null);
    const el = document.querySelector(`[data-app-id="${appId}"]`);
    if (el) el.classList.remove('dragging');
  };

  const onDragOver = (e: React.DragEvent, colId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverColumn(colId);
  };

  const onDragLeave = (_e: React.DragEvent) => {
    setDragOverColumn(null);
  };

  const onDrop = async (e: React.DragEvent, colId: string) => {
    e.preventDefault();
    setDragOverColumn(null);
    const appId = e.dataTransfer.getData('text/plain') || draggedAppId;
    if (!appId) return;
    const app = applications.find(a => a.id === appId);
    if (!app || app.status === colId) return;
    await handleStatusChange(appId, colId);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-bold text-text-primary mb-1">Applications</h3>
          <p className="text-sm text-text-secondary">Drag cards between columns to update status.</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-accent-teal text-white rounded-lg text-sm hover:bg-opacity-90"
        >
          <Plus className="w-4 h-4" />
          Add Application
        </button>
      </div>

      {/* Kanban Board */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        {COLUMNS.map(col => {
          const colApps = getAppsForColumn(col.id);
          const isDragOver = dragOverColumn === col.id;
          return (
            <div
              key={col.id}
              className={`bg-surface border rounded-xl flex flex-col transition-colors ${
                isDragOver ? 'border-accent-teal border-dashed bg-accent-teal-light/30' : 'border-border'
              }`}
              onDragOver={(e) => onDragOver(e, col.id)}
              onDragLeave={onDragLeave}
              onDrop={(e) => onDrop(e, col.id)}
            >
              <div className={`px-4 py-3 border-b border-border flex items-center gap-2`}>
                <div className={`w-2 h-2 rounded-full ${col.color}`} />
                <h4 className="text-sm font-semibold text-text-primary">{col.label}</h4>
                <span className="ml-auto text-xs text-text-secondary bg-surface-muted px-2 py-0.5 rounded-full">{colApps.length}</span>
              </div>
              <div className="p-3 space-y-3 flex-1 min-h-[200px]">
                {colApps.map(app => {
                  const job = jobs[app.jobId];
                  const count = companyCounts[app.company] || 0;
                  const nearLimit = count >= 3;
                  const isDragging = draggedAppId === app.id;
                  return (
                    <div
                      key={app.id}
                      data-app-id={app.id}
                      draggable
                      onDragStart={(e) => onDragStart(e, app.id)}
                      onDragEnd={(e) => onDragEnd(e, app.id)}
                      className={`bg-surface-muted border rounded-lg p-3 cursor-grab active:cursor-grabbing transition-all ${
                        isDragging ? 'opacity-50 scale-[0.98]' : 'hover:border-accent-teal/30'
                      } border-border`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-1.5 flex-1 min-w-0">
                          <GripVertical className="w-3 h-3 text-text-secondary/50 shrink-0" />
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-text-primary truncate">{job?.title || app.applicationUrl}</p>
                            <div className="flex items-center gap-1 mt-1">
                              <Building2 className="w-3 h-3 text-text-secondary" />
                              <span className="text-xs text-text-secondary">{app.company}</span>
                            </div>
                            {job?.score && (
                              <span className={`inline-block mt-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                job.score >= 9 ? 'bg-accent-lime-light text-accent-lime' :
                                job.score >= 7 ? 'bg-accent-teal-light text-accent-teal' :
                                'bg-accent-orange-light text-accent-orange'
                              }`}>
                                {job.score}/10
                              </span>
                            )}
                            {nearLimit && (
                              <span className="block mt-1 text-[10px] text-accent-orange">{count}/3 applications</span>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-col gap-1">
                          <a
                            href={app.applicationUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="p-1 text-text-secondary hover:text-accent-teal"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <ExternalLink className="w-3 h-3" />
                          </a>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDelete(app.id); }}
                            className="p-1 text-text-secondary hover:text-accent-red"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                      <select
                        value={app.status}
                        onChange={(e) => handleStatusChange(app.id, e.target.value)}
                        className="mt-2 w-full px-2 py-1 bg-surface border border-border rounded text-xs text-text-secondary cursor-pointer"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {COLUMNS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                      </select>
                    </div>
                  );
                })}
                {colApps.length === 0 && (
                  <div className={`text-center py-6 rounded-lg border-2 border-dashed transition-colors ${
                    isDragOver ? 'border-accent-teal bg-accent-teal-light/20' : 'border-border'
                  }`}>
                    <p className="text-xs text-text-secondary">Drop here</p>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-surface border border-border rounded-xl p-6 w-full max-w-md space-y-4">
            <h4 className="text-lg font-bold text-text-primary">Add Application Manually</h4>
            <input
              type="text"
              value={newAppCompany}
              onChange={(e) => setNewAppCompany(e.target.value)}
              placeholder="Company name"
              className="w-full px-4 py-2 bg-surface-muted border border-border rounded-lg text-sm"
            />
            <input
              type="text"
              value={newAppTitle}
              onChange={(e) => setNewAppTitle(e.target.value)}
              placeholder="Job title"
              className="w-full px-4 py-2 bg-surface-muted border border-border rounded-lg text-sm"
            />
            <input
              type="url"
              value={newAppUrl}
              onChange={(e) => setNewAppUrl(e.target.value)}
              placeholder="Application URL (optional)"
              className="w-full px-4 py-2 bg-surface-muted border border-border rounded-lg text-sm"
            />
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary"
              >
                Cancel
              </button>
              <button
                onClick={handleAddManual}
                className="px-4 py-2 bg-accent-teal text-white rounded-lg text-sm hover:bg-opacity-90"
              >
                Add
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
