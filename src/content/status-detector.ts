(function () {
  'use strict';

  const APPLICATION_URL_PATTERNS = [
    /\/apply/i,
    /\/application/i,
    /\/applications\//i,
    /application-confirmation/i,
    /apply\/confirm/i,
    /\/jobs\/.*\/apply/i,
    /careers.*\/apply/i,
    /\/job\/.*\/apply/i,
  ];

  function isLikelyApplicationPage(): boolean {
    const url = location.href.toLowerCase();
    return APPLICATION_URL_PATTERNS.some(p => p.test(url));
  }

  function detectStatus(): string | null {
    if (!isLikelyApplicationPage()) return null;

    const bodyText = document.body.innerText.toLowerCase();

    const positiveSignals: string[] = [];
    if (bodyText.includes('thank you for applying') || bodyText.includes('application submitted') || bodyText.includes('application received')) {
      positiveSignals.push('applied');
    }
    if (bodyText.includes('not selected') || (bodyText.includes('unfortunately') && bodyText.includes('position')) || bodyText.includes('we regret') || bodyText.includes('moved forward with other candidate')) {
      positiveSignals.push('rejected');
    }
    if (bodyText.includes('offer') && bodyText.includes('congratulations')) {
      positiveSignals.push('offer');
    }
    if (
      (bodyText.includes('interview') && (bodyText.includes('schedule') || bodyText.includes('book') || bodyText.includes('confirm'))) ||
      bodyText.includes('interview invitation')
    ) {
      positiveSignals.push('interviewing');
    }

    const url = location.href.toLowerCase();
    if (url.includes('application-confirmation') || url.includes('apply/confirm')) {
      positiveSignals.push('applied');
    }

    if (positiveSignals.length === 0) return null;

    const priority = ['offer', 'interviewing', 'applied', 'rejected'] as const;
    for (const status of priority) {
      if (positiveSignals.includes(status)) return status;
    }
    return positiveSignals[0];
  }

  const status = detectStatus();
  if (status) {
    const jobIdMatch = location.href.match(/job[s/]?([a-zA-Z0-9\-]+)/i);
    const jobId = jobIdMatch ? jobIdMatch[1] : location.hostname + '-' + Date.now();
    const companyEl = document.querySelector('[class*="company"], [class*="employer"], h1');
    const titleEl = document.querySelector('h1, [class*="title"], [class*="position"]');
    const company = companyEl?.textContent?.trim().slice(0, 100) || '';
    const title = titleEl?.textContent?.trim().slice(0, 200) || '';

    try {
      chrome.runtime.sendMessage({
        type: 'AUTO_STATUS_DETECTED',
        payload: {
          jobId: `detected-${jobId}`,
          status,
          company,
          title,
          url: location.href
        }
      }).catch(() => {});
    } catch { /* extension context invalidated */ }
  }
})();