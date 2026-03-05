export interface Skill {
  id: string
  name: string
  description: string
  iconUrl?: string
  categories: string[]
  installs: number
  version: string
  official?: boolean
  author: string
  creating?: boolean
}

/** Known brand keywords → abbreviation for icon fallback */
const BRAND_MAP: Record<string, string> = {
  linkedin: 'Li',
  twitter: 'Tw',
  facebook: 'Fb',
  instagram: 'Ig',
  tiktok: 'Tk',
  youtube: 'YT',
  reddit: 'Re',
  pinterest: 'Pi',
  whatsapp: 'WA',
  google: 'G',
  amazon: 'a',
  airtable: 'At',
  notion: 'No',
  slack: 'Sl',
  yandex: 'YM',
}

/** Get icon text for a skill: match known brand or use first 2 letters */
export function getSkillAbbr(name: string): string {
  const lower = name.toLowerCase()
  for (const [keyword, abbr] of Object.entries(BRAND_MAP)) {
    if (lower.includes(keyword)) return abbr
  }
  const words = name.split(/\s+/)
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

export interface SkillParameter {
  name: string
  type: 'string' | 'number' | 'boolean' | 'select'
  description: string
  required: boolean
  default?: string | number | boolean
  options?: string[]
}

export interface ChangelogEntry {
  version: string
  date: string
  changes: string[]
}

export interface SkillDetail extends Skill {
  longDescription: string
  screenshots: string[]
  changelog: ChangelogEntry[]
  parameters: SkillParameter[]
  compatibleSites: string[]
  rating: number
  reviewCount: number
  runCount: number
  updatedAt: string
}

export const MOCK_SKILLS: Skill[] = [
  {
    id: 'linkedin-outreach',
    name: 'LinkedIn Outreach',
    description: 'Automate personalized connection requests and follow-up messages on LinkedIn.',
    categories: ['Social Media', 'Lead Generation'],
    installs: 2340,
    version: 'v2',
    official: true,
    author: 'ocbot',
  },
  {
    id: 'twitter-engagement',
    name: 'Twitter Engagement',
    description: 'Monitor keywords and auto-reply to relevant tweets to boost brand visibility.',
    categories: ['Social Media'],
    installs: 1870,
    version: 'v2',
    official: true,
    author: 'ocbot',
  },
  {
    id: 'lead-scraper',
    name: 'Lead Scraper',
    description: 'Extract contact info and company details from business directories and websites.',
    categories: ['Lead Generation', 'Data'],
    installs: 3120,
    version: 'v3',
    official: true,
    author: 'ocbot',
  },
  {
    id: 'email-finder',
    name: 'Email Finder',
    description: 'Find verified email addresses for prospects using name and company domain.',
    categories: ['Lead Generation'],
    installs: 2890,
    version: 'v2',
    official: true,
    author: 'ocbot',
  },
  {
    id: 'google-sheets-sync',
    name: 'Google Sheets Sync',
    description: 'Push scraped data directly into Google Sheets with automatic deduplication.',
    categories: ['Data', 'Integration'],
    installs: 1560,
    version: 'v1',
    author: 'community',
  },
  {
    id: 'csv-export',
    name: 'CSV Export',
    description: 'Export any table or list on a webpage into a clean, formatted CSV file.',
    categories: ['Data'],
    installs: 980,
    version: 'v1',
    author: 'community',
  },
  {
    id: 'price-monitor',
    name: 'Price Monitor',
    description: 'Track product prices across e-commerce sites and alert on drops.',
    categories: ['E-Commerce', 'Automation'],
    installs: 2100,
    version: 'v2',
    official: true,
    author: 'ocbot',
  },
  {
    id: 'review-collector',
    name: 'Review Collector',
    description: 'Aggregate product reviews from multiple marketplaces into one report.',
    categories: ['E-Commerce', 'Data'],
    installs: 740,
    version: 'v1',
    author: 'community',
  },
  {
    id: 'form-filler',
    name: 'Form Filler',
    description: 'Auto-fill web forms with saved profile data for rapid applications.',
    categories: ['Automation'],
    installs: 1430,
    version: 'v1',
    official: true,
    author: 'ocbot',
  },
  {
    id: 'scheduled-actions',
    name: 'Scheduled Actions',
    description: 'Run any browser automation on a recurring schedule — daily, weekly, or custom.',
    categories: ['Automation'],
    installs: 1950,
    version: 'v2',
    official: true,
    author: 'ocbot',
  },
  {
    id: 'instagram-dm',
    name: 'Instagram DM',
    description: 'Send personalized direct messages to targeted Instagram audiences.',
    categories: ['Social Media'],
    installs: 1620,
    version: 'v1',
    author: 'community',
  },
  {
    id: 'competitor-tracker',
    name: 'Competitor Tracker',
    description: 'Monitor competitor websites for pricing, content, and product changes.',
    categories: ['Data', 'E-Commerce'],
    installs: 1080,
    version: 'v1',
    author: 'community',
  },
  {
    id: 'tiktok-analytics',
    name: 'TikTok Analytics',
    description: 'Track video performance, follower growth, and trending sounds on TikTok.',
    categories: ['Social Media', 'Data'],
    installs: 2450,
    version: 'v1',
    author: 'community',
  },
  {
    id: 'youtube-scraper',
    name: 'YouTube Scraper',
    description: 'Extract video metadata, comments, and channel stats from YouTube.',
    categories: ['Social Media', 'Data'],
    installs: 1920,
    version: 'v2',
    official: true,
    author: 'ocbot',
  },
  {
    id: 'crm-sync',
    name: 'CRM Sync',
    description: 'Automatically push captured leads into your CRM system via webhooks.',
    categories: ['Lead Generation', 'Integration'],
    installs: 1740,
    version: 'v1',
    official: true,
    author: 'ocbot',
  },
  {
    id: 'cold-email-generator',
    name: 'Cold Email Generator',
    description: 'Generate personalized cold email drafts based on prospect profile data.',
    categories: ['Lead Generation'],
    installs: 2210,
    version: 'v1',
    author: 'community',
  },
  {
    id: 'airtable-export',
    name: 'Airtable Export',
    description: 'Send scraped data to Airtable bases with field mapping and dedup.',
    categories: ['Data', 'Integration'],
    installs: 870,
    version: 'v1',
    author: 'community',
  },
  {
    id: 'json-api-fetcher',
    name: 'JSON API Fetcher',
    description: 'Fetch and parse JSON from public APIs and display results in tables.',
    categories: ['Data', 'Developer'],
    installs: 1340,
    version: 'v1',
    official: true,
    author: 'ocbot',
  },
  {
    id: 'amazon-product-fetcher',
    name: 'Amazon Product Fetcher',
    description: 'Return the amazon.com product details in a structured format by providing a query, for example "christmas tree".',
    categories: ['E-Commerce', 'Lead Generation'],
    installs: 55,
    version: 'v2',
    official: true,
    author: 'ocbot',
  },
  {
    id: 'product-listing',
    name: 'Product Listing',
    description: 'Bulk list products on marketplaces by filling forms from spreadsheet data.',
    categories: ['E-Commerce'],
    installs: 1560,
    version: 'v1',
    official: true,
    author: 'ocbot',
  },
  {
    id: 'inventory-checker',
    name: 'Inventory Checker',
    description: 'Monitor stock availability across multiple e-commerce platforms.',
    categories: ['E-Commerce'],
    installs: 930,
    version: 'v1',
    author: 'community',
  },
  {
    id: 'coupon-finder',
    name: 'Coupon Finder',
    description: 'Automatically search and apply the best coupon codes at checkout.',
    categories: ['E-Commerce'],
    installs: 3450,
    version: 'v3',
    official: true,
    author: 'ocbot',
  },
  {
    id: 'screenshot-capture',
    name: 'Screenshot Capture',
    description: 'Take full-page or element-level screenshots and save them locally.',
    categories: ['Automation'],
    installs: 1120,
    version: 'v1',
    author: 'community',
  },
  {
    id: 'pdf-downloader',
    name: 'PDF Downloader',
    description: 'Batch download PDF files from websites and organize by category.',
    categories: ['Automation'],
    installs: 860,
    version: 'v1',
    author: 'community',
  },
  {
    id: 'cookie-manager',
    name: 'Cookie Manager',
    description: 'Export and import browser cookies for session management across profiles.',
    categories: ['Automation', 'Developer'],
    installs: 670,
    version: 'v1',
    author: 'community',
  },
  {
    id: 'reddit-monitor',
    name: 'Reddit Monitor',
    description: 'Track subreddits for keyword mentions and new posts matching criteria.',
    categories: ['Social Media', 'Data'],
    installs: 1380,
    version: 'v1',
    author: 'community',
  },
  {
    id: 'facebook-groups',
    name: 'Facebook Groups',
    description: 'Auto-post content to multiple Facebook groups on a schedule.',
    categories: ['Social Media'],
    installs: 1050,
    version: 'v1',
    author: 'community',
  },
  {
    id: 'phone-number-finder',
    name: 'Phone Number Finder',
    description: 'Extract phone numbers from business listings and contact pages.',
    categories: ['Lead Generation'],
    installs: 1890,
    version: 'v2',
    official: true,
    author: 'ocbot',
  },
  {
    id: 'company-enrichment',
    name: 'Company Enrichment',
    description: 'Enrich lead data with company size, industry, and revenue estimates.',
    categories: ['Lead Generation', 'Data'],
    installs: 2050,
    version: 'v2',
    official: true,
    author: 'ocbot',
  },
  {
    id: 'web-dashboard',
    name: 'Web Dashboard',
    description: 'Build a live dashboard from scraped data with auto-refresh charts.',
    categories: ['Data', 'Developer'],
    installs: 760,
    version: 'v1',
    author: 'community',
  },
  {
    id: 'notion-sync',
    name: 'Notion Sync',
    description: 'Sync extracted web data into Notion databases with rich formatting.',
    categories: ['Data', 'Integration'],
    installs: 1210,
    version: 'v1',
    author: 'community',
  },
  {
    id: 'shipping-tracker',
    name: 'Shipping Tracker',
    description: 'Track shipments across carriers and get delivery status notifications.',
    categories: ['E-Commerce'],
    installs: 820,
    version: 'v1',
    author: 'community',
  },
  {
    id: 'dropship-finder',
    name: 'Dropship Finder',
    description: 'Find trending products and reliable suppliers for dropshipping stores.',
    categories: ['E-Commerce', 'Lead Generation'],
    installs: 1670,
    version: 'v1',
    official: true,
    author: 'ocbot',
  },
  {
    id: 'captcha-solver',
    name: 'CAPTCHA Handler',
    description: 'Integrate with CAPTCHA solving services to automate protected pages.',
    categories: ['Automation', 'Developer'],
    installs: 2980,
    version: 'v2',
    official: true,
    author: 'ocbot',
  },
  {
    id: 'multi-tab-runner',
    name: 'Multi-Tab Runner',
    description: 'Run automations across multiple browser tabs in parallel.',
    categories: ['Automation'],
    installs: 1540,
    version: 'v1',
    official: true,
    author: 'ocbot',
  },
  {
    id: 'slack-notifier',
    name: 'Slack Notifier',
    description: 'Send automation results and alerts to Slack channels via webhooks.',
    categories: ['Automation', 'Integration'],
    installs: 1320,
    version: 'v1',
    author: 'community',
  },
  {
    id: 'pinterest-pin',
    name: 'Pinterest Pinner',
    description: 'Auto-pin images to Pinterest boards with optimized descriptions.',
    categories: ['Social Media'],
    installs: 890,
    version: 'v1',
    author: 'community',
  },
  {
    id: 'google-maps-scraper',
    name: 'Google Maps Scraper',
    description: 'Extract business listings, reviews, and contact info from Google Maps.',
    categories: ['Lead Generation', 'Data'],
    installs: 3680,
    version: 'v3',
    official: true,
    author: 'ocbot',
  },
  {
    id: 'event-ticket-sniper',
    name: 'Event Ticket Sniper',
    description: 'Monitor ticket sale pages and alert when tickets become available.',
    categories: ['E-Commerce', 'Automation'],
    installs: 2760,
    version: 'v1',
    author: 'community',
  },
  {
    id: 'data-validator',
    name: 'Data Validator',
    description: 'Validate and clean scraped data with customizable rules and formats.',
    categories: ['Data', 'Developer'],
    installs: 640,
    version: 'v1',
    author: 'community',
  },
  {
    id: 'proxy-rotator',
    name: 'Proxy Rotator',
    description: 'Rotate proxies automatically to avoid rate limits during scraping.',
    categories: ['Automation', 'Developer'],
    installs: 2130,
    version: 'v2',
    official: true,
    author: 'ocbot',
  },
  {
    id: 'whatsapp-sender',
    name: 'WhatsApp Sender',
    description: 'Send bulk messages through WhatsApp Web with personalized templates.',
    categories: ['Social Media'],
    installs: 3100,
    version: 'v2',
    official: true,
    author: 'ocbot',
  },
  {
    id: 'yandex-market',
    name: 'Yandex Market',
    description: 'Search Yandex Market for products, returning title, price, rating, reviews, and URL.',
    categories: ['E-Commerce', 'Financial'],
    installs: 0,
    version: 'v1',
    author: 'community',
  },
]

/** IDs of skills the user has "cloned" (mock data) */
export const MOCK_MY_SKILLS_IDS = [
  'linkedin-outreach',
  'google-maps-scraper',
  'price-monitor',
  'coupon-finder',
]

/** Return the Skill objects the user has cloned */
export function getMySkills(): Skill[] {
  return MOCK_MY_SKILLS_IDS.map((id) => MOCK_SKILLS.find((s) => s.id === id)!).filter(Boolean)
}

const MOCK_SKILL_DETAILS: Record<string, Omit<SkillDetail, keyof Skill>> = {
  'linkedin-outreach': {
    longDescription: `Automate your LinkedIn outreach at scale without sacrificing personalization.\n\nThis skill visits prospect profiles, sends customized connection requests based on configurable templates, and queues follow-up messages after acceptance. It respects LinkedIn's daily limits and randomizes timing to mimic human behavior.\n\n**Key features:**\n- Template variables: \`{{firstName}}\`, \`{{company}}\`, \`{{title}}\`\n- Smart delay between actions (configurable)\n- Auto-withdraw pending requests older than N days\n- CSV import for prospect lists\n- Detailed delivery report with accept/ignore/pending stats`,
    screenshots: [],
    changelog: [
      { version: 'v2', date: '2026-01-15', changes: ['Added follow-up message sequences', 'Template variables for company and title', 'Auto-withdraw stale requests'] },
      { version: 'v1', date: '2025-09-20', changes: ['Initial release with connection request automation', 'CSV prospect import'] },
    ],
    parameters: [
      { name: 'prospectCsv', type: 'string', description: 'Path or URL to CSV file with prospect LinkedIn URLs', required: true },
      { name: 'connectionMessage', type: 'string', description: 'Connection request message template (supports {{variables}})', required: true, default: 'Hi {{firstName}}, I came across your profile and would love to connect!' },
      { name: 'followUpMessage', type: 'string', description: 'Message sent after connection is accepted', required: false },
      { name: 'dailyLimit', type: 'number', description: 'Maximum connection requests per day', required: false, default: 25 },
      { name: 'delaySeconds', type: 'number', description: 'Random delay range (in seconds) between actions', required: false, default: 30 },
      { name: 'withdrawAfterDays', type: 'number', description: 'Auto-withdraw pending requests after N days (0 = disabled)', required: false, default: 14 },
    ],
    compatibleSites: ['linkedin.com'],
    rating: 4.7,
    reviewCount: 128,
    runCount: 12400,
    updatedAt: '2026-01-15',
  },
  'google-maps-scraper': {
    longDescription: `Extract structured business data from Google Maps search results.\n\nProvide a search query (e.g. "dentists in Chicago") and this skill scrolls through results, visiting each listing to capture detailed information including name, address, phone, website, hours, rating, review count, and individual reviews.\n\n**Key features:**\n- Pagination — scrapes beyond the initial result page\n- Review extraction with author, date, and text\n- Exports to CSV or JSON\n- Configurable result limit to control run time\n- Handles "More hours" and "See all reviews" expandable sections`,
    screenshots: [],
    changelog: [
      { version: 'v3', date: '2026-01-08', changes: ['Added individual review extraction', 'Handle expandable hours sections', 'JSON export option'] },
      { version: 'v2', date: '2025-10-12', changes: ['Pagination support for 100+ results', 'Improved address parsing'] },
      { version: 'v1', date: '2025-07-01', changes: ['Initial release — basic listing extraction'] },
    ],
    parameters: [
      { name: 'query', type: 'string', description: 'Search query (e.g. "plumbers in Austin, TX")', required: true },
      { name: 'maxResults', type: 'number', description: 'Maximum number of listings to extract', required: false, default: 50 },
      { name: 'includeReviews', type: 'boolean', description: 'Whether to extract individual reviews per listing', required: false, default: false },
      { name: 'reviewLimit', type: 'number', description: 'Max reviews per listing (when includeReviews is true)', required: false, default: 10 },
      { name: 'outputFormat', type: 'select', description: 'Export format', required: false, default: 'csv', options: ['csv', 'json'] },
    ],
    compatibleSites: ['google.com/maps', 'maps.google.com'],
    rating: 4.8,
    reviewCount: 256,
    runCount: 34200,
    updatedAt: '2026-01-08',
  },
  'price-monitor': {
    longDescription: `Track product prices across major e-commerce platforms and get notified when they drop.\n\nAdd product URLs to your watchlist and this skill periodically checks prices, storing history so you can see trends over time. Set a target price to receive alerts via webhook or in-app notification.\n\n**Key features:**\n- Supports Amazon, eBay, Walmart, Best Buy, and generic product pages\n- Price history chart data\n- Target-price alerts via webhook\n- Handles currency conversion for international listings\n- Runs on a configurable schedule (hourly, daily, custom)`,
    screenshots: [],
    changelog: [
      { version: 'v2', date: '2025-12-20', changes: ['Added Walmart and Best Buy support', 'Webhook notifications for price drops', 'Currency conversion'] },
      { version: 'v1', date: '2025-08-15', changes: ['Initial release — Amazon and eBay price tracking'] },
    ],
    parameters: [
      { name: 'productUrls', type: 'string', description: 'Comma-separated product URLs to monitor', required: true },
      { name: 'targetPrice', type: 'number', description: 'Alert when price drops below this value', required: false },
      { name: 'webhookUrl', type: 'string', description: 'Webhook URL to receive price drop notifications', required: false },
      { name: 'checkInterval', type: 'select', description: 'How often to check prices', required: false, default: 'daily', options: ['hourly', 'daily', 'weekly'] },
      { name: 'currency', type: 'select', description: 'Display currency for price data', required: false, default: 'USD', options: ['USD', 'EUR', 'GBP', 'JPY'] },
    ],
    compatibleSites: ['amazon.com', 'ebay.com', 'walmart.com', 'bestbuy.com'],
    rating: 4.5,
    reviewCount: 89,
    runCount: 18700,
    updatedAt: '2025-12-20',
  },
  'coupon-finder': {
    longDescription: `Automatically find and apply the best coupon codes at checkout.\n\nWhen you reach a checkout page, this skill searches a database of known coupon codes for the retailer, tries each one, and keeps the one that gives the biggest discount. Works across thousands of online stores.\n\n**Key features:**\n- Database of 50,000+ active coupon codes\n- Tries codes automatically at checkout\n- Keeps the best discount found\n- Community-sourced code updates\n- Works on 10,000+ online retailers`,
    screenshots: [],
    changelog: [
      { version: 'v3', date: '2026-02-01', changes: ['Expanded retailer coverage to 10,000+', 'Faster code testing with parallel validation', 'Community code submissions'] },
      { version: 'v2', date: '2025-11-10', changes: ['Added support for percentage and fixed-amount coupons', 'Better checkout page detection'] },
      { version: 'v1', date: '2025-06-01', changes: ['Initial release with 2,000 supported retailers'] },
    ],
    parameters: [
      { name: 'autoApply', type: 'boolean', description: 'Automatically apply the best coupon found', required: false, default: true },
      { name: 'notifyOnSave', type: 'boolean', description: 'Show notification when savings are found', required: false, default: true },
      { name: 'minSavings', type: 'number', description: 'Minimum discount amount to consider (in dollars)', required: false, default: 1 },
    ],
    compatibleSites: ['Most e-commerce sites'],
    rating: 4.6,
    reviewCount: 342,
    runCount: 89500,
    updatedAt: '2026-02-01',
  },
}

/** Get full skill detail — returns mock detail if available, otherwise synthesizes from base Skill */
export function getSkillDetail(id: string): SkillDetail | null {
  const base = MOCK_SKILLS.find((s) => s.id === id)
  if (!base) return null

  const detail = MOCK_SKILL_DETAILS[id]
  if (detail) {
    return { ...base, ...detail }
  }

  // Synthesize plausible defaults from the base skill
  return {
    ...base,
    longDescription: base.description,
    screenshots: [],
    changelog: [{ version: base.version, date: '2025-09-01', changes: ['Initial release'] }],
    parameters: [],
    compatibleSites: [],
    rating: 4.0 + Math.round(Math.random() * 10) / 10,
    reviewCount: Math.max(1, Math.floor(base.installs * 0.05)),
    runCount: base.installs * 3,
    updatedAt: '2025-09-01',
  }
}

import { SkillStore } from '@/lib/skills/store'
import type { Skill as RealSkill, SkillExecution as RealSkillExecution } from '@/lib/skills/types'
import { computeStepFragility, type StepFragility } from '@/lib/skills/fragility'

// Convert internal Skill to display Skill format
export function toDisplaySkill(real: RealSkill): Skill {
  return {
    id: real.id,
    name: real.name,
    description: real.description,
    categories: real.categories,
    installs: real.totalRuns,
    version: `v${real.version}`,
    official: false,
    author: real.author,
    creating: real.status === 'creating',
  }
}

// Convert internal Skill to display SkillDetail format
export function toDisplaySkillDetail(real: RealSkill): SkillDetail {
  return {
    ...toDisplaySkill(real),
    longDescription: real.skillMd || real.description,
    screenshots: [],
    changelog: [],
    parameters: real.parameters.map(p => ({
      name: p.name,
      type: p.type,
      description: p.description,
      required: p.required,
      default: p.default,
      options: p.options,
    })),
    compatibleSites: real.startUrl ? [new URL(real.startUrl).hostname] : [],
    rating: real.score * 5,
    reviewCount: 0,
    runCount: real.totalRuns,
    updatedAt: new Date(real.updatedAt).toISOString().slice(0, 10),
  }
}

const skillStoreInstance = new SkillStore()

export async function getLocalSkills(): Promise<Skill[]> {
  const skills = await skillStoreInstance.list()
  return skills.filter(s => s.source === 'user').map(toDisplaySkill)
}

export async function getLocalSkillDetail(id: string): Promise<SkillDetail | null> {
  const skill = await skillStoreInstance.get(id)
  if (!skill) return null
  return toDisplaySkillDetail(skill)
}

export async function deleteLocalSkill(id: string): Promise<void> {
  await skillStoreInstance.delete(id)
}

export { skillStoreInstance }

export async function getSkillExecutions(skillId: string): Promise<RealSkillExecution[]> {
  return skillStoreInstance.getExecutions(skillId)
}

export async function getSkillFragility(skillId: string): Promise<StepFragility[]> {
  const skill = await skillStoreInstance.get(skillId)
  if (!skill) return []
  const executions = await skillStoreInstance.getExecutions(skillId)
  return computeStepFragility(executions, skill.steps.length)
}

export async function getRealSkill(skillId: string): Promise<RealSkill | null> {
  return skillStoreInstance.get(skillId)
}

export async function saveRealSkill(skill: RealSkill): Promise<void> {
  await skillStoreInstance.save(skill)
}

export type { RealSkill, RealSkillExecution, StepFragility }
