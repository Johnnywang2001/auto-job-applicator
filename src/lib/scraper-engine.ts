import { idb, incrementSiteCounter, getCounterForSite, getSiteConfigs, getSettings, storage } from './storage';
import type { ScrapeTask } from '../types';

interface ActiveScrape {
  taskId: string;
  tabId: number;
  maxJobs: number;
  totalScraped: number;
  status: 'running' | 'stopping';
}

const STORAGE_KEY = 'aja_active_scrape';

async function getActiveScrape(): Promise<ActiveScrape | null> {
  const data = await storage.get<ActiveScrape>(STORAGE_KEY);
  return data || null;
}

async function setActiveScrape(scrape: ActiveScrape): Promise<void> {
  await storage.set(STORAGE_KEY, scrape);
}

async function clearActiveScrape(): Promise<void> {
  await storage.remove(STORAGE_KEY);
}

async function updateTask(taskId: string, updates: Partial<ScrapeTask>): Promise<void> {
  const tasks = await idb.getTasks();
  const task = tasks.find(t => t.id === taskId);
  if (task) {
    Object.assign(task, updates);
    await idb.saveTask(task);
  }
}

export async function startBackgroundScraping(siteId: string, keywords?: string[]): Promise<string> {
  const existingScrape = await getActiveScrape();
  if (existingScrape && existingScrape.status === 'running') {
    throw new Error('Scraping already in progress');
  }

  if (existingScrape) {
    await clearActiveScrape();
  }

  const task: ScrapeTask = {
    id: crypto.randomUUID(),
    type: siteId === 'linkedin' ? 'linkedin-feed' : 'career-page',
    status: 'running',
    progress: 0,
    site: siteId
  };

  await idb.saveTask(task);

  if (siteId === 'linkedin') {
    await scrapeLinkedIn(task.id, keywords);
  } else {
    await scrapeCareerPage(task.id, siteId);
  }

  return task.id;
}

export async function stopBackgroundScraping() {
  const scrape = await getActiveScrape();
  if (scrape) {
    try {
      await chrome.tabs.sendMessage(scrape.tabId, { type: 'STOP_AUTO_SCROLL' });
    } catch { /* tab may be gone */ }
    chrome.tabs.remove(scrape.tabId).catch(() => {});
    const progress = scrape.maxJobs > 0 ? Math.round((scrape.totalScraped / scrape.maxJobs) * 100) : 0;
    await updateTask(scrape.taskId, { status: 'paused', progress });
    await clearActiveScrape();
  }
  chrome.alarms.clear('aja_scrape_timeout').catch(() => {});
}

async function scrapeLinkedIn(taskId: string, keywords?: string[]): Promise<void> {
  const counter = await getCounterForSite('linkedin');
  const settings = await getSettings();
  const limit = settings.linkedinDailyLimit || 70;
  const maxJobs = settings.maxJobsPerScrape || 25;

  if (counter.count >= limit) {
    await updateTask(taskId, { status: 'paused', error: 'Daily limit reached' });
    return;
  }

  let url = 'https://www.linkedin.com/jobs/search/?f_TPR=r604800';
  if (keywords && keywords.length > 0) {
    url += '&keywords=' + encodeURIComponent(keywords.join(' OR '));
  }

  const tab = await chrome.tabs.create({ url, active: false });
  const tabId = tab.id!;

  const delayMs = settings.delayBetweenRequests || 8000;

  const scrape: ActiveScrape = {
    taskId,
    tabId,
    maxJobs,
    totalScraped: 0,
    status: 'running'
  };
  await setActiveScrape(scrape);

  chrome.alarms.create('aja_scrape_timeout', { delayInMinutes: 5 });

  await new Promise(r => setTimeout(r, 3000));

  try {
    await chrome.tabs.sendMessage(tabId, {
      type: 'START_AUTO_SCROLL',
      payload: { maxJobs, keywords, delayMs }
    });
  } catch {
    await new Promise(r => setTimeout(r, 3000));
    try {
      await chrome.tabs.sendMessage(tabId, {
        type: 'START_AUTO_SCROLL',
        payload: { maxJobs, keywords, delayMs }
      });
    } catch {
      await updateTask(taskId, { status: 'error', error: 'Could not reach LinkedIn content script' });
      chrome.tabs.remove(tabId).catch(() => {});
      await clearActiveScrape();
      chrome.alarms.clear('aja_scrape_timeout').catch(() => {});
    }
  }
}

async function scrapeCareerPage(taskId: string, siteId: string): Promise<void> {
  const configs = await getSiteConfigs();
  const site = configs.find(c => c.id === siteId);
  if (!site || !site.urlPattern) {
    await updateTask(taskId, { status: 'error', error: 'Site config not found' });
    return;
  }

  const url = site.urlPattern.replace('/*', '');
  const tab = await chrome.tabs.create({ url, active: false });
  const tabId = tab.id!;

  const scrape: ActiveScrape = {
    taskId,
    tabId,
    maxJobs: 0,
    totalScraped: 0,
    status: 'running'
  };
  await setActiveScrape(scrape);

  chrome.alarms.create('aja_scrape_timeout', { delayInMinutes: 1 });
}

export async function handleScrapeProgress(jobsCount: number): Promise<void> {
  const scrape = await getActiveScrape();
  if (!scrape || scrape.status !== 'running') return;

  scrape.totalScraped += jobsCount;
  await setActiveScrape(scrape);

  const progress = Math.min(100, Math.round((scrape.totalScraped / scrape.maxJobs) * 100));
  await updateTask(scrape.taskId, { progress });
}

export async function handleScrapeComplete(totalScraped: number): Promise<void> {
  const scrape = await getActiveScrape();
  if (!scrape) return;

  chrome.alarms.clear('aja_scrape_timeout').catch(() => {});
  chrome.tabs.remove(scrape.tabId).catch(() => {});

  await incrementSiteCounter('linkedin', totalScraped);

  await updateTask(scrape.taskId, { progress: 100, status: 'done' });

  await clearActiveScrape();
}

export async function handleCareerPageComplete(): Promise<void> {
  const scrape = await getActiveScrape();
  if (!scrape) return;

  chrome.alarms.clear('aja_scrape_timeout').catch(() => {});
  chrome.tabs.remove(scrape.tabId).catch(() => {});

  const siteId = scrape.taskId.includes('linkedin') ? 'linkedin' : 'career';
  await incrementSiteCounter(siteId, 1);

  await updateTask(scrape.taskId, { progress: 100, status: 'done' });

  await clearActiveScrape();
}

export async function handleTabClosed(tabId: number): Promise<void> {
  const scrape = await getActiveScrape();
  if (!scrape || scrape.tabId !== tabId) return;

  chrome.alarms.clear('aja_scrape_timeout').catch(() => {});

  const progress = scrape.maxJobs > 0 ? Math.min(100, Math.round((scrape.totalScraped / scrape.maxJobs) * 100)) : 0;
  await updateTask(scrape.taskId, { progress, status: 'done' });

  if (scrape.totalScraped > 0) {
    await incrementSiteCounter('linkedin', scrape.totalScraped);
  }

  await clearActiveScrape();
}

export async function handleScrapeTimeout(): Promise<void> {
  const scrape = await getActiveScrape();
  if (!scrape) {
    chrome.alarms.clear('aja_scrape_timeout').catch(() => {});
    return;
  }

  console.warn('[AJA] Scrape timeout reached, force-closing tab');

  try {
    await chrome.tabs.sendMessage(scrape.tabId, { type: 'STOP_AUTO_SCROLL' });
  } catch { /* tab may not be responding */ }

  chrome.tabs.remove(scrape.tabId).catch(() => {});

  if (scrape.totalScraped > 0) {
    await incrementSiteCounter('linkedin', scrape.totalScraped);
  }

  const progress = scrape.maxJobs > 0 ? Math.min(100, Math.round((scrape.totalScraped / scrape.maxJobs) * 100)) : 0;
  await updateTask(scrape.taskId, { progress, status: 'done' });

  await clearActiveScrape();
}

export async function handleScraperMessage(type: string, payload: Record<string, unknown>): Promise<Record<string, unknown> | null> {
  switch (type) {
    case 'START_BACKGROUND_SCRAPE': {
      const taskId = await startBackgroundScraping(payload.siteId as string, payload.keywords as string[] | undefined);
      return { taskId };
    }
    case 'STOP_BACKGROUND_SCRAPE':
      await stopBackgroundScraping();
      return { success: true };
    default:
      return null;
  }
}