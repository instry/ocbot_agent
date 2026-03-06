// lib/hooks/useSkillSync.ts
import { useState, useEffect, useCallback } from 'react'

const SYNC_META_KEY = 'ocbot_skill_sync_meta'

type SyncStatus = 'idle' | 'syncing' | 'error'

export function useSkillSync() {
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle')
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null)

  // Load lastSyncAt from storage on mount
  useEffect(() => {
    chrome.storage.local.get(SYNC_META_KEY).then((result) => {
      const meta = result[SYNC_META_KEY]
      if (meta?.lastSyncAt) {
        setLastSyncAt(meta.lastSyncAt)
      }
    })
  }, [])

  // Listen for sync meta changes
  useEffect(() => {
    const listener = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if (changes[SYNC_META_KEY]) {
        const meta = changes[SYNC_META_KEY].newValue
        if (meta?.lastSyncAt) {
          setLastSyncAt(meta.lastSyncAt)
          setSyncStatus('idle')
        }
      }
    }
    chrome.storage.local.onChanged.addListener(listener)
    return () => chrome.storage.local.onChanged.removeListener(listener)
  }, [])

  const triggerSync = useCallback(() => {
    setSyncStatus('syncing')
    chrome.runtime.sendMessage({ type: 'syncSkills' }, (response) => {
      if (chrome.runtime.lastError || !response?.ok) {
        setSyncStatus('error')
        // Reset to idle after a delay
        setTimeout(() => setSyncStatus('idle'), 3000)
      } else {
        setSyncStatus('idle')
      }
    })
  }, [])

  return { syncStatus, lastSyncAt, triggerSync }
}
