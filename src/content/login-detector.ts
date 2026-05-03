(function () {
  'use strict';

  function checkLogin() {
    const hostname = window.location.hostname;
    let site: string | null = null;
    let isLoggedIn = false;

    if (hostname.includes('linkedin.com')) {
      site = 'linkedin';
      const hasGlobalNav = !!(
        document.querySelector('nav.global-nav') ||
        document.querySelector('.global-nav__content') ||
        document.querySelector('[class*="global-nav"]') ||
        document.querySelector('input[role="combobox"]') ||
        document.querySelector('.global-nav__primary-item') ||
        document.querySelector('[class*="global-nav__me"]') ||
        document.querySelector('.share-box-feed-entry__wrapper') ||
        document.querySelector('.feed-identity-module')
      );
      const hasAuthWall = !!(
        document.querySelector('.authwall-join-form') ||
        document.querySelector('[class*="authwall"]') ||
        document.querySelector('[class*="join-form"]') ||
        document.querySelector('form[action*="login"]') ||
        document.querySelector('a[href*="login"]')?.textContent?.toLowerCase().includes('sign in')
      );
      isLoggedIn = hasGlobalNav && !hasAuthWall;
    } else if (hostname.includes('indeed.com')) {
      site = 'indeed';
      const hasAccount = !!(
        document.querySelector('[data-testid="resume-header"]') ||
        document.querySelector('.gnav-AccountMenu') ||
        document.querySelector('[data-gnav-element-name="AccountMenu"]') ||
        document.querySelector('.gnav-Header') ||
        document.querySelector('[aria-label*="account"]')
      );
      const hasSignInWall = !!(
        document.querySelector('.gnav-SignIn') ||
        document.querySelector('a[href*="login"]') ||
        document.querySelector('[data-testid="sign-in-button"]')
      );
      if (hasAccount) isLoggedIn = true;
      else if (hasSignInWall) isLoggedIn = false;
    } else if (hostname.includes('glassdoor.com')) {
      site = 'glassdoor';
      const hasProfile = !!(
        document.querySelector('.profile-container') ||
        document.querySelector('[data-test="profile-dropdown"]') ||
        document.querySelector('.userProfile') ||
        document.querySelector('[class*="user-profile"]') ||
        document.querySelector('[aria-label*="profile"]')
      );
      const hasSignInWall = !!(
        document.querySelector('a[href*="login"]') ||
        document.querySelector('[data-test="sign-in-link"]') ||
        document.querySelector('button[data-test="signInButton"]')
      );
      if (hasProfile) isLoggedIn = true;
      else if (hasSignInWall) isLoggedIn = false;
    }

    if (site) {
      try {
        chrome.runtime.sendMessage({
          type: 'LOGIN_DETECTED',
          payload: { site, isLoggedIn }
        }).catch(() => {});
      } catch { /* extension context invalidated */ }
    }
  }

  setTimeout(checkLogin, 1000);
})();