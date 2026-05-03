import { createJobListing, extractText, extractRequirements, extractSalaryFromText } from './generic';
import type { JobListing } from '../../types';
import { SALARY_UNKNOWN } from '../../types';

function isWorkdayListing(): boolean {
  const hasMultiple = document.querySelectorAll('[data-automation-id="jobTitle"], [data-automation-id="job posting"]').length > 1;
  return hasMultiple && !document.querySelector('[data-automation-id="jobPosting.title"]');
}

export function scrapeWorkday(): JobListing | null {
  if (isWorkdayListing()) return null;

  const titleEl = document.querySelector('[data-automation-id="jobPosting.title"], h1');
  const companyEl = document.querySelector('[data-automation-id="jobPosting.company"]');
  const locationEl = document.querySelector('[data-automation-id="jobPosting.location"]');
  const descEl = document.querySelector('[data-automation-id="jobPosting.jobDescription"], [class*="job-description"]');
  const salaryEl = document.querySelector('[data-automation-id="jobPosting.salary"], [class*="compensation"], [class*="salary"]');

  const title = extractText(titleEl);
  const company = extractText(companyEl) || window.location.hostname;
  const location = extractText(locationEl);
  const description = extractText(descEl);

  let salary = extractText(salaryEl);
  if (!salary) salary = extractSalaryFromText(description);
  if (!salary) salary = SALARY_UNKNOWN;

  if (!title) return null;

  return createJobListing({
    source: 'workday',
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

export function scrapeWorkdayListings(): JobListing[] {
  const jobs: JobListing[] = [];
  const company = window.location.hostname;

  const postings = document.querySelectorAll('[data-automation-id="jobTitle"], [data-automation-id="job posting"]');
  postings.forEach(post => {
    const titleEl = post.querySelector('a') || post;
    const locationEl = post.closest('[class*="job-card"]')?.querySelector('[data-automation-id="jobPosting.location"], [class*="location"]');
    const title = extractText(titleEl);
    const location = extractText(locationEl);
    const linkEl = post.querySelector('a') || post.closest('a');
    const href = (linkEl as HTMLAnchorElement)?.href || window.location.href;

    if (title) {
      jobs.push(createJobListing({
        source: 'workday',
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

  return jobs;
}