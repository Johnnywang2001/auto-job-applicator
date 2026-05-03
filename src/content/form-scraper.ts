import type { ApplicationQuestion } from '../types';

(function () {
  'use strict';

  let pageIndex = 0;

  function isApplicationPage(): boolean {
    const url = location.href.toLowerCase();
    const hasApplyUrlPattern = /\/apply/i.test(url) || /\/application/i.test(url) || /careers.*\/apply/i.test(url);
    const hasFormWithSubmit = document.querySelectorAll('form').length > 0 &&
      document.querySelectorAll('button[type="submit"], input[type="submit"]').length > 0;
    const bodyText = document.body.innerText.toLowerCase();
    const hasApplicationKeywords = bodyText.includes('apply') || bodyText.includes('application');
    const hasFileUpload = document.querySelectorAll('input[type="file"]').length > 0;

    return hasApplyUrlPattern || ((hasFormWithSubmit || hasFileUpload) && hasApplicationKeywords);
  }

  function detectFields(): ApplicationQuestion[] {
    const fields: ApplicationQuestion[] = [];

    const inputs = document.querySelectorAll('input, textarea, select');
    inputs.forEach((input, idx) => {
      const el = input as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
      const label = findLabel(el);
      const type = getFieldType(el);
      const required = el.required ||
        el.getAttribute('aria-required') === 'true' ||
        el.closest('label')?.textContent?.includes('*') ||
        false;
      const selector = generateSelector(el, idx);

      const question: ApplicationQuestion = {
        pageIndex,
        fieldLabel: label || `Field ${idx + 1}`,
        fieldType: type,
        required,
        selector
      };

      if (type === 'select' || type === 'radio' || type === 'checkbox') {
        question.options = getOptions(el);
      }

      fields.push(question);
    });

    return fields;
  }

  function findLabel(el: HTMLElement): string | undefined {
    if (el.id) {
      const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (label) return label.textContent?.trim();
    }
    const parentLabel = el.closest('label');
    if (parentLabel) {
      const clone = parentLabel.cloneNode(true) as HTMLElement;
      clone.querySelectorAll('input, textarea, select').forEach(child => child.remove());
      return clone.textContent?.trim();
    }
    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel) return ariaLabel;
    const placeholder = (el as HTMLInputElement).placeholder;
    if (placeholder) return placeholder;
    const title = el.getAttribute('title');
    if (title) return title;
    return undefined;
  }

  function getFieldType(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement): ApplicationQuestion['fieldType'] {
    if (el.tagName === 'TEXTAREA') return 'textarea';
    if (el.tagName === 'SELECT') return 'select';
    const input = el as HTMLInputElement;
    switch (input.type) {
      case 'radio': return 'radio';
      case 'checkbox': return 'checkbox';
      case 'file': return 'file';
      case 'date': return 'date';
      case 'number': return 'text';
      case 'email': return 'text';
      case 'tel': return 'text';
      case 'url': return 'text';
      default: return 'text';
    }
  }

  function getOptions(el: HTMLElement): string[] | undefined {
    if (el.tagName === 'SELECT') {
      return Array.from((el as HTMLSelectElement).options).map(o => o.text).filter(t => t);
    }
    if ((el as HTMLInputElement).type === 'radio') {
      const name = (el as HTMLInputElement).name;
      if (!name) return undefined;
      return Array.from(document.querySelectorAll(`input[name="${CSS.escape(name)}"]`)).map(r => {
        const id = (r as HTMLInputElement).id;
        const label = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`)?.textContent?.trim() : undefined;
        return label || (r as HTMLInputElement).value;
      }).filter(Boolean) as string[];
    }
    return undefined;
  }

  function generateSelector(el: HTMLElement, idx: number): string {
    if (el.id) return `#${CSS.escape(el.id)}`;
    if (el.getAttribute('name')) return `${el.tagName.toLowerCase()}[name="${CSS.escape(el.getAttribute('name')!)}"]`;
    if (el.getAttribute('aria-label')) return `${el.tagName.toLowerCase()}[aria-label="${CSS.escape(el.getAttribute('aria-label')!)}"]`;
    if (el.className && typeof el.className === 'string') {
      const firstClass = el.className.split(' ').find(c => c.length > 0);
      if (firstClass) return `.${CSS.escape(firstClass)}:nth-of-type(${idx + 1})`;
    }
    return el.tagName.toLowerCase();
  }

  function detectMultiPage() {
    const nextButtons = document.querySelectorAll('button[type="submit"], input[type="submit"], button');
    const hasNext = Array.from(nextButtons).some(btn =>
      /next|continue|proceed|save and continue/i.test(btn.textContent || '')
    );
    return hasNext;
  }

  if (isApplicationPage()) {
    const fields = detectFields();

    try {
      chrome.runtime.sendMessage({
        type: 'FORM_SCRAPED',
        payload: {
          url: location.href,
          questions: fields,
          isMultiPage: detectMultiPage()
        }
      }).catch(() => {});
    } catch { /* extension context invalidated */ }
  }

  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (/next|continue|proceed/i.test(target.textContent || '')) {
      pageIndex++;
      setTimeout(() => {
        const fields = detectFields();
        try {
          chrome.runtime.sendMessage({
            type: 'FORM_SCRAPED',
            payload: {
              url: location.href,
              questions: fields,
              pageIndex,
              isMultiPage: detectMultiPage()
            }
          }).catch(() => {});
        } catch { /* extension context invalidated */ }
      }, 2000);
    }
  });
})();