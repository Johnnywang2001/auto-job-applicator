export type ApplicationStatus = 'saved' | 'applied' | 'interviewing' | 'rejected' | 'offer';

export const SALARY_UNKNOWN = 'Unsure';

export interface JobListing {
  id: string;
  source: 'linkedin' | 'greenhouse' | 'lever' | 'workday' | 'ashby' | 'generic';
  sourceUrl: string;
  applicationUrl: string;
  company: string;
  title: string;
  location?: string;
  salary: string;
  description: string;
  requirements: string[];
  postedDate?: string;
  score?: number;
  scoreReason?: string;
  status: 'scraped' | 'saved' | 'applied' | 'interviewing' | 'rejected' | 'offer';
  resumeBlobId?: string;
  coverLetterBlobId?: string;
  scrapedAt: number;
  questions?: ApplicationQuestion[];
}

export interface ApplicationRecord {
  id: string;
  jobId: string;
  company: string;
  applicationUrl: string;
  status: ApplicationStatus;
  statusHistory: StatusChange[];
  appliedAt?: number;
  notes?: string;
}

export interface StatusChange {
  status: ApplicationStatus;
  at: number;
  source: 'auto' | 'manual';
}

export interface ResumeData {
  rawText: string;
  htmlContent: string;
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
  options?: string[];
  selector: string;
}

export interface ScrapeTask {
  id: string;
  type: 'linkedin-feed' | 'linkedin-job' | 'career-page';
  status: 'queued' | 'running' | 'paused' | 'done' | 'error';
  progress: number;
  error?: string;
  site?: string;
  resultJobIds?: string[];
}

export interface SiteConfig {
  id: string;
  name: string;
  urlPattern: string;
  adapter: 'greenhouse' | 'lever' | 'workday' | 'ashby' | 'generic';
  enabled: boolean;
  isBuiltIn: boolean;
}

export interface TemplateStyle {
  fontFamily?: string;
  headingColor?: string;
  accentColor?: string;
  bodyColor?: string;
  sectionOrder?: ('summary' | 'skills' | 'experience' | 'education')[];
  marginInches?: number;
  fontSizeHalfPoints?: number;
}

export interface UserSettings {
  apiKey: string;
  apiModel: string;
  apiBaseUrl: string;
  linkedinDailyLimit: number;
  delayBetweenRequests: number;
  maxApplicationsPerCompany: number;
  maxJobsPerScrape: number;
  autoSubmitEnabled: boolean;
  requireConfirmBeforeSubmit: boolean;
  onboardingComplete: boolean;
  templateStyle?: TemplateStyle;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LoginStatus {
  site: string;
  url: string;
  isLoggedIn: boolean;
  checkedAt: number;
}

export interface SiteCounters {
  [siteId: string]: {
    count: number;
    date: string;
  };
}