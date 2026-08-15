export type ProviderId = 'openai' | 'anthropic' | 'gemini' | 'openrouter'

export type ListingInputs = {
  propertyType: string
  location: string
  bedrooms: number
  bathrooms: number
  guests: number
  amenities: string[]
  uniqueFeatures: string
  nearby: string
  vibe: string[]
  platform: string
  tone: string
}

export type ListingOutput = {
  title: string
  titleAlternatives: string[]
  description: string
  shortSummary: string
  bulletPoints: string[]
  tags: string[]
  houseRules: string[]
}

export const SYSTEM_PROMPT = `You are an expert short-term rental copywriter with 10+ years experience writing high-converting listings for Airbnb, VRBO, and Booking.com. Write compelling, accurate, SEO-aware descriptions that help guests understand the experience and book with confidence. Never invent amenities or facts.`

async function requestJson(url: string, init: RequestInit): Promise<unknown> {
  const response = await fetch(url, init)
  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message = typeof body === 'object' && body && 'error' in body
      ? String((body as { error?: { message?: string } }).error?.message || 'Request failed')
      : 'Request failed'
    throw new Error(message)
  }
  return body
}

export async function callOpenAI(prompt: string, apiKey: string, model = 'gpt-4o-mini') {
  return requestJson('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: prompt }], max_tokens: 2000, temperature: 0.8 }),
  })
}

export async function callAnthropic(prompt: string, apiKey: string, model = 'claude-3-haiku-20240307') {
  return requestJson('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, max_tokens: 2000, messages: [{ role: 'user', content: prompt }], system: SYSTEM_PROMPT }),
  })
}

export async function callGemini(prompt: string, apiKey: string, model = 'gemini-1.5-flash') {
  return requestJson(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: `${SYSTEM_PROMPT}\n\n${prompt}` }] }], generationConfig: { maxOutputTokens: 2000, temperature: 0.8 } }),
  })
}

export async function callOpenRouter(prompt: string, apiKey: string, model = 'meta-llama/llama-3.1-8b-instruct:free') {
  return requestJson('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'HTTP-Referer': 'https://listingai.app', 'X-Title': 'ListingAI' },
    body: JSON.stringify({ model, messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: prompt }], max_tokens: 2000 }),
  })
}

function deviceKeyMaterial(): Promise<CryptoKey> {
  const seed = `listingai:${navigator.userAgent}:${screen.width}x${screen.height}:${navigator.language}`
  return crypto.subtle.digest('SHA-256', new TextEncoder().encode(seed)).then(hash => crypto.subtle.importKey('raw', hash, 'AES-GCM', false, ['encrypt', 'decrypt']))
}

export async function encryptKey(key: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await deviceKeyMaterial(), new TextEncoder().encode(key))
  return `${btoa(String.fromCharCode(...iv))}.${btoa(String.fromCharCode(...new Uint8Array(encrypted)))} `
}

export async function decryptKey(value: string): Promise<string> {
  const [ivText, dataText] = value.trim().split('.')
  const iv = Uint8Array.from(atob(ivText), char => char.charCodeAt(0))
  const data = Uint8Array.from(atob(dataText), char => char.charCodeAt(0))
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, await deviceKeyMaterial(), data)
  return new TextDecoder().decode(decrypted)
}

export function buildListingPrompt(inputs: ListingInputs): string {
  return `Write a complete rental listing for:\n- Property: ${inputs.propertyType} in ${inputs.location}\n- Sleeps: ${inputs.guests} guests, ${inputs.bedrooms} bedrooms, ${inputs.bathrooms} bathrooms\n- Amenities: ${inputs.amenities.join(', ') || 'None provided'}\n- Unique features: ${inputs.uniqueFeatures || 'None provided'}\n- Nearby: ${inputs.nearby || 'None provided'}\n- Vibe: ${inputs.vibe.join(', ') || 'Welcoming'}\n- Platform: ${inputs.platform}\n- Tone: ${inputs.tone}\n\nReturn valid JSON only with keys: title, titleAlternatives (array of 3), description (500-600 words with THE SPACE, GUEST ACCESS, THE NEIGHBORHOOD, GETTING AROUND), shortSummary (150 words), bulletPoints (array of 8), tags (array of 10), houseRules (array).`
}

export async function generateListing(inputs: ListingInputs, provider: ProviderId, apiKey: string, model: string): Promise<ListingOutput> {
  const raw = provider === 'openai' ? await callOpenAI(buildListingPrompt(inputs), apiKey, model) : provider === 'anthropic' ? await callAnthropic(buildListingPrompt(inputs), apiKey, model) : provider === 'gemini' ? await callGemini(buildListingPrompt(inputs), apiKey, model) : await callOpenRouter(buildListingPrompt(inputs), apiKey, model)
  const content = provider === 'anthropic' ? ((raw as { content?: Array<{ text?: string }> }).content?.[0]?.text || '') : provider === 'gemini' ? ((raw as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }).candidates?.[0]?.content?.parts?.[0]?.text || '') : ((raw as { choices?: Array<{ message?: { content?: string } }> }).choices?.[0]?.message?.content || '')
  const cleaned = content.replace(/^```json\s*/i, '').replace(/```$/i, '').trim()
  return JSON.parse(cleaned) as ListingOutput
}
