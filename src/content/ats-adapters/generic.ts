import type { JobListing } from '../../types';
import { SALARY_UNKNOWN } from '../../types';

export function createJobListing(partial: Partial<JobListing> & { company: string; title: string; sourceUrl: string }): JobListing {
  return {
    id: `${partial.source || 'generic'}-${crypto.randomUUID().slice(0, 8)}`,
    source: partial.source || 'generic',
    sourceUrl: partial.sourceUrl,
    applicationUrl: partial.applicationUrl || partial.sourceUrl,
    company: partial.company,
    title: partial.title,
    location: partial.location,
    salary: partial.salary || SALARY_UNKNOWN,
    description: partial.description || '',
    requirements: partial.requirements || [],
    status: 'scraped',
    scrapedAt: Date.now(),
  };
}

export function extractText(el: Element | null): string {
  return el?.textContent?.trim() || '';
}

export function extractRequirements(description: string): string[] {
  const lines = description.split('\n').map(l => l.trim()).filter(Boolean);
  return lines.filter(l =>
    /requirement|qualification|skill|experience|education|must have|nice to have/i.test(l) && l.length > 10
  );
}

export function extractSalaryFromText(text: string): string {
  const match = text.match(/\$[\d,]+(?:\s*[-–—]\s*\$?[\d,]+)?(?:\s*(?:per|\/)\s*(?:year|yr|hour|hr|annum|month|mo))?/i);
  return match ? match[0] : '';
}

export function scrapeGeneric(): JobListing | null {
  // Try to detect a single job posting on a generic career page
  const titleEl = document.querySelector('h1, [class*="job-title"], [class*="position-title"], [class*="jobtitle"]');
  const companyEl = document.querySelector('[class*="company"], [class*="employer"], [itemprop="hiringOrganization"]');
  const locationEl = document.querySelector('[class*="location"], [class*="address"], [itemprop="jobLocation"]');
  const descEl = document.querySelector(
    '[class*="job-description"], [class*="description"], [class*="jobDescription"], ' +
    '[itemprop="description"], main, article'
  );

  const title = extractText(titleEl);
  const company = extractText(companyEl) || window.location.hostname;
  const location = extractText(locationEl);
  const description = extractText(descEl);

  if (!title || title.length < 3) return null;
  if (!description || description.length < 50) return null;

  let salary = extractSalaryFromText(description);
  if (!salary) salary = SALARY_UNKNOWN;

  return createJobListing({
    source: 'generic',
    sourceUrl: window.location.href,
    applicationUrl: window.location.href,
    company,
    title,
    location,
    description,
    salary,
    requirements: extractRequirements(description)
  });
}

export function scrapeGenericListings(): JobListing[] {
  const jobs: JobListing[] = [];
  const company = window.location.hostname;

  // Try common job listing patterns
  const patterns = [
    { sel: 'a[href*="job"]', titleSel: 'a', locationSel: '[class*="location"]' },
    { sel: '[class*="job-listing"], [class*="job-card"], [class*="opening"]', titleSel: 'a, h2, h3', locationSel: '[class*="location"]' },
    { sel: '.position, .job-posting, [data-job-id]', titleSel: 'a, h3, h2', locationSel: '[class*="location"]' },
  ];

  for (const pattern of patterns) {
    const listings = document.querySelectorAll(pattern.sel);
    if (listings.length > 0) {
      listings.forEach(post => {
        const titleEl = post.querySelector(pattern.titleSel);
        const locationEl = post.querySelector(pattern.locationSel);
        const linkEl = post.querySelector('a') || (post.tagName === 'A' ? post : null);
        const title = extractText(titleEl);
        const location = extractText(locationEl);
        const href = (linkEl as HTMLAnchorElement)?.href || window.location.href;

        if (title && title.length > 2) {
          jobs.push(createJobListing({
            source: 'generic',
            sourceUrl: href,
            applicationUrl: href,
            company,
            title,
            location,
            description: '',
            requirements: []
          }));
        }
      });
      break; // Use first matching pattern
    }
  }

  return jobs;
}