import { openDB } from 'idb';
import type { DBSchema, IDBPDatabase } from 'idb';

export type ApplicationStatus = 'saved' | 'applied' | 'interviewing' | 'rejected' | 'offer';
export const SALARY_UNKNOWN = 'Unsure';

import type { JobListing, ApplicationRecord, UserSettings, ScrapeTask, SiteConfig, LoginStatus } from '../types';

interface AjaDB extends DBSchema {
  jobs: {
    key: string;
    value: JobListing;
    indexes: {
      'by-company': string;
      'by-status': string;
      'by-sourceUrl': string;
      'by-applicationUrl': string;
    };
  };
  applications: {
    key: string;
    value: ApplicationRecord;
    indexes: { 'by-company': string; 'by-status': string };
  };
  resumes: {
    key: string;
    value: { id: string; blob: ArrayBuffer; createdAt: number };
  };
  coverLetters: {
    key: string;
    value: { id: string; blob: ArrayBuffer; createdAt: number };
  };
  tasks: {
    key: string;
    value: ScrapeTask;
  };
  templateBlobs: {
    key: string;
    value: { id: string; blob: ArrayBuffer; createdAt: number };
  };
}

let dbPromise: Promise<IDBPDatabase<AjaDB>> | null = null;

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<AjaDB>('auto-job-applicator', 3, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          const jobsStore = db.createObjectStore('jobs', { keyPath: 'id' });
          jobsStore.createIndex('by-company', 'company');
          jobsStore.createIndex('by-status', 'status');

          const appsStore = db.createObjectStore('applications', { keyPath: 'id' });
          appsStore.createIndex('by-company', 'company');
          appsStore.createIndex('by-status', 'status');

          db.createObjectStore('resumes', { keyPath: 'id' });
          db.createObjectStore('coverLetters', { keyPath: 'id' });
          db.createObjectStore('tasks', { keyPath: 'id' });
        }
        if (oldVersion < 2) {
          db.createObjectStore('templateBlobs', { keyPath: 'id' });
        }
        if (oldVersion < 3) {
          const jobsStore = db.objectStoreNames.contains('jobs')
            ? db.transaction('jobs', 'readwrite').objectStore('jobs') as unknown as IDBObjectStore
            : null;
          if (jobsStore) {
            try {
              jobsStore.createIndex('by-sourceUrl', 'sourceUrl');
              jobsStore.createIndex('by-applicationUrl', 'applicationUrl');
            } catch { /* index may already exist */ }
          }
        }
      }
    }).catch((err) => {
      dbPromise = null;
      throw err;
    }) as Promise<IDBPDatabase<AjaDB>>;
  }
  return dbPromise;
}

export const storage = {
  async get<T>(key: string): Promise<T | undefined> {
    try {
      const result = await chrome.storage.local.get(key);
      return result[key];
    } catch {
      return undefined;
    }
  },
  async set<T>(key: string, value: T): Promise<void> {
    await chrome.storage.local.set({ [key]: value });
  },
  async remove(key: string): Promise<void> {
    await chrome.storage.local.remove(key);
  }
};

export const idb = {
  async getJobs(): Promise<JobListing[]> {
    try {
      const db = await getDB();
      return db.getAll('jobs');
    } catch { return []; }
  },
  async getJob(id: string): Promise<JobListing | undefined> {
    try {
      const db = await getDB();
      return db.get('jobs', id);
    } catch { return undefined; }
  },
  async getJobByUrl(url: string): Promise<JobListing | undefined> {
    try {
      const db = await getDB();
      const bySource = await db.getAllFromIndex('jobs', 'by-sourceUrl', url);
      if (bySource.length > 0) return bySource[0];
      const byApp = await db.getAllFromIndex('jobs', 'by-applicationUrl', url);
      if (byApp.length > 0) return byApp[0];
      return undefined;
    } catch {
      const all = await this.getJobs();
      return all.find(j => j.sourceUrl === url || j.applicationUrl === url);
    }
  },
  async saveJob(job: JobListing): Promise<void> {
    try {
      const db = await getDB();
      await db.put('jobs', job);
    } catch (e) { console.error('[AJA] Failed to save job:', e); }
  },
  async deleteJob(id: string): Promise<void> {
    try {
      const db = await getDB();
      await db.delete('jobs', id);
    } catch (e) { console.error('[AJA] Failed to delete job:', e); }
  },
  async getJobsByCompany(company: string): Promise<JobListing[]> {
    try {
      const db = await getDB();
      return db.getAllFromIndex('jobs', 'by-company', company);
    } catch { return []; }
  },

  async getApplications(): Promise<ApplicationRecord[]> {
    try {
      const db = await getDB();
      return db.getAll('applications');
    } catch { return []; }
  },
  async saveApplication(app: ApplicationRecord): Promise<void> {
    try {
      const db = await getDB();
      await db.put('applications', app);
    } catch (e) { console.error('[AJA] Failed to save application:', e); }
  },
  async getApplicationsByCompany(company: string): Promise<ApplicationRecord[]> {
    try {
      const db = await getDB();
      return db.getAllFromIndex('applications', 'by-company', company);
    } catch { return []; }
  },
  async deleteApplication(id: string): Promise<void> {
    try {
      const db = await getDB();
      await db.delete('applications', id);
    } catch (e) { console.error('[AJA] Failed to delete application:', e); }
  },

  async getApplicationsByStatus(status: string): Promise<ApplicationRecord[]> {
    try {
      const db = await getDB();
      return db.getAllFromIndex('applications', 'by-status', status);
    } catch { return []; }
  },

  async saveBlob(store: 'resumes' | 'coverLetters', id: string, blob: ArrayBuffer): Promise<void> {
    try {
      const db = await getDB();
      await db.put(store, { id, blob, createdAt: Date.now() });
    } catch (e) { console.error('[AJA] Failed to save blob:', e); }
  },
  async getBlob(store: 'resumes' | 'coverLetters', id: string): Promise<ArrayBuffer | undefined> {
    try {
      const db = await getDB();
      const entry = await db.get(store, id);
      return entry?.blob;
    } catch { return undefined; }
  },
  async deleteBlob(store: 'resumes' | 'coverLetters', id: string): Promise<void> {
    try {
      const db = await getDB();
      await db.delete(store, id);
    } catch (e) { console.error('[AJA] Failed to delete blob:', e); }
  },
  async getAllBlobs(store: 'resumes' | 'coverLetters'): Promise<{ id: string; createdAt: number }[]> {
    try {
      const db = await getDB();
      const entries = await db.getAll(store);
      return entries.map(e => ({ id: e.id, createdAt: e.createdAt }));
    } catch { return []; }
  },

  async getTasks(): Promise<ScrapeTask[]> {
    try {
      const db = await getDB();
      return db.getAll('tasks');
    } catch { return []; }
  },
  async saveTask(task: ScrapeTask): Promise<void> {
    try {
      const db = await getDB();
      await db.put('tasks', task);
    } catch (e) { console.error('[AJA] Failed to save task:', e); }
  },

  async saveTemplateBlob(id: 'resume-template' | 'coverletter-template', blob: ArrayBuffer): Promise<void> {
    try {
      const db = await getDB();
      await db.put('templateBlobs', { id, blob, createdAt: Date.now() });
    } catch (e) { console.error('[AJA] Failed to save template blob:', e); }
  },
  async getTemplateBlob(id: 'resume-template' | 'coverletter-template'): Promise<ArrayBuffer | undefined> {
    try {
      const db = await getDB();
      const entry = await db.get('templateBlobs', id);
      return entry?.blob;
    } catch { return undefined; }
  },
  async deleteTemplateBlob(id: 'resume-template' | 'coverletter-template'): Promise<void> {
    try {
      const db = await getDB();
      await db.delete('templateBlobs', id);
    } catch (e) { console.error('[AJA] Failed to delete template blob:', e); }
  },

  async clearAll(): Promise<void> {
    try {
      const db = await getDB();
      const tx = db.transaction(['jobs', 'applications', 'resumes', 'coverLetters', 'tasks', 'templateBlobs'], 'readwrite');
      await Promise.all([
        tx.objectStore('jobs').clear(),
        tx.objectStore('applications').clear(),
        tx.objectStore('resumes').clear(),
        tx.objectStore('coverLetters').clear(),
        tx.objectStore('tasks').clear(),
        tx.objectStore('templateBlobs').clear(),
      ]);
      await tx.done;
    } catch (e) { console.error('[AJA] Failed to clear IDB:', e); }
  }
};

const SETTINGS_DEFAULTS: UserSettings = {
  apiKey: '',
  apiModel: 'deepseek-v4-flash',
  apiBaseUrl: 'https://opencode.ai/zen/go/v1/chat/completions',
  linkedinDailyLimit: 70,
  delayBetweenRequests: 8000,
  maxApplicationsPerCompany: 3,
  maxJobsPerScrape: 25,
  autoSubmitEnabled: false,
  requireConfirmBeforeSubmit: true,
  onboardingComplete: false,
};

export async function getSettings(): Promise<UserSettings> {
  const saved = await storage.get<Partial<UserSettings>>('settings');
  const merged = { ...SETTINGS_DEFAULTS, ...saved };

  for (const [key, defaultValue] of Object.entries(SETTINGS_DEFAULTS)) {
    const val = (merged as any)[key];
    if (typeof val !== typeof defaultValue) {
      (merged as any)[key] = defaultValue;
    }
    if (typeof defaultValue === 'number' && typeof (merged as any)[key] === 'string') {
      (merged as any)[key] = Number((merged as any)[key]) || defaultValue;
    }
  }

  return merged;
}

export async function saveSettings(settings: Partial<UserSettings>): Promise<void> {
  const current = await getSettings();
  await storage.set('settings', { ...current, ...settings });
}

const BUILT_IN_SITES: SiteConfig[] = [
  { id: 'linkedin', name: 'LinkedIn', urlPattern: 'https://www.linkedin.com/jobs/*', adapter: 'generic', enabled: true, isBuiltIn: true },
  { id: 'greenhouse', name: 'Greenhouse', urlPattern: 'https://*.greenhouse.io/*', adapter: 'greenhouse', enabled: true, isBuiltIn: true },
  { id: 'lever', name: 'Lever', urlPattern: 'https://jobs.lever.co/*', adapter: 'lever', enabled: true, isBuiltIn: true },
  { id: 'workday', name: 'Workday', urlPattern: 'https://*.myworkdayjobs.com/*', adapter: 'workday', enabled: true, isBuiltIn: true },
  { id: 'ashby', name: 'Ashby', urlPattern: 'https://jobs.ashbyhq.com/*', adapter: 'ashby', enabled: true, isBuiltIn: true },
];

export async function getSiteConfigs(): Promise<SiteConfig[]> {
  const custom = await storage.get<SiteConfig[]>('customSites') || [];
  return [...BUILT_IN_SITES, ...custom];
}

export async function addCustomSite(site: Omit<SiteConfig, 'isBuiltIn'>): Promise<void> {
  const custom = await storage.get<SiteConfig[]>('customSites') || [];
  custom.push({ ...site, isBuiltIn: false });
  await storage.set('customSites', custom);
}

export async function removeCustomSite(id: string): Promise<void> {
  const custom = await storage.get<SiteConfig[]>('customSites') || [];
  await storage.set('customSites', custom.filter(s => s.id !== id));
}

export async function getLoginStatuses(): Promise<LoginStatus[]> {
  return await storage.get<LoginStatus[]>('loginStatuses') || [];
}

export async function updateLoginStatus(status: LoginStatus): Promise<void> {
  const statuses = await getLoginStatuses();
  const idx = statuses.findIndex(s => s.site === status.site);
  if (idx >= 0) statuses[idx] = status;
  else statuses.push(status);
  await storage.set('loginStatuses', statuses);
}

export async function getSiteCounters(): Promise<Record<string, { count: number; date: string }>> {
  return await storage.get('siteCounters') || {};
}

export async function incrementSiteCounter(siteId: string, count: number = 1): Promise<{ count: number; date: string }> {
  const counters = await getSiteCounters();
  const today = new Date().toISOString().slice(0, 10);
  const current = counters[siteId];
  if (!current || current.date !== today) {
    counters[siteId] = { count, date: today };
  } else {
    counters[siteId].count += count;
  }
  await storage.set('siteCounters', counters);
  return counters[siteId];
}

export async function getCounterForSite(siteId: string): Promise<{ count: number; date: string }> {
  const counters = await getSiteCounters();
  const today = new Date().toISOString().slice(0, 10);
  const current = counters[siteId];
  if (!current || current.date !== today) return { count: 0, date: today };
  return current;
}

export function formatSalary(salary: string | undefined): string {
  if (!salary || salary === SALARY_UNKNOWN) return '';
  return salary;
}