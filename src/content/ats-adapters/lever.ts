import { createJobListing, extractText, extractRequirements, extractSalaryFromText } from './generic';
import type { JobListing } from '../../types';
import { SALARY_UNKNOWN } from '../../types';

function isLeverListing(): boolean {
  const hasMultiple = document.querySelectorAll('.posting, [data-qa="posting"]').length > 1;
  return hasMultiple && !document.querySelector('.posting-headline h2');
}

export function scrapeLever(): JobListing | null {
  if (isLeverListing()) return null;

  const titleEl = document.querySelector('.posting-headline h2');
  const companyEl = document.querySelector('.main-header-logo');
  const locationEl = document.querySelector('.posting-categories span');
  const descEl = document.querySelector('.section.page-centered, [class*="description"]');
  const salaryEl = document.querySelector('.posting-categories .sort-by-commitment, [class*="salary"], .posting-categories .job-info');

  const title = extractText(titleEl);
  const company = extractText(companyEl) || window.location.hostname;
  const location = extractText(locationEl);
  const description = extractText(descEl);

  let salary = extractText(salaryEl);
  if (!salary) salary = extractSalaryFromText(description);
  if (!salary) salary = SALARY_UNKNOWN;

  if (!title) return null;

  return createJobListing({
    source: 'lever',
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

export function scrapeLeverListings(): JobListing[] {
  const jobs: JobListing[] = [];
  const companyEl = document.querySelector('.main-header-logo, .logo');
  const company = extractText(companyEl) || window.location.hostname;

  const postings = document.querySelectorAll('.posting, [data-qa="posting"]');
  postings.forEach(post => {
    const titleEl = post.querySelector('h5, .posting-title');
    const locationEl = post.querySelector('.sort-by-location, [class*="location"]');
    const teamEl = post.querySelector('.sort-by-team, [class*="team"]');
    const title = extractText(titleEl);
    const location = extractText(locationEl);
    const team = extractText(teamEl);
    const linkEl = post.querySelector('a');
    const href = (linkEl as HTMLAnchorElement)?.href || window.location.href;

    if (title) {
      jobs.push(createJobListing({
        source: 'lever',
        sourceUrl: href,
        applicationUrl: href,
        company,
        title: team ? `${title} — ${team}` : title,
        location,
        description: '',
        requirements: []
      }));
    }
  });

  return jobs;
}