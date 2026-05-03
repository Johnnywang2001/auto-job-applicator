import type { JobListing } from '../types';
import { SALARY_UNKNOWN } from '../types';

(function () {
  'use strict';

  let lastUrl = location.href;
  let autoScrollActive = false;
  let seenJobIds = new Set<string>();
  let emptyScrollCount = 0;
  let totalScraped = 0;
  let maxJobs = 25;
  let scrollTimeoutId: number | null = null;
  let filterKeywords: string[] = [];
  let baseDelay = 2000;

  function getJobIdFromUrl(url: string): string {
    const match = url.match(/view\/([^/?]+)/);
    return match ? match[1] : '';
  }

  function waitFor(ms: number): Promise<void> {
    return new Promise(r => setTimeout(r, ms));
  }

  function jitterDelay(): number {
    const jitter = (Math.random() - 0.5) * 1000;
    return Math.max(800, Math.round(baseDelay + jitter));
  }

  function detectAuthWall(): boolean {
    const bodyText = document.body.innerText.toLowerCase();
    const indicators = [
      'sign in to view',
      'join to view',
      'sign in to see',
      'join now to see',
      'authwall',
      'login to view'
    ];
    return indicators.some(i => bodyText.includes(i));
  }

  function checkAntiBot(): boolean {
    const indicators = [
      'captcha',
      'unusual activity',
      "verify you're human",
      'please verify',
      'security check',
      'authwall'
    ];
    const bodyText = document.body.innerText.toLowerCase();
    for (const indicator of indicators) {
      if (bodyText.includes(indicator)) {
        try {
          chrome.runtime.sendMessage({ type: 'ANTI_BOT_DETECTED', payload: { site: 'linkedin' } }).catch(() => {});
        } catch { /* extension context invalidated */ }
        stopAutoScroll();
        return true;
      }
    }
    return false;
  }

  function getJobCards(): Element[] {
    const selectors = [
      'li.scaffold-layout__list-item',
      '.jobs-search-results__list-item',
      '[data-job-id]',
      '.job-card-container',
      '.job-card-list',
      '.job-search-card',
    ];
    for (const sel of selectors) {
      const nodes = document.querySelectorAll(sel);
      if (nodes.length > 0) return Array.from(nodes);
    }
    const anchors = document.querySelectorAll('a[href*="/jobs/view/"]');
    if (anchors.length > 0) {
      const cards = new Set<Element>();
      anchors.forEach(a => {
        const card = a.closest('li, div, article') || a;
        cards.add(card);
      });
      return Array.from(cards);
    }
    return [];
  }

  function getDescriptionFromDetail(): string {
    const selectors = [
      '.jobs-description__content',
      '.jobs-box__html-content',
      '[class*="jobs-description-content"]',
      '[class*="job-details-jobs"]',
      '.jobs-unified-description',
      '.job-details-jobs-unified-description'
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.textContent && el.textContent.trim().length > 20) {
        return el.textContent.trim();
      }
    }
    return '';
  }

  function getSalaryFromDetail(): string {
    const selectors = [
      '.job-details-jobs-unified-top-card__job-insight-view-model',
      '.jobs-unified-top-card__job-insight',
      '.jobs-unified-top-card__metadata-container',
      '[class*="salary"]',
      '[class*="compensation"]',
      '[class*="pay-range"]'
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      const text = el?.textContent?.trim() || '';
      const salaryMatch = text.match(/\$[\d,]+(?:\s*[-–—]\s*\$?[\d,]+)?(?:\s*(?:per|\/)\s*(?:year|yr|hour|hr|annum|month|mo))?/i);
      if (salaryMatch) return salaryMatch[0];
    }
    const desc = getDescriptionFromDetail();
    if (desc) {
      const descMatch = desc.match(/\$[\d,]+(?:\s*[-–—]\s*\$?[\d,]+)?(?:\s*(?:per|\/)\s*(?:year|yr|hour|hr|annum|month|mo))?/i);
      if (descMatch) return descMatch[0];
    }
    return '';
  }

  function getRequirementsFromDescription(desc: string): string[] {
    if (!desc) return [];
    const lines = desc.split(/\n+/);
    const reqs: string[] = [];
    let inReqSection = false;
    for (const line of lines) {
      const lower = line.toLowerCase();
      if (
        /qualifications?|requirements?|what you'll need|what you need|skills? needed|must have/.test(lower)
      ) {
        inReqSection = true;
        continue;
      }
      if (inReqSection) {
        if (/about (us|the company)|benefits?|perks?|apply now|how to apply/.test(lower)) {
          inReqSection = false;
          continue;
        }
        const clean = line.trim();
        if (clean.length > 10 && clean.length < 400) {
          reqs.push(clean);
        }
      }
    }
    return reqs;
  }

  function getScrollContainer(): Element | null {
    return (
      document.querySelector('.jobs-search-results-list') ||
      document.querySelector('.scaffold-finite-scroll__content') ||
      document.querySelector('[class*="jobs-search__results-list"]') ||
      document.querySelector('.scaffold-layout__list')
    );
  }

  function matchesKeywords(job: JobListing): boolean {
    if (!filterKeywords.length) return true;
    const text = `${job.title} ${job.company} ${job.description}`.toLowerCase();
    return filterKeywords.some(kw => text.includes(kw.toLowerCase()));
  }

  function passiveScrape(): JobListing[] {
    const cards = getJobCards();
    const jobs: JobListing[] = [];
    for (const card of cards) {
      const job = scrapeJobCard(card);
      if (job && !seenJobIds.has(job.id) && matchesKeywords(job)) {
        seenJobIds.add(job.id);
        jobs.push(job);
      }
    }
    return jobs;
  }

  function scrapeJobCard(card: Element): JobListing | null {
    const titleSelectors = [
      'a.job-card-list__title',
      'a.job-card-container__link',
      '[data-control-name="job_title"]',
      'a strong',
      'a span[aria-hidden="true"]',
      'a[href*="/jobs/view/"] span',
      'a[dir="ltr"]'
    ];
    let titleEl: Element | null = null;
    for (const sel of titleSelectors) {
      titleEl = card.querySelector(sel);
      if (titleEl) break;
    }

    const companySelectors = [
      '.job-card-container__company-name',
      '.artdeco-entity-lockup__subtitle',
      '[data-control-name="company_link"]',
      '[class*="company-name"]',
      'h4 a',
      '[class*="job-card"] [class*="company"]'
    ];
    let companyEl: Element | null = null;
    for (const sel of companySelectors) {
      companyEl = card.querySelector(sel);
      if (companyEl) break;
    }

    if (!titleEl) return null;

    const title = titleEl.textContent?.trim() || '';
    const company = companyEl?.textContent?.trim() || '';

    const locationSelectors = [
      '.job-card-container__metadata-wrapper',
      '.artdeco-entity-lockup__caption',
      '[class*="metadata"]',
      'span[class*="location"]'
    ];
    let locationEl: Element | null = null;
    for (const sel of locationSelectors) {
      locationEl = card.querySelector(sel);
      if (locationEl) break;
    }
    const jobLocation = locationEl?.textContent?.trim() || '';

    const cardSalary = getSalaryFromCard(card);

    const anchor = card.querySelector('a[href*="/jobs/view/"], a') as HTMLAnchorElement | null;
    const href = anchor?.href || window.location.href;
    const jobId = getJobIdFromUrl(href) || `${company}-${title}`.replace(/\s+/g, '-').toLowerCase();

    return {
      id: `linkedin-${jobId}`,
      source: 'linkedin',
      sourceUrl: href,
      applicationUrl: href,
      company,
      title,
      location: jobLocation,
      salary: cardSalary || SALARY_UNKNOWN,
      description: '',
      requirements: [],
      status: 'scraped',
      scrapedAt: Date.now()
    };
  }

  function getSalaryFromCard(card: Element): string {
    const selectors = [
      '.job-card-container__salary-info',
      '.job-search-card__salary-info',
      '[class*="salary"]',
      '[class*="compensation"]'
    ];
    for (const sel of selectors) {
      const el = card.querySelector(sel);
      const text = el?.textContent?.trim() || '';
      if (text) {
        const match = text.match(/\$[\d,]+(?:\s*[-–—]\s*\$?[\d,]+)?(?:\s*(?:per|\/)\s*(?:year|yr|hour|hr|annum|month|mo))?/i);
        if (match) return match[0];
        if (/[\$]/.test(text)) return text;
      }
    }
    return '';
  }

  async function clickAndScrapeCard(card: Element): Promise<JobListing | null> {
    if (checkAntiBot()) return null;
    if (detectAuthWall()) {
      try {
        chrome.runtime.sendMessage({ type: 'ANTI_BOT_DETECTED', payload: { site: 'linkedin' } }).catch(() => {});
      } catch { /* extension context invalidated */ }
      stopAutoScroll();
      return null;
    }

    const baseJob = scrapeJobCard(card);
    if (!baseJob) return null;
    if (seenJobIds.has(baseJob.id)) return null;

    const clickTarget = card.querySelector('a[href*="/jobs/view/"]') || card.querySelector('a') || card;
    (clickTarget as HTMLElement).click();

    let attempts = 0;
    let description = '';
    while (attempts < 10) {
      await waitFor(300);
      description = getDescriptionFromDetail();
      if (description.length > 50) break;
      attempts++;
    }

    if (detectAuthWall()) {
      try {
        chrome.runtime.sendMessage({ type: 'ANTI_BOT_DETECTED', payload: { site: 'linkedin' } }).catch(() => {});
      } catch { /* extension context invalidated */ }
      stopAutoScroll();
      return null;
    }

    const requirements = getRequirementsFromDescription(description);
    const detailSalary = getSalaryFromDetail();
    const salary = detailSalary || baseJob.salary;

    const job: JobListing = {
      ...baseJob,
      description,
      requirements,
      salary: salary === SALARY_UNKNOWN || !salary ? SALARY_UNKNOWN : salary
    };

    if (matchesKeywords(job)) {
      seenJobIds.add(job.id);
      totalScraped++;
      return job;
    }
    return null;
  }

  async function processVisibleCardsActive(): Promise<JobListing[]> {
    const cards = getJobCards();
    const jobs: JobListing[] = [];
    for (const card of cards) {
      if (!autoScrollActive) break;
      if (totalScraped >= maxJobs) break;

      const job = await clickAndScrapeCard(card);
      if (job) {
        jobs.push(job);
      }
      await waitFor(jitterDelay());
    }
    return jobs;
  }

  function injectBadges(jobs: JobListing[]) {
    jobs.forEach(job => {
      const rawId = job.id.replace('linkedin-', '');
      const card = document.querySelector(
        `[data-job-id="${rawId}"], a[href*="${rawId}"]`
      )?.closest('li.scaffold-layout__list-item, .jobs-search-results__list-item, [data-job-id]');
      if (!card) return;

      const existing = card.querySelector('.aja-badge');
      if (existing) return;

      const badge = document.createElement('span');
      badge.className = 'aja-badge';
      badge.textContent = 'AJA';
      badge.style.cssText = 'background:#0D9488;color:#fff;padding:2px 6px;border-radius:4px;font-size:11px;margin-left:8px;cursor:pointer;';
      badge.title = 'Auto Job Applicator - Click to save';
      badge.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        try {
          chrome.runtime.sendMessage({ type: 'SCRAPE_LINKEDIN_PASSIVE', payload: { jobs: [job] } }).catch(() => {});
        } catch { /* extension context invalidated */ }
        badge.textContent = 'Saved';
        badge.style.background = '#84CC16';
      });

      const titleEl = card.querySelector('a');
      if (titleEl) titleEl.appendChild(badge);
    });
  }

  async function scrollList() {
    const container = getScrollContainer();
    if (container) {
      container.scrollTop += container.clientHeight * 0.8;
    } else {
      window.scrollBy(0, window.innerHeight * 0.8);
    }
    await waitFor(1500);
  }

  async function doScrapeStep(): Promise<boolean> {
    if (!autoScrollActive) return false;
    if (totalScraped >= maxJobs) {
      return false;
    }
    if (checkAntiBot()) return false;

    const jobs = await processVisibleCardsActive();

    if (jobs.length > 0) {
      try {
        await chrome.runtime.sendMessage({ type: 'SCRAPE_LINKEDIN_PASSIVE', payload: { jobs } });
      } catch {
        // Extension context may be invalidated
      }
      injectBadges(jobs);
      emptyScrollCount = 0;
    } else {
      emptyScrollCount++;
    }

    if (totalScraped >= maxJobs) {
      return false;
    }
    if (emptyScrollCount >= 3) {
      return false;
    }

    await scrollList();
    return true;
  }

  async function startAutoScroll(cfg: { maxJobs: number; keywords?: string[]; delayMs?: number }) {
    if (autoScrollActive) return;
    autoScrollActive = true;
    seenJobIds.clear();
    emptyScrollCount = 0;
    totalScraped = 0;
    maxJobs = cfg.maxJobs || 25;
    filterKeywords = cfg.keywords || [];
    baseDelay = cfg.delayMs || 2000;

    async function loop() {
      if (!autoScrollActive) return;
      const shouldContinue = await doScrapeStep();
      if (shouldContinue) {
        scrollTimeoutId = window.setTimeout(loop, 500);
      } else {
        stopAutoScroll();
      }
    }

    loop();
  }

  function stopAutoScroll() {
    autoScrollActive = false;
    if (scrollTimeoutId) {
      clearTimeout(scrollTimeoutId);
      scrollTimeoutId = null;
    }
    try {
      chrome.runtime.sendMessage({ type: 'AUTO_SCROLL_DONE', payload: { totalScraped } }).catch(() => {});
    } catch { /* extension context invalidated */ }
  }

  chrome.runtime.onMessage.addListener((message: any, _sender: any, sendResponse: any) => {
    if (message.type === 'START_AUTO_SCROLL') {
      startAutoScroll(message.payload || {});
      sendResponse({ success: true });
      return true;
    }
    if (message.type === 'STOP_AUTO_SCROLL') {
      stopAutoScroll();
      sendResponse({ success: true });
      return true;
    }
    return false;
  });

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  const debouncedPassiveScrape = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      if (!autoScrollActive) {
        const jobs = passiveScrape();
        if (jobs.length > 0) {
          try {
            chrome.runtime.sendMessage({ type: 'SCRAPE_LINKEDIN_PASSIVE', payload: { jobs } }).catch(() => {});
          } catch { /* extension context invalidated */ }
          injectBadges(jobs);
        }
      }
    }, 1500);
  };

  const observer = new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      seenJobIds.clear();
      debouncedPassiveScrape();
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

  // Cleanup on page unload
  window.addEventListener('beforeunload', () => {
    observer.disconnect();
    if (scrollTimeoutId) clearTimeout(scrollTimeoutId);
    if (debounceTimer) clearTimeout(debounceTimer);
  });

  setTimeout(() => {
    if (!autoScrollActive) {
      const jobs = passiveScrape();
      if (jobs.length > 0) {
        try {
          chrome.runtime.sendMessage({ type: 'SCRAPE_LINKEDIN_PASSIVE', payload: { jobs } }).catch(() => {});
        } catch { /* extension context invalidated */ }
        injectBadges(jobs);
      }
    }
  }, 2000);
})();