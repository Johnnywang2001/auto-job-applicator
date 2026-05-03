# Auto Job Applicator — Technical Blueprint

## 1. Project Identity
- **Name:** Auto Job Applicator
- **Type:** Chrome Extension (Manifest V3)
- **Workspace:** `/Users/dehydratedflask/Documents/Codex/Auto Job Applicator`
- **Target Platforms:** Chrome, Edge (Manifest V3 compatible)

---

## 2. Tech Stack

| Layer | Technology | Version/Notes |
|-------|-----------|---------------|
| Build Tool | Vite | Fast HMR, multi-page entry for popup/dashboard/content-scripts |
| Language | TypeScript | Strict mode |
| Frontend Framework | React 18 | Functional components + hooks |
| Styling | Tailwind CSS | Custom color tokens (no blue/purple) |
| UI Components | shadcn/ui primitives | Button, Card, Table, Dialog, Tabs, Select, Toast |
| State Management | Zustand | Lightweight, works outside React tree for extension contexts |
| Routing | wouter | Lightweight router for dashboard SPA |
| Storage | `chrome.storage.local` + IndexedDB (via `idb` package) | Jobs, applications, resume blobs |
| Resume Parsing | `mammoth` | Client-side .docx -> HTML/text |
| Resume Generation | `docx` | Programmatic .docx with precise layout control |
| LLM API | OpenCode Go | OpenAI-compatible endpoint |
| Icons | `lucide-react` | Consistent iconography |

---

## 3. Color System (Tailwind Config)

```js
// tailwind.config.js extend colors
colors: {
  background: '#FAFAF9',      // warm off-white
  surface: '#FFFFFF',
  surfaceMuted: '#F5F5F4',
  textPrimary: '#1C1917',     // near-black
  textSecondary: '#78716C',   // warm gray
  border: '#E7E5E4',
  accent: {
    teal: '#0D9488',          // primary actions
    tealLight: '#CCFBF1',
    orange: '#F97316',        // warnings / queued
    orangeLight: '#FFEDD5',
    lime: '#84CC16',          // success / complete
    limeLight: '#ECFCCB',
    red: '#EF4444',           // errors / anti-bot
    redLight: '#FEE2E2',
  }
}
```

---

## 4. Extension Manifest (manifest.json)

```json
{
  "manifest_version": 3,
  "name": "Auto Job Applicator",
  "version": "1.0.0",
  "permissions": [
    "storage",
    "activeTab",
    "scripting",
    "alarms",
    "background",
    "tabs",
    "notifications"
  ],
  "host_permissions": [
    "https://www.linkedin.com/*",
    "https://*.greenhouse.io/*",
    "https://jobs.lever.co/*",
    "https://*.workday.com/*",
    "https://*.myworkdayjobs.com/*",
    "https://jobs.ashbyhq.com/*",
    "<all_urls>"
  ],
  "background": {
    "service_worker": "src/background.ts",
    "type": "module"
  },
  "action": {
    "default_popup": "popup.html"
  },
  "content_scripts": [
    {
      "matches": ["https://www.linkedin.com/jobs/*"],
      "js": ["src/content/linkedin.ts"],
      "run_at": "document_idle"
    },
    {
      "matches": ["<all_urls>"],
      "js": ["src/content/form-scraper.ts"],
      "run_at": "document_idle"
    }
  ],
  "web_accessible_resources": [{
    "resources": ["assets/*"],
    "matches": ["<all_urls>"]
  }]
}
```

---

## 5. File Structure

```
Auto Job Applicator/
|-- public/
|   |-- manifest.json
|-- src/
|   |-- background.ts                    # Service worker: scheduler, rate limiter, API proxy
|   |-- popup/
|   |   |-- Popup.tsx                    # Mini popup UI
|   |   |-- main.tsx
|   |-- dashboard/
|   |   |-- Dashboard.tsx                # Root dashboard component
|   |   |-- main.tsx                     # Dashboard entry point
|   |   |-- layout/
|   |   |   |-- Sidebar.tsx              # Tab navigation
|   |   |   |-- StatusBar.tsx            # Global task runner indicator
|   |   |   |-- TopBar.tsx               # Logo + global actions
|   |   |-- tabs/
|   |   |   |-- ScraperTab.tsx
|   |   |   |-- RankingsTab.tsx
|   |   |   |-- ResumeTab.tsx
|   |   |   |-- ApplicationsTab.tsx
|   |   |   |-- SettingsTab.tsx
|   |   |-- components/
|   |   |   |-- JobCard.tsx
|   |   |   |-- KanbanBoard.tsx
|   |   |   |-- ScoreBadge.tsx
|   |   |   |-- TaskIndicator.tsx
|   |   |   |-- LoginStatusPanel.tsx
|   |-- content/
|   |   |-- linkedin.ts                  # LinkedIn DOM scraping + badge injection
|   |   |-- ats-adapters/
|   |   |   |-- greenhouse.ts
|   |   |   |-- lever.ts
|   |   |   |-- workday.ts
|   |   |   |-- ashby.ts
|   |   |   |-- generic.ts
|   |   |-- form-scraper.ts              # Application form field detection
|   |   |-- status-detector.ts           # Auto-detect application submission status
|   |-- lib/
|   |   |-- api.ts                       # OpenCode Go API client
|   |   |-- storage.ts                   # chrome.storage + IndexedDB wrappers
|   |   |-- resume-parser.ts             # mammoth.js wrapper
|   |   |-- resume-generator.ts          # docx.js wrapper
|   |   |-- coverletter-generator.ts     # Cover letter generator
|   |   |-- scraper-engine.ts            # Orchestrates background scraping
|   |   |-- rate-limiter.ts              # Per-site navigation limits
|   |   |-- anti-bot-detector.ts         # Detects CAPTCHA/blocks
|   |   |-- logger.ts                    # Structured console logging
|   |-- types/
|   |   |-- index.ts                     # All TypeScript interfaces
|   |-- styles/
|   |   |-- globals.css
|-- index.html                           # Popup entry
|-- dashboard.html                       # Dashboard entry
|-- vite.config.ts
|-- tsconfig.json
|-- tailwind.config.js
|-- package.json
```

---

## 6. Core Data Models

```typescript
// src/types/index.ts

export interface JobListing {
  id: string;                          // uuid
  source: 'linkedin' | 'greenhouse' | 'lever' | 'workday' | 'ashby' | 'generic';
  sourceUrl: string;                   // URL scraped from
  applicationUrl: string;              // Direct apply link
  company: string;
  title: string;
  location?: string;
  description: string;                 // Full job description text
  requirements: string[];              // Parsed requirements
  postedDate?: string;
  score?: number;                      // 1-10 (only display if >= 5)
  scoreReason?: string;
  status: 'scraped' | 'saved' | 'applied' | 'interviewing' | 'rejected' | 'offer';
  resumeBlobId?: string;               // IndexedDB key for generated resume
  coverLetterBlobId?: string;          // IndexedDB key for generated cover letter
  scrapedAt: number;                   // timestamp
  questions?: ApplicationQuestion[];   // Phase 9
}

export interface ApplicationRecord {
  id: string;
  jobId: string;
  company: string;
  applicationUrl: string;
  status: string;
  statusHistory: StatusChange[];
  appliedAt?: number;
  notes?: string;
}

export interface StatusChange {
  status: string;
  at: number;
  source: 'auto' | 'manual';
}

export interface ResumeData {
  rawText: string;
  htmlContent: string;                 // From mammoth
  skills: string[];
  experience: ExperienceEntry[];
  education: EducationEntry[];
  baseDocxBlob: ArrayBuffer;
}

export interface ExperienceEntry {
  company: string;
  title: string;
  dates: string;
  bullets: string[];
}

export interface EducationEntry {
  institution: string;
  degree: string;
  dates: string;
}

export interface ApplicationQuestion {
  pageIndex: number;
  fieldLabel: string;
  fieldType: 'text' | 'textarea' | 'select' | 'radio' | 'checkbox' | 'file' | 'date';
  required: boolean;
  options?: string[];                  // For select/radio/checkbox
  selector: string;                    // CSS selector for autofill
}

export interface ScrapeTask {
  id: string;
  type: 'linkedin-feed' | 'linkedin-job' | 'career-page';
  status: 'queued' | 'running' | 'paused' | 'done' | 'error';
  progress: number;                    // 0-100
  results: JobListing[];
  error?: string;
  site?: string;                       // For per-site tracking
}

export interface SiteConfig {
  id: string;
  name: string;
  urlPattern: string;                  // Regex or wildcard
  adapter: 'greenhouse' | 'lever' | 'workday' | 'ashby' | 'generic';
  enabled: boolean;
  isBuiltIn: boolean;                  // Built-in vs user-added
}

export interface UserSettings {
  apiKey: string;
  apiModel: string;                    // Default: deepseek-v4-flash
  linkedinDailyLimit: number;          // Default: 70 (suggestion only)
  maxApplicationsPerCompany: number;   // Default: 3
  autoSubmitEnabled: boolean;          // Phase 10 toggle
  resumeTemplateBlob?: ArrayBuffer;
  coverLetterTemplateBlob?: ArrayBuffer;
}

export interface LoginStatus {
  site: string;                        // 'linkedin', 'indeed', etc.
  url: string;
  isLoggedIn: boolean;
  checkedAt: number;
}
```

---

## 7. Dashboard UI Specification

### Layout
- **Left Sidebar:** Vertical tab navigation with icons
  - Scraper (search icon)
  - Rankings (list icon)
  - Resume (file-text icon)
  - Applications (briefcase icon)
  - Settings (settings icon)
- **Top Status Bar:** Fixed height (48px), shows:
  - Current running tasks with teal pulsing dot
  - LinkedIn daily count: "LinkedIn: 63/70 today" (orange when >= 70)
  - Overall task queue count
  - Anti-bot warning banner (red) if detected
- **Main Content Area:** Scrollable, max-width 1400px centered

### Tab: Scraper
**Layout:** Two-column on desktop (controls left, results right), stacked on mobile.

**Controls Panel:**
- Section: "Job Sites"
  - Built-in toggle list: LinkedIn, Greenhouse, Lever, Workday, Ashby
  - Each item shows login status indicator (green dot = logged in, gray = unknown, red = not logged in)
  - "Check Login Status" button that opens each site in a background tab and checks for authenticated UI elements
- Section: "Custom Sites"
  - Textarea to paste URLs (one per line)
  - "Add to Scraping List" button
  - Table of custom sites with remove button
- Section: "Run Controls"
  - "Start Scraping" button (teal)
  - "Stop / Pause" button (orange)
  - Progress bar for current task
  - Site selector dropdown (which site to scrape)

**Results Panel:**
- Filter: Minimum score (slider 5-10, default 5)
- Table columns:
  1. Company
  2. Job Title
  3. Site (badge: LinkedIn, Greenhouse, etc.)
  4. Score (1-10, color-coded: 5-6 orange, 7-8 teal, 9-10 lime)
  5. Actions: "Optimize Resume" (teal button), "Optimize Cover Letter" (teal outline button), "Apply" (lime button)
- Row click expands to show score reason + job description excerpt
- Pagination: 20 per page
- "Apply" button: Opens application URL. If autofill is available later, shows confirmation dialog: "Autofill available for this application. Start autofill? [Yes] [No, just open]"

### Tab: Rankings
- Alternative view of scraped jobs
- Sortable by score, company, date
- Filter by site, location, company
- Bulk actions: "Generate resumes for selected", "Export to CSV"

### Tab: Resume
**Layout:** Two columns

**Left Column:**
- "Upload Base Resume" (.docx only)
- "Upload Cover Letter Template" (.docx only)
- Parse preview: Expandable sections (Skills, Experience, Education) extracted from resume
- "Re-parse" button if extraction looks wrong

**Right Column:**
- "Preview Generated Resume" (when one exists for a selected job)
- "Download Resume" (.docx)
- "Preview Cover Letter"
- "Download Cover Letter" (.docx)

### Tab: Applications (Kanban)
- **Columns:** Saved -> Applied -> Interviewing -> Rejected -> Offer
- Each card shows: Company, Title, Score, Date, application link icon
- Drag-and-drop between columns (manual status update)
- Click card to expand: full details, status history, notes field
- Company count badge: "2/3 applications" (warning at 3/3, block at >3)
- "Add Application Manually" button (for jobs found outside the extension)

### Tab: Settings
- **API Configuration:**
  - OpenCode Go API Key input (password field with show/hide)
  - Model selector dropdown (kimi-k2.6, deepseek-v4-pro, deepseek-v4-flash, qwen3.5-plus, etc.)
  - "Test API Key" button
- **Scraping Limits:**
  - LinkedIn daily suggestion: number input (default 70)
  - Delay between requests: number input ms (default 8000)
  - Max applications per company: number input (default 3)
- **Autofill (Phase 10):**
  - Toggle: "Enable application autofill"
  - Toggle: "Require confirmation before submitting"
- **Data Management:**
  - Export all data (JSON)
  - Clear all data
  - Export application questions (CSV/JSON)

---

## 8. LLM Prompts & API Strategy

### API Client
```typescript
// src/lib/api.ts
const BASE_URL = "https://opencode.ai/zen/go/v1/chat/completions";

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

async function callLLM(messages: ChatMessage[], model?: string): Promise<string> {
  const settings = await getSettings();
  const response = await fetch(BASE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${settings.apiKey}`
    },
    body: JSON.stringify({
      model: model || settings.apiModel,
      messages,
      temperature: 0.3,
      max_tokens: 2000
    })
  });
  const data = await response.json();
  return data.choices[0].message.content;
}
```

### Prompt: Job Ranking
```text
System: You are an expert career advisor. Rate how well a candidate's resume matches a job description on a scale of 1-10. Be critical but fair. Only return the numeric score and a brief 1-sentence explanation.

User:
RESUME:
{resumeText}

JOB DESCRIPTION:
{jobDescription}

Respond in this exact format:
Score: X
Reason: [one sentence]
```

**Model:** `deepseek-v4-flash` (cheapest, sufficient for classification)

### Prompt: Resume Optimization
```text
System: You are a professional resume writer. Rewrite the candidate's resume to better align with the job description. Keep all facts truthful and based on the original resume. Do not invent experience. Emphasize relevant skills and achievements. Output as structured JSON.

User:
ORIGINAL RESUME:
{resumeJSON}

JOB DESCRIPTION:
{jobDescription}

REQUIRED OUTPUT FORMAT:
{
  "name": "...",
  "contact": "...",
  "summary": "...",
  "skills": ["..."],
  "experience": [
    {
      "company": "...",
      "title": "...",
      "dates": "...",
      "bullets": ["..."]
    }
  ],
  "education": [...]
}
```

**Model:** `kimi-k2.6` (higher quality for generation)

### Prompt: Cover Letter Optimization
```text
System: You are a professional cover letter writer. Write a compelling cover letter based on the candidate's resume and the job description. Use the provided template structure. Keep it to one page.

User:
RESUME:
{resumeText}

JOB DESCRIPTION:
{jobDescription}

COMPANY NAME: {company}

JOB TITLE: {title}

Write a cover letter that:
1. Opens with enthusiasm for the specific role
2. Connects 2-3 relevant experiences to job requirements
3. Closes with a call to action
```

**Model:** `kimi-k2.6`

---

## 9. Resume Generation Engine

### Requirements
1. **Template Preservation:** Parse the uploaded .docx structure (fonts, colors, section order, header style) and replicate it
2. **Dynamic Spacing:**
   - Start with standard margins (0.75" all sides), font 11pt
   - If content doesn't fill page -> reduce margins to 0.5", reduce font to 10.5pt
   - If still not full -> slightly increase line spacing (1.15 -> 1.2)
   - If content exceeds one page -> allow natural overflow to page 2 (do NOT pad)
3. **Skills Injection:** Add/modify a "Skills" section that includes relevant skills from the job description that the candidate possesses (based on resume + LLM inference)
4. **Output:** `.docx` file using `docx` library

### Algorithm
```typescript
function generateResume(originalDocx: ArrayBuffer, optimizedContent: any): Blob {
  // 1. Parse original to understand template structure
  // 2. Create new document with same styles
  // 3. Populate with optimized content
  // 4. Measure approximate page count:
  //    - Estimate: ~500 words per page with 0.75" margins, 11pt
  // 5. If wordCount < 400:
  //    - Reduce margins to 0.5"
  //    - If still < 400 words: reduce font to 10.5pt, line spacing 1.2
  // 6. Return Blob
}
```

---

## 10. Scraping Engine

### LinkedIn Strategy
**Phase 1 (Passive):** Content script on `linkedin.com/jobs/*`
- On page load / scroll / URL change (LinkedIn is SPA), detect job cards in DOM
- Extract: title, company, location, description from right rail
- Inject score badge next to each job card
- "Save to Tracker" button

**Phase 2 (Active Background):** Service worker
- User clicks "Start Scraping" -> LinkedIn selected
- Background opens `linkedin.com/jobs/search/?...` in new tab
- Content script signals back with job listings found on page
- Background closes tab, increments counter
- If counter >= 70, show notification: "LinkedIn daily suggestion reached (70). Continuing may increase anti-bot risk."
- **Anti-bot detection:** Content script checks for CAPTCHA, login wall, "unusual activity" banners. If detected -> stop task, show red warning in dashboard.

### Career Page Strategy
- For each enabled custom site / built-in ATS:
  - Background opens URL in new tab
  - Content script runs appropriate adapter:
    - **Greenhouse:** Look for `.app-title`, `.location`, `#content`
    - **Lever:** Look for `.posting-headline`, `.posting-categories`, `.section.page-centered`
    - **Workday:** Look for `[data-automation-id="jobPosting.title"]`, `[data-automation-id="jobPosting.jobDescription"]`
    - **Ashby:** Look for `.ashby-job-posting-heading`, `.ashby-job-description`
    - **Generic:** Heuristic scan for `<h1>`, sections containing "requirements", "qualifications", "about"
  - Extract job listings or single job details
  - Close tab, move to next
  - 8-second delay between requests (configurable)

### Rate Limiting
```typescript
// Per-site counters in chrome.storage.local
interface SiteCounters {
  [siteId: string]: {
    count: number;
    date: string; // YYYY-MM-DD
  }
}

// Check function
function checkLimit(siteId: string, suggestionLimit: number): { allowed: boolean; message?: string } {
  // Always allowed, but warn if over suggestion limit
}
```

---

## 11. Application Tracker

### Kanban Board
- 5 columns as specified
- Cards draggable between columns
- On drop -> update status, add to `statusHistory` with `source: 'manual'`

### Auto Status Detection
- Content script `status-detector.ts` runs on `<all_urls>`
- Checks page content for keywords:
  - "Thank you for applying" / "Application submitted" -> `applied`
  - "Interview" / "Schedule" -> `interviewing`
  - "Not selected" / "Unfortunately" -> `rejected`
  - "Offer" / "Congratulations" -> `offer`
- If match found -> send message to background -> update application record with `source: 'auto'`

### Per-Company Limit
```typescript
async function canApplyToCompany(company: string): Promise<boolean> {
  const apps = await getApplicationsByCompany(company);
  const appliedCount = apps.filter(a => ['applied', 'interviewing', 'offer'].includes(a.status)).length;
  return appliedCount < settings.maxApplicationsPerCompany;
}
```
- If at limit -> disable "Apply" button, show tooltip: "Max 3 applications reached for {company}"

---

## 12. Login Status Detection

### Supported Sites
- LinkedIn (`linkedin.com`)
- Indeed (`indeed.com`) -- optional built-in
- Glassdoor (`glassdoor.com`) -- optional built-in

### Detection Method
For each site:
1. Open site in background tab (hidden)
2. Content script checks for authenticated-only elements:
   - LinkedIn: `global-nav__me` avatar dropdown, or `feed-identity-module`
   - Indeed: `resume-header`, or `user-name`
3. Send result back to background
4. Close tab
5. Update `LoginStatus` in storage
6. Show indicators in Scraper tab

---

## 13. Form Scraper (Phase 9)

### Detection
Content script `form-scraper.ts` on application pages:
1. Detect multi-page forms (Next/Continue buttons)
2. On each page, scan for:
   - `<input>`, `<textarea>`, `<select>`
   - Labels (associated via `for` attribute or parent)
   - Required indicators (`*`, `required` attribute)
   - File upload fields (resume upload detection)
3. Build `ApplicationQuestion[]` array
4. On "Review" or "Submit" page, capture full form snapshot
5. Store in IndexedDB attached to JobListing
6. Provide "Export Questions" button in dashboard -> JSON/CSV

---

## 14. Anti-Bot Detection

### Indicators to Monitor
- CAPTCHA challenges (reCAPTCHA, hCaptcha)
- "Unusual activity" / "Please verify you're human" banners
- HTTP 403 / 429 responses
- Redirects to login page unexpectedly
- Rate limit pages

### Response
1. Immediately stop all scraping tasks
2. Set task status to `error` with message "Anti-bot detected on {site}"
3. Show persistent red banner in dashboard
4. Send browser notification: "Auto Job Applicator: Anti-bot detected. Scraping paused. Resume manually and try again later."

---

## 15. Implementation Phases (Execution Order)

| Phase | Scope | Est. Effort |
|-------|-------|-------------|
| **0** | Vite + React + Tailwind + shadcn scaffold; manifest; popup skeleton | 2h |
| **1** | Dashboard shell: routing, sidebar, status bar, all 5 tab shells | 3h |
| **2** | Settings tab: API key input, model selector, test connection | 2h |
| **3** | Resume tab: .docx upload, mammoth parsing, parsed preview | 3h |
| **4** | OpenCode Go API client + ranking prompt + basic scoring | 2h |
| **5** | LinkedIn content script (passive): scrape visible jobs, inject badges | 4h |
| **6** | Scraper tab UI: controls, results table, filters, action buttons | 4h |
| **7** | Resume generator: docx.js template preservation + dynamic spacing | 5h |
| **8** | Cover letter generator | 2h |
| **9** | Background LinkedIn scraper: active navigation, rate limiting, anti-bot | 5h |
| **10** | Career page adapters: Greenhouse, Lever, Workday, Ashby, generic | 6h |
| **11** | Login status detection panel | 2h |
| **12** | Applications tab: Kanban board, drag-drop, per-company limits | 4h |
| **13** | Auto status detection | 2h |
| **14** | Form scraper + question export | 4h |
| **15** | Polish: error handling, empty states, onboarding, notifications | 3h |

**Total Est. Effort:** ~53 hours of focused development

---

## 16. Key Decisions Log

1. **No hard rate limits:** 70/day is a suggestion with warning, not enforced.
2. **Score filter:** Only jobs with score >= 5 appear in scraper results.
3. **Template fidelity:** Original resume structure/format is preserved; only content is optimized.
4. **No padding:** Resume never fills whitespace with generic content; spacing is adjusted instead.
5. **Autofill confirmation:** Even when Phase 10 is built, user must confirm before any form submission.
6. **Local-only storage:** No external backend; all data in browser storage for privacy.

---

## 17. Environment Setup Commands

```bash
# Create project
cd "/Users/dehydratedflask/Documents/Codex/Auto Job Applicator"

# Initialize
npm create vite@latest . -- --template react-ts
npm install
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p

# Core dependencies
npm install zustand wouter lucide-react
npm install mammoth docx idb
npm install -D @types/chrome

# shadcn/ui setup (if using CLI)
npx shadcn-ui@latest init
```

---

*This blueprint is comprehensive enough for any agent to pick up and implement. Each section can be treated as a unit of work.*
