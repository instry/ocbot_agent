import { authFetch } from '../auth/api'

const API_BASE = __OCBOT_API_URL__

export interface MarketplaceSkill {
  id: string
  skill_id: string
  author_id: string
  author_name: string
  name: string
  description: string
  categories: string  // JSON array string
  data: string        // full Skill JSON blob
  clone_count: number
  version: number
  created_at: number
  updated_at: number
}

export interface PublishPayload {
  skill_id: string
  author_name: string
  name: string
  description: string
  categories: string
  data: string
  version: number
}

// --- Public endpoints (no auth) ---

export async function fetchMarketplaceSkills(params: {
  category?: string
  q?: string
  offset?: number
  limit?: number
}): Promise<{ skills: MarketplaceSkill[]; total: number }> {
  const searchParams = new URLSearchParams()
  if (params.category) searchParams.set('category', params.category)
  if (params.q) searchParams.set('q', params.q)
  if (params.offset !== undefined) searchParams.set('offset', String(params.offset))
  if (params.limit !== undefined) searchParams.set('limit', String(params.limit))

  const qs = searchParams.toString()
  const url = `${API_BASE}/api/marketplace/skills${qs ? '?' + qs : ''}`
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Failed to fetch marketplace skills: ${res.status}`)
  }
  return res.json()
}

export async function fetchMarketplaceSkill(id: string): Promise<MarketplaceSkill> {
  const res = await fetch(`${API_BASE}/api/marketplace/skills/${id}`)
  if (!res.ok) {
    throw new Error(`Failed to fetch marketplace skill: ${res.status}`)
  }
  const data = await res.json()
  return data.skill
}

// --- Authenticated endpoints ---

export async function publishSkill(payload: PublishPayload): Promise<{ id: string }> {
  const res = await authFetch('/api/marketplace/publish', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    throw new Error(`Failed to publish skill: ${res.status}`)
  }
  return res.json()
}

export async function unpublishSkill(publishedId: string): Promise<void> {
  const res = await authFetch(`/api/marketplace/skills/${publishedId}`, {
    method: 'DELETE',
  })
  if (!res.ok) {
    throw new Error(`Failed to unpublish skill: ${res.status}`)
  }
}

export async function cloneSkill(publishedId: string): Promise<void> {
  const res = await authFetch(`/api/marketplace/skills/${publishedId}/clone`, {
    method: 'POST',
  })
  if (!res.ok) {
    throw new Error(`Failed to clone skill: ${res.status}`)
  }
}
