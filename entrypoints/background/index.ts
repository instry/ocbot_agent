import { initFromStorage, startChannel, stopChannel, getAllStatuses } from '../../lib/channels/manager'
import { supabase } from '../../lib/auth/supabase'
import { syncSkills } from '../../lib/sync/skillSync'
import type { ChannelConfig } from '../../lib/channels/types'

export default defineBackground(() => {
  // Set side panel behavior: open when extension icon is clicked
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })

  // Initialize channels from storage
  initFromStorage().catch(err => {
    console.error('[ocbot] Failed to init channels:', err)
  })

  // Restore auth session on service worker wake (ensures token refresh)
  supabase.auth.getSession().catch(err => {
    console.error('[ocbot] Failed to restore auth session:', err)
  })

  // Periodic skill sync via alarms
  chrome.alarms.create('skill-sync', { periodInMinutes: 5 })

  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'skill-sync') {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) syncSkills()
      }).catch(() => {})
    }
  })

  // Sync skills on sign-in
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_IN') {
      syncSkills()
    }
  })

  // Handle messages from sidepanel
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message?.type) return false

    switch (message.type) {
      case 'startChannel': {
        const config = message.config as ChannelConfig
        startChannel(config)
          .then(() => sendResponse({ ok: true }))
          .catch(err => sendResponse({ ok: false, error: String(err) }))
        return true // async response
      }

      case 'stopChannel': {
        stopChannel(message.channelId as string)
          .then(() => sendResponse({ ok: true }))
          .catch(err => sendResponse({ ok: false, error: String(err) }))
        return true
      }

      case 'getChannelStatuses': {
        sendResponse({ ok: true, statuses: getAllStatuses() })
        return false
      }

      case 'openSidePanel': {
        const windowIdPromise = sender.tab?.windowId
          ? Promise.resolve(sender.tab.windowId)
          : chrome.windows.getLastFocused().then(w => w.id)
        windowIdPromise
          .then(windowId => chrome.sidePanel.open({ windowId }))
          .then(() => sendResponse({ ok: true }))
          .catch(err => sendResponse({ ok: false, error: String(err) }))
        return true
      }

      case 'syncSkills': {
        syncSkills()
          .then(() => sendResponse({ ok: true }))
          .catch(err => sendResponse({ ok: false, error: String(err) }))
        return true
      }
    }

    return false
  })

  console.log('[ocbot] Background service worker initialized')
})
