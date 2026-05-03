import { createJobListing, extractText, extractRequirements, extractSalaryFromText } from './generic';
import type { JobListing } from '../../types';
import { SALARY_UNKNOWN } from '../../types';

function isGreenhouseListing(): boolean {
  const hasMultipleJobs = document.querySelectorAll('.opening, [data-mapped="true"], .job-posting').length > 1;
  const hasListContainer = !!document.querySelector('.board-name, #main, [class*="job-board"]');
  return hasMultipleJobs && hasListContainer && !document.querySelector('.app-title');
}

export function scrapeGreenhouse(): JobListing | null {
  if (isGreenhouseListing()) {
    return null;
  }

  const titleEl = document.querySelector('.app-title');
  const companyEl = document.querySelector('.company-name, .header-logo a');
  const locationEl = document.querySelector('.location');
  const descEl = document.querySelector('#content, [id*="job_description"]');
  const salaryEl = document.querySelector('.compensation, [class*="salary"], [class*="pay-range"]');

  const title = extractText(titleEl);
  const company = extractText(companyEl) || window.location.hostname;
  const location = extractText(locationEl);
  const description = extractText(descEl);

  let salary = extractText(salaryEl);
  if (!salary) salary = extractSalaryFromText(description);
  if (!salary) salary = SALARY_UNKNOWN;

  if (!title) return null;

  return createJobListing({
    source: 'greenhouse',
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

export function scrapeGreenhouseListings(): JobListing[] {
  const jobs: JobListing[] = [];
  const companyEl = document.querySelector('.board-name, .company-name, .header-logo a');
  const company = extractText(companyEl) || window.location.hostname;

  const postings = document.querySelectorAll('.opening, [data-mapped="true"]');
  postings.forEach(post => {
    const titleEl = post.querySelector('a');
    const locationEl = post.querySelector('.location, [class*="location"]');
    const title = extractText(titleEl);
    const location = extractText(locationEl);
    const href = (titleEl as HTMLAnchorElement)?.href || window.location.href;

    if (title) {
      jobs.push(createJobListing({
        source: 'greenhouse',
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