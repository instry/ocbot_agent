// lib/sync/skillSync.ts
import { SkillStore } from '../skills/store'
import { authFetch } from '../auth/api'
import { supabase } from '../auth/supabase'
import type { Skill } from '../skills/types'

const SYNC_META_KEY = 'ocbot_skill_sync_meta'

interface SkillSyncMeta {
  lastSyncAt: number
  dirtySkillIds: string[]
  deletedSkillIds: string[]
}

async function getMeta(): Promise<SkillSyncMeta> {
  const result = await chrome.storage.local.get(SYNC_META_KEY)
  return (result[SYNC_META_KEY] as SkillSyncMeta) || {
    lastSyncAt: 0,
    dirtySkillIds: [],
    deletedSkillIds: [],
  }
}

async function setMeta(meta: SkillSyncMeta): Promise<void> {
  await chrome.storage.local.set({ [SYNC_META_KEY]: meta })
}

/** Mark a skill as locally modified (needs push). */
export async function markDirty(skillId: string): Promise<void> {
  const meta = await getMeta()
  if (!meta.dirtySkillIds.includes(skillId)) {
    meta.dirtySkillIds.push(skillId)
  }
  // If it was in deleted, remove it (re-created)
  meta.deletedSkillIds = meta.deletedSkillIds.filter(id => id !== skillId)
  await setMeta(meta)
}

/** Mark a skill as locally deleted (needs push). */
export async function markDeleted(skillId: string): Promise<void> {
  const meta = await getMeta()
  if (!meta.deletedSkillIds.includes(skillId)) {
    meta.deletedSkillIds.push(skillId)
  }
  // Remove from dirty since it's deleted
  meta.dirtySkillIds = meta.dirtySkillIds.filter(id => id !== skillId)
  await setMeta(meta)
}

let syncing = false

/** Sync local skills with the server. Silently skips if not authenticated or already syncing. */
export async function syncSkills(): Promise<void> {
  if (syncing) return
  syncing = true

  try {
    // Check auth
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return

    const store = new SkillStore()
    const meta = await getMeta()

    // --- Push dirty skills ---
    if (meta.dirtySkillIds.length > 0 || meta.deletedSkillIds.length > 0) {
      const pushItems: Array<{ id: string; data: string; updated_at: number; deleted: boolean }> = []

      // Dirty (upsert)
      for (const id of meta.dirtySkillIds) {
        const skill = await store.get(id)
        if (skill) {
          pushItems.push({
            id: skill.id,
            data: JSON.stringify(skill),
            updated_at: skill.updatedAt,
            deleted: false,
          })
        }
      }

      // Deleted
      for (const id of meta.deletedSkillIds) {
        pushItems.push({
          id,
          data: '{}',
          updated_at: Date.now(),
          deleted: true,
        })
      }

      if (pushItems.length > 0) {
        const res = await authFetch('/api/skills/sync', {
          method: 'POST',
          body: JSON.stringify({ skills: pushItems }),
        })
        if (!res.ok) {
          console.error('[ocbot] Skill sync push failed:', res.status)
          return
        }
      }
    }

    // --- Pull updated skills from server ---
    const pullRes = await authFetch(`/api/skills?since=${meta.lastSyncAt}`)
    if (!pullRes.ok) {
      console.error('[ocbot] Skill sync pull failed:', pullRes.status)
      return
    }

    const { skills: remoteSkills } = (await pullRes.json()) as {
      skills: Array<{ id: string; data: string; updated_at: number; deleted: boolean }>
    }

    let maxUpdatedAt = meta.lastSyncAt

    for (const remote of remoteSkills) {
      if (remote.updated_at > maxUpdatedAt) {
        maxUpdatedAt = remote.updated_at
      }

      if (remote.deleted) {
        // Remote deleted — remove locally
        await store.delete(remote.id)
      } else {
        // Check if remote is newer than local
        const local = await store.get(remote.id)
        if (!local || remote.updated_at > local.updatedAt) {
          const skill: Skill = JSON.parse(remote.data)
          if (skill.source === 'auto') {
            await store.saveAutoSkill(skill)
          } else {
            await store.save(skill)
          }
        }
      }
    }

    // Update meta: clear synced IDs, advance lastSyncAt
    await setMeta({
      lastSyncAt: maxUpdatedAt,
      dirtySkillIds: [],
      deletedSkillIds: [],
    })
  } catch (err) {
    console.error('[ocbot] Skill sync error:', err)
  } finally {
    syncing = false
  }
}
