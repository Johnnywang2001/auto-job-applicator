import { idb, storage } from './lib/storage';
import { handleScraperMessage, handleScrapeProgress, handleScrapeComplete, handleCareerPageComplete, handleTabClosed, handleScrapeTimeout } from './lib/scraper-engine';
import type { ScrapeTask, JobListing, LoginStatus } from './types';

const LOGIN_CHECK_TIMEOUT_MS = 15000;
const loginCheckTabs = new Map<number, ReturnType<typeof setTimeout>>();

chrome.tabs.onRemoved.addListener((tabId) => {
  const timeout = loginCheckTabs.get(tabId);
  if (timeout) {
    clearTimeout(timeout);
    loginCheckTabs.delete(tabId);
  }
  handleTabClosed(tabId);
});

chrome.alarms.onAlarm.addListener(async (alarm: chrome.alarms.Alarm) => {
  if (alarm.name === 'daily-reset') {
    const counters = await storage.get<Record<string, { count: number; date: string }>>('siteCounters') || {};
    const today = new Date().toISOString().slice(0, 10);
    let changed = false;
    for (const key of Object.keys(counters)) {
      if (counters[key].date !== today) {
        counters[key] = { count: 0, date: today };
        changed = true;
      }
    }
    if (changed) await storage.set('siteCounters', counters);
  }
  if (alarm.name === 'aja_scrape_timeout') {
    await handleScrapeTimeout();
  }
});

chrome.runtime.onMessage.addListener((message: any, sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void) => {
  handleMessage(message, sender).then(sendResponse).catch((e: Error) => sendResponse({ error: e.message }));
  return true;
});

async function handleMessage(message: any, sender: chrome.runtime.MessageSender) {
  const { type, payload } = message;

  switch (type) {
    case 'SCRAPE_LINKEDIN_PASSIVE': {
      const jobs: JobListing[] = payload.jobs || [];
      if (jobs.length === 0) return { success: true, count: 0 };

      const existingIds = new Set((await idb.getJobs()).map(j => j.id));
      const newJobs = jobs.filter(j => !existingIds.has(j.id));
      if (newJobs.length > 0) {
        await Promise.all(newJobs.map(j => idb.saveJob(j)));
      }
      await handleScrapeProgress(jobs.length);
      return { success: true, count: jobs.length };
    }

    case 'SCRAPE_CAREER_PAGE': {
      const careerJobs: JobListing[] = payload.jobs || [];
      if (careerJobs.length > 0) {
        const existingIds = new Set((await idb.getJobs()).map(j => j.id));
        const newJobs = careerJobs.filter(j => !existingIds.has(j.id));
        if (newJobs.length > 0) {
          await Promise.all(newJobs.map(j => idb.saveJob(j)));
        }
      }
      await handleCareerPageComplete();
      return { success: true, count: careerJobs.length };
    }

    case 'AUTO_SCROLL_DONE': {
      const totalScraped = payload?.totalScraped || 0;
      await handleScrapeComplete(totalScraped);
      return { success: true };
    }

    case 'CHECK_LOGIN_STATUS': {
      const { url } = payload;
      const tab = await chrome.tabs.create({ url, active: false });
      const tabId = tab.id!;
      const timeout = setTimeout(() => {
        loginCheckTabs.delete(tabId);
        chrome.tabs.remove(tabId).catch(() => {});
      }, LOGIN_CHECK_TIMEOUT_MS);
      loginCheckTabs.set(tabId, timeout);
      return { tabId };
    }

    case 'LOGIN_DETECTED': {
      const { site, isLoggedIn } = payload;
      const tabId = sender.tab?.id;
      if (tabId && loginCheckTabs.has(tabId)) {
        clearTimeout(loginCheckTabs.get(tabId)!);
        loginCheckTabs.delete(tabId);
        chrome.tabs.remove(tabId).catch(() => {});
      }
      const statuses = await storage.get<LoginStatus[]>('loginStatuses') || [];
      const idx = statuses.findIndex((s: LoginStatus) => s.site === site);
      const status: LoginStatus = { site, url: sender.tab?.url || '', isLoggedIn, checkedAt: Date.now() };
      if (idx >= 0) statuses[idx] = status;
      else statuses.push(status);
      await storage.set('loginStatuses', statuses);
      return { success: true };
    }

    case 'START_BACKGROUND_SCRAPE':
    case 'STOP_BACKGROUND_SCRAPE': {
      return await handleScraperMessage(type, payload as Record<string, unknown>) || { error: 'Scraper engine error' };
    }

    case 'START_SCRAPE_TASK': {
      const task: ScrapeTask = {
        id: crypto.randomUUID(),
        type: payload.type,
        status: 'running',
        progress: 0,
        site: payload.site
      };
      await idb.saveTask(task);
      return { taskId: task.id };
    }

    case 'UPDATE_TASK': {
      const tasks = await idb.getTasks();
      const task = tasks.find(t => t.id === payload.taskId);
      if (task) {
        Object.assign(task, payload.updates);
        await idb.saveTask(task);
      }
      return { success: true };
    }

    case 'FORM_SCRAPED': {
      const { url, questions } = payload;
      const job = await idb.getJobByUrl(url);
      if (job) {
        job.questions = questions || [];
        await idb.saveJob(job);
      }
      return { success: true, questionsCount: questions?.length || 0 };
    }

    case 'ANTI_BOT_DETECTED': {
      const { site } = payload;
      await storage.set('antiBotAlert', { site, detectedAt: Date.now() });
      chrome.notifications.create({
        type: 'basic',
        iconUrl: chrome.runtime.getURL('assets/icon48.png'),
        title: 'Anti-bot Detected',
        message: `Auto Job Applicator detected anti-bot measures on ${site}. Scraping paused.`
      });
      return { success: true };
    }

    case 'AUTO_STATUS_DETECTED': {
      const { jobId, status, company, title, url } = payload;
      let job = await idb.getJob(jobId);
      if (!job) {
        job = {
          id: jobId,
          source: 'generic',
          sourceUrl: url || '',
          applicationUrl: url || '',
          company: company || 'Unknown',
          title: title || 'Unknown Position',
          description: '',
          requirements: [],
          salary: 'Unsure',
          status: 'scraped',
          scrapedAt: Date.now()
        };
        await idb.saveJob(job);
      }
      const apps = await idb.getApplications();
      let app = apps.find(a => a.jobId === jobId);
      if (!app) {
        app = {
          id: crypto.randomUUID(),
          jobId,
          company: job.company,
          applicationUrl: job.applicationUrl,
          status,
          statusHistory: [{ status, at: Date.now(), source: 'auto' }],
        };
        await idb.saveApplication(app);
      } else if (app.status !== status) {
        app.status = status;
        app.statusHistory.push({ status, at: Date.now(), source: 'auto' });
        await idb.saveApplication(app);
      }
      return { success: true };
    }

    default:
      return { error: 'Unknown message type' };
  }
}