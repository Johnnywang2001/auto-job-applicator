import { createJobListing, extractText, extractRequirements, extractSalaryFromText } from './generic';
import type { JobListing } from '../../types';
import { SALARY_UNKNOWN } from '../../types';

function isAshbyListing(): boolean {
  const hasMultiple = document.querySelectorAll('.ashby-job-posting-brief, [class*="job-posting"]').length > 1;
  return hasMultiple && !document.querySelector('.ashby-job-posting-heading h1');
}

export function scrapeAshby(): JobListing | null {
  if (isAshbyListing()) return null;

  const titleEl = document.querySelector('.ashby-job-posting-heading h1, h1');
  const companyEl = document.querySelector('.ashby-job-posting-company');
  const locationEl = document.querySelector('.ashby-job-posting-location');
  const descEl = document.querySelector('.ashby-job-description, [class*="description"]');
  const salaryEl = document.querySelector('.ashby-job-posting-salary, [class*="compensation"], [class*="salary"]');

  const title = extractText(titleEl);
  const company = extractText(companyEl) || window.location.hostname;
  const location = extractText(locationEl);
  const description = extractText(descEl);

  let salary = extractText(salaryEl);
  if (!salary) salary = extractSalaryFromText(description);
  if (!salary) salary = SALARY_UNKNOWN;

  if (!title) return null;

  return createJobListing({
    source: 'ashby',
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

export function scrapeAshbyListings(): JobListing[] {
  const jobs: JobListing[] = [];
  const companyEl = document.querySelector('.ashby-company-name, [class*="company"]');
  const company = extractText(companyEl) || window.location.hostname;

  const postings = document.querySelectorAll('.ashby-job-posting-brief, [class*="job-posting"]');
  postings.forEach(post => {
    const titleEl = post.querySelector('h3, h2, a');
    const locationEl = post.querySelector('[class*="location"]');
    const title = extractText(titleEl);
    const location = extractText(locationEl);
    const linkEl = post.querySelector('a');
    const href = (linkEl as HTMLAnchorElement)?.href || window.location.href;

    if (title) {
      jobs.push(createJobListing({
        source: 'ashby',
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