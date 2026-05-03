import { scrapeGreenhouse, scrapeGreenhouseListings } from './ats-adapters/greenhouse';
import { scrapeLever, scrapeLeverListings } from './ats-adapters/lever';
import { scrapeWorkday, scrapeWorkdayListings } from './ats-adapters/workday';
import { scrapeAshby, scrapeAshbyListings } from './ats-adapters/ashby';
import { scrapeGeneric, scrapeGenericListings } from './ats-adapters/generic';
import type { JobListing } from '../types';

(function () {
  'use strict';

  const hostname = window.location.hostname;
  let jobs: JobListing[] = [];

  if (hostname.includes('greenhouse.io')) {
    const detail = scrapeGreenhouse();
    if (detail) {
      jobs.push(detail);
    } else {
      jobs = scrapeGreenhouseListings();
    }
  } else if (hostname.includes('lever.co')) {
    const detail = scrapeLever();
    if (detail) {
      jobs.push(detail);
    } else {
      jobs = scrapeLeverListings();
    }
  } else if (hostname.includes('myworkdayjobs.com') || hostname.includes('workday.com')) {
    const detail = scrapeWorkday();
    if (detail) {
      jobs.push(detail);
    } else {
      jobs = scrapeWorkdayListings();
    }
  } else if (hostname.includes('ashbyhq.com')) {
    const detail = scrapeAshby();
    if (detail) {
      jobs.push(detail);
    } else {
      jobs = scrapeAshbyListings();
    }
  } else {
    const detail = scrapeGeneric();
    if (detail) {
      jobs.push(detail);
    } else {
      jobs = scrapeGenericListings();
    }
  }

  if (jobs.length > 0) {
    try {
      chrome.runtime.sendMessage({ type: 'SCRAPE_CAREER_PAGE', payload: { jobs } }).catch(() => {});
    } catch { /* extension context invalidated */ }
  }
})();