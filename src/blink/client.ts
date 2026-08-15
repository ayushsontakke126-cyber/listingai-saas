import { createClient } from '@blinkdotnew/sdk'

export const blink = createClient({
  projectId: import.meta.env.VITE_BLINK_PROJECT_ID || 'listingai-saas-app-4bro3srd',
  publishableKey: import.meta.env.VITE_BLINK_PUBLISHABLE_KEY || 'blnk_pk_WQ2e3f_mzaEpfqOeuZ9k_z5lukODsU__',
  authRequired: false,
  auth: { mode: 'managed' },
})
