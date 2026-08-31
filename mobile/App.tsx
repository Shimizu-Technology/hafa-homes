import AsyncStorage from '@react-native-async-storage/async-storage'
import { ClerkLoaded, ClerkProvider, useAuth, useSSO, useUser } from '@clerk/expo'
import { useSignInWithApple } from '@clerk/expo/apple'
import { useSignIn, useSignUp } from '@clerk/expo/legacy'
import { tokenCache } from '@clerk/expo/token-cache'
import * as AppleAuthentication from 'expo-apple-authentication'
import * as Crypto from 'expo-crypto'
import * as Linking from 'expo-linking'
import { StatusBar } from 'expo-status-bar'
import * as WebBrowser from 'expo-web-browser'
import { apiFetch } from './src/apiClient'
import { clearPendingAccountDeletion, hasPendingAccountDeletion, markPendingAccountDeletion } from './src/accountDeletionState'
import { createLeadIdempotencyManager } from './src/leadIdempotency'
import { advanceNavigationGeneration, agentRecordBackTarget, beginAppLinkNavigation, closeListingTransition, isCurrentNavigationGeneration, mergeAgentListingPage, openListingFromAgentTransition, requestDetailKey } from './src/navigation'
import { WebView } from 'react-native-webview'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'

type TabKey = 'search' | 'map' | 'agents' | 'saved' | 'requests' | 'more'
type ListingKind = 'sale' | 'rent'
type MapCamera = { center: [number, number]; zoom: number }

type Feature = {
  id: number
  name: string
  slug: string
}

type LocalIntel = {
  summary?: string
  lifestyle_tags?: string[]
  schools_note?: string
  nearby_schools?: string[]
  parks_and_recreation?: string[]
  daily_life?: string[]
  commute_notes?: string[]
}

type Village = {
  id: number
  name: string
  slug: string
  region?: string
  local_intel?: LocalIntel
}

type ListingPhoto = {
  id: number
  url: string
  position: number
  alt_text?: string
}

type Brokerage = {
  id: number
  name: string
  slug?: string
  phone?: string
  website_url?: string
  demo_data?: boolean
}

type Agent = {
  id: number
  brokerage_id?: number
  name: string
  email?: string
  phone?: string
  license_number?: string
  photo_url?: string
  bio?: string
  status?: string
  brokerage?: Brokerage
}

type PaginationMeta = {
  page: number
  per_page: number
  total_count: number
  total_pages: number
  previous_page: number | null
  next_page: number | null
}

type Listing = {
  id: number
  external_id?: string
  source?: string
  status?: string
  title: string
  address: string
  listing_kind: ListingKind
  property_type: string
  price: number
  beds: number
  baths: number
  square_feet?: number
  latitude?: number
  longitude?: number
  primary_photo_url: string
  description?: string
  agent_name?: string
  brokerage_name?: string
  brokerage?: Brokerage | null
  agent?: Agent | null
  village: Village
  features: Feature[]
  photos?: ListingPhoto[]
}

type AgentDetailResponse = {
  agent: Agent
  attributed_listings: Listing[]
  pagination: PaginationMeta
}

type ShowingAppointment = {
  id: number
  lead_id: number
  scheduled_starts_at?: string
  scheduled_ends_at?: string
  timezone: string
  tour_type: 'in_person' | 'virtual'
  status: 'proposed' | 'confirmed' | 'completed' | 'cancelled' | 'no_show'
  location?: string
  consumer_notes?: string
  listing?: { id: number; title: string; address?: string; primary_photo_url?: string } | null
  agent?: { id: number; name: string; email?: string; phone?: string } | null
  brokerage?: { id: number; name: string; phone?: string } | null
}

type ConsumerLead = {
  id: number
  lead_type: string
  status: string
  consumer_status_label?: string
  preferred_contact_method?: string
  created_at: string
  message?: string
  listing?: { id: number; title: string; address?: string; village?: string; primary_photo_url?: string; price?: number; listing_kind?: ListingKind; agent?: Agent | null } | null
  requested_agent?: Agent | null
  assigned_agent?: { id: number; name: string; phone?: string; email?: string } | null
  brokerage?: { id: number; name: string; phone?: string } | null
  prequalified_status_label?: string
  purchase_timeline_label?: string
  budget_range_label?: string
  has_qualification_details?: boolean
  qualification_summary?: string
  showing_appointments?: ShowingAppointment[]
  latest_showing_appointment?: ShowingAppointment | null
}

type LeadIntentSummary = {
  narrative?: string | null
  unique_listing_view_count?: number
  saved_listing_count?: number
  search_filter_count?: number
  form_open_count?: number
  top_villages?: Array<{ name: string; count: number }>
  viewed_price_min?: number
  viewed_price_max?: number
  latest_listing_id?: number
}

type SearchProfile = {
  id?: number
  preferred_contact_method?: 'phone' | 'text' | 'email'
  phone?: string
  prequalified_status?: string
  prequalified_status_label?: string
  lender_name?: string
  purchase_timeline?: string
  purchase_timeline_label?: string
  budget_min?: number
  budget_max?: number
  budget_range_label?: string
  desired_villages?: string
  desired_beds?: number
  desired_baths?: number
  buyer_status?: string
  buyer_status_label?: string
  already_working_with_agent?: string
  already_working_with_agent_label?: string
  notes?: string
  completion_status?: 'complete' | 'incomplete'
  completion_percentage?: number
  qualification_summary?: string
}

type SearchProfilePayload = Partial<{
  preferred_contact_method: string
  phone: string
  prequalified_status: string
  lender_name: string
  purchase_timeline: string
  budget_min: string
  budget_max: string
  desired_villages: string
  desired_beds: string
  desired_baths: string
  buyer_status: string
  already_working_with_agent: string
  notes: string
}>

type LeadIntentPrompt = {
  eligible: boolean
  key?: string
  trigger?: string
  title?: string
  body?: string
  cta?: string
  profile_prompt?: boolean
  profile_prompt_kind?: 'finish_search_profile' | 'update_search_profile'
  create_lead_default?: boolean
  suggested?: Partial<SearchProfile> & {
    listing_id?: number
  }
  summary?: LeadIntentSummary
}

type GetAuthToken = (options?: { template?: string }) => Promise<string | null>

type CurrentUser = {
  id: number
  email: string
  first_name?: string
  last_name?: string
  full_name: string
  phone?: string
  preferred_contact_method?: 'phone' | 'text' | 'email'
  role: 'platform_admin' | 'brokerage_admin' | 'agent' | 'consumer'
  is_staff: boolean
  is_platform_admin: boolean
}

type AppAuth = {
  clerkEnabled: boolean
  isSignedIn: boolean
  userId?: string
  userName?: string
  userEmail?: string
  userInitial?: string
  getToken?: GetAuthToken
  signOut?: () => Promise<void> | void
}

type AuthPrompt = {
  title?: string
  copy?: string
  initialMode?: 'sign-in' | 'sign-up'
}

WebBrowser.maybeCompleteAuthSession()

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000'
const HAFA_HOMES_WEBSITE_URL = 'https://hafahomes.com'
const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN
const CLERK_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY
const CLERK_JWT_TEMPLATE = process.env.EXPO_PUBLIC_CLERK_JWT_TEMPLATE
const APPLE_AUTH_ENABLED = process.env.EXPO_PUBLIC_ENABLE_APPLE_AUTH === 'true'
const GOOGLE_AUTH_ENABLED = process.env.EXPO_PUBLIC_ENABLE_GOOGLE_AUTH === 'true'
const FALLBACK_IMAGE = 'https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?auto=format&fit=crop&w=1200&q=80'
const LEGACY_SAVED_LISTING_IDS_KEY = 'hafaHomes:savedListingIds'
const LEGACY_SAVED_LISTINGS_KEY = 'hafaHomes:savedListings'
const SELECTED_AGENT_ID_KEY = 'hafaHomes:selectedAgentId'
const LEAD_INTENT_SESSION_TOKEN_KEY = 'hafaHomes:leadIntentSessionToken'
const LEAD_INTENT_CONTEXT_REQUIRED_KEY = 'hafaHomes:leadIntentContextRequired'
const MEANINGFUL_LEAD_INTENT_EVENTS = new Set(['listing_detail_viewed', 'listing_saved', 'search_filter_changed', 'map_marker_clicked', 'saved_search_created'])
const OAUTH_CALLBACK_PATH = 'oauth-native-callback'
const AUTH_FLOW_TIMEOUT_MS = 25_000

const preferredTimeOptions = [
  { value: 'morning', label: 'Morning' },
  { value: 'afternoon', label: 'Afternoon' },
  { value: 'evening', label: 'Evening' },
  { value: 'flexible', label: 'Flexible' },
]

const preferredContactOptions = [
  { value: 'phone', label: 'Phone' },
  { value: 'text', label: 'Text' },
  { value: 'email', label: 'Email' },
]

const prequalifiedOptions = [
  { value: '', label: 'Not sure' },
  { value: 'yes', label: 'Yes' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'no', label: 'No' },
]

const purchaseTimelineOptions = [
  { value: '', label: 'Timeline' },
  { value: 'asap', label: 'ASAP' },
  { value: '1_3_months', label: '1–3 months' },
  { value: '3_6_months', label: '3–6 months' },
  { value: '6_plus_months', label: '6+ months' },
  { value: 'just_browsing', label: 'Browsing' },
]

const buyerStatusOptions = [
  { value: '', label: 'Buyer type' },
  { value: 'first_time', label: 'First-time buyer' },
  { value: 'upgrading', label: 'Upgrading' },
  { value: 'relocating', label: 'Relocating' },
  { value: 'military', label: 'Military move' },
  { value: 'investor', label: 'Investor' },
  { value: 'renter', label: 'Renter' },
  { value: 'selling', label: 'Selling too' },
  { value: 'other', label: 'Other' },
]

const agentRelationshipOptions = [
  { value: '', label: 'Agent relationship' },
  { value: 'no', label: 'No agent yet' },
  { value: 'yes', label: 'Already have one' },
  { value: 'not_sure', label: 'Not sure' },
]

class ApiRequestError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiRequestError'
    this.status = status
  }
}

const tabs: Array<{ key: TabKey; label: string; icon: string }> = [
  { key: 'search', label: 'Search', icon: '⌂' },
  { key: 'map', label: 'Map', icon: '⌖' },
  { key: 'agents', label: 'Agents', icon: '◉' },
  { key: 'saved', label: 'Saved', icon: '♡' },
  { key: 'requests', label: 'Requests', icon: '◎' },
  { key: 'more', label: 'More', icon: '☰' },
]

function currency(value: number, kind: ListingKind) {
  const formatted = formatCurrency(value)

  return kind === 'rent' ? `${formatted}/mo` : formatted
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value)
}

function parseNumber(value: string, fallback = 0) {
  const parsed = Number(value.replace(/[^0-9.]/g, ''))
  return Number.isFinite(parsed) ? parsed : fallback
}

function profileValue(profile: SearchProfile | null | undefined, field: keyof SearchProfile, fallback = '') {
  const value = profile?.[field]
  return value === undefined || value === null ? fallback : String(value)
}

function profileBudgetValue(profile: SearchProfile | null | undefined, field: 'budget_min' | 'budget_max', fallback = '') {
  const value = profile?.[field]
  if (value === undefined || value === null) return fallback

  const numeric = Number(value)
  return Number.isFinite(numeric) ? String(Math.round(numeric)) : String(value)
}

function mergedPromptProfile(prompt: LeadIntentPrompt, searchProfile?: SearchProfile | null): SearchProfile {
  return { ...(searchProfile || {}), ...(prompt.suggested || {}) }
}

async function fetchListings(kind: ListingKind): Promise<Listing[]> {
  const response = await apiFetch(`${API_URL}/api/v1/listings?kind=${kind}`)
  if (!response.ok) throw new Error('Unable to load listings')
  const json = await response.json()
  return json.listings ?? []
}

async function fetchAgents(): Promise<Agent[]> {
  const response = await apiFetch(`${API_URL}/api/v1/agents`)
  if (!response.ok) throw new Error('Unable to load agents')
  const json = await response.json()
  return json.agents ?? []
}

async function fetchAgent(id: number, page = 1): Promise<AgentDetailResponse> {
  const response = await apiFetch(`${API_URL}/api/v1/agents/${id}?page=${page}&per_page=6`)
  if (!response.ok) throw new Error(await apiErrorMessage(response, response.status === 404 ? 'This agent is not available in this storefront.' : 'Unable to load this agent profile.'))
  return response.json()
}

function agentInitials(agent: Agent) {
  return agent.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('') || 'HH'
}

async function apiErrorMessage(response: Response, fallback: string) {
  try {
    const payload = await response.json() as { error?: unknown; errors?: unknown }
    if (Array.isArray(payload.errors) && payload.errors.length > 0) return payload.errors.map((error) => String(error)).join(', ')
    if (typeof payload.error === 'string' && payload.error.trim()) return payload.error
  } catch {
    // Fall back to the caller-provided message when the API response is not JSON.
  }

  return fallback
}

function authErrorMessage(error: any, fallback: string) {
  return error?.errors?.[0]?.longMessage || error?.errors?.[0]?.message || error?.message || fallback
}

function authErrorCode(error: any) {
  return error?.code || error?.errors?.[0]?.code
}

function isAuthCancellation(error: any) {
  const code = authErrorCode(error)
  const message = String(error?.message || error?.errors?.[0]?.message || '').toLowerCase()
  return code === 'ERR_REQUEST_CANCELED' || code === 'ERR_CANCELED' || code === 'ERR_CANCELLED' || message.includes('authorizationerror 1001') || message.includes('cancelled') || message.includes('canceled')
}

function isExistingSessionError(error: any) {
  return authErrorCode(error) === 'session_exists'
}

function oauthRedirectUrl() {
  return Linking.createURL(OAUTH_CALLBACK_PATH)
}

function withAuthDelayNotice<T>(promise: Promise<T>, onDelay: () => void, timeoutMs = AUTH_FLOW_TIMEOUT_MS): Promise<T> {
  const timeoutId = setTimeout(onDelay, timeoutMs)
  return promise.finally(() => clearTimeout(timeoutId))
}

async function fetchListing(listingId: number): Promise<Listing> {
  const response = await apiFetch(`${API_URL}/api/v1/listings/${listingId}`)
  if (!response.ok) throw new ApiRequestError(await apiErrorMessage(response, 'Unable to load listing'), response.status)
  const json = await response.json()
  return json.listing
}

async function authHeaders(getToken?: GetAuthToken): Promise<Record<string, string>> {
  if (!getToken) return {}

  try {
    const token = await getToken(CLERK_JWT_TEMPLATE ? { template: CLERK_JWT_TEMPLATE } : undefined)
    return token ? { Authorization: `Bearer ${token}` } : {}
  } catch (tokenError) {
    console.warn('Unable to load Clerk token', tokenError)
    return {}
  }
}

async function currentLeadIntentSessionToken() {
  return (await AsyncStorage.getItem(LEAD_INTENT_SESSION_TOKEN_KEY)) || ''
}

async function leadIntentSessionToken() {
  const existing = await currentLeadIntentSessionToken()
  if (existing) return existing

  const randomSource = typeof globalThis.crypto?.randomUUID === 'function' ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`
  await AsyncStorage.setItem(LEAD_INTENT_SESSION_TOKEN_KEY, randomSource)
  return randomSource
}

async function clearLeadIntentSessionToken() {
  await AsyncStorage.removeItem(LEAD_INTENT_SESSION_TOKEN_KEY)
}

async function resetLeadIntentSessionToken() {
  await clearLeadIntentSessionToken()
  return leadIntentSessionToken()
}

type LeadIntentContextGuard = { token?: string; eventCount: number; meaningfulEventCount: number; startedAt: number }

async function markLeadIntentCurrentContextRequired() {
  await AsyncStorage.setItem(LEAD_INTENT_CONTEXT_REQUIRED_KEY, JSON.stringify({ eventCount: 0, meaningfulEventCount: 0, startedAt: Date.now() }))
}

async function leadIntentCurrentContextGuard(): Promise<LeadIntentContextGuard | null> {
  const raw = await AsyncStorage.getItem(LEAD_INTENT_CONTEXT_REQUIRED_KEY)
  if (!raw) return null
  if (raw === 'true') return { eventCount: 0, meaningfulEventCount: 0, startedAt: Date.now() }

  try {
    const parsed = JSON.parse(raw) as Partial<LeadIntentContextGuard>
    return { token: parsed.token, eventCount: Number(parsed.eventCount || 0), meaningfulEventCount: Number(parsed.meaningfulEventCount || 0), startedAt: Number(parsed.startedAt || Date.now()) }
  } catch {
    return { eventCount: 0, meaningfulEventCount: 0, startedAt: Date.now() }
  }
}

async function saveLeadIntentCurrentContextGuard(guard: LeadIntentContextGuard) {
  await AsyncStorage.setItem(LEAD_INTENT_CONTEXT_REQUIRED_KEY, JSON.stringify(guard))
}

async function clearLeadIntentCurrentContextRequired() {
  await AsyncStorage.removeItem(LEAD_INTENT_CONTEXT_REQUIRED_KEY)
}

async function leadIntentCurrentContextRequired() {
  return (await leadIntentCurrentContextGuard()) !== null
}

async function noteLeadIntentCurrentContextEvent(sessionToken: string, eventName: string) {
  const guard = await leadIntentCurrentContextGuard()
  if (!guard) return

  const sameToken = !guard.token || guard.token === sessionToken
  const isMeaningfulEvent = MEANINGFUL_LEAD_INTENT_EVENTS.has(eventName)
  const nextGuard = {
    token: sessionToken,
    eventCount: sameToken ? guard.eventCount + 1 : 1,
    meaningfulEventCount: sameToken ? guard.meaningfulEventCount + (isMeaningfulEvent ? 1 : 0) : (isMeaningfulEvent ? 1 : 0),
    startedAt: guard.startedAt || Date.now(),
  }

  if (nextGuard.meaningfulEventCount >= 2) {
    await clearLeadIntentCurrentContextRequired()
  } else {
    await saveLeadIntentCurrentContextGuard(nextGuard)
  }
}

function leadIntentClientEventId(eventName: string) {
  return `${eventName}:${Date.now()}:${Math.random().toString(36).slice(2)}`
}

async function recordLeadIntentEvent(eventName: string, payload: { listing_id?: number; village_id?: number; agent_id?: number; source?: string; metadata?: Record<string, unknown> } = {}, getToken?: GetAuthToken) {
  try {
    let sessionToken = await leadIntentSessionToken()
    const clientEventId = leadIntentClientEventId(eventName)

    async function postEvent(token: string) {
      return apiFetch(`${API_URL}/api/v1/lead_intent/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders(getToken)) },
        body: JSON.stringify({
          lead_intent_event: {
            session_token: token,
            event_name: eventName,
            client_event_id: clientEventId,
            source: payload.source || 'mobile',
            listing_id: payload.listing_id,
            village_id: payload.village_id,
            agent_id: payload.agent_id,
            metadata: payload.metadata || {},
          },
        }),
      })
    }

    let response = await postEvent(sessionToken)
    if (response.status === 409) {
      sessionToken = await resetLeadIntentSessionToken()
      response = await postEvent(sessionToken)
    }
    if (!response.ok) return null

    await noteLeadIntentCurrentContextEvent(sessionToken, eventName)
    return response.json() as Promise<{ prompt: LeadIntentPrompt; lead_intent_session: LeadIntentSummary }>
  } catch (intentError) {
    console.warn('Unable to record Hafa Homes lead intent', intentError)
    return null
  }
}

async function dismissLeadIntentPrompt(promptKey?: string, reason = 'dismissed', getToken?: GetAuthToken) {
  try {
    const sessionToken = await currentLeadIntentSessionToken()
    if (!sessionToken) return
    const response = await apiFetch(`${API_URL}/api/v1/lead_intent/dismiss`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeaders(getToken)) },
      body: JSON.stringify({ lead_intent: { session_token: sessionToken, prompt_key: promptKey, reason } }),
    })
    if (response.status === 409) {
      await clearLeadIntentSessionToken()
      await markLeadIntentCurrentContextRequired()
    }
  } catch (intentError) {
    console.warn('Unable to dismiss Hafa Homes lead intent prompt', intentError)
  }
}

async function fetchSavedListings(getToken: GetAuthToken): Promise<{ listing_ids: number[]; listings: Listing[] }> {
  const response = await apiFetch(`${API_URL}/api/v1/me/saved_listings`, {
    headers: await authHeaders(getToken),
  })
  if (!response.ok) throw new Error('Unable to load saved homes')
  return response.json()
}

async function saveListingForUser(listingId: number, getToken: GetAuthToken): Promise<{ listing: Listing; listing_id: number; saved: boolean }> {
  const response = await apiFetch(`${API_URL}/api/v1/listings/${listingId}/save`, {
    method: 'POST',
    headers: await authHeaders(getToken),
  })
  if (!response.ok) throw new ApiRequestError(await apiErrorMessage(response, 'Unable to save home'), response.status)
  return response.json()
}

async function removeSavedListingForUser(listingId: number, getToken: GetAuthToken): Promise<{ listing_id: number; saved: boolean }> {
  const response = await apiFetch(`${API_URL}/api/v1/listings/${listingId}/save`, {
    method: 'DELETE',
    headers: await authHeaders(getToken),
  })
  if (!response.ok) throw new ApiRequestError(await apiErrorMessage(response, 'Unable to remove saved home'), response.status)
  return response.json()
}

type CreateLeadPayload = {
  listing_id?: number
  lead_type: 'showing_request' | 'price_tracker' | 'search_assist'
  name: string
  email: string
  phone: string
  preferred_contact_method: string
  preferred_time?: string
  preferred_tour_date?: string
  tour_type?: string
  target_price?: string
  source_campaign?: string
  source_url?: string
  requested_agent_id?: number
  prequalified_status?: string
  lender_name?: string
  purchase_timeline?: string
  budget_min?: string
  budget_max?: string
  desired_villages?: string
  desired_beds?: string
  desired_baths?: string
  buyer_status?: string
  already_working_with_agent?: string
  qualification_notes?: string
  intent_session_token?: string
  message: string
}

async function createLead(payload: CreateLeadPayload, getToken?: GetAuthToken, ownerId?: string, retryAfterIntentReset = true) {
  if (payload.lead_type === 'search_assist' && !payload.intent_session_token) {
    throw new ApiRequestError('Your search session refreshed. Please keep browsing or reopen the prompt so we can attach the right search context.', 409)
  }

  if (!payload.intent_session_token && await leadIntentCurrentContextRequired()) {
    throw new ApiRequestError('Your search session refreshed after sign-in. Please view the home again and reopen this form before submitting.', 409)
  }

  const requestAuthHeaders = await authHeaders(getToken)
  const idempotency = createLeadIdempotencyManager({
    storage: AsyncStorage,
    digest: (value) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value),
    uuid: () => Crypto.randomUUID(),
  })
  const idempotencyToken = await idempotency.prepare(payload, requestAuthHeaders.Authorization ? ownerId : undefined)
  const response = await apiFetch(`${API_URL}/api/v1/leads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyToken.key, ...requestAuthHeaders },
    body: JSON.stringify({ lead: payload }),
  })

  if (response.status === 409) {
    const conflictPayload = await response.clone().json().catch(() => null) as { reset_session?: boolean; reset_idempotency_key?: boolean } | null
    if (conflictPayload?.reset_idempotency_key) {
      await idempotency.complete(idempotencyToken)
      throw new ApiRequestError('Please try submitting again.', response.status)
    }
    if (retryAfterIntentReset && payload.intent_session_token && conflictPayload?.reset_session) {
      await clearLeadIntentSessionToken()
      await markLeadIntentCurrentContextRequired()
      throw new ApiRequestError('Your search session refreshed after sign-in. Please view the home again and reopen this form before submitting.', response.status)
    }
  }

  if (!response.ok) throw new ApiRequestError(await apiErrorMessage(response, 'Unable to send request'), response.status)
  await idempotency.complete(idempotencyToken)
  await clearLeadIntentCurrentContextRequired()
  return response.json()
}

async function fetchMyLeads(getToken: GetAuthToken): Promise<{ leads: ConsumerLead[] }> {
  const leads = new Map<number, ConsumerLead>()
  let page = 1

  while (true) {
    const response = await apiFetch(`${API_URL}/api/v1/me/leads?page=${page}&per_page=100`, {
      headers: await authHeaders(getToken),
    })
    if (!response.ok) throw new ApiRequestError(await apiErrorMessage(response, 'Unable to load your requests'), response.status)

    const result = await response.json() as {
      leads?: ConsumerLead[]
      pagination?: { next_page?: number | null }
    }
    for (const lead of result.leads ?? []) leads.set(lead.id, lead)

    const nextPage = result.pagination?.next_page
    if (!nextPage || nextPage <= page) break
    page = nextPage
  }

  return { leads: [...leads.values()] }
}

async function fetchMyLead(leadId: number, getToken: GetAuthToken): Promise<{ lead: ConsumerLead }> {
  const response = await apiFetch(`${API_URL}/api/v1/me/leads/${leadId}`, {
    headers: await authHeaders(getToken),
  })
  if (!response.ok) throw new ApiRequestError(await apiErrorMessage(response, 'Unable to load this request'), response.status)
  return response.json()
}

async function fetchMe(getToken: GetAuthToken): Promise<{ user: CurrentUser }> {
  const response = await apiFetch(`${API_URL}/api/v1/me`, {
    headers: await authHeaders(getToken),
  })
  if (!response.ok) throw new ApiRequestError(await apiErrorMessage(response, 'Unable to load profile'), response.status)
  return response.json()
}

async function updateProfile(payload: Partial<Pick<CurrentUser, 'first_name' | 'last_name' | 'phone' | 'preferred_contact_method'>>, getToken: GetAuthToken): Promise<{ user: CurrentUser }> {
  const response = await apiFetch(`${API_URL}/api/v1/me`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders(getToken)) },
    body: JSON.stringify({ user: payload }),
  })
  if (!response.ok) throw new ApiRequestError(await apiErrorMessage(response, 'Unable to update profile'), response.status)
  return response.json()
}

async function fetchSearchProfile(getToken: GetAuthToken): Promise<{ search_profile: SearchProfile }> {
  const response = await apiFetch(`${API_URL}/api/v1/me/search_profile`, {
    headers: await authHeaders(getToken),
  })
  if (!response.ok) throw new ApiRequestError(await apiErrorMessage(response, 'Unable to load search profile'), response.status)
  return response.json()
}

async function updateSearchProfile(payload: SearchProfilePayload, getToken: GetAuthToken): Promise<{ search_profile: SearchProfile }> {
  const response = await apiFetch(`${API_URL}/api/v1/me/search_profile`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders(getToken)) },
    body: JSON.stringify({ search_profile: payload }),
  })
  if (!response.ok) throw new ApiRequestError(await apiErrorMessage(response, 'Unable to update search profile'), response.status)
  return response.json()
}

async function deleteAccount(getToken: GetAuthToken): Promise<{ deleted: boolean; deletion_pending: boolean }> {
  const response = await apiFetch(`${API_URL}/api/v1/me`, {
    method: 'DELETE',
    headers: await authHeaders(getToken),
  })
  if (!response.ok) throw new ApiRequestError(await apiErrorMessage(response, 'Unable to delete account'), response.status)
  return response.json()
}

const disabledAuth: AppAuth = { clerkEnabled: false, isSignedIn: false }

export default function App() {
  if (!CLERK_PUBLISHABLE_KEY) return <AppContent auth={disabledAuth} />

  return (
    <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY} tokenCache={tokenCache}>
      <ClerkLoaded>
        <AuthenticatedAppContent />
      </ClerkLoaded>
    </ClerkProvider>
  )
}

function AuthenticatedAppContent() {
  const { getToken, isSignedIn, signOut } = useAuth()
  const { user } = useUser()
  const userEmail = user?.primaryEmailAddress?.emailAddress
  const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim()
  const userName = user?.fullName || fullName || undefined
  const userInitial = (user?.firstName || userEmail || 'A').charAt(0).toUpperCase()

  const auth = useMemo<AppAuth>(() => ({
    clerkEnabled: true,
    isSignedIn: Boolean(isSignedIn),
    userId: user?.id,
    userName,
    userEmail,
    userInitial,
    getToken,
    signOut: () => signOut(),
  }), [getToken, isSignedIn, signOut, user?.id, userEmail, userInitial, userName])

  return <AppContent auth={auth} />
}

function AppContent({ auth }: { auth: AppAuth }) {
  const [activeTab, setActiveTab] = useState<TabKey>('map')
  const [kind, setKind] = useState<ListingKind>('sale')
  const [searchQuery, setSearchQuery] = useState('')
  const [listings, setListings] = useState<Listing[]>([])
  const [agents, setAgents] = useState<Agent[]>([])
  const [agentsScope, setAgentsScope] = useState<'storefront' | null>(null)
  const [agentsLoading, setAgentsLoading] = useState(false)
  const [selectedAgentId, setSelectedAgentId] = useState<number | null>(null)
  const [selectedAgentDetailId, setSelectedAgentDetailId] = useState<number | null>(null)
  const [selectedAgentDetail, setSelectedAgentDetail] = useState<AgentDetailResponse | null>(null)
  const [agentDetailLoading, setAgentDetailLoading] = useState(false)
  const [agentDetailError, setAgentDetailError] = useState<string | null>(null)
  const [agentReturnListing, setAgentReturnListing] = useState<Listing | null>(null)
  const [listingCache, setListingCache] = useState<Record<number, Listing>>({})
  const [selectedListing, setSelectedListing] = useState<Listing | null>(null)
  const [selectedRequestId, setSelectedRequestId] = useState<number | null>(null)
  const [savedListingIds, setSavedListingIds] = useState<number[]>([])
  const [savedListingsLoading, setSavedListingsLoading] = useState(false)
  const [pendingSaveListingId, setPendingSaveListingId] = useState<number | null>(null)
  const [legacySaveMigrationAttempted, setLegacySaveMigrationAttempted] = useState(false)
  const [authPrompt, setAuthPrompt] = useState<AuthPrompt | null>(null)
  const [leadIntentPrompt, setLeadIntentPrompt] = useState<LeadIntentPrompt | null>(null)
  const [dismissedLeadIntentPromptKey, setDismissedLeadIntentPromptKey] = useState<string | null>(null)
  const [fullMapOpen, setFullMapOpen] = useState(false)
  const [mapCamera, setMapCamera] = useState<MapCamera | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const navigationGeneration = useRef(0)

  useEffect(() => {
    if (activeTab !== 'map' && fullMapOpen) setFullMapOpen(false)
  }, [activeTab, fullMapOpen])

  useEffect(() => {
    let active = true
    let linkSequence = 0

    async function handleUrl(url: string | null) {
      if (!url) return
      const sequence = ++linkSequence
      const navigation = beginAppLinkNavigation(navigationGeneration, Linking.parse(url))
      const { generation, target } = navigation

      if (target.type === 'request') {
        setSelectedAgentDetailId(null)
        setSelectedAgentDetail(null)
        setAgentReturnListing(null)
        setSelectedListing(null)
        setSelectedRequestId(target.requestId)
        setActiveTab('requests')
        return
      }

      if (target.type === 'listing') {
        setSelectedAgentDetailId(null)
        setSelectedAgentDetail(null)
        setAgentReturnListing(null)
        setSelectedRequestId(null)
        setSelectedListing(null)
        setActiveTab('search')
        try {
          const listing = await fetchListing(target.listingId)
          if (!active || sequence !== linkSequence || !isCurrentNavigationGeneration(navigationGeneration, generation)) return
          setKind(listing.listing_kind)
          setListingCache((current) => ({ ...current, [listing.id]: listing }))
          setSelectedListing(listing)
        } catch (linkError) {
          console.warn('Unable to open linked listing', linkError)
          if (active && sequence === linkSequence && isCurrentNavigationGeneration(navigationGeneration, generation)) Alert.alert('Listing unavailable', 'This listing is no longer available to open.')
        }
        return
      }

      if (target.type === 'agent') {
        setSelectedListing(null)
        setSelectedRequestId(null)
        setSelectedAgentDetailId(target.agentId)
        setSelectedAgentDetail(null)
        setAgentReturnListing(null)
        setAgentDetailError(null)
        setAgentDetailLoading(true)
        setActiveTab('agents')
        try {
          const agentRecord = await fetchAgent(target.agentId)
          if (!active || sequence !== linkSequence || !isCurrentNavigationGeneration(navigationGeneration, generation)) return
          setSelectedAgentDetail(agentRecord)
        } catch (linkError) {
          console.warn('Unable to open linked agent', linkError)
          if (active && sequence === linkSequence && isCurrentNavigationGeneration(navigationGeneration, generation)) {
            setAgentDetailError(linkError instanceof Error ? linkError.message : 'Unable to load this agent profile.')
          }
        } finally {
          if (active && sequence === linkSequence && isCurrentNavigationGeneration(navigationGeneration, generation)) setAgentDetailLoading(false)
        }
        return
      }

      setSelectedListing(null)
      setSelectedRequestId(null)
      setSelectedAgentDetailId(null)
      setSelectedAgentDetail(null)
      setAgentReturnListing(null)
      if (target.type === 'agents') setActiveTab('agents')
      else if (target.type === 'requests') setActiveTab('requests')
      else if (target.type === 'saved') setActiveTab('saved')
      else if (target.type === 'more') setActiveTab('more')
    }

    Linking.getInitialURL().then(handleUrl).catch((linkError) => console.warn('Unable to parse initial link', linkError))
    const subscription = Linking.addEventListener('url', ({ url }) => {
      handleUrl(url).catch((linkError) => console.warn('Unable to handle incoming link', linkError))
    })
    return () => {
      active = false
      subscription.remove()
    }
  }, [])

  useEffect(() => {
    if (!auth.isSignedIn) {
      setSelectedAgentId(null)
      if (auth.clerkEnabled) AsyncStorage.removeItem(SELECTED_AGENT_ID_KEY).catch((storageError) => console.warn('Unable to clear selected agent', storageError))
      return
    }

    AsyncStorage.getItem(SELECTED_AGENT_ID_KEY)
      .then((value) => {
        const parsed = value ? Number(value) : null
        if (parsed && Number.isFinite(parsed)) setSelectedAgentId(parsed)
      })
      .catch((storageError) => console.warn('Unable to load selected agent', storageError))
  }, [auth.clerkEnabled, auth.isSignedIn])

  useEffect(() => {
    const targetAgentsScope: 'storefront' | null = activeTab === 'agents' || Boolean(selectedListing) || Boolean(selectedAgentDetailId) ? 'storefront' : null
    if (!targetAgentsScope || agentsScope === targetAgentsScope) return undefined

    let cancelled = false

    async function loadAgents() {
      setAgentsLoading(true)
      try {
        const results = await fetchAgents()
        if (!cancelled) {
          setAgents(results)
          setAgentsScope(targetAgentsScope)
        }
      } catch (loadError) {
        console.warn('Unable to load agents', loadError)
        if (!cancelled) {
          setAgents([])
          setAgentsScope(targetAgentsScope)
        }
      } finally {
        if (!cancelled) setAgentsLoading(false)
      }
    }

    loadAgents()

    return () => {
      cancelled = true
    }
  }, [activeTab, agentsScope, selectedAgentDetailId, selectedListing])

  useEffect(() => {
    let cancelled = false

    async function loadListings() {
      setLoading(true)
      setError(null)
      try {
        const results = await fetchListings(kind)
        if (!cancelled) {
          setListings(results)
          setListingCache((current) => {
            const next = { ...current }
            results.forEach((listing) => {
              next[listing.id] = listing
            })
            return next
          })
          if (selectedListing && !results.some((listing) => listing.id === selectedListing.id)) {
            setSelectedListing(null)
          }
        }
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : 'Unable to load listings')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadListings()

    return () => {
      cancelled = true
    }
  }, [kind])

  const filteredListings = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return listings

    return listings.filter((listing) => [
      listing.title,
      listing.address,
      listing.village.name,
      listing.property_type,
      listing.agent_name,
      listing.brokerage_name,
      ...listing.features.map((feature) => feature.name),
    ].filter(Boolean).some((value) => String(value).toLowerCase().includes(query)))
  }, [listings, searchQuery])

  const savedListings = useMemo(
    () => savedListingIds.map((id) => listingCache[id]).filter((listing): listing is Listing => Boolean(listing)),
    [listingCache, savedListingIds],
  )

  const directoryAgents = agentsScope === 'storefront' ? agents : []
  const selectedListingAgents = agentsScope === 'storefront' ? agents : []
  const selectedAgent = useMemo(
    () => (selectedListing ? selectedListingAgents : directoryAgents).find((agent) => agent.id === selectedAgentId) ?? null,
    [directoryAgents, selectedAgentId, selectedListing, selectedListingAgents],
  )

  const selectAgent = useCallback((agentId: number | null) => {
    if (!auth.isSignedIn || !auth.getToken) {
      openAuthPrompt({
        title: 'Sign in to choose an agent',
        copy: 'Create a free Hafa Homes account before setting a preferred agent for future requests.',
      })
      return
    }

    setSelectedAgentId(agentId)
    if (agentId) {
      AsyncStorage.setItem(SELECTED_AGENT_ID_KEY, String(agentId)).catch((storageError) => console.warn('Unable to save selected agent', storageError))
      recordLeadIntentEvent('agent_selected', { agent_id: agentId, source: 'mobile', metadata: { surface: selectedListing ? 'listing_detail' : 'agents_tab' } }, auth.getToken)
    } else {
      AsyncStorage.removeItem(SELECTED_AGENT_ID_KEY).catch((storageError) => console.warn('Unable to clear selected agent', storageError))
    }
  }, [auth.getToken, auth.isSignedIn, selectedListing])

  useEffect(() => {
    let cancelled = false

    async function loadServerSavedListings() {
      if (!auth.isSignedIn || !auth.getToken) {
        setSavedListingIds([])
        setSavedListingsLoading(false)
        setLegacySaveMigrationAttempted(false)
        return
      }

      setSavedListingsLoading(true)
      try {
        const result = await fetchSavedListings(auth.getToken)
        if (cancelled) return

        const serverListings = Array.isArray(result.listings) ? result.listings : []
        const serverIds = Array.isArray(result.listing_ids) ? result.listing_ids : serverListings.map((listing) => listing.id)
        setSavedListingIds(serverIds.filter((id): id is number => typeof id === 'number'))
        setListingCache((current) => {
          const next = { ...current }
          serverListings.forEach((listing) => {
            if (listing && typeof listing.id === 'number') next[listing.id] = listing
          })
          return next
        })
      } catch (savedError) {
        console.warn('Unable to load server-backed Hafa Homes saves', savedError)
      } finally {
        if (!cancelled) setSavedListingsLoading(false)
      }
    }

    loadServerSavedListings()

    return () => {
      cancelled = true
    }
  }, [auth.getToken, auth.isSignedIn])

  useEffect(() => {
    let cancelled = false

    async function migrateLegacyLocalSaves() {
      if (!auth.isSignedIn || !auth.getToken || legacySaveMigrationAttempted) return

      setLegacySaveMigrationAttempted(true)
      try {
        const [savedIdsJson, savedListingsJson] = await Promise.all([
          AsyncStorage.getItem(LEGACY_SAVED_LISTING_IDS_KEY),
          AsyncStorage.getItem(LEGACY_SAVED_LISTINGS_KEY),
        ])
        if (cancelled) return

        const persistedIds = savedIdsJson ? JSON.parse(savedIdsJson) : []
        const persistedListings = savedListingsJson ? JSON.parse(savedListingsJson) : []
        const legacyListings = Array.isArray(persistedListings)
          ? persistedListings.filter((listing): listing is Listing => listing && typeof listing.id === 'number')
          : []
        const legacyIds = Array.from(new Set([
          ...(Array.isArray(persistedIds) ? persistedIds.filter((id): id is number => typeof id === 'number') : []),
          ...legacyListings.map((listing) => listing.id),
        ]))

        if (legacyListings.length > 0) {
          setListingCache((current) => {
            const next = { ...current }
            legacyListings.forEach((listing) => { next[listing.id] = listing })
            return next
          })
        }

        if (legacyIds.length === 0) return

        const results = await Promise.allSettled(legacyIds.map((listingId) => saveListingForUser(listingId, auth.getToken!)))
        if (cancelled) return

        const migratedListings = results
          .filter((result): result is PromiseFulfilledResult<{ listing: Listing; listing_id: number; saved: boolean }> => result.status === 'fulfilled')
          .map((result) => result.value.listing)
          .filter((listing): listing is Listing => Boolean(listing))
        const migratedIds = migratedListings.map((listing) => listing.id)

        if (migratedIds.length > 0) {
          setSavedListingIds((current) => Array.from(new Set([...current, ...migratedIds])))
          setListingCache((current) => {
            const next = { ...current }
            migratedListings.forEach((listing) => { next[listing.id] = listing })
            return next
          })
        }

        const migrationComplete = results.every((result) => (
          result.status === 'fulfilled' || (result.reason instanceof ApiRequestError && result.reason.status === 404)
        ))
        if (migrationComplete) {
          await AsyncStorage.multiRemove([LEGACY_SAVED_LISTING_IDS_KEY, LEGACY_SAVED_LISTINGS_KEY])
        }
      } catch (migrationError) {
        console.warn('Unable to migrate legacy local saved Hafa Homes listings', migrationError)
      }
    }

    migrateLegacyLocalSaves()

    return () => {
      cancelled = true
    }
  }, [auth.getToken, auth.isSignedIn, legacySaveMigrationAttempted])

  function openAuthPrompt(prompt: AuthPrompt = {}) {
    if (!auth.clerkEnabled) {
      Alert.alert('Sign-in coming online', 'Accounts need Clerk configuration before saved homes can sync.')
      return
    }

    setAuthPrompt({ initialMode: 'sign-in', ...prompt })
  }

  const trackLeadIntent = useCallback(async (eventName: string, payload: { listing_id?: number; village_id?: number; agent_id?: number; source?: string; metadata?: Record<string, unknown> } = {}) => {
    const result = await recordLeadIntentEvent(eventName, payload, auth.isSignedIn ? auth.getToken : undefined)
    const prompt = result?.prompt
    if (prompt?.eligible && prompt.key && prompt.key !== dismissedLeadIntentPromptKey) setLeadIntentPrompt(prompt)
  }, [auth.getToken, auth.isSignedIn, dismissedLeadIntentPromptKey])

  const viewedListingRef = useRef<number | null>(null)

  useEffect(() => {
    if (!selectedListing || viewedListingRef.current === selectedListing.id) return

    viewedListingRef.current = selectedListing.id
    trackLeadIntent('listing_detail_viewed', { listing_id: selectedListing.id, source: 'mobile', metadata: { surface: 'listing_detail', listing_kind: selectedListing.listing_kind } })
  }, [selectedListing, trackLeadIntent])

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (searchQuery.trim()) trackLeadIntent('search_filter_changed', { source: 'mobile', metadata: { filter: 'query', value: searchQuery.trim(), listing_kind: kind, surface: 'search_bar' } })
    }, 700)

    return () => clearTimeout(timeout)
  }, [kind, searchQuery, trackLeadIntent])

  function cacheListingForSave(listingId: number) {
    const listingToCache = listingCache[listingId] ?? listings.find((listing) => listing.id === listingId) ?? selectedListing
    if (listingToCache && !listingCache[listingId]) {
      setListingCache((current) => ({ ...current, [listingId]: listingToCache }))
    }
  }

  async function ensureSaved(listingId: number) {
    if (!auth.getToken) return

    cacheListingForSave(listingId)
    setSavedListingIds((current) => current.includes(listingId) ? current : [...current, listingId])

    try {
      const result = await saveListingForUser(listingId, auth.getToken)
      if (result.listing) setListingCache((current) => ({ ...current, [result.listing.id]: result.listing }))
      await trackLeadIntent('listing_saved', { listing_id: listingId, source: 'mobile', metadata: { surface: 'save_button' } })
    } catch (saveError) {
      console.warn('Unable to save Hafa Homes listing', saveError)
      setSavedListingIds((current) => current.filter((id) => id !== listingId))
      Alert.alert('Unable to save home', saveError instanceof Error ? saveError.message : 'Please try again in a moment.')
    }
  }

  async function removeSaved(listingId: number) {
    if (!auth.getToken) return

    setSavedListingIds((current) => current.filter((id) => id !== listingId))

    try {
      await removeSavedListingForUser(listingId, auth.getToken)
    } catch (saveError) {
      console.warn('Unable to remove Hafa Homes saved listing', saveError)
      setSavedListingIds((current) => current.includes(listingId) ? current : [...current, listingId])
      Alert.alert('Unable to update saved homes', saveError instanceof Error ? saveError.message : 'Please try again in a moment.')
    }
  }

  function toggleSaved(listingId: number) {
    if (!auth.isSignedIn || !auth.getToken) {
      setPendingSaveListingId(listingId)
      openAuthPrompt({
        title: 'Sign in to save this home',
        copy: 'Create a free Hafa Homes account to sync saved homes across devices and pick up your search later.',
      })
      return
    }

    if (savedListingIds.includes(listingId)) {
      removeSaved(listingId)
    } else {
      ensureSaved(listingId)
    }
  }

  useEffect(() => {
    if (!auth.isSignedIn || !auth.getToken || !pendingSaveListingId) return

    const listingId = pendingSaveListingId
    setPendingSaveListingId(null)
    ensureSaved(listingId)
  }, [auth.getToken, auth.isSignedIn, pendingSaveListingId])

  async function openAgentRecord(agentId: number, returnListing: Listing | null = null) {
    const generation = advanceNavigationGeneration(navigationGeneration)
    setSelectedRequestId(null)
    setSelectedListing(null)
    setSelectedAgentDetailId(agentId)
    setSelectedAgentDetail(null)
    setAgentReturnListing(returnListing)
    setAgentDetailError(null)
    setAgentDetailLoading(true)
    setActiveTab('agents')

    try {
      const agentRecord = await fetchAgent(agentId)
      if (!isCurrentNavigationGeneration(navigationGeneration, generation)) return
      setSelectedAgentDetail(agentRecord)
    } catch (agentError) {
      if (!isCurrentNavigationGeneration(navigationGeneration, generation)) return
      setAgentDetailError(agentError instanceof Error ? agentError.message : 'Unable to load this agent profile.')
    } finally {
      if (isCurrentNavigationGeneration(navigationGeneration, generation)) setAgentDetailLoading(false)
    }
  }

  async function loadMoreAgentListings() {
    const agentId = selectedAgentDetail?.agent.id
    const nextPage = selectedAgentDetail?.pagination.next_page
    if (!agentId || !nextPage || agentDetailLoading) return

    const generation = navigationGeneration.current
    setAgentDetailLoading(true)
    setAgentDetailError(null)
    try {
      const next = await fetchAgent(agentId, nextPage)
      if (!isCurrentNavigationGeneration(navigationGeneration, generation)) return
      setSelectedAgentDetail((current) => mergeAgentListingPage(current, next, agentId))
    } catch (agentError) {
      if (!isCurrentNavigationGeneration(navigationGeneration, generation)) return
      setAgentDetailError(agentError instanceof Error ? agentError.message : 'Unable to load more listings.')
    } finally {
      if (isCurrentNavigationGeneration(navigationGeneration, generation)) setAgentDetailLoading(false)
    }
  }

  function openListingFromBrowse(listing: Listing) {
    advanceNavigationGeneration(navigationGeneration)
    setSelectedRequestId(null)
    setSelectedAgentDetailId(null)
    setSelectedAgentDetail(null)
    setAgentReturnListing(null)
    setSelectedListing(listing)
  }

  async function openListingFromRequest(listingId: number) {
    const generation = advanceNavigationGeneration(navigationGeneration)
    const listing = listingCache[listingId] ?? await fetchListing(listingId)
    if (!isCurrentNavigationGeneration(navigationGeneration, generation)) return
    setKind(listing.listing_kind)
    setListingCache((current) => ({ ...current, [listing.id]: listing }))
    setSelectedAgentDetailId(null)
    setSelectedAgentDetail(null)
    setAgentReturnListing(null)
    setSelectedListing(listing)
  }

  function openListingFromAgent(listing: Listing) {
    advanceNavigationGeneration(navigationGeneration)
    const transition = openListingFromAgentTransition({ agentDetailId: selectedAgentDetailId, agentDetailLoading, listing: selectedListing }, listing)
    setSelectedAgentDetailId(transition.agentDetailId)
    setAgentDetailLoading(transition.agentDetailLoading)
    setListingCache((current) => ({ ...current, [listing.id]: listing }))
    setSelectedListing(transition.listing)
  }

  function closeListing() {
    advanceNavigationGeneration(navigationGeneration)
    const transition = closeListingTransition({ agentDetailId: selectedAgentDetailId, agentDetailLoading, listing: selectedListing })
    setSelectedAgentDetailId(transition.agentDetailId)
    setAgentDetailLoading(transition.agentDetailLoading)
    setSelectedListing(transition.listing)
  }

  function openRequest(requestId: number) {
    advanceNavigationGeneration(navigationGeneration)
    setSelectedListing(null)
    setSelectedAgentDetailId(null)
    setSelectedAgentDetail(null)
    setAgentReturnListing(null)
    setSelectedRequestId(requestId)
  }

  function closeRequest() {
    advanceNavigationGeneration(navigationGeneration)
    setSelectedRequestId(null)
  }

  function closeAgentRecord() {
    advanceNavigationGeneration(navigationGeneration)
    const returnListing = agentRecordBackTarget(agentReturnListing)
    setSelectedAgentDetailId(null)
    setSelectedAgentDetail(null)
    setAgentDetailError(null)
    setAgentReturnListing(null)
    if (returnListing) setSelectedListing(returnListing)
  }

  function navigateToTab(tab: TabKey) {
    advanceNavigationGeneration(navigationGeneration)
    setSelectedListing(null)
    setSelectedRequestId(null)
    setSelectedAgentDetailId(null)
    setSelectedAgentDetail(null)
    setAgentReturnListing(null)
    setActiveTab(tab)
  }

  if (selectedListing) {
    return (
      <>
        <ListingDetailScreen
          listing={selectedListing}
          saved={savedListingIds.includes(selectedListing.id)}
          auth={auth}
          agents={selectedListingAgents}
          selectedAgent={selectedAgent}
          onSelectAgent={selectAgent}
          onOpenAgent={(agentId) => openAgentRecord(agentId, selectedListing)}
          onBack={closeListing}
          onOpenAuth={openAuthPrompt}
          onToggleSaved={() => toggleSaved(selectedListing.id)}
          onTrackIntent={trackLeadIntent}
        />
        <ProgressiveLeadPromptSheet
          prompt={leadIntentPrompt}
          auth={auth}
          selectedAgent={selectedAgent}
          onDismiss={(reason) => {
            setDismissedLeadIntentPromptKey(leadIntentPrompt?.key || null)
            dismissLeadIntentPrompt(leadIntentPrompt?.key, reason, auth.isSignedIn ? auth.getToken : undefined)
            setLeadIntentPrompt(null)
          }}
          onSubmitted={() => setDismissedLeadIntentPromptKey(leadIntentPrompt?.key || null)}
          onClose={() => setLeadIntentPrompt(null)}
        />
        {auth.clerkEnabled && <AuthModal open={Boolean(authPrompt)} prompt={authPrompt} onClose={() => setAuthPrompt(null)} />}
      </>
    )
  }


  if (selectedAgentDetailId) {
    return (
      <AgentDetailScreen
        record={selectedAgentDetail}
        loading={agentDetailLoading}
        error={agentDetailError}
        selectedAgentId={selectedAgentId}
        canSelectAgent={auth.isSignedIn}
        onBack={closeAgentRecord}
        onSelectAgent={selectAgent}
        onOpenListing={openListingFromAgent}
        onLoadMore={loadMoreAgentListings}
      />
    )
  }

  return (
    <SafeAreaView style={styles.shell}>
      <StatusBar style="light" />
      {!(activeTab === 'map' && fullMapOpen) && <View style={styles.header}>
        <View style={styles.brandRow}>
          <View style={styles.brandIdentity}>
            <View style={styles.brandMark}><Image source={require('./assets/hafa-homes-icon.png')} style={styles.brandMarkImage} /></View>
            <View>
              <Text style={styles.brandTitle}>Hafa Homes</Text>
              <Text style={styles.brandSubtitle}>Guam real estate app</Text>
            </View>
          </View>
          <HeaderAuthButton auth={auth} onOpenAccount={() => navigateToTab('more')} onOpenAuth={() => openAuthPrompt()} />
        </View>
        <View style={styles.searchBar}>
          <Text style={styles.searchIcon}>⌕</Text>
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Address, village, or listing ID"
            placeholderTextColor="#53645f"
            returnKeyType="search"
            style={styles.searchInput}
          />
        </View>
        <View style={styles.segmentedControl}>
          {(['sale', 'rent'] as const).map((option) => (
            <Pressable key={option} onPress={() => { setKind(option); trackLeadIntent('search_filter_changed', { source: 'mobile', metadata: { filter: 'kind', value: option, listing_kind: option, surface: 'segment_control' } }) }} style={[styles.segmentButton, kind === option && styles.segmentButtonActive]}>
              <Text style={[styles.segmentText, kind === option && styles.segmentTextActive]}>{option === 'sale' ? 'Buy' : 'Rent'}</Text>
            </Pressable>
          ))}
          <Text style={styles.resultCount}>{filteredListings.length} found</Text>
        </View>
      </View>}

      <View style={[styles.content, activeTab === 'map' && fullMapOpen && styles.fullMapContent]}>
        {activeTab === 'search' && (
          loading
            ? <CenteredState label="Loading Guam listings..." loading />
            : error
              ? <CenteredState label={error} />
              : <SearchScreen listings={filteredListings} savedIds={savedListingIds} onOpen={openListingFromBrowse} onToggleSaved={toggleSaved} />
        )}
        {activeTab === 'map' && (
          loading
            ? <CenteredState label="Loading Guam listings..." loading />
            : error
              ? <CenteredState label={error} />
              : <MapScreen
                listings={filteredListings}
                savedIds={savedListingIds}
                onOpen={openListingFromBrowse}
                onToggleSaved={toggleSaved}
                fullMap={fullMapOpen}
                initialCamera={mapCamera}
                onCameraChange={setMapCamera}
                onToggleFullMap={() => setFullMapOpen((current) => !current)}
              />
        )}
        {activeTab === 'agents' && (
          <AgentsScreen agents={directoryAgents} loading={agentsLoading || agentsScope !== 'storefront'} selectedAgentId={selectedAgentId} canSelectAgent={auth.isSignedIn} onSelectAgent={selectAgent} onOpenAgent={(agentId) => openAgentRecord(agentId)} />
        )}
        {activeTab === 'saved' && (
          !auth.isSignedIn
            ? <SavedSignInScreen clerkEnabled={auth.clerkEnabled} onOpenAuth={() => openAuthPrompt({ title: 'Sign in to view saved homes', copy: 'Saved homes are tied to your Hafa Homes account so they stay with you across devices.' })} />
            : savedListingsLoading
              ? <CenteredState label="Loading saved homes..." loading />
              : <SavedScreen listings={savedListings} onOpen={openListingFromBrowse} onToggleSaved={toggleSaved} />
        )}
        {activeTab === 'requests' && (
          !auth.isSignedIn
            ? <RequestsSignInScreen clerkEnabled={auth.clerkEnabled} onOpenAuth={() => openAuthPrompt({ title: 'Sign in to view your requests', copy: 'Signed-in showing and price watch requests can show status, agent, and scheduled appointment details.' })} />
            : selectedRequestId
              ? <RequestDetailScreen key={requestDetailKey(selectedRequestId)} requestId={selectedRequestId} auth={auth} onBack={closeRequest} onOpenListing={openListingFromRequest} />
              : <RequestsScreen auth={auth} onSelectRequest={openRequest} />
        )}
        {activeTab === 'more' && <MoreScreen auth={auth} onOpenAuth={openAuthPrompt} onNavigateTab={navigateToTab} />}
      </View>

      {!(activeTab === 'map' && fullMapOpen) && <View style={styles.tabBar}>
        {tabs.map((tab) => (
          <Pressable key={tab.key} onPress={() => navigateToTab(tab.key)} style={[styles.tabButton, activeTab === tab.key && styles.tabButtonActive]}>
            <View style={[styles.tabIndicator, activeTab === tab.key && styles.tabIndicatorActive]} />
            <Text style={[styles.tabIcon, activeTab === tab.key && styles.tabActive]}>{tab.icon}</Text>
            <Text style={[styles.tabLabel, activeTab === tab.key && styles.tabActive]}>{tab.label}</Text>
          </Pressable>
        ))}
      </View>}
      <ProgressiveLeadPromptSheet
        prompt={leadIntentPrompt}
        auth={auth}
        selectedAgent={selectedAgent}
        onDismiss={(reason) => {
          setDismissedLeadIntentPromptKey(leadIntentPrompt?.key || null)
          dismissLeadIntentPrompt(leadIntentPrompt?.key, reason, auth.isSignedIn ? auth.getToken : undefined)
          setLeadIntentPrompt(null)
        }}
        onSubmitted={() => setDismissedLeadIntentPromptKey(leadIntentPrompt?.key || null)}
        onClose={() => setLeadIntentPrompt(null)}
      />
      {auth.clerkEnabled && <AuthModal open={Boolean(authPrompt)} prompt={authPrompt} onClose={() => setAuthPrompt(null)} />}
    </SafeAreaView>
  )
}

function ProgressiveLeadPromptSheet({ prompt, auth, selectedAgent, onDismiss, onSubmitted, onClose }: { prompt: LeadIntentPrompt | null; auth: AppAuth; selectedAgent: Agent | null; onDismiss: (reason: string) => void; onSubmitted: () => void; onClose: () => void }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('+1671')
  const [preferredContact, setPreferredContact] = useState<'phone' | 'text' | 'email'>('email')
  const [prequalifiedStatus, setPrequalifiedStatus] = useState('')
  const [purchaseTimeline, setPurchaseTimeline] = useState('')
  const [budgetMin, setBudgetMin] = useState('')
  const [budgetMax, setBudgetMax] = useState('')
  const [desiredVillages, setDesiredVillages] = useState('')
  const [desiredBeds, setDesiredBeds] = useState('')
  const [desiredBaths, setDesiredBaths] = useState('')
  const [buyerStatus, setBuyerStatus] = useState('')
  const [alreadyWorkingWithAgent, setAlreadyWorkingWithAgent] = useState('')
  const [lenderName, setLenderName] = useState('')
  const [notes, setNotes] = useState('')
  const [agentHelpRequested, setAgentHelpRequested] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [followUpError, setFollowUpError] = useState<string | null>(null)
  const editedPromptFieldsRef = useRef<Set<string>>(new Set())

  function markPromptFieldEdited(field: string) {
    editedPromptFieldsRef.current.add(field)
  }

  function prefillPromptField(field: string, setter: (value: string) => void, value: string) {
    if (!editedPromptFieldsRef.current.has(field)) setter(value)
  }

  useEffect(() => {
    if (!prompt) return undefined

    let cancelled = false
    editedPromptFieldsRef.current = new Set()

    setSubmitted(false)
    setError(null)
    setFollowUpError(null)
    setName(auth.userName || '')
    setEmail(auth.userEmail || '')
    setPhone('+1671')
    setPreferredContact('email')
    setAgentHelpRequested(false)
    setPrequalifiedStatus('')
    setPurchaseTimeline('')
    setDesiredVillages(prompt.suggested?.desired_villages || '')
    setBudgetMin(prompt.suggested?.budget_min ? String(Math.round(prompt.suggested.budget_min)) : '')
    setBudgetMax(prompt.suggested?.budget_max ? String(Math.round(prompt.suggested.budget_max)) : '')
    setDesiredBeds('')
    setDesiredBaths('')
    setBuyerStatus('')
    setAlreadyWorkingWithAgent('')
    setLenderName('')
    setNotes('')

    if (auth.isSignedIn && auth.getToken) {
      fetchSearchProfile(auth.getToken)
        .then((result) => {
          if (cancelled) return
          const merged = mergedPromptProfile(prompt, result.search_profile)
          prefillPromptField('phone', setPhone, profileValue(merged, 'phone', '+1671'))
          prefillPromptField('preferredContact', (value) => setPreferredContact((value || 'email') as 'phone' | 'text' | 'email'), profileValue(merged, 'preferred_contact_method', 'email'))
          prefillPromptField('prequalifiedStatus', setPrequalifiedStatus, profileValue(merged, 'prequalified_status'))
          prefillPromptField('purchaseTimeline', setPurchaseTimeline, profileValue(merged, 'purchase_timeline'))
          prefillPromptField('desiredVillages', setDesiredVillages, profileValue(merged, 'desired_villages'))
          prefillPromptField('budgetMin', setBudgetMin, profileBudgetValue(merged, 'budget_min'))
          prefillPromptField('budgetMax', setBudgetMax, profileBudgetValue(merged, 'budget_max'))
          prefillPromptField('desiredBeds', setDesiredBeds, profileValue(merged, 'desired_beds'))
          prefillPromptField('desiredBaths', setDesiredBaths, profileValue(merged, 'desired_baths'))
          prefillPromptField('buyerStatus', setBuyerStatus, profileValue(merged, 'buyer_status'))
          prefillPromptField('alreadyWorkingWithAgent', setAlreadyWorkingWithAgent, profileValue(merged, 'already_working_with_agent'))
          prefillPromptField('lenderName', setLenderName, profileValue(merged, 'lender_name'))
          prefillPromptField('notes', setNotes, profileValue(merged, 'notes'))
        })
        .catch((profileError) => {
          if (!cancelled) console.warn('Unable to prefill search profile prompt', profileError)
        })
    }

    return () => { cancelled = true }
  }, [auth.getToken, auth.isSignedIn, auth.userEmail, auth.userName, prompt])

  if (!prompt) return null
  const activePrompt = prompt
  const promptCreatesLead = !activePrompt.profile_prompt || agentHelpRequested
  const profileSubmitAction = activePrompt.profile_prompt_kind === 'update_search_profile' ? 'Update profile' : 'Save profile'
  const profileSubmittingLabel = activePrompt.profile_prompt_kind === 'update_search_profile' ? 'Updating profile...' : 'Saving profile...'
  const submitButtonLabel = submitting
    ? (promptCreatesLead ? 'Sending request...' : profileSubmittingLabel)
    : activePrompt.profile_prompt
      ? (agentHelpRequested ? `${profileSubmitAction} and request follow-up` : activePrompt.cta || profileSubmitAction)
      : activePrompt.cta || 'Get matched with an agent'

  async function handleSubmit() {
    const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
    if (!emailValid) {
      setError('Please add a valid email so the team can follow up.')
      return
    }

    if (activePrompt.profile_prompt && !auth.getToken) {
      setError('Please sign in again before saving your search profile.')
      return
    }

    setSubmitting(true)
    setError(null)
    setFollowUpError(null)
    let profileSaved = false
    try {
      const token = await currentLeadIntentSessionToken()
      const profilePayload: SearchProfilePayload = {
        preferred_contact_method: preferredContact,
        phone: phone.trim(),
        prequalified_status: prequalifiedStatus,
        lender_name: lenderName.trim(),
        purchase_timeline: purchaseTimeline,
        budget_min: budgetMin.trim(),
        budget_max: budgetMax.trim(),
        desired_villages: desiredVillages.trim(),
        desired_beds: desiredBeds.trim(),
        desired_baths: desiredBaths.trim(),
        buyer_status: buyerStatus,
        already_working_with_agent: alreadyWorkingWithAgent,
        notes: notes.trim(),
      }
      const createLeadRequested = !activePrompt.profile_prompt || agentHelpRequested
      if (activePrompt.profile_prompt && auth.getToken) {
        await updateSearchProfile(profilePayload, auth.getToken)
        profileSaved = true
      }
      if (createLeadRequested) {
        try {
          await createLead({
            listing_id: activePrompt.suggested?.listing_id,
            lead_type: 'search_assist',
            name: name.trim() || 'Hafa Homes searcher',
            email: email.trim(),
            phone: phone.trim(),
            preferred_contact_method: preferredContact,
            source_campaign: `progressive_prompt:${activePrompt.trigger || 'search_intent'}`,
            source_url: 'hafahomes:///search',
            requested_agent_id: auth.isSignedIn ? selectedAgent?.id : undefined,
            prequalified_status: prequalifiedStatus,
            lender_name: lenderName.trim(),
            purchase_timeline: purchaseTimeline,
            budget_min: budgetMin.trim(),
            budget_max: budgetMax.trim(),
            desired_villages: desiredVillages.trim(),
            desired_beds: desiredBeds.trim(),
            desired_baths: desiredBaths.trim(),
            buyer_status: buyerStatus,
            already_working_with_agent: alreadyWorkingWithAgent,
            qualification_notes: notes.trim(),
            intent_session_token: token,
            message: `Progressive search assist prompt: ${activePrompt.trigger || 'search_intent'}`,
          }, auth.isSignedIn ? auth.getToken : undefined, auth.userId)
        } catch (leadError) {
          if (!profileSaved) throw leadError

          setFollowUpError(leadError instanceof Error ? leadError.message : 'The agent follow-up request did not send.')
          setSubmitted(true)
          onSubmitted()
          return
        }
      }
      setSubmitted(true)
      onSubmitted()
    } catch (submitError) {
      console.warn('Unable to submit progressive search assist lead', submitError)
      setError(submitError instanceof Error ? submitError.message : 'We could not send your search details yet.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={() => onDismiss('system_close')}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.sheetBackdrop}>
        <Pressable style={styles.sheetScrim} onPress={() => onDismiss('scrim')} />
        <View style={styles.requestSheet}>
          {submitted ? (
            <View style={styles.requestSuccess}>
              <Text style={styles.kicker}>{followUpError || (prompt.profile_prompt && !agentHelpRequested) ? 'Search profile saved' : 'Search assist sent'}</Text>
              <Text style={styles.requestTitle}>{followUpError ? 'Your saved preferences are ready.' : prompt.profile_prompt && !agentHelpRequested ? 'Your saved preferences are ready.' : 'The brokerage team has your search context.'}</Text>
              <Text style={styles.requestCopy}>{followUpError ? 'Hafa Homes can prefill future requests from this profile. The optional agent follow-up did not send, so request a showing or price watch from a listing if you still want the team to reach out.' : prompt.profile_prompt && !agentHelpRequested ? 'Hafa Homes can prefill future requests from this profile and avoid asking the long prompt again.' : 'An agent can use these details to follow up with better Guam listing matches.'}</Text>
              {followUpError && <Text style={styles.requestWarning}>Agent follow-up was not sent: {followUpError}</Text>}
              <Pressable style={styles.primaryCta} onPress={onClose}><Text style={styles.primaryCtaText}>Done</Text></Pressable>
            </View>
          ) : (
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <View style={styles.sheetHandle} />
              <View style={styles.sheetHeaderRow}>
                <View style={styles.sheetHeaderCopy}>
                  <Text style={styles.kicker}>Search assist</Text>
                  <Text style={styles.requestTitle}>{prompt.title || 'Want an agent to send matching homes?'}</Text>
                </View>
                <Pressable onPress={() => onDismiss('closed')} style={styles.sheetCloseButton}><Text style={styles.sheetCloseText}>×</Text></Pressable>
              </View>
              <Text style={styles.requestCopy}>{prompt.body || 'Share a few details and the brokerage team can follow up with useful Guam listings.'}</Text>
              {prompt.summary?.narrative && <Text style={styles.intentSummaryText}>{prompt.summary.narrative}</Text>}
              <View style={styles.requestFieldGroup}>
                <RequestInput label="Email" value={email} onChangeText={setEmail} placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none" />
                <RequestInput label="Name" value={name} onChangeText={setName} placeholder="Your name" />
                <RequestInput label="Phone optional" value={phone} onChangeText={(value) => { markPromptFieldEdited('phone'); setPhone(value) }} placeholder="+1671" keyboardType="phone-pad" />
                <Text style={styles.requestLabel}>Preferred contact</Text>
                <View style={styles.contactSegmentRow}>
                  {preferredContactOptions.map((option) => (
                    <Pressable key={option.value} onPress={() => { markPromptFieldEdited('preferredContact'); setPreferredContact(option.value as 'phone' | 'text' | 'email') }} style={[styles.contactSegment, preferredContact === option.value && styles.contactSegmentActive]}>
                      <Text style={[styles.contactSegmentText, preferredContact === option.value && styles.contactSegmentTextActive]}>{option.label}</Text>
                    </Pressable>
                  ))}
                </View>
                <QualificationChoiceGroup label="Timeline" options={purchaseTimelineOptions} value={purchaseTimeline} onChange={(value) => { markPromptFieldEdited('purchaseTimeline'); setPurchaseTimeline(value) }} />
                <RequestInput label="Desired villages" value={desiredVillages} onChangeText={(value) => { markPromptFieldEdited('desiredVillages'); setDesiredVillages(value) }} placeholder="Dededo, Yigo, Tamuning" />
                <QualificationChoiceGroup label="Prequalified?" options={prequalifiedOptions} value={prequalifiedStatus} onChange={(value) => { markPromptFieldEdited('prequalifiedStatus'); setPrequalifiedStatus(value) }} />
                <RequestInput label="Lender / bank optional" value={lenderName} onChangeText={(value) => { markPromptFieldEdited('lenderName'); setLenderName(value) }} placeholder="Bank of Guam, Coast360..." />
                <RequestInput label="Budget min optional" value={budgetMin} onChangeText={(value) => { markPromptFieldEdited('budgetMin'); setBudgetMin(value) }} placeholder="450000" keyboardType="number-pad" />
                <RequestInput label="Budget max optional" value={budgetMax} onChangeText={(value) => { markPromptFieldEdited('budgetMax'); setBudgetMax(value) }} placeholder="650000" keyboardType="number-pad" />
                <RequestInput label="Beds optional" value={desiredBeds} onChangeText={(value) => { markPromptFieldEdited('desiredBeds'); setDesiredBeds(value) }} placeholder="3" keyboardType="number-pad" />
                <RequestInput label="Baths optional" value={desiredBaths} onChangeText={(value) => { markPromptFieldEdited('desiredBaths'); setDesiredBaths(value) }} placeholder="2" keyboardType="number-pad" />
                <QualificationChoiceGroup label="Buyer type" options={buyerStatusOptions} value={buyerStatus} onChange={(value) => { markPromptFieldEdited('buyerStatus'); setBuyerStatus(value) }} />
                <QualificationChoiceGroup label="Working with an agent?" options={agentRelationshipOptions} value={alreadyWorkingWithAgent} onChange={(value) => { markPromptFieldEdited('alreadyWorkingWithAgent'); setAlreadyWorkingWithAgent(value) }} />
                <Text style={styles.requestLabel}>Search notes</Text>
                <TextInput value={notes} onChangeText={(value) => { markPromptFieldEdited('notes'); setNotes(value) }} multiline style={[styles.requestInput, styles.requestMessageInput]} placeholder="Relocating soon, commute needs, pet-friendly, must-haves..." placeholderTextColor="#7b8a84" />
                {prompt.profile_prompt && (
                  <Pressable onPress={() => setAgentHelpRequested((current) => !current)} style={[styles.profilePromptToggle, agentHelpRequested && styles.profilePromptToggleActive]}>
                    <Text style={[styles.profilePromptToggleText, agentHelpRequested && styles.profilePromptToggleTextActive]}>Also ask an agent to follow up using this search context</Text>
                  </Pressable>
                )}
              </View>
              {error && <Text style={styles.requestError}>{error}</Text>}
              <Pressable disabled={submitting} style={[styles.primaryCta, submitting && styles.ctaDisabled]} onPress={handleSubmit}>
                <Text style={styles.primaryCtaText}>{submitButtonLabel}</Text>
              </Pressable>
              <Pressable style={styles.secondaryCta} onPress={() => onDismiss('not_now')}><Text style={styles.secondaryCtaText}>Not now</Text></Pressable>
            </ScrollView>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

function HeaderAuthButton({ auth, onOpenAuth, onOpenAccount }: { auth: AppAuth; onOpenAuth: () => void; onOpenAccount: () => void }) {
  if (!auth.clerkEnabled) return null

  if (auth.isSignedIn) {
    return (
      <Pressable onPress={onOpenAccount} style={styles.headerAccountPill} accessibilityRole="button" accessibilityLabel="Open account">
        <Text style={styles.headerAccountInitial}>{auth.userInitial || 'A'}</Text>
      </Pressable>
    )
  }

  return (
    <Pressable onPress={onOpenAuth} style={styles.headerSignInPill} accessibilityRole="button" accessibilityLabel="Sign in or create account">
      <Text style={styles.headerSignInText}>Sign in</Text>
    </Pressable>
  )
}

function SearchScreen({ listings, savedIds, onOpen, onToggleSaved }: { listings: Listing[]; savedIds: number[]; onOpen: (listing: Listing) => void; onToggleSaved: (listingId: number) => void }) {
  if (listings.length === 0) {
    return <CenteredState label="No matching homes yet. Try switching Buy/Rent or clearing filters." />
  }

  return (
    <FlatList
      data={listings}
      keyExtractor={(listing) => String(listing.id)}
      contentContainerStyle={styles.listContent}
      ListHeaderComponent={(
        <View style={styles.listHeaderStack}>
          <View style={styles.screenIntro}>
            <Text style={styles.kicker}>Listings</Text>
            <Text style={styles.screenTitle}>Latest Guam homes</Text>
            <Text style={styles.screenCopy}>Search homes and rentals by village, price, features, and the details that matter on island.</Text>
          </View>
          {listings.some((listing) => listing.brokerage?.demo_data) && <DemoInventoryNotice />}
        </View>
      )}
      renderItem={({ item }) => (
        <ListingCard
          listing={item}
          saved={savedIds.includes(item.id)}
          onOpen={() => onOpen(item)}
          onToggleSaved={() => onToggleSaved(item.id)}
        />
      )}
    />
  )
}

function DemoInventoryNotice() {
  return (
    <View style={styles.demoInventoryNotice} accessibilityRole="text">
      <Text style={styles.demoInventoryTitle}>Demonstration inventory</Text>
      <Text style={styles.demoInventoryCopy}>Listing facts and photos are sample content while authorized Guam MLS/IDX access is completed. Availability and pricing are not live.</Text>
    </View>
  )
}

function MapScreen({ listings, savedIds, onOpen, onToggleSaved, fullMap, initialCamera, onCameraChange, onToggleFullMap }: { listings: Listing[]; savedIds: number[]; onOpen: (listing: Listing) => void; onToggleSaved: (listingId: number) => void; fullMap: boolean; initialCamera: MapCamera | null; onCameraChange: (camera: MapCamera) => void; onToggleFullMap: () => void }) {
  const [mapLoading, setMapLoading] = useState(true)
  const [previewListing, setPreviewListing] = useState<Listing | null>(null)
  const initialCameraRef = useRef(initialCamera)
  const points = useMemo(() => listings.filter((listing) => listing.latitude && listing.longitude), [listings])
  const mapHtml = useMemo(() => buildMapHtml(points, initialCameraRef.current), [points])
  const mapSource = useMemo(() => ({ html: mapHtml }), [mapHtml])

  useEffect(() => {
    const shouldLoadMap = Boolean(MAPBOX_TOKEN && points.length > 0)
    setMapLoading(shouldLoadMap)
    setPreviewListing(null)

    if (!shouldLoadMap) return undefined
    const safetyTimeout = setTimeout(() => setMapLoading(false), 8000)
    return () => clearTimeout(safetyTimeout)
  }, [mapHtml, points.length])

  return (
    <View style={styles.mapScreen}>
      <View style={styles.nativeMapFrame}>
        {MAPBOX_TOKEN && points.length > 0 ? (
          <WebView
            originWhitelist={['*']}
            source={mapSource}
            style={styles.nativeMap}
            onMessage={(event) => {
              try {
                const message = JSON.parse(event.nativeEvent.data)
                if (message.type === 'map-ready') {
                  setMapLoading(false)
                  return
                }
                if (message.type === 'listing-preview') {
                  const listing = listings.find((item) => item.id === Number(message.id))
                  if (listing) setPreviewListing(listing)
                  return
                }
                if (message.type === 'map-camera' && Array.isArray(message.center) && typeof message.zoom === 'number') {
                  const [longitude, latitude] = message.center.map(Number)
                  if (Number.isFinite(longitude) && Number.isFinite(latitude) && Number.isFinite(message.zoom)) {
                    onCameraChange({ center: [longitude, latitude], zoom: message.zoom })
                  }
                  return
                }
              } catch {
                const listingId = Number(event.nativeEvent.data)
                const listing = listings.find((item) => item.id === listingId)
                if (listing) setPreviewListing(listing)
              }
            }}
            scrollEnabled={false}
          />
        ) : (
          <View style={styles.mapFallback}>
            <Text style={styles.mapCanvasTitle}>{MAPBOX_TOKEN ? 'No mapped listings yet' : 'Mapbox token needed'}</Text>
            <Text style={styles.mapCanvasCopy}>{MAPBOX_TOKEN ? 'Homes with map coordinates will appear here as soon as they are available.' : 'Add EXPO_PUBLIC_MAPBOX_TOKEN to mobile/.env and restart Expo with npm run start -- --clear.'}</Text>
          </View>
        )}
        {mapLoading && <MapLoadingOverlay />}
        <View style={[styles.mapOverlay, fullMap && styles.mapOverlayFull]}>
          <View>
            <Text style={styles.mapTitle}>{fullMap ? 'Full map search' : 'Map search'}</Text>
            <Text style={styles.mapOverlayHint}>{fullMap ? 'Explore Guam without the app chrome' : 'Zoom in for price pins'}</Text>
          </View>
          <View style={styles.mapOverlayActions}>
            <Text style={styles.mapCount}>{points.length} listings</Text>
            <Pressable onPress={onToggleFullMap} style={styles.mapFullButton}>
              <Text style={styles.mapFullButtonText}>{fullMap ? 'Done' : 'Full map'}</Text>
            </Pressable>
          </View>
        </View>
        {listings.some((listing) => listing.brokerage?.demo_data) && (
          <View style={styles.demoMapNotice} pointerEvents="none">
            <Text style={styles.demoMapNoticeText}>Demo inventory · availability and pricing are not live</Text>
          </View>
        )}
        {previewListing && (
          <MapListingPreview
            key={previewListing.id}
            listing={previewListing}
            saved={savedIds.includes(previewListing.id)}
            onClose={() => setPreviewListing(null)}
            onOpen={() => onOpen(previewListing)}
            onToggleSaved={() => onToggleSaved(previewListing.id)}
          />
        )}
      </View>
    </View>
  )
}

function MapLoadingOverlay() {
  return (
    <View style={styles.mapLoadingOverlay} pointerEvents="none">
      <View style={styles.mapLoadingCard}>
        <ActivityIndicator color={colors.green} />
        <Text style={styles.mapLoadingTitle}>Drawing Guam map</Text>
        <Text style={styles.mapLoadingCopy}>Loading villages, homes, and search pins.</Text>
      </View>
    </View>
  )
}

function MapListingPreview({ listing, saved, onOpen, onClose, onToggleSaved }: { listing: Listing; saved: boolean; onOpen: () => void; onClose: () => void; onToggleSaved: () => void }) {
  const [imageUri, setImageUri] = useState(listing.primary_photo_url || FALLBACK_IMAGE)

  return (
    <View style={styles.mapPreviewCard}>
      <Image source={{ uri: imageUri }} onError={() => setImageUri(FALLBACK_IMAGE)} style={styles.mapPreviewImage} />
      <View style={styles.mapPreviewBody}>
        <View style={styles.cardTopRow}>
          <Text style={styles.mapPreviewPrice}>{currency(listing.price, listing.listing_kind)}</Text>
          <View style={styles.mapPreviewActions}>
            <Pressable onPress={onToggleSaved} hitSlop={10} style={[styles.saveButton, saved && styles.saveButtonActive]}>
              <Text style={[styles.saveText, saved && styles.saveTextActive]}>{saved ? '♥' : '♡'}</Text>
            </Pressable>
            <Pressable onPress={onClose} hitSlop={10} style={styles.mapPreviewClose}><Text style={styles.mapPreviewCloseText}>×</Text></Pressable>
          </View>
        </View>
        <Text numberOfLines={1} style={styles.cardTitle}>{listing.title}</Text>
        <Text numberOfLines={1} style={styles.cardMeta}>{listing.village.name} · {listing.address}</Text>
        <Text style={styles.cardStats}>{listing.beds} beds · {listing.baths} baths · {listing.square_feet?.toLocaleString() ?? '—'} sqft</Text>
        <Pressable onPress={onOpen} style={styles.mapPreviewCta}><Text style={styles.mapPreviewCtaText}>View details</Text></Pressable>
      </View>
    </View>
  )
}

function htmlSafeJson(value: unknown) {
  const json = JSON.stringify(value)
  if (typeof json !== 'string') return 'null'

  return json
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}

function buildMapHtml(points: Listing[], initialCamera?: MapCamera | null) {
  const safePoints = points.map((listing) => ({
    id: listing.id,
    price: currency(listing.price, listing.listing_kind).replace('/mo', ''),
    latitude: listing.latitude,
    longitude: listing.longitude,
    title: listing.title,
    village: listing.village.name,
  }))
  const safeInitialCamera = initialCamera && Array.isArray(initialCamera.center) && Number.isFinite(initialCamera.center[0]) && Number.isFinite(initialCamera.center[1]) && Number.isFinite(initialCamera.zoom)
    ? { center: initialCamera.center, zoom: initialCamera.zoom }
    : null

  return `<!doctype html>
<html>
  <head>
    <meta name="viewport" content="initial-scale=1,maximum-scale=1,user-scalable=no" />
    <script src="https://api.mapbox.com/mapbox-gl-js/v3.10.0/mapbox-gl.js"></script>
    <link href="https://api.mapbox.com/mapbox-gl-js/v3.10.0/mapbox-gl.css" rel="stylesheet" />
    <style>
      html, body, #map { height: 100%; margin: 0; width: 100%; }
      body { background: #9fd2eb; overflow: hidden; }
      .marker, .cluster {
        appearance: none;
        border: 0;
        border-radius: 999px;
        box-shadow: 0 14px 28px rgba(15, 61, 53, 0.28);
        cursor: pointer;
        font: 800 13px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        min-height: 38px;
        white-space: nowrap;
      }
      .marker {
        background: #0f3d35;
        color: white;
        padding: 0 14px;
      }
      .cluster {
        align-items: center;
        background: rgba(255, 255, 255, 0.94);
        border: 2px solid rgba(15, 61, 53, 0.18);
        color: #0f3d35;
        display: inline-flex;
        gap: 7px;
        padding: 0 13px;
      }
      .cluster-count {
        align-items: center;
        background: #0f3d35;
        border-radius: 999px;
        color: white;
        display: inline-flex;
        height: 24px;
        justify-content: center;
        min-width: 24px;
        padding: 0 4px;
      }
    </style>
  </head>
  <body>
    <div id="map"></div>
    <script>
      mapboxgl.accessToken = ${htmlSafeJson(MAPBOX_TOKEN || '')};
      const points = ${htmlSafeJson(safePoints)};
      const initialCamera = ${htmlSafeJson(safeInitialCamera)};
      const map = new mapboxgl.Map({
        container: 'map',
        style: 'mapbox://styles/mapbox/outdoors-v12',
        center: [144.7937, 13.4443],
        zoom: 10.2,
        attributionControl: true,
        logoPosition: 'bottom-left'
      });

      map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'bottom-right');

      const bounds = new mapboxgl.LngLatBounds();
      const priceMarkers = [];
      const clusterMarkers = [];
      const grouped = new Map();

      function postMessage(message) {
        window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify(message));
      }

      points.forEach((listing) => {
        if (!listing.latitude || !listing.longitude) return;
        bounds.extend([listing.longitude, listing.latitude]);

        const priceElement = document.createElement('button');
        priceElement.className = 'marker';
        priceElement.textContent = listing.price;
        priceElement.setAttribute('aria-label', 'Preview ' + listing.title);
        priceElement.addEventListener('click', () => postMessage({ type: 'listing-preview', id: listing.id }));
        priceMarkers.push(new mapboxgl.Marker({ element: priceElement, anchor: 'center' })
          .setLngLat([listing.longitude, listing.latitude])
          .addTo(map));

        const key = listing.village || 'Guam';
        const group = grouped.get(key) || { village: key, count: 0, latitude: 0, longitude: 0 };
        group.count += 1;
        group.latitude += listing.latitude;
        group.longitude += listing.longitude;
        grouped.set(key, group);
      });

      grouped.forEach((group) => {
        const clusterElement = document.createElement('button');
        const countElement = document.createElement('span');
        const labelElement = document.createElement('span');
        clusterElement.className = 'cluster';
        countElement.className = 'cluster-count';
        countElement.textContent = String(group.count);
        labelElement.textContent = group.village;
        clusterElement.append(countElement, labelElement);
        clusterElement.setAttribute('aria-label', group.count + ' listings in ' + group.village);
        clusterElement.addEventListener('click', () => {
          map.easeTo({ center: [group.longitude / group.count, group.latitude / group.count], zoom: Math.max(map.getZoom() + 1.4, 11.4), duration: 450 });
        });
        clusterMarkers.push(new mapboxgl.Marker({ element: clusterElement, anchor: 'center' })
          .setLngLat([group.longitude / group.count, group.latitude / group.count])
          .addTo(map));
      });

      function updateMarkerVisibility() {
        const showPrices = map.getZoom() >= 11.35;
        priceMarkers.forEach((marker) => { marker.getElement().style.display = showPrices ? 'block' : 'none'; });
        clusterMarkers.forEach((marker) => { marker.getElement().style.display = showPrices ? 'none' : 'inline-flex'; });
      }

      function postCamera() {
        const center = map.getCenter();
        postMessage({ type: 'map-camera', center: [center.lng, center.lat], zoom: map.getZoom() });
      }

      function updateAfterMove() {
        updateMarkerVisibility();
        postCamera();
      }

      map.on('zoomend', updateAfterMove);
      map.on('moveend', updateAfterMove);
      map.on('load', () => {
        if (initialCamera && Array.isArray(initialCamera.center) && Number.isFinite(initialCamera.zoom)) {
          map.jumpTo({ center: initialCamera.center, zoom: initialCamera.zoom });
        } else if (!bounds.isEmpty()) {
          map.fitBounds(bounds, { padding: { top: 130, right: 70, bottom: 120, left: 70 }, maxZoom: 12.2, duration: 650 });
        }
        updateMarkerVisibility();
        postCamera();
        map.once('idle', () => postMessage({ type: 'map-ready' }));
      });
    </script>
  </body>
</html>`
}

function AgentDetailScreen({ record, loading, error, selectedAgentId, canSelectAgent, onBack, onSelectAgent, onOpenListing, onLoadMore }: { record: AgentDetailResponse | null; loading: boolean; error: string | null; selectedAgentId: number | null; canSelectAgent: boolean; onBack: () => void; onSelectAgent: (agentId: number | null) => void; onOpenListing: (listing: Listing) => void; onLoadMore: () => void }) {
  const agent = record?.agent
  const selected = agent?.id === selectedAgentId

  return (
    <SafeAreaView style={styles.shell}>
      <StatusBar style="light" />
      <View style={styles.detailHeader}>
        <Pressable onPress={onBack} style={styles.backButton} accessibilityRole="button"><Text style={styles.backButtonText}>← Back</Text></Pressable>
        <Text style={styles.agentDetailHeaderTitle}>Agent profile</Text>
      </View>
      {loading && !record ? <CenteredState label="Loading agent profile..." loading /> : error && !record ? <CenteredState label={error} /> : agent && record ? (
        <ScrollView contentContainerStyle={styles.agentDetailContent}>
          <View style={styles.agentDetailHero}>
            <View style={styles.agentDetailAvatar}>
              {agent.photo_url ? <Image source={{ uri: agent.photo_url }} style={styles.agentDirectoryPhoto} /> : <Text style={styles.agentDetailInitial}>{agentInitials(agent)}</Text>}
            </View>
            <Text style={styles.agentDetailKicker}>Storefront agent</Text>
            <Text style={styles.agentDetailName}>{agent.name}</Text>
            <Text style={styles.agentDetailBrokerage}>{agent.brokerage?.name || 'Brokerage partner'}</Text>
            {agent.license_number && <Text style={styles.agentDetailLicense}>License {agent.license_number}</Text>}
          </View>

          <View style={styles.agentDetailCard}>
            <Text style={styles.kicker}>About</Text>
            <Text style={styles.detailCopy}>{agent.bio || 'Contact this brokerage agent for help with your Guam home search.'}</Text>
            {(agent.phone || agent.email) && <Text style={styles.agentDetailContact}>{[agent.phone, agent.email].filter(Boolean).join(' · ')}</Text>}
            <Pressable style={[styles.primaryCta, selected && styles.selectedAgentCta]} onPress={() => onSelectAgent(agent.id)} accessibilityRole="button">
              <Text style={[styles.primaryCtaText, selected && styles.selectedAgentCtaText]}>{canSelectAgent ? (selected ? 'Selected for future requests' : `Work with ${agent.name.split(' ')[0]}`) : `Sign in to work with ${agent.name.split(' ')[0]}`}</Text>
            </Pressable>
            <Text style={styles.agentRoutingNote}>Preferred-agent selection controls request routing. Listing attribution below remains source-of-truth for each property.</Text>
          </View>

          <View style={styles.agentDetailCard}>
            <Text style={styles.kicker}>Attributed inventory</Text>
            <Text style={styles.agentListingsTitle}>Active listings</Text>
            <Text style={styles.detailCopy}>Properties whose current listing attribution names this agent.</Text>
            {record.attributed_listings.length === 0 && <Text style={styles.agentEmptyCopy}>No active attributed listings are published for this agent.</Text>}
            {record.attributed_listings.map((listing) => (
              <Pressable key={listing.id} style={styles.agentListingRow} onPress={() => onOpenListing(listing)} accessibilityRole="button" accessibilityLabel={`View ${listing.title}`}>
                <Image source={{ uri: listing.primary_photo_url || FALLBACK_IMAGE }} style={styles.agentListingImage} />
                <View style={styles.agentListingBody}>
                  <Text style={styles.agentListingPrice}>{currency(listing.price, listing.listing_kind)}</Text>
                  <Text style={styles.agentListingTitle} numberOfLines={2}>{listing.title}</Text>
                  <Text style={styles.agentMeta}>{listing.village.name} · {listing.address}</Text>
                </View>
                <Text style={styles.agentListingArrow}>›</Text>
              </Pressable>
            ))}
            {error && record && <Text style={styles.requestError}>{error}</Text>}
            {record.pagination.next_page && (
              <Pressable disabled={loading} style={[styles.secondaryCta, loading && styles.ctaDisabled]} onPress={onLoadMore} accessibilityRole="button">
                <Text style={styles.secondaryCtaText}>{loading ? 'Loading listings...' : `Load more listings (${record.attributed_listings.length} of ${record.pagination.total_count})`}</Text>
              </Pressable>
            )}
          </View>
        </ScrollView>
      ) : <CenteredState label="This agent is not available in this storefront." />}
    </SafeAreaView>
  )
}

function AgentsScreen({ agents, loading, selectedAgentId, canSelectAgent, onSelectAgent, onOpenAgent }: { agents: Agent[]; loading: boolean; selectedAgentId: number | null; canSelectAgent: boolean; onSelectAgent: (agentId: number | null) => void; onOpenAgent: (agentId: number) => void }) {
  return (
    <ScrollView contentContainerStyle={styles.listContent}>
      <View style={styles.screenIntro}>
        <Text style={styles.kicker}>Agent network</Text>
        <Text style={styles.screenTitle}>Choose who you want to work with</Text>
        <Text style={styles.screenCopy}>{canSelectAgent ? 'Your selected agent is added to future showing and price requests while listing attribution remains unchanged.' : 'Browse active brokerage agents. Sign in before choosing a preferred agent for future requests.'}</Text>
      </View>

      {canSelectAgent && selectedAgentId && (
        <Pressable style={styles.secondaryCta} onPress={() => onSelectAgent(null)} accessibilityRole="button">
          <Text style={styles.secondaryCtaText}>Clear selected agent</Text>
        </Pressable>
      )}

      {loading && <CenteredState label="Loading agents..." loading />}
      {!loading && agents.length === 0 && <CenteredState label="No active agents are published yet." />}
      {agents.map((agent) => {
        const selected = agent.id === selectedAgentId
        return (
          <View key={agent.id} style={[styles.agentDirectoryCard, selected && styles.agentDirectoryCardActive]}>
            <View style={styles.agentDirectoryHeader}>
              <View style={styles.agentDirectoryAvatar}>
                {agent.photo_url ? <Image source={{ uri: agent.photo_url }} style={styles.agentDirectoryPhoto} /> : <Text style={styles.agentInitial}>{agentInitials(agent)}</Text>}
              </View>
              <View style={styles.agentInfo}>
                <Text style={styles.agentName}>{agent.name}</Text>
                <Text style={styles.agentMeta}>{agent.brokerage?.name || 'Brokerage partner'}</Text>
                {agent.license_number && <Text style={styles.agentMeta}>License {agent.license_number}</Text>}
              </View>
            </View>
            {agent.bio && <Text style={styles.agentBio}>{agent.bio}</Text>}
            {(agent.phone || agent.email) && <Text style={styles.agentBio}>{[agent.phone, agent.email].filter(Boolean).join(' · ')}</Text>}
            <Pressable style={styles.secondaryCta} onPress={() => onOpenAgent(agent.id)} accessibilityRole="button" accessibilityLabel={`View ${agent.name} profile`}>
              <Text style={styles.secondaryCtaText}>View profile</Text>
            </Pressable>
            <Pressable style={[styles.primaryCta, selected && styles.selectedAgentCta]} onPress={() => onSelectAgent(agent.id)} accessibilityRole="button">
              <Text style={[styles.primaryCtaText, selected && styles.selectedAgentCtaText]}>{canSelectAgent ? (selected ? 'Selected for future requests' : `Work with ${agent.name.split(' ')[0]}`) : `Sign in to work with ${agent.name.split(' ')[0]}`}</Text>
            </Pressable>
          </View>
        )
      })}
    </ScrollView>
  )
}

function SavedSignInScreen({ clerkEnabled, onOpenAuth }: { clerkEnabled: boolean; onOpenAuth: () => void }) {
  return (
    <ScrollView contentContainerStyle={styles.listContent}>
      <View style={styles.screenIntro}>
        <Text style={styles.kicker}>Saved homes</Text>
        <Text style={styles.screenTitle}>Keep your Guam shortlist synced</Text>
        <Text style={styles.screenCopy}>Saved homes are connected to your Hafa Homes account so your shortlist can follow you across devices.</Text>
      </View>
      <View style={styles.accountCard}>
        <Text style={styles.accountKicker}>Account required</Text>
        <Text style={styles.accountTitle}>{clerkEnabled ? 'Sign in to view saved homes' : 'Sign-in coming online'}</Text>
        <Text style={styles.accountCopy}>{clerkEnabled ? 'Create a free account or sign in before saving homes. Public browsing stays open.' : 'Clerk is ready in the app. Add EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY to enable synced saved homes.'}</Text>
        {clerkEnabled && <Pressable style={styles.primaryCta} onPress={onOpenAuth}><Text style={styles.primaryCtaText}>Sign in or create account</Text></Pressable>}
      </View>
    </ScrollView>
  )
}

function SavedScreen({ listings, onOpen, onToggleSaved }: { listings: Listing[]; onOpen: (listing: Listing) => void; onToggleSaved: (listingId: number) => void }) {
  if (listings.length === 0) {
    return <CenteredState label="Saved homes will appear here. Tap the heart on a listing to save it." />
  }

  return (
    <FlatList
      data={listings}
      keyExtractor={(listing) => String(listing.id)}
      contentContainerStyle={styles.listContent}
      ListHeaderComponent={<Text style={styles.screenTitle}>Saved homes</Text>}
      renderItem={({ item }) => <ListingCard listing={item} saved onOpen={() => onOpen(item)} onToggleSaved={() => onToggleSaved(item.id)} />}
    />
  )
}

function MoreScreen({ auth, onOpenAuth, onNavigateTab }: { auth: AppAuth; onOpenAuth: (prompt?: AuthPrompt) => void; onNavigateTab: (tab: TabKey) => void }) {
  const [page, setPage] = useState<'home' | 'profile'>('home')

  async function openWebsite() {
    try {
      await WebBrowser.openBrowserAsync(HAFA_HOMES_WEBSITE_URL)
    } catch {
      try {
        await Linking.openURL(HAFA_HOMES_WEBSITE_URL)
      } catch (linkError) {
        console.warn('Unable to open Hafa Homes website', linkError)
        Alert.alert('Unable to open website', 'Visit hafahomes.com from your browser.')
      }
    }
  }

  if (page === 'profile') {
    return <ProfileSettingsScreen auth={auth} onOpenAuth={onOpenAuth} onBack={() => setPage('home')} />
  }

  return (
    <ScrollView contentContainerStyle={styles.listContent}>
      <View style={styles.screenIntro}>
        <Text style={styles.kicker}>More</Text>
        <Text style={styles.screenTitle}>Your Hafa Homes hub</Text>
        <Text style={styles.screenCopy}>Manage your account, jump into saved homes, track requests, and open island search resources as the app grows.</Text>
      </View>


      <View style={styles.moreMenuSection}>
        <MoreMenuItem title="Profile & settings" copy="Edit contact details, search profile, sign out, or delete account." label="Account" onPress={() => auth.isSignedIn ? setPage('profile') : onOpenAuth()} />
        <MoreMenuItem title="Saved homes" copy="Return to homes you saved from web or mobile." label="Saved" onPress={() => onNavigateTab('saved')} />
        <MoreMenuItem title="Agents" copy="Choose the brokerage agent you want future requests routed to." label="Agents" onPress={() => onNavigateTab('agents')} />
        <MoreMenuItem title="Request history" copy="Track showing requests, agents, brokerage details, and appointment status." label="CRM" onPress={() => onNavigateTab('requests')} />
        <MoreMenuItem title="Hafa Homes website" copy="Open the public web search, privacy policy, and island resources." label="Web" onPress={openWebsite} />
      </View>

      <View style={styles.moreMenuSection}>
        <Text style={styles.moreSectionLabel}>Coming next</Text>
        {['Saved search alerts', 'Neighborhood guide', 'Automated price alerts', 'Military relocation resources'].map((item) => (
          <View key={item} style={styles.resourceRow}>
            <View style={styles.resourceBullet} />
            <Text style={styles.resourceText}>{item}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  )
}

function MoreMenuItem({ title, copy, label, onPress }: { title: string; copy: string; label: string; onPress: () => void }) {
  return (
    <Pressable style={styles.moreMenuItem} onPress={onPress} accessibilityRole="button">
      <View style={styles.moreMenuMark}><Text style={styles.moreMenuMarkText}>{label.slice(0, 2).toUpperCase()}</Text></View>
      <View style={styles.moreMenuCopy}>
        <Text style={styles.moreMenuTitle}>{title}</Text>
        <Text style={styles.moreMenuDescription}>{copy}</Text>
      </View>
      <Text style={styles.moreMenuArrow}>›</Text>
    </Pressable>
  )
}

function ProfileSettingsScreen({ auth, onOpenAuth, onBack }: { auth: AppAuth; onOpenAuth: (prompt?: AuthPrompt) => void; onBack: () => void }) {
  return (
    <ScrollView contentContainerStyle={styles.listContent}>
      <View style={styles.profileScreenHeader}>
        <Pressable style={styles.profileBackButton} onPress={onBack} accessibilityRole="button">
          <Text style={styles.profileBackText}>Back</Text>
        </Pressable>
        <Text style={styles.kicker}>Profile & settings</Text>
        <Text style={styles.screenCopy}>Edit your account details, choose how agents should contact you, or manage account deletion.</Text>
      </View>
      {auth.clerkEnabled ? <AccountCard auth={auth} onOpenAuth={onOpenAuth} /> : <AuthUnavailableCard />}
    </ScrollView>
  )
}

function formatRequestDate(value?: string) {
  if (!value) return 'Not scheduled'
  return new Date(value).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function requestNextStep(request: ConsumerLead) {
  if (request.latest_showing_appointment) return 'Your showing details are below. Contact the assigned agent if you need to reschedule.'

  switch (request.status) {
    case 'new':
      return 'The brokerage has received your request and will assign follow-up soon.'
    case 'contacted':
      return 'An agent has started follow-up. Watch for a call, text, or email.'
    case 'showing_scheduled':
      return 'A showing is being coordinated. Appointment details will appear here once confirmed.'
    case 'nurturing':
      return 'The team is keeping this request open while you continue searching.'
    case 'closed':
    case 'lost':
    case 'archived':
      return 'This request is closed. You can submit a new request from any listing.'
    default:
      return 'The Hafa Homes team is reviewing this request.'
  }
}

function RequestsSignInScreen({ clerkEnabled, onOpenAuth }: { clerkEnabled: boolean; onOpenAuth: () => void }) {
  return (
    <ScrollView contentContainerStyle={styles.listContent}>
      <View style={styles.screenIntro}>
        <Text style={styles.kicker}>My requests</Text>
        <Text style={styles.screenTitle}>Track showings and price watch requests</Text>
        <Text style={styles.screenCopy}>Signed-in requests show status, assigned agent, brokerage contact details, and confirmed appointment information.</Text>
      </View>
      <View style={styles.accountCard}>
        <Text style={styles.accountKicker}>Account required</Text>
        <Text style={styles.accountTitle}>{clerkEnabled ? 'Sign in to view requests' : 'Sign-in coming online'}</Text>
        <Text style={styles.accountCopy}>{clerkEnabled ? 'Showing requests stay public, but request history is tied to your Hafa Homes account.' : 'Clerk must be configured before request history can sync.'}</Text>
        {clerkEnabled && <Pressable style={styles.primaryCta} onPress={onOpenAuth}><Text style={styles.primaryCtaText}>Sign in or create account</Text></Pressable>}
      </View>
    </ScrollView>
  )
}

function RequestsScreen({ auth, onSelectRequest }: { auth: AppAuth; onSelectRequest: (requestId: number) => void }) {
  const [requests, setRequests] = useState<ConsumerLead[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function loadRequests() {
      if (!auth.getToken) return
      setLoading(true)
      setError(null)
      try {
        const result = await fetchMyLeads(auth.getToken)
        if (!cancelled) setRequests(result.leads ?? [])
      } catch (requestError) {
        console.warn('Unable to load Hafa Homes requests', requestError)
        if (!cancelled) setError(requestError instanceof Error ? requestError.message : 'Unable to load requests')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    loadRequests()
    return () => { cancelled = true }
  }, [auth.getToken])

  return (
    <FlatList
      data={requests}
      keyExtractor={(request) => String(request.id)}
      contentContainerStyle={styles.listContent}
      ListHeaderComponent={(
        <View style={styles.screenIntro}>
          <Text style={styles.kicker}>My requests</Text>
          <Text style={styles.screenTitle}>Showing and price watch requests</Text>
          <Text style={styles.screenCopy}>See status, agent, brokerage, and appointment details for every signed-in request.</Text>
        </View>
      )}
      ListEmptyComponent={loading ? <CenteredState label="Loading your requests..." loading /> : <CenteredState label="No requests yet. Request a showing or send a price watch request from any listing." />}
      renderItem={({ item }) => <RequestHistoryCard request={item} onOpen={() => onSelectRequest(item.id)} />}
      ListFooterComponent={error ? <Text style={styles.requestError}>{error}</Text> : null}
    />
  )
}

function RequestDetailScreen({ requestId, auth, onBack, onOpenListing }: { requestId: number; auth: AppAuth; onBack: () => void; onOpenListing: (listingId: number) => Promise<void> }) {
  const [request, setRequest] = useState<ConsumerLead | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [openingListing, setOpeningListing] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function loadRequest() {
      if (!auth.getToken) return
      setRequest(null)
      setLoading(true)
      setError(null)
      try {
        const result = await fetchMyLead(requestId, auth.getToken)
        if (!cancelled) setRequest(result.lead)
      } catch (requestError) {
        console.warn('Unable to load exact Hafa Homes request', requestError)
        if (!cancelled) {
          const unavailable = requestError instanceof ApiRequestError && requestError.status === 404
          setError(unavailable ? 'This request is not available in this brokerage storefront.' : requestError instanceof Error ? requestError.message : 'Unable to load this request')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadRequest()
    return () => { cancelled = true }
  }, [auth.getToken, requestId])

  async function openRelatedListing() {
    if (!request?.listing?.id || openingListing) return
    setOpeningListing(true)
    setError(null)
    try {
      await onOpenListing(request.listing.id)
    } catch (listingError) {
      console.warn('Unable to open request listing', listingError)
      setError(listingError instanceof Error ? listingError.message : 'Unable to open this listing')
    } finally {
      setOpeningListing(false)
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.listContent}>
      <View style={styles.requestDetailHeader}>
        <Pressable style={styles.profileBackButton} onPress={onBack} accessibilityRole="button">
          <Text style={styles.profileBackText}>Back to requests</Text>
        </Pressable>
        <Text style={styles.kicker}>Private request record</Text>
        <Text style={styles.screenTitle}>Request HH-{requestId}</Text>
        <Text style={styles.screenCopy}>Status, brokerage ownership, agent roles, and showing details stay scoped to this storefront.</Text>
      </View>

      {loading && <CenteredState label="Loading request details..." loading />}
      {!loading && error && !request && <CenteredState label={error} />}
      {!loading && request && (
        <>
          <RequestHistoryCard request={request} detailed />
          {request.listing?.id && (
            <Pressable style={styles.primaryCta} onPress={openRelatedListing} disabled={openingListing} accessibilityRole="button">
              <Text style={styles.primaryCtaText}>{openingListing ? 'Opening listing...' : `Open related listing · ${request.listing.title}`}</Text>
            </Pressable>
          )}
          {error && <Text style={styles.requestError}>{error}</Text>}
          <View style={styles.requestPrivacyCard}>
            <Text style={styles.requestHistoryStatus}>Private to this storefront</Text>
            <Text style={styles.requestHistoryMeta}>This record is connected only to your signed-in account and the brokerage storefront where it was submitted. Listing attribution remains separate from requested and coordinating agents.</Text>
          </View>
        </>
      )}
    </ScrollView>
  )
}

function RequestHistoryCard({ request, detailed = false, onOpen }: { request: ConsumerLead; detailed?: boolean; onOpen?: () => void }) {
  const showings = detailed
    ? (request.showing_appointments ?? (request.latest_showing_appointment ? [request.latest_showing_appointment] : []))
    : (request.latest_showing_appointment ? [request.latest_showing_appointment] : [])
  return (
    <View style={styles.requestHistoryCard}>
      {request.listing?.primary_photo_url && <Image source={{ uri: request.listing.primary_photo_url }} style={styles.requestHistoryImage} />}
      <View style={styles.requestHistoryBody}>
        <View style={styles.requestStatusCard}>
          <Text style={styles.requestHistoryStatus}>Current status</Text>
          <Text style={styles.requestStatusTitle}>{request.consumer_status_label || request.status.replace(/_/g, ' ')}</Text>
          <Text style={styles.requestStatusMeta}>{requestNextStep(request)}</Text>
        </View>
        <Text style={styles.requestHistoryTitle}>{request.listing?.title || request.lead_type.replace(/_/g, ' ')}</Text>
        <Text style={styles.requestHistoryMeta}>Submitted {formatRequestDate(request.created_at)}</Text>
        <View style={styles.showingSummaryCard}>
          <Text style={styles.requestHistoryStatus}>Agent and brokerage</Text>
          <Text style={styles.requestHistoryMeta}>Requested agent: {request.requested_agent?.name || 'Brokerage team'}</Text>
          <Text style={styles.requestHistoryMeta}>Assigned agent: {request.assigned_agent?.name || 'Pending assignment'}</Text>
          {request.assigned_agent?.phone && <Text style={styles.requestHistoryMeta}>Agent phone: {request.assigned_agent.phone}</Text>}
          {request.assigned_agent?.email && <Text style={styles.requestHistoryMeta}>Agent email: {request.assigned_agent.email}</Text>}
          <Text style={styles.requestHistoryMeta}>Brokerage: {request.brokerage?.name || 'Hafa Homes'}</Text>
          {request.brokerage?.phone && <Text style={styles.requestHistoryMeta}>Brokerage phone: {request.brokerage.phone}</Text>}
        </View>
        {request.has_qualification_details && request.qualification_summary && (
          <View style={styles.showingSummaryCard}>
            <Text style={styles.requestHistoryStatus}>Search readiness</Text>
            <Text style={styles.requestHistoryMeta}>{request.qualification_summary}</Text>
          </View>
        )}
        {showings.map((showing) => (
          <View key={showing.id} style={styles.showingSummaryCard}>
            <Text style={styles.requestHistoryStatus}>Showing appointment</Text>
            <Text style={styles.requestHistoryMeta}>{formatRequestDate(showing.scheduled_starts_at)} · {showing.status.replace(/_/g, ' ')} · {showing.tour_type.replace(/_/g, ' ')}</Text>
            {showing.location && <Text style={styles.requestHistoryMeta}>{showing.location}</Text>}
            {showing.consumer_notes && <Text style={styles.requestHistoryMeta}>{showing.consumer_notes}</Text>}
          </View>
        ))}
        {request.message && <Text style={styles.requestHistoryMessage}>{request.message}</Text>}
        {onOpen && (
          <Pressable style={styles.secondaryCta} onPress={onOpen} accessibilityRole="button" accessibilityLabel={`View request HH-${request.id}`}>
            <Text style={styles.secondaryCtaText}>View request details</Text>
          </Pressable>
        )}
      </View>
    </View>
  )
}

function AuthUnavailableCard() {
  return (
    <View style={styles.accountCard}>
      <Text style={styles.accountKicker}>Account</Text>
      <Text style={styles.accountTitle}>Sign-in coming online</Text>
      <Text style={styles.accountCopy}>Clerk is ready in the app. Add EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY to enable public consumer accounts.</Text>
    </View>
  )
}

function AccountCard({ auth, onOpenAuth }: { auth: AppAuth; onOpenAuth: (prompt?: AuthPrompt) => void }) {
  const [profile, setProfile] = useState<CurrentUser | null>(null)
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [phone, setPhone] = useState('')
  const [preferredContact, setPreferredContact] = useState<'phone' | 'text' | 'email'>('email')
  const [searchProfile, setSearchProfile] = useState<SearchProfile | null>(null)
  const [searchProfileLoading, setSearchProfileLoading] = useState(false)
  const [searchProfileLoaded, setSearchProfileLoaded] = useState(false)
  const [searchProfileSaving, setSearchProfileSaving] = useState(false)
  const [searchProfileError, setSearchProfileError] = useState<string | null>(null)
  const [searchProfileReloadKey, setSearchProfileReloadKey] = useState(0)
  const [searchPrequalifiedStatus, setSearchPrequalifiedStatus] = useState('')
  const [searchLenderName, setSearchLenderName] = useState('')
  const [searchPurchaseTimeline, setSearchPurchaseTimeline] = useState('')
  const [searchBudgetMin, setSearchBudgetMin] = useState('')
  const [searchBudgetMax, setSearchBudgetMax] = useState('')
  const [searchDesiredVillages, setSearchDesiredVillages] = useState('')
  const [searchDesiredBeds, setSearchDesiredBeds] = useState('')
  const [searchDesiredBaths, setSearchDesiredBaths] = useState('')
  const [searchBuyerStatus, setSearchBuyerStatus] = useState('')
  const [searchAlreadyWorkingWithAgent, setSearchAlreadyWorkingWithAgent] = useState('')
  const [searchNotes, setSearchNotes] = useState('')
  const [deletingAccount, setDeletingAccount] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deletionStarted, setDeletionStarted] = useState(false)
  const [deletionStateHydrated, setDeletionStateHydrated] = useState(!auth.isSignedIn)
  const deletingAccountRef = useRef(false)

  useEffect(() => {
    let cancelled = false

    if (!auth.isSignedIn) {
      setDeletionStarted(false)
      setDeletionStateHydrated(true)
      return () => { cancelled = true }
    }

    if (!auth.userId) {
      setDeletionStateHydrated(false)
      return () => { cancelled = true }
    }

    setDeletionStateHydrated(false)
    hasPendingAccountDeletion(AsyncStorage, auth.userId)
      .then((pending) => {
        if (!cancelled) setDeletionStarted(pending)
      })
      .catch((storageError) => console.warn('Unable to restore account deletion state', storageError))
      .finally(() => {
        if (!cancelled) setDeletionStateHydrated(true)
      })

    return () => { cancelled = true }
  }, [auth.isSignedIn, auth.userId])

  useEffect(() => {
    let cancelled = false

    async function loadProfile() {
      if (!auth.isSignedIn || !auth.getToken) {
        setSearchProfileLoaded(false)
        setSearchProfileLoading(false)
        return
      }

      let loadedUser: CurrentUser | null = null
      setProfileLoading(true)
      setProfileError(null)
      setSearchProfileError(null)
      setSearchProfileLoaded(false)

      let accountBlocked = false
      try {
        const result = await fetchMe(auth.getToken)
        loadedUser = result.user
        if (!cancelled) {
          setProfile(result.user)
          setFirstName(result.user.first_name || '')
          setLastName(result.user.last_name || '')
          setPhone(result.user.phone || '')
          setPreferredContact(result.user.preferred_contact_method || 'email')
        }
      } catch (error) {
        if (!cancelled) {
          if (error instanceof ApiRequestError && error.status === 403) {
            accountBlocked = true
            setDeletionStarted(true)
            markPendingAccountDeletion(AsyncStorage, auth.userId).catch((storageError) => console.warn('Unable to save account deletion state', storageError))
          }
          setProfileError(error instanceof Error ? error.message : 'Unable to load profile')
        }
      } finally {
        if (!cancelled) setProfileLoading(false)
      }

      if (accountBlocked) return

      setSearchProfileLoading(true)
      try {
        const searchResult = await fetchSearchProfile(auth.getToken)
        if (!cancelled) {
          setSearchProfile(searchResult.search_profile)
          setSearchProfileLoaded(true)
          setSearchPrequalifiedStatus(searchResult.search_profile.prequalified_status || '')
          setSearchLenderName(searchResult.search_profile.lender_name || '')
          setSearchPurchaseTimeline(searchResult.search_profile.purchase_timeline || '')
          setSearchBudgetMin(profileBudgetValue(searchResult.search_profile, 'budget_min'))
          setSearchBudgetMax(profileBudgetValue(searchResult.search_profile, 'budget_max'))
          setSearchDesiredVillages(searchResult.search_profile.desired_villages || '')
          setSearchDesiredBeds(profileValue(searchResult.search_profile, 'desired_beds'))
          setSearchDesiredBaths(profileValue(searchResult.search_profile, 'desired_baths'))
          setSearchBuyerStatus(searchResult.search_profile.buyer_status || '')
          setSearchAlreadyWorkingWithAgent(searchResult.search_profile.already_working_with_agent || '')
          setSearchNotes(searchResult.search_profile.notes || '')
        }
      } catch (error) {
        if (!cancelled) {
          setSearchProfileLoaded(false)
          setSearchProfileError(error instanceof Error ? error.message : 'Unable to load search profile')
        }
      } finally {
        if (!cancelled) setSearchProfileLoading(false)
      }
    }

    loadProfile()
    return () => { cancelled = true }
  }, [auth.getToken, auth.isSignedIn, auth.userId, searchProfileReloadKey])

  async function handleSaveProfile() {
    if (!auth.getToken || profileSaving) return
    setProfileSaving(true)
    setProfileError(null)
    try {
      const result = await updateProfile({ first_name: firstName.trim(), last_name: lastName.trim(), phone: phone.trim(), preferred_contact_method: preferredContact }, auth.getToken)
      setProfile(result.user)
      Alert.alert('Profile saved', 'Your contact settings were updated.')
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : 'Unable to update profile')
    } finally {
      setProfileSaving(false)
    }
  }

  async function handleSaveSearchProfile() {
    if (!auth.getToken || searchProfileSaving || searchProfileLoading || !searchProfileLoaded) return
    setSearchProfileSaving(true)
    setSearchProfileError(null)
    try {
      const result = await updateSearchProfile({
        preferred_contact_method: profile ? preferredContact : (searchProfile?.preferred_contact_method || preferredContact),
        phone: profile ? phone.trim() : (phone.trim() || searchProfile?.phone || ''),
        prequalified_status: searchPrequalifiedStatus,
        lender_name: searchLenderName.trim(),
        purchase_timeline: searchPurchaseTimeline,
        budget_min: searchBudgetMin.trim(),
        budget_max: searchBudgetMax.trim(),
        desired_villages: searchDesiredVillages.trim(),
        desired_beds: searchDesiredBeds.trim(),
        desired_baths: searchDesiredBaths.trim(),
        buyer_status: searchBuyerStatus,
        already_working_with_agent: searchAlreadyWorkingWithAgent,
        notes: searchNotes.trim(),
      }, auth.getToken)
      setSearchProfile(result.search_profile)
      Alert.alert('Search profile saved', 'Your search preferences will prefill future requests.')
    } catch (error) {
      setSearchProfileError(error instanceof Error ? error.message : 'Unable to update search profile')
    } finally {
      setSearchProfileSaving(false)
    }
  }

  async function handleDeleteAccount() {
    if (!auth.getToken || deletingAccountRef.current) return

    deletingAccountRef.current = true
    setDeletingAccount(true)
    setDeleteError(null)
    try {
      await deleteAccount(auth.getToken)
      setDeletionStarted(true)
      markPendingAccountDeletion(AsyncStorage, auth.userId).catch((storageError) => console.warn('Unable to save account deletion state', storageError))
      const signedOut = await signOutDeletedAccount()
      if (signedOut) {
        Alert.alert('Deletion started', 'You have been signed out and cannot use this account again. Hafa Homes will finish removing the account and its synced data through the secure deletion process.')
      } else {
        Alert.alert('Deletion started', 'Your account is blocked and secure deletion is continuing, but this device could not finish signing out. Use the visible “Finish signing out” action before continuing.')
      }
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : 'Unable to delete account right now.')
    } finally {
      deletingAccountRef.current = false
      setDeletingAccount(false)
    }
  }

  async function signOutDeletedAccount() {
    if (!auth.signOut) {
      setDeleteError('Deletion is underway, but sign-out is unavailable. Restart the app or try “Finish signing out” again.')
      return false
    }

    try {
      await auth.signOut()
      setDeleteError(null)
      clearPendingAccountDeletion(AsyncStorage, auth.userId).catch((storageError) => console.warn('Unable to clear account deletion state', storageError))
      return true
    } catch (signOutError) {
      console.warn('Account deleted but sign-out failed', signOutError)
      setDeleteError('Deletion is underway, but this device is still signed in. Finish signing out before continuing.')
      return false
    }
  }

  async function handleDeletionSessionRecovery() {
    if (deletingAccountRef.current) return

    deletingAccountRef.current = true
    setDeletingAccount(true)
    const signedOut = await signOutDeletedAccount()
    deletingAccountRef.current = false
    setDeletingAccount(false)
    if (signedOut) Alert.alert('Signed out', 'Account deletion is still processing securely in the background.')
  }

  function confirmDeleteAccount() {
    Alert.alert(
      'Delete Hafa Homes account?',
      'This permanently deletes your Hafa Homes account, synced saved homes, and search profile. Showing/contact requests are retained for broker follow-up, but they will no longer be linked to your account.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: deletingAccount ? 'Deleting...' : 'Delete account', style: 'destructive', onPress: handleDeleteAccount },
      ],
    )
  }

  if (auth.isSignedIn && !deletionStateHydrated) {
    return (
      <View style={styles.accountCard}>
        <ActivityIndicator color={colors.green2} />
        <Text style={styles.accountCopy}>Checking account status...</Text>
      </View>
    )
  }

  if (auth.isSignedIn && deletionStarted) {
    return (
      <View style={styles.accountCard}>
        <Text style={styles.accountKicker}>Deletion started</Text>
        <Text style={styles.accountTitle}>Your account is blocked.</Text>
        <Text style={styles.accountCopy}>Secure deletion is continuing in the background. Finish signing out on this device before using Hafa Homes again.</Text>
        {deleteError && <Text style={styles.profileErrorText}>{deleteError}</Text>}
        <Pressable style={[styles.primaryCta, deletingAccount && styles.ctaDisabled]} onPress={handleDeletionSessionRecovery} disabled={deletingAccount}>
          <Text style={styles.primaryCtaText}>{deletingAccount ? 'Signing out...' : 'Finish signing out'}</Text>
        </Pressable>
      </View>
    )
  }

  if (auth.isSignedIn) {
    return (
      <View style={styles.profileSettingsStack}>
        {profileLoading && <ActivityIndicator color={colors.green} style={{ marginTop: 4 }} />}
        <View style={styles.profileDetailsPanel}>
          <Text style={styles.profileSectionTitle}>Contact details</Text>
          <Text style={styles.profileSectionCopy}>These details prefill showing and price watch requests.</Text>
          <RequestInput label="First name" value={firstName} onChangeText={setFirstName} />
          <RequestInput label="Last name" value={lastName} onChangeText={setLastName} />
          <RequestInput label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="+1671" />
          <Text style={styles.requestLabel}>Preferred contact</Text>
          <View style={styles.contactSegmentRow}>
            {preferredContactOptions.map((option) => (
              <Pressable key={option.value} style={[styles.contactSegment, preferredContact === option.value && styles.contactSegmentActive]} onPress={() => setPreferredContact(option.value as 'phone' | 'text' | 'email')}>
                <Text style={[styles.contactSegmentText, preferredContact === option.value && styles.contactSegmentTextActive]}>{option.label}</Text>
              </Pressable>
            ))}
          </View>
          {profileError && <Text style={styles.profileErrorText}>{profileError}</Text>}
          <Pressable style={[styles.primaryCta, profileSaving && styles.ctaDisabled]} onPress={handleSaveProfile} disabled={profileSaving}>
            <Text style={styles.primaryCtaText}>{profileSaving ? 'Saving profile...' : 'Save profile'}</Text>
          </Pressable>
        </View>

        <View style={styles.profileDetailsPanel}>
          <Text style={styles.profileSectionTitle}>Search profile</Text>
          <Text style={styles.profileSectionCopy}>Contact details above handle phone and preferred contact. Save your budget, villages, timeline, and readiness so prompts and request forms do not keep asking from scratch.</Text>
          <View style={styles.searchProfileMeter}>
            <Text style={styles.searchProfileMeterKicker}>{searchProfile?.completion_status === 'complete' ? 'Complete profile' : `${searchProfile?.completion_percentage ?? 0}% complete`}</Text>
            <Text style={styles.profileSectionCopy}>{searchProfile?.qualification_summary || 'Add timeline, criteria, and readiness. Contact preference comes from your profile above.'}</Text>
          </View>
          {(searchProfileLoading || (!searchProfileLoaded && !searchProfileError)) ? (
            <View style={styles.searchProfileMeter}>
              <ActivityIndicator color={colors.green2} />
              <Text style={styles.profileSectionCopy}>Loading your saved search profile before enabling edits, so existing preferences are not overwritten.</Text>
            </View>
          ) : !searchProfileLoaded ? (
            <View style={styles.searchProfileMeter}>
              <Text style={styles.profileErrorText}>{searchProfileError || 'Unable to load search profile.'}</Text>
              <Pressable style={styles.secondaryCta} onPress={() => setSearchProfileReloadKey((current) => current + 1)}>
                <Text style={styles.secondaryCtaText}>Retry search profile</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <QualificationChoiceGroup label="Timeline" options={purchaseTimelineOptions} value={searchPurchaseTimeline} onChange={setSearchPurchaseTimeline} />
              <QualificationChoiceGroup label="Prequalified?" options={prequalifiedOptions} value={searchPrequalifiedStatus} onChange={setSearchPrequalifiedStatus} />
              <RequestInput label="Lender / bank optional" value={searchLenderName} onChangeText={setSearchLenderName} placeholder="Bank of Guam, Coast360..." />
              <RequestInput label="Desired villages" value={searchDesiredVillages} onChangeText={setSearchDesiredVillages} placeholder="Dededo, Yigo, Tamuning" />
              <RequestInput label="Budget min" value={searchBudgetMin} onChangeText={setSearchBudgetMin} keyboardType="number-pad" placeholder="450000" />
              <RequestInput label="Budget max" value={searchBudgetMax} onChangeText={setSearchBudgetMax} keyboardType="number-pad" placeholder="650000" />
              <RequestInput label="Desired beds" value={searchDesiredBeds} onChangeText={setSearchDesiredBeds} keyboardType="number-pad" placeholder="3" />
              <RequestInput label="Desired baths" value={searchDesiredBaths} onChangeText={setSearchDesiredBaths} keyboardType="number-pad" placeholder="2" />
              <QualificationChoiceGroup label="Buyer type" options={buyerStatusOptions} value={searchBuyerStatus} onChange={setSearchBuyerStatus} />
              <QualificationChoiceGroup label="Working with an agent?" options={agentRelationshipOptions} value={searchAlreadyWorkingWithAgent} onChange={setSearchAlreadyWorkingWithAgent} />
              <Text style={styles.requestLabel}>Notes</Text>
              <TextInput value={searchNotes} onChangeText={setSearchNotes} multiline style={[styles.requestInput, styles.requestMessageInput]} placeholder="Commute, relocation, pet needs, must-haves..." placeholderTextColor="#7b8a84" />
              {searchProfileError && <Text style={styles.profileErrorText}>{searchProfileError}</Text>}
              <Pressable style={[styles.primaryCta, searchProfileSaving && styles.ctaDisabled]} onPress={handleSaveSearchProfile} disabled={searchProfileSaving}>
                <Text style={styles.primaryCtaText}>{searchProfileSaving ? 'Saving search profile...' : 'Save search profile'}</Text>
              </Pressable>
            </>
          )}
        </View>

        <View style={styles.profileActionsPanel}>
          <Text style={styles.profileSectionTitle}>Account access</Text>
          <Pressable style={styles.secondaryCta} onPress={() => auth.signOut?.()} disabled={deletingAccount}><Text style={styles.secondaryCtaText}>Sign out</Text></Pressable>
        </View>

        <View style={styles.deleteAccountPanel}>
          <Text style={styles.deleteAccountTitle}>Delete account</Text>
          <Text style={styles.deleteAccountCopy}>Permanently remove your Hafa Homes account, synced saved homes, and search profile. Public showing/contact requests are preserved for follow-up, but disconnected from your account.</Text>
          {deleteError && <Text style={styles.profileErrorText}>{deleteError}</Text>}
          <Pressable style={[styles.dangerCta, deletingAccount && styles.ctaDisabled]} onPress={confirmDeleteAccount} disabled={deletingAccount}>
            <Text style={styles.dangerCtaText}>{deletingAccount ? 'Deleting account...' : 'Delete account'}</Text>
          </Pressable>
        </View>
      </View>
    )
  }

  return (
    <View style={styles.accountCard}>
      <Text style={styles.accountKicker}>Account</Text>
      <Text style={styles.accountTitle}>Save and sync your Guam home search</Text>
      <Text style={styles.accountCopy}>Create a free Hafa Homes account. Public browsing stays open; accounts unlock synced saved homes, alerts, and future lead history.</Text>
      <Pressable style={styles.primaryCta} onPress={() => onOpenAuth()}><Text style={styles.primaryCtaText}>Sign in or create account</Text></Pressable>
    </View>
  )
}

function AuthModal({ open, prompt, onClose }: { open: boolean; prompt: AuthPrompt | null; onClose: () => void }) {
  const { signIn, setActive: setSignInActive, isLoaded: signInLoaded } = useSignIn()
  const { signUp, setActive: setSignUpActive, isLoaded: signUpLoaded } = useSignUp()
  const { startSSOFlow } = useSSO()
  const { startAppleAuthenticationFlow } = useSignInWithApple()
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [signupPhone, setSignupPhone] = useState('+1671')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [pendingVerification, setPendingVerification] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [appleAuthAvailable, setAppleAuthAvailable] = useState(false)

  useEffect(() => {
    if (!open) return

    setMode(prompt?.initialMode ?? 'sign-in')
    setFirstName('')
    setLastName('')
    setSignupPhone('+1671')
    setEmail('')
    setPassword('')
    setCode('')
    setPendingVerification(false)
    setLoading(false)
    setMessage(null)
  }, [open, prompt?.initialMode])

  useEffect(() => {
    let active = true

    if (!open || Platform.OS !== 'ios' || !APPLE_AUTH_ENABLED) {
      setAppleAuthAvailable(false)
      return
    }

    AppleAuthentication.isAvailableAsync()
      .then((available) => {
        if (active) setAppleAuthAvailable(available)
      })
      .catch(() => {
        if (active) setAppleAuthAvailable(false)
      })

    return () => {
      active = false
    }
  }, [open])

  function switchMode(nextMode: 'sign-in' | 'sign-up') {
    setMode(nextMode)
    setPendingVerification(false)
    setMessage(null)
  }

  async function finishSocialSignIn(result: { createdSessionId: string | null; setActive?: (params: { session: string }) => Promise<void> | void }, provider: 'Apple' | 'Google') {
    if (result.createdSessionId && result.setActive) {
      await result.setActive({ session: result.createdSessionId })
      onClose()
      return
    }

    setMessage(`${provider} sign-in was cancelled or did not finish. Please try again or use email.`)
  }

  async function handleGoogleSignIn() {
    setLoading(true)
    setMessage(null)
    try {
      const result = await withAuthDelayNotice(
        startSSOFlow({
          strategy: 'oauth_google',
          redirectUrl: oauthRedirectUrl(),
        }),
        () => setMessage('Google sign-in is taking longer than usual. Finish in the browser, or cancel and use email.')
      )

      await finishSocialSignIn(result, 'Google')
    } catch (authError: any) {
      if (isAuthCancellation(authError)) {
        setMessage(null)
        return
      }
      if (isExistingSessionError(authError)) {
        onClose()
        return
      }

      setMessage(authErrorMessage(authError, 'Google sign-in failed. Please try again or use email.'))
    } finally {
      setLoading(false)
    }
  }

  async function handleAppleSignIn() {
    setLoading(true)
    setMessage(null)
    try {
      const result = await withAuthDelayNotice(
        startAppleAuthenticationFlow(),
        () => setMessage('Apple sign-in is taking longer than usual. Finish in the Apple prompt, or cancel and use email.')
      )
      await finishSocialSignIn(result, 'Apple')
    } catch (nativeAppleError: any) {
      if (isAuthCancellation(nativeAppleError)) {
        setMessage(null)
        return
      }
      if (isExistingSessionError(nativeAppleError)) {
        onClose()
        return
      }

      setMessage(authErrorMessage(nativeAppleError, 'Apple sign-in failed. Please try again or use email.'))
    } finally {
      setLoading(false)
    }
  }

  async function handleSubmit() {
    if (!email.trim() || !password.trim()) {
      setMessage('Enter your email and password.')
      return
    }

    if (mode === 'sign-up' && !firstName.trim()) {
      setMessage('Add your name so agents know who to follow up with.')
      return
    }

    setLoading(true)
    setMessage(null)
    try {
      if (mode === 'sign-in') {
        if (!signInLoaded) return
        const result = await signIn.create({ identifier: email.trim(), password })
        if (result.status === 'complete') {
          await setSignInActive({ session: result.createdSessionId })
          onClose()
        } else {
          setMessage('Could not complete sign in. Please try again.')
        }
      } else {
        if (!signUpLoaded) return
        const cleanedSignupPhone = signupPhone.trim()
        await signUp.create({
          emailAddress: email.trim(),
          password,
          firstName: firstName.trim(),
          lastName: lastName.trim() || undefined,
          unsafeMetadata: cleanedSignupPhone && cleanedSignupPhone !== '+1671' ? { phone: cleanedSignupPhone } : undefined,
        })
        await signUp.prepareEmailAddressVerification({ strategy: 'email_code' })
        setPendingVerification(true)
        setMessage('Check your email for a verification code.')
      }
    } catch (authError: any) {
      setMessage(authError?.errors?.[0]?.longMessage || authError?.errors?.[0]?.message || 'Authentication failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  async function verifyEmail() {
    if (!signUpLoaded || !code.trim()) return
    setLoading(true)
    setMessage(null)
    try {
      const result = await signUp.attemptEmailAddressVerification({ code: code.trim() })
      if (result.status === 'complete') {
        await setSignUpActive({ session: result.createdSessionId })
        onClose()
      } else {
        setMessage('Could not verify this code. Please try again.')
      }
    } catch (authError: any) {
      setMessage(authError?.errors?.[0]?.longMessage || authError?.errors?.[0]?.message || 'Verification failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const title = prompt?.title || (mode === 'sign-in' ? 'Welcome back' : 'Create your account')
  const intro = prompt?.copy || (mode === 'sign-in'
    ? 'Sign in to save Guam homes, sync your shortlist, and keep your search moving.'
    : 'Create a free Hafa Homes account to sync saved homes and make showing requests easier.')
  const showAppleAuth = Platform.OS === 'ios' && APPLE_AUTH_ENABLED && appleAuthAvailable
  const showGoogleAuth = GOOGLE_AUTH_ENABLED && (Platform.OS !== 'ios' || showAppleAuth)

  return (
    <Modal visible={open} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <SafeAreaView style={styles.authModalShell}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.authKeyboard}>
          <View style={styles.authHeader}>
            <View>
              <Text style={styles.authEyebrow}>Hafa Homes account</Text>
              <Text style={styles.authTitle}>{title}</Text>
            </View>
            <Pressable onPress={onClose} style={styles.authCloseButton}><Text style={styles.authClose}>Close</Text></Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.authBody}>
            <View style={styles.authHeroCard}>
              <Text style={styles.authHeroTitle}>{mode === 'sign-in' ? 'Pick up your Guam search.' : 'Make your shortlist portable.'}</Text>
              <Text style={styles.authHeroCopy}>{intro}</Text>
            </View>

            <View style={styles.authModeTabs}>
              <Pressable onPress={() => switchMode('sign-in')} style={[styles.authModeTab, mode === 'sign-in' && styles.authModeTabActive]}>
                <Text style={[styles.authModeText, mode === 'sign-in' && styles.authModeTextActive]}>Sign in</Text>
              </Pressable>
              <Pressable onPress={() => switchMode('sign-up')} style={[styles.authModeTab, mode === 'sign-up' && styles.authModeTabActive]}>
                <Text style={[styles.authModeText, mode === 'sign-up' && styles.authModeTextActive]}>Create account</Text>
              </Pressable>
            </View>

            {!pendingVerification && (showAppleAuth || showGoogleAuth) && (
              <>
                {showAppleAuth && (
                  <View style={[styles.nativeAppleButtonWrap, loading && styles.ctaDisabled]}>
                    <AppleAuthentication.AppleAuthenticationButton
                      buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
                      buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                      cornerRadius={16}
                      onPress={() => { if (!loading) handleAppleSignIn() }}
                      style={styles.nativeAppleButton}
                    />
                  </View>
                )}
                {showGoogleAuth && (
                  <Pressable style={styles.socialCta} onPress={handleGoogleSignIn} disabled={loading}>
                    <View style={styles.socialCtaMark}><Text style={styles.socialCtaMarkText}>G</Text></View>
                    <Text style={styles.socialCtaText}>{loading ? 'Signing in...' : 'Continue with Google'}</Text>
                  </Pressable>
                )}
                <View style={styles.authDividerRow}>
                  <View style={styles.authDividerLine} />
                  <Text style={styles.authDividerText}>or use email</Text>
                  <View style={styles.authDividerLine} />
                </View>
              </>
            )}

            <View style={styles.authFormCard}>
              {pendingVerification ? (
                <>
                  <Text style={styles.authIntro}>Enter the verification code Clerk sent to {email.trim()}.</Text>
                  <RequestInput label="Verification code" value={code} onChangeText={setCode} keyboardType="number-pad" />
                  {message && <Text style={styles.authMessage}>{message}</Text>}
                  <Pressable style={styles.primaryCta} onPress={verifyEmail} disabled={loading}><Text style={styles.primaryCtaText}>{loading ? 'Verifying...' : 'Verify email'}</Text></Pressable>
                </>
              ) : (
                <>
                  {mode === 'sign-up' && (
                    <>
                      <RequestInput label="First name" value={firstName} onChangeText={setFirstName} placeholder="Leon" />
                      <RequestInput label="Last name" value={lastName} onChangeText={setLastName} placeholder="Shimizu" />
                      <RequestInput label="Phone" value={signupPhone} onChangeText={setSignupPhone} keyboardType="phone-pad" placeholder="+1671" />
                    </>
                  )}
                  <RequestInput label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" placeholder="you@example.com" />
                  <RequestInput label="Password" value={password} onChangeText={setPassword} secureTextEntry placeholder="At least 8 characters" />
                  {message && <Text style={styles.authMessage}>{message}</Text>}
                  <Pressable style={styles.primaryCta} onPress={handleSubmit} disabled={loading}><Text style={styles.primaryCtaText}>{loading ? 'Please wait...' : mode === 'sign-in' ? 'Sign in' : 'Create account'}</Text></Pressable>
                  <Pressable style={styles.secondaryCta} onPress={() => switchMode(mode === 'sign-in' ? 'sign-up' : 'sign-in')}>
                    <Text style={styles.secondaryCtaText}>{mode === 'sign-in' ? 'Create a new account' : 'I already have an account'}</Text>
                  </Pressable>
                </>
              )}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  )
}

function ListingCard({ listing, saved, onOpen, onToggleSaved }: { listing: Listing; saved: boolean; onOpen: () => void; onToggleSaved: () => void }) {
  const [imageUri, setImageUri] = useState(listing.primary_photo_url || FALLBACK_IMAGE)

  return (
    <Pressable onPress={onOpen} style={styles.card}>
      <Image source={{ uri: imageUri }} onError={() => setImageUri(FALLBACK_IMAGE)} style={styles.cardImage} />
      <View style={styles.cardBody}>
        <View style={styles.cardTopRow}>
          <Text style={styles.price}>{currency(listing.price, listing.listing_kind)}</Text>
          <Pressable onPress={onToggleSaved} hitSlop={10} style={[styles.saveButton, saved && styles.saveButtonActive]}>
            <Text style={[styles.saveText, saved && styles.saveTextActive]}>{saved ? '♥' : '♡'}</Text>
          </Pressable>
        </View>
        <Text style={styles.cardTitle}>{listing.title}</Text>
        <Text style={styles.cardMeta}>{listing.village.name} · {listing.address}</Text>
        <Text style={styles.cardStats}>{listing.beds} beds · {listing.baths} baths · {listing.square_feet?.toLocaleString() ?? '—'} sqft</Text>
        <View style={styles.pillRow}>
          {listing.features.slice(0, 3).map((feature) => <Text key={feature.id} style={styles.pill}>{feature.name}</Text>)}
        </View>
      </View>
    </Pressable>
  )
}

function MortgageCalculator({ listing }: { listing: Listing }) {
  const [downPaymentPercent, setDownPaymentPercent] = useState('20')
  const [interestRate, setInterestRate] = useState('6.75')
  const [loanTermYears, setLoanTermYears] = useState('30')
  const [annualTaxPercent, setAnnualTaxPercent] = useState('0.35')
  const [insuranceMonthly, setInsuranceMonthly] = useState('175')

  const downPercent = parseNumber(downPaymentPercent, 20)
  const rate = parseNumber(interestRate, 6.75)
  const termYears = parseNumber(loanTermYears, 30)
  const annualTaxes = parseNumber(annualTaxPercent, 0.35)
  const insurance = parseNumber(insuranceMonthly, 175)
  const downPayment = listing.price * (downPercent / 100)
  const loanAmount = Math.max(listing.price - downPayment, 0)
  const monthlyRate = rate / 100 / 12
  const numberOfPayments = Math.max(termYears * 12, 1)
  const principalAndInterest = monthlyRate > 0
    ? loanAmount * ((monthlyRate * (1 + monthlyRate) ** numberOfPayments) / (((1 + monthlyRate) ** numberOfPayments) - 1))
    : loanAmount / numberOfPayments
  const taxesMonthly = listing.price * (annualTaxes / 100) / 12
  const estimatedMonthly = principalAndInterest + taxesMonthly + insurance

  return (
    <View style={styles.calculatorCard}>
      <View style={styles.calculatorHeader}>
        <View>
          <Text style={styles.kicker}>Mortgage calculator</Text>
          <Text style={styles.calculatorTotal}>{formatCurrency(estimatedMonthly)}/mo</Text>
        </View>
        <Text style={styles.calculatorBadge}>Estimate</Text>
      </View>
      <Text style={styles.calculatorCopy}>Includes principal, interest, estimated Guam property tax, and homeowners insurance. Final terms depend on lender, credit, taxes, insurance, and closing costs.</Text>

      <View style={styles.calculatorGrid}>
        <CalculatorInput label="Down payment" suffix="%" value={downPaymentPercent} onChangeText={setDownPaymentPercent} />
        <CalculatorInput label="Interest rate" suffix="%" value={interestRate} onChangeText={setInterestRate} />
        <CalculatorInput label="Loan term" suffix="yrs" value={loanTermYears} onChangeText={setLoanTermYears} />
        <CalculatorInput label="Property tax" suffix="%/yr" value={annualTaxPercent} onChangeText={setAnnualTaxPercent} />
        <CalculatorInput label="Insurance" prefix="$" suffix="/mo" value={insuranceMonthly} onChangeText={setInsuranceMonthly} />
      </View>

      <View style={styles.calculatorBreakdown}>
        <Text style={styles.breakdownLine}>Home price <Text style={styles.breakdownValue}>{formatCurrency(listing.price)}</Text></Text>
        <Text style={styles.breakdownLine}>Down payment <Text style={styles.breakdownValue}>{formatCurrency(downPayment)}</Text></Text>
        <Text style={styles.breakdownLine}>Loan amount <Text style={styles.breakdownValue}>{formatCurrency(loanAmount)}</Text></Text>
        <Text style={styles.breakdownLine}>Principal & interest <Text style={styles.breakdownValue}>{formatCurrency(principalAndInterest)}/mo</Text></Text>
        <Text style={styles.breakdownLine}>Taxes & insurance <Text style={styles.breakdownValue}>{formatCurrency(taxesMonthly + insurance)}/mo</Text></Text>
      </View>
    </View>
  )
}

function CalculatorInput({ label, value, onChangeText, prefix, suffix }: { label: string; value: string; onChangeText: (value: string) => void; prefix?: string; suffix?: string }) {
  return (
    <View style={styles.calculatorField}>
      <Text style={styles.calculatorLabel}>{label}</Text>
      <View style={styles.calculatorInputShell}>
        {prefix && <Text style={styles.calculatorAffix}>{prefix}</Text>}
        <TextInput value={value} onChangeText={onChangeText} keyboardType="decimal-pad" style={styles.calculatorInput} />
        {suffix && <Text style={styles.calculatorAffix}>{suffix}</Text>}
      </View>
    </View>
  )
}

function ListingDetailScreen({ listing, saved, auth, agents, selectedAgent, onSelectAgent, onOpenAgent, onBack, onOpenAuth, onToggleSaved, onTrackIntent }: { listing: Listing; saved: boolean; auth: AppAuth; agents: Agent[]; selectedAgent: Agent | null; onSelectAgent: (agentId: number | null) => void; onOpenAgent: (agentId: number) => void; onBack: () => void; onOpenAuth: (prompt?: AuthPrompt) => void; onToggleSaved: () => void; onTrackIntent: (eventName: string, payload?: { listing_id?: number; village_id?: number; agent_id?: number; source?: string; metadata?: Record<string, unknown> }) => void }) {
  const [detailListing, setDetailListing] = useState(listing)
  const [imageUri, setImageUri] = useState(listing.photos?.[0]?.url || listing.primary_photo_url || FALLBACK_IMAGE)
  const [photoIndex, setPhotoIndex] = useState(0)
  const [showMortgageCalculator, setShowMortgageCalculator] = useState(false)
  const [showRequestForm, setShowRequestForm] = useState(false)
  const [showPriceTracker, setShowPriceTracker] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setDetailListing(listing)
    setPhotoIndex(0)
    setImageUri(listing.photos?.[0]?.url || listing.primary_photo_url || FALLBACK_IMAGE)
    setDetailError(null)

    if (listing.village.local_intel && Object.keys(listing.village.local_intel).length > 0) return undefined

    fetchListing(listing.id)
      .then((result) => {
        if (!cancelled) {
          setDetailListing(result)
          setPhotoIndex(0)
          setImageUri(result.photos?.[0]?.url || result.primary_photo_url || FALLBACK_IMAGE)
        }
      })
      .catch((listingDetailError) => {
        console.warn('Unable to load Hafa Homes listing detail', listingDetailError)
        if (!cancelled) setDetailError(listingDetailError instanceof Error ? listingDetailError.message : 'Unable to refresh this listing')
      })

    return () => {
      cancelled = true
    }
  }, [listing])

  const photos = detailListing.photos?.length ? detailListing.photos : [{ id: 0, url: detailListing.primary_photo_url || FALLBACK_IMAGE, position: 1, alt_text: detailListing.title }]
  const routingAgents = agents
  const requestedAgent = auth.isSignedIn ? selectedAgent : null
  const listingAgent = detailListing.agent || null
  const storefrontListingAgent = listingAgent && routingAgents.some((agent) => agent.id === listingAgent.id) ? listingAgent : null

  function showPhoto(index: number) {
    const nextIndex = (index + photos.length) % photos.length
    setPhotoIndex(nextIndex)
    setImageUri(photos[nextIndex]?.url || FALLBACK_IMAGE)
  }

  return (
    <SafeAreaView style={styles.shell}>
      <StatusBar style="light" />
      <ScrollView style={styles.detailScroll} contentContainerStyle={styles.detailContent}>
        <View style={styles.detailHeader}>
          <Pressable onPress={onBack} style={styles.backButton}><Text style={styles.backButtonText}>← Back</Text></Pressable>
          <Pressable disabled={Boolean(detailError)} onPress={onToggleSaved} style={[styles.detailSaveButton, saved && styles.saveButtonActive, detailError && styles.ctaDisabled]}><Text style={[styles.saveText, saved && styles.saveTextActive]}>{saved ? '♥' : '♡'}</Text></Pressable>
        </View>
        <View style={styles.detailImageWrap}>
          <Image source={{ uri: imageUri }} onError={() => setImageUri(FALLBACK_IMAGE)} style={styles.detailImage} />
          {photos.length > 1 && (
            <>
              <Pressable onPress={() => showPhoto(photoIndex - 1)} style={[styles.photoNavButton, styles.photoNavLeft]}><Text style={styles.photoNavText}>‹</Text></Pressable>
              <Pressable onPress={() => showPhoto(photoIndex + 1)} style={[styles.photoNavButton, styles.photoNavRight]}><Text style={styles.photoNavText}>›</Text></Pressable>
              <View style={styles.photoCountBadge}><Text style={styles.photoCountText}>{photoIndex + 1} of {photos.length}</Text></View>
            </>
          )}
        </View>
        <View style={styles.detailPanel}>
          <Text style={styles.priceLarge}>{currency(detailListing.price, detailListing.listing_kind)}</Text>
          <Text style={styles.detailTitle}>{detailListing.title}</Text>
          <Text style={styles.cardMeta}>{detailListing.village.name} · {detailListing.address}</Text>
          {detailListing.brokerage?.demo_data && <DemoInventoryNotice />}
          <Text style={styles.detailStats}>{detailListing.beds} beds · {detailListing.baths} baths · {detailListing.square_feet?.toLocaleString() ?? '—'} sqft</Text>
          <View style={styles.listingFactsCard}>
            <Text style={styles.factLine}>Listing ID <Text style={styles.factValue}>{detailListing.external_id || `HH-${detailListing.id}`}</Text></Text>
            <Text style={styles.factLine}>Status <Text style={styles.factValue}>{detailListing.status || 'active'}</Text></Text>
            <Text style={styles.factLine}>Type <Text style={styles.factValue}>{detailListing.property_type}</Text></Text>
          </View>
          <Text style={styles.sectionTitle}>Local details</Text>
          <Text style={styles.detailCopy}>{detailListing.description || 'Explore this Guam listing, request a showing, save it for later, or ask an agent for next steps.'}</Text>
          {detailError && <Text style={styles.requestError}>This listing could not be refreshed from the API. Go back to search and reload listings before saving or requesting a showing. Error: {detailError}</Text>}
          <LocalIntelSection listing={detailListing} />
          <Text style={styles.sectionTitle}>Listed by</Text>
          <View style={styles.agentCard}>
            <View style={styles.agentAvatar}><Text style={styles.agentInitial}>{listingAgent ? agentInitials(listingAgent) : (detailListing.agent_name || 'H').charAt(0)}</Text></View>
            <View style={styles.agentInfo}>
              <Text style={styles.agentName}>{listingAgent?.name || detailListing.agent_name || 'Listing agent'}</Text>
              <Text style={styles.agentMeta}>{listingAgent?.brokerage?.name || detailListing.brokerage_name || 'Listing brokerage'}</Text>
              <Text style={styles.agentMeta}>Listing attribution</Text>
            </View>
          </View>
          {storefrontListingAgent && (
            <Pressable style={styles.secondaryCta} onPress={() => onOpenAgent(storefrontListingAgent.id)} accessibilityRole="button" accessibilityLabel={`View ${storefrontListingAgent.name} profile`}>
              <Text style={styles.secondaryCtaText}>View storefront agent profile</Text>
            </Pressable>
          )}
          <View style={styles.agentChoiceList}>
            <Text style={styles.sectionTitle}>Work with an agent</Text>
            <Text style={styles.detailCopy}>Choose who should follow up and coordinate next steps. The listing attribution above stays unchanged.</Text>
            {auth.isSignedIn ? (
              routingAgents.length > 0 ? (
                <>
                  <Text style={styles.requestLabel}>Preferred agent for requests</Text>
                  {routingAgents.map((agent) => (
                    <Pressable key={agent.id} style={[styles.agentChoice, requestedAgent?.id === agent.id && styles.agentChoiceActive]} onPress={() => onSelectAgent(agent.id)} accessibilityRole="button">
                      <Text style={[styles.agentChoiceText, requestedAgent?.id === agent.id && styles.agentChoiceTextActive]}>{agent.name}</Text>
                    </Pressable>
                  ))}
                </>
              ) : <Text style={styles.detailCopy}>No preferred-agent options are available yet. Requests will route to the brokerage team.</Text>
            ) : (
              <Pressable style={styles.secondaryCta} onPress={() => onOpenAuth({ title: 'Sign in to choose an agent', copy: 'Create a free Hafa Homes account before setting a preferred agent for future requests.' })} accessibilityRole="button">
                <Text style={styles.secondaryCtaText}>Sign in to choose a preferred agent</Text>
              </Pressable>
            )}
          </View>
          <Pressable disabled={Boolean(detailError)} style={[styles.primaryCta, detailError && styles.ctaDisabled]} onPress={() => { setShowRequestForm(true); onTrackIntent('showing_form_opened', { listing_id: detailListing.id, source: 'mobile', metadata: { surface: 'listing_detail', listing_kind: detailListing.listing_kind } }) }}>
            <Text style={styles.primaryCtaText}>Request a showing</Text>
          </Pressable>
          <Pressable
            style={styles.secondaryCta}
            onPress={() => { setShowPriceTracker(true); onTrackIntent('price_tracker_opened', { listing_id: detailListing.id, source: 'mobile', metadata: { surface: 'listing_detail', listing_kind: detailListing.listing_kind } }) }}
          >
            <Text style={styles.secondaryCtaText}>Ask about price changes</Text>
          </Pressable>
          {detailListing.listing_kind === 'sale' && (
            <>
              <Pressable
                style={styles.secondaryCta}
                onPress={() => setShowMortgageCalculator((current) => !current)}
              >
                <Text style={styles.secondaryCtaText}>{showMortgageCalculator ? 'Hide mortgage calculator' : 'Estimate mortgage payment'}</Text>
              </Pressable>
              {showMortgageCalculator && <MortgageCalculator listing={detailListing} />}
            </>
          )}
        </View>
      </ScrollView>
      <ShowingRequestSheet listing={detailListing} auth={auth} requestedAgent={requestedAgent} open={showRequestForm} onOpenAuth={onOpenAuth} onClose={() => setShowRequestForm(false)} />
      <PriceAlertSheet listing={detailListing} auth={auth} requestedAgent={requestedAgent} open={showPriceTracker} onClose={() => setShowPriceTracker(false)} />
    </SafeAreaView>
  )
}

function LocalIntelSection({ listing }: { listing: Listing }) {
  const intel = listing.village.local_intel
  if (!intel || Object.keys(intel).length === 0) return null

  return (
    <View style={styles.localIntelCard}>
      <View style={styles.localIntelHeader}>
        <View>
          <Text style={styles.kicker}>Local intel</Text>
          <Text style={styles.localIntelTitle}>Around {listing.village.name}</Text>
        </View>
        {listing.village.region && <Text style={styles.localIntelRegion}>{listing.village.region}</Text>}
      </View>
      {intel.summary && <Text style={styles.localIntelSummary}>{intel.summary}</Text>}
      {Boolean(intel.lifestyle_tags?.length) && (
        <View style={styles.pillRow}>
          {intel.lifestyle_tags?.slice(0, 5).map((tag) => <Text key={tag} style={styles.pill}>{tag}</Text>)}
        </View>
      )}
      <LocalIntelList title="Nearby schools" items={intel.nearby_schools} note={intel.schools_note} />
      <LocalIntelList title="Parks and recreation" items={intel.parks_and_recreation} />
      <LocalIntelList title="Daily life" items={intel.daily_life} />
      <LocalIntelList title="Commute notes" items={intel.commute_notes} />
      <Text style={styles.localIntelDisclaimer}>School assignments, access, and commute times should be verified before making housing decisions.</Text>
    </View>
  )
}

function LocalIntelList({ title, items, note }: { title: string; items?: string[]; note?: string }) {
  if (!items?.length && !note) return null

  return (
    <View style={styles.localIntelGroup}>
      <Text style={styles.localIntelGroupTitle}>{title}</Text>
      {items?.slice(0, 5).map((item) => (
        <View key={item} style={styles.localIntelBulletRow}>
          <View style={styles.localIntelBullet} />
          <Text style={styles.localIntelBulletText}>{item}</Text>
        </View>
      ))}
      {note && <Text style={styles.localIntelNote}>{note}</Text>}
    </View>
  )
}

function ShowingRequestSheet({ listing, auth, requestedAgent, open, onOpenAuth, onClose }: { listing: Listing; auth: AppAuth; requestedAgent: Agent | null; open: boolean; onOpenAuth: (prompt?: AuthPrompt) => void; onClose: () => void }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('+1671')
  const [preferredContact, setPreferredContact] = useState('phone')
  const [preferredTime, setPreferredTime] = useState('flexible')
  const [tourType, setTourType] = useState('in_person')
  const [prequalifiedStatus, setPrequalifiedStatus] = useState('')
  const [purchaseTimeline, setPurchaseTimeline] = useState('')
  const [lenderName, setLenderName] = useState('')
  const [budgetMin, setBudgetMin] = useState('')
  const [budgetMax, setBudgetMax] = useState(String(Math.round(listing.price)))
  const [desiredVillages, setDesiredVillages] = useState(listing.village.name || '')
  const [desiredBeds, setDesiredBeds] = useState(listing.beds ? String(listing.beds) : '')
  const [desiredBaths, setDesiredBaths] = useState(listing.baths ? String(listing.baths) : '')
  const [buyerStatus, setBuyerStatus] = useState('')
  const [alreadyWorkingWithAgent, setAlreadyWorkingWithAgent] = useState('')
  const [qualificationNotes, setQualificationNotes] = useState('')
  const [message, setMessage] = useState(`I'm interested in ${listing.title}.`)
  const [showOptionalDetails, setShowOptionalDetails] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const editedShowingFieldsRef = useRef<Set<string>>(new Set())
  const wasOpenRef = useRef(false)

  function markShowingFieldEdited(field: string) {
    editedShowingFieldsRef.current.add(field)
  }

  function prefillShowingField(field: string, setter: (value: string) => void, value: string) {
    if (!editedShowingFieldsRef.current.has(field)) setter(value)
  }

  useEffect(() => {
    if (open) {
      wasOpenRef.current = true
      return
    }

    if (wasOpenRef.current && !submitted) {
      recordLeadIntentEvent('lead_form_abandoned', { listing_id: listing.id, source: 'mobile', metadata: { surface: 'showing_request', listing_kind: listing.listing_kind } }, auth.isSignedIn ? auth.getToken : undefined)
    }
    wasOpenRef.current = false
  }, [auth.getToken, auth.isSignedIn, listing.id, listing.listing_kind, open, submitted])

  useEffect(() => {
    if (!open) return undefined

    let cancelled = false
    editedShowingFieldsRef.current = new Set()

    async function loadPrefill() {
      setMessage(`I'm interested in ${listing.title}.`)
      setBudgetMax(String(Math.round(listing.price)))
      setDesiredVillages(listing.village.name || '')
      setDesiredBeds(listing.beds ? String(listing.beds) : '')
      setDesiredBaths(listing.baths ? String(listing.baths) : '')
      setSubmitted(false)
      setError(null)
      setShowOptionalDetails(false)

      if (!auth.isSignedIn) return

      let loadedUser: CurrentUser | null = null
      setName((current) => current || auth.userName || '')
      setEmail((current) => current || auth.userEmail || '')
      if (!auth.getToken) return

      try {
        const result = await fetchMe(auth.getToken)
        loadedUser = result.user
        if (!cancelled) {
          prefillShowingField('name', setName, result.user.full_name || auth.userName || '')
          prefillShowingField('email', setEmail, result.user.email || auth.userEmail || '')
          prefillShowingField('phone', setPhone, result.user.phone || '+1671')
          prefillShowingField('preferredContact', setPreferredContact, result.user.preferred_contact_method || 'phone')
        }
      } catch (profileError) {
        console.warn('Unable to prefill showing request contact profile', profileError)
      }

      try {
        const searchResult = await fetchSearchProfile(auth.getToken)
        const saved = searchResult.search_profile
        if (!cancelled) {
          prefillShowingField('phone', setPhone, saved.phone || loadedUser?.phone || '+1671')
          prefillShowingField('preferredContact', setPreferredContact, saved.preferred_contact_method || loadedUser?.preferred_contact_method || 'phone')
          prefillShowingField('prequalifiedStatus', setPrequalifiedStatus, saved.prequalified_status || '')
          prefillShowingField('purchaseTimeline', setPurchaseTimeline, saved.purchase_timeline || '')
          prefillShowingField('lenderName', setLenderName, saved.lender_name || '')
          prefillShowingField('budgetMin', setBudgetMin, profileBudgetValue(saved, 'budget_min'))
          prefillShowingField('budgetMax', setBudgetMax, profileBudgetValue(saved, 'budget_max', String(Math.round(listing.price))))
          prefillShowingField('desiredVillages', setDesiredVillages, saved.desired_villages || listing.village.name || '')
          prefillShowingField('desiredBeds', setDesiredBeds, profileValue(saved, 'desired_beds', listing.beds ? String(listing.beds) : ''))
          prefillShowingField('desiredBaths', setDesiredBaths, profileValue(saved, 'desired_baths', listing.baths ? String(listing.baths) : ''))
          prefillShowingField('buyerStatus', setBuyerStatus, saved.buyer_status || '')
          prefillShowingField('alreadyWorkingWithAgent', setAlreadyWorkingWithAgent, saved.already_working_with_agent || '')
          prefillShowingField('qualificationNotes', setQualificationNotes, saved.notes || '')
        }
      } catch (profileError) {
        console.warn('Unable to prefill showing request search profile', profileError)
      }
    }

    loadPrefill()
    return () => { cancelled = true }
  }, [auth.getToken, auth.isSignedIn, auth.userEmail, auth.userName, listing.baths, listing.beds, listing.price, listing.title, listing.village.name, open])

  async function handleSubmit() {
    const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
    if (!name.trim() || !email.trim() || !emailValid) {
      setError('Please add your name and a valid email so an agent can follow up.')
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      const token = await currentLeadIntentSessionToken()
      await createLead({
        listing_id: listing.id,
        lead_type: 'showing_request',
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        preferred_contact_method: preferredContact,
        preferred_time: preferredTime,
        tour_type: tourType,
        source_url: `hafahomes:///listings/${listing.id}`,
        requested_agent_id: requestedAgent?.id,
        prequalified_status: prequalifiedStatus,
        lender_name: lenderName.trim(),
        purchase_timeline: purchaseTimeline,
        budget_min: budgetMin.trim(),
        budget_max: budgetMax.trim(),
        desired_villages: desiredVillages.trim(),
        desired_beds: desiredBeds.trim(),
        desired_baths: desiredBaths.trim(),
        buyer_status: buyerStatus,
        already_working_with_agent: alreadyWorkingWithAgent,
        qualification_notes: qualificationNotes.trim(),
        intent_session_token: token || undefined,
        message: `${message.trim()}\n\nListing: ${listing.title} — ${listing.address}, ${listing.village.name}`,
      }, auth.isSignedIn ? auth.getToken : undefined, auth.userId)
      setSubmitted(true)
    } catch (submitError) {
      console.warn('Unable to submit showing request', submitError)
      setError(submitError instanceof Error ? submitError.message : 'We could not send the request yet. Please try again in a moment.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.sheetBackdrop}>
        <Pressable style={styles.sheetScrim} onPress={onClose} />
        <View style={styles.requestSheet}>
          {submitted ? (
            <View style={styles.requestSuccess}>
              <Text style={styles.kicker}>Request sent</Text>
              <Text style={styles.requestTitle}>Thanks — we received your showing request.</Text>
              <Text style={styles.requestCopy}>{auth.isSignedIn ? `This request is linked to your Hafa Homes account, and the team can follow up about ${listing.title}.` : `The Hafa Homes team can follow up about ${listing.title}. Create an account later with the same email to connect future saved homes and inquiries.`}</Text>
              <Pressable style={styles.primaryCta} onPress={onClose}><Text style={styles.primaryCtaText}>Done</Text></Pressable>
              {!auth.isSignedIn && auth.clerkEnabled && (
                <Pressable style={styles.secondaryCta} onPress={() => { onClose(); onOpenAuth({ title: 'Create your Hafa Homes account', copy: 'Use the same email to keep your saved homes and future inquiries connected.', initialMode: 'sign-up' }) }}>
                  <Text style={styles.secondaryCtaText}>Create account</Text>
                </Pressable>
              )}
            </View>
          ) : (
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <View style={styles.sheetHandle} />
              <View style={styles.sheetHeaderRow}>
                <View style={styles.sheetHeaderCopy}>
                  <Text style={styles.kicker}>Showing request</Text>
                  <Text style={styles.requestTitle}>Ask about this home</Text>
                </View>
                <Pressable onPress={onClose} style={styles.sheetCloseButton}><Text style={styles.sheetCloseText}>×</Text></Pressable>
              </View>
              <View style={styles.requestListingSummary}>
                <Text style={styles.requestListingPrice}>{currency(listing.price, listing.listing_kind)}</Text>
                <Text numberOfLines={1} style={styles.requestListingTitle}>{listing.title}</Text>
                <Text numberOfLines={1} style={styles.cardMeta}>{listing.village.name} · {listing.address}</Text>
                <Text numberOfLines={1} style={styles.cardMeta}>Preferred agent: {requestedAgent?.name || 'Brokerage team'}</Text>
              </View>
              <View style={styles.requestFieldGroup}>
                <RequestInput label="Name" value={name} onChangeText={(value) => { markShowingFieldEdited('name'); setName(value) }} placeholder="Your name" />
                <RequestInput label="Email" value={email} onChangeText={(value) => { markShowingFieldEdited('email'); setEmail(value) }} placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none" />
                <RequestInput label="Phone" value={phone} onChangeText={(value) => { markShowingFieldEdited('phone'); setPhone(value) }} placeholder="+1671" keyboardType="phone-pad" />
                <Text style={styles.requestLabel}>Preferred contact</Text>
                <View style={styles.contactSegmentRow}>
                  {preferredContactOptions.map((option) => (
                    <Pressable key={option.value} onPress={() => { markShowingFieldEdited('preferredContact'); setPreferredContact(option.value) }} style={[styles.contactSegment, preferredContact === option.value && styles.contactSegmentActive]}>
                      <Text style={[styles.contactSegmentText, preferredContact === option.value && styles.contactSegmentTextActive]}>{option.label}</Text>
                    </Pressable>
                  ))}
                </View>
                <Text style={styles.requestLabel}>Tour type</Text>
                <View style={styles.contactSegmentRow}>
                  {[['in_person', 'in person'], ['virtual', 'virtual']].map(([value, label]) => (
                    <Pressable key={value} onPress={() => setTourType(value)} style={[styles.contactSegment, tourType === value && styles.contactSegmentActive]}>
                      <Text style={[styles.contactSegmentText, tourType === value && styles.contactSegmentTextActive]}>{label}</Text>
                    </Pressable>
                  ))}
                </View>
                <Text style={styles.requestLabel}>Preferred time</Text>
                <View style={styles.contactSegmentRow}>
                  {preferredTimeOptions.map((option) => (
                    <Pressable key={option.value} onPress={() => setPreferredTime(option.value)} style={[styles.contactSegment, preferredTime === option.value && styles.contactSegmentActive]}>
                      <Text style={[styles.contactSegmentText, preferredTime === option.value && styles.contactSegmentTextActive]}>{option.label}</Text>
                    </Pressable>
                  ))}
                </View>
                <Pressable style={styles.optionalDetailsToggle} onPress={() => setShowOptionalDetails((current) => !current)} accessibilityRole="button" accessibilityState={{ expanded: showOptionalDetails }}>
                  <View style={styles.optionalDetailsCopy}>
                    <Text style={styles.optionalDetailsTitle}>Tell the agent more</Text>
                    <Text style={styles.optionalDetailsSubtitle}>Optional search and readiness details</Text>
                  </View>
                  <Text style={styles.optionalDetailsIcon}>{showOptionalDetails ? '−' : '+'}</Text>
                </Pressable>
                {showOptionalDetails && (
                  <View style={styles.optionalDetailsFields}>
                    <QualificationChoiceGroup label="Prequalified?" options={prequalifiedOptions} value={prequalifiedStatus} onChange={(value) => { markShowingFieldEdited('prequalifiedStatus'); setPrequalifiedStatus(value) }} />
                    <QualificationChoiceGroup label="Timeline" options={purchaseTimelineOptions} value={purchaseTimeline} onChange={(value) => { markShowingFieldEdited('purchaseTimeline'); setPurchaseTimeline(value) }} />
                    <QualificationChoiceGroup label="Buyer type" options={buyerStatusOptions} value={buyerStatus} onChange={(value) => { markShowingFieldEdited('buyerStatus'); setBuyerStatus(value) }} />
                    <QualificationChoiceGroup label="Working with an agent?" options={agentRelationshipOptions} value={alreadyWorkingWithAgent} onChange={(value) => { markShowingFieldEdited('alreadyWorkingWithAgent'); setAlreadyWorkingWithAgent(value) }} />
                    <RequestInput label="Lender / bank optional" value={lenderName} onChangeText={(value) => { markShowingFieldEdited('lenderName'); setLenderName(value) }} placeholder="Bank of Guam, Coast360..." />
                    <RequestInput label="Budget min" value={budgetMin} onChangeText={(value) => { markShowingFieldEdited('budgetMin'); setBudgetMin(value) }} placeholder="450000" keyboardType="number-pad" />
                    <RequestInput label="Budget max" value={budgetMax} onChangeText={(value) => { markShowingFieldEdited('budgetMax'); setBudgetMax(value) }} placeholder="650000" keyboardType="number-pad" />
                    <RequestInput label="Desired villages" value={desiredVillages} onChangeText={(value) => { markShowingFieldEdited('desiredVillages'); setDesiredVillages(value) }} placeholder="Dededo, Yigo, Tamuning" />
                    <RequestInput label="Desired beds" value={desiredBeds} onChangeText={(value) => { markShowingFieldEdited('desiredBeds'); setDesiredBeds(value) }} placeholder="3" keyboardType="number-pad" />
                    <RequestInput label="Desired baths" value={desiredBaths} onChangeText={(value) => { markShowingFieldEdited('desiredBaths'); setDesiredBaths(value) }} placeholder="2" keyboardType="number-pad" />
                    <Text style={styles.requestLabel}>Qualification notes</Text>
                    <TextInput value={qualificationNotes} onChangeText={(value) => { markShowingFieldEdited('qualificationNotes'); setQualificationNotes(value) }} multiline style={[styles.requestInput, styles.requestMessageInput]} placeholder="Relocating soon, needs pet-friendly, prefers central Guam..." placeholderTextColor="#7b8a84" />
                  </View>
                )}
                <Text style={styles.requestLabel}>Message</Text>
                <TextInput value={message} onChangeText={setMessage} multiline style={[styles.requestInput, styles.requestMessageInput]} />
              </View>
              {error && <Text style={styles.requestError}>{error}</Text>}
              <Pressable disabled={submitting} style={[styles.primaryCta, submitting && styles.ctaDisabled]} onPress={handleSubmit}>
                <Text style={styles.primaryCtaText}>{submitting ? 'Sending request...' : 'Send showing request'}</Text>
              </Pressable>
            </ScrollView>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

function PriceAlertSheet({ listing, auth, requestedAgent, open, onClose }: { listing: Listing; auth: AppAuth; requestedAgent: Agent | null; open: boolean; onClose: () => void }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('+1671')
  const [targetPrice, setTargetPrice] = useState(String(Math.round(listing.price * 0.97)))
  const [prequalifiedStatus, setPrequalifiedStatus] = useState('')
  const [purchaseTimeline, setPurchaseTimeline] = useState('')
  const [lenderName, setLenderName] = useState('')
  const [budgetMin, setBudgetMin] = useState('')
  const [budgetMax, setBudgetMax] = useState('')
  const [buyerStatus, setBuyerStatus] = useState('')
  const [alreadyWorkingWithAgent, setAlreadyWorkingWithAgent] = useState('')
  const [showPriceOptionalDetails, setShowPriceOptionalDetails] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const editedPriceFieldsRef = useRef<Set<string>>(new Set())
  const wasOpenRef = useRef(false)

  function markPriceFieldEdited(field: string) {
    editedPriceFieldsRef.current.add(field)
  }

  function prefillPriceField(field: string, setter: (value: string) => void, value: string) {
    if (!editedPriceFieldsRef.current.has(field)) setter(value)
  }

  useEffect(() => {
    if (open) {
      wasOpenRef.current = true
      return
    }

    if (wasOpenRef.current && !submitted) {
      recordLeadIntentEvent('lead_form_abandoned', { listing_id: listing.id, source: 'mobile', metadata: { surface: 'price_tracker', listing_kind: listing.listing_kind } }, auth.isSignedIn ? auth.getToken : undefined)
    }
    wasOpenRef.current = false
  }, [auth.getToken, auth.isSignedIn, listing.id, listing.listing_kind, open, submitted])

  useEffect(() => {
    if (!open) return undefined

    let cancelled = false
    editedPriceFieldsRef.current = new Set()

    async function loadPrefill() {
      setSubmitted(false)
      setError(null)
      setTargetPrice(String(Math.round(listing.price * 0.97)))
      setBudgetMax('')
      setShowPriceOptionalDetails(false)

      if (!auth.isSignedIn) return

      let loadedUser: CurrentUser | null = null
      setName((current) => current || auth.userName || '')
      setEmail((current) => current || auth.userEmail || '')
      if (!auth.getToken) return

      try {
        const result = await fetchMe(auth.getToken)
        loadedUser = result.user
        if (!cancelled) {
          prefillPriceField('name', setName, result.user.full_name || auth.userName || '')
          prefillPriceField('email', setEmail, result.user.email || auth.userEmail || '')
          prefillPriceField('phone', setPhone, result.user.phone || '+1671')
        }
      } catch (profileError) {
        console.warn('Unable to prefill price alert contact profile', profileError)
      }

      try {
        const searchResult = await fetchSearchProfile(auth.getToken)
        const saved = searchResult.search_profile
        if (!cancelled) {
          prefillPriceField('phone', setPhone, saved.phone || loadedUser?.phone || '+1671')
          prefillPriceField('prequalifiedStatus', setPrequalifiedStatus, saved.prequalified_status || '')
          prefillPriceField('purchaseTimeline', setPurchaseTimeline, saved.purchase_timeline || '')
          prefillPriceField('lenderName', setLenderName, saved.lender_name || '')
          prefillPriceField('budgetMin', setBudgetMin, profileBudgetValue(saved, 'budget_min'))
          prefillPriceField('budgetMax', setBudgetMax, profileBudgetValue(saved, 'budget_max'))
          prefillPriceField('buyerStatus', setBuyerStatus, saved.buyer_status || '')
          prefillPriceField('alreadyWorkingWithAgent', setAlreadyWorkingWithAgent, saved.already_working_with_agent || '')
        }
      } catch (profileError) {
        console.warn('Unable to prefill price alert search profile', profileError)
      }
    }

    loadPrefill()
    return () => { cancelled = true }
  }, [auth.getToken, auth.isSignedIn, auth.userEmail, auth.userName, listing.price, open])

  async function handleSubmit() {
    const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
    if (!email.trim() || !emailValid) {
      setError('Please add a valid email for this price watch request.')
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      const token = await currentLeadIntentSessionToken()
      await createLead({
        listing_id: listing.id,
        lead_type: 'price_tracker',
        name: name.trim() || 'Hafa Homes user',
        email: email.trim(),
        phone: phone.trim(),
        preferred_contact_method: 'email',
        target_price: targetPrice.trim(),
        source_url: `hafahomes:///listings/${listing.id}`,
        requested_agent_id: requestedAgent?.id,
        prequalified_status: prequalifiedStatus,
        lender_name: lenderName.trim(),
        purchase_timeline: purchaseTimeline,
        budget_min: budgetMin.trim(),
        budget_max: budgetMax.trim(),
        buyer_status: buyerStatus,
        already_working_with_agent: alreadyWorkingWithAgent,
        intent_session_token: token || undefined,
        message: `Target price: ${targetPrice.trim()}\n\nListing: ${listing.title} — ${listing.address}, ${listing.village.name}`,
      }, auth.isSignedIn ? auth.getToken : undefined, auth.userId)
      setSubmitted(true)
    } catch (submitError) {
      console.warn('Unable to submit price watch request', submitError)
      setError(submitError instanceof Error ? submitError.message : 'We could not send this price watch request yet.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.sheetBackdrop}>
        <Pressable style={styles.sheetScrim} onPress={onClose} />
        <View style={styles.requestSheet}>
          {submitted ? (
            <View style={styles.requestSuccess}>
              <Text style={styles.kicker}>Price watch request sent</Text>
              <Text style={styles.requestTitle}>Your target price is with the team.</Text>
              <Text style={styles.requestCopy}>The brokerage team can follow up when price activity matters for {listing.title}.</Text>
              <Pressable style={styles.primaryCta} onPress={onClose}><Text style={styles.primaryCtaText}>Done</Text></Pressable>
            </View>
          ) : (
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <View style={styles.sheetHandle} />
              <View style={styles.sheetHeaderRow}>
                <View style={styles.sheetHeaderCopy}>
                  <Text style={styles.kicker}>Price watch request</Text>
                  <Text style={styles.requestTitle}>Set a target price</Text>
                </View>
                <Pressable onPress={onClose} style={styles.sheetCloseButton}><Text style={styles.sheetCloseText}>×</Text></Pressable>
              </View>
              <View style={styles.requestListingSummary}>
                <Text style={styles.requestListingPrice}>{currency(listing.price, listing.listing_kind)}</Text>
                <Text numberOfLines={1} style={styles.requestListingTitle}>{listing.title}</Text>
                <Text numberOfLines={1} style={styles.cardMeta}>{listing.village.name} · {listing.address}</Text>
                <Text numberOfLines={1} style={styles.cardMeta}>Preferred agent: {requestedAgent?.name || 'Brokerage team'}</Text>
              </View>
              <View style={styles.requestFieldGroup}>
                <RequestInput label="Target price" value={targetPrice} onChangeText={(value) => { markPriceFieldEdited('targetPrice'); setTargetPrice(value) }} placeholder="750000" keyboardType="number-pad" />
                <RequestInput label="Email" value={email} onChangeText={(value) => { markPriceFieldEdited('email'); setEmail(value) }} placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none" />
                <RequestInput label="Name" value={name} onChangeText={(value) => { markPriceFieldEdited('name'); setName(value) }} placeholder="Your name" />
                <RequestInput label="Phone optional" value={phone} onChangeText={(value) => { markPriceFieldEdited('phone'); setPhone(value) }} placeholder="+1671" keyboardType="phone-pad" />
                <Pressable style={styles.optionalDetailsToggle} onPress={() => setShowPriceOptionalDetails((current) => !current)} accessibilityRole="button" accessibilityState={{ expanded: showPriceOptionalDetails }}>
                  <View style={styles.optionalDetailsCopy}>
                    <Text style={styles.optionalDetailsTitle}>Tell the team more</Text>
                    <Text style={styles.optionalDetailsSubtitle}>Optional search and readiness details</Text>
                  </View>
                  <Text style={styles.optionalDetailsIcon}>{showPriceOptionalDetails ? '−' : '+'}</Text>
                </Pressable>
                {showPriceOptionalDetails && (
                  <View style={styles.optionalDetailsFields}>
                    <QualificationChoiceGroup label="Prequalified?" options={prequalifiedOptions} value={prequalifiedStatus} onChange={(value) => { markPriceFieldEdited('prequalifiedStatus'); setPrequalifiedStatus(value) }} />
                    <QualificationChoiceGroup label="Timeline" options={purchaseTimelineOptions} value={purchaseTimeline} onChange={(value) => { markPriceFieldEdited('purchaseTimeline'); setPurchaseTimeline(value) }} />
                    <QualificationChoiceGroup label="Buyer type" options={buyerStatusOptions} value={buyerStatus} onChange={(value) => { markPriceFieldEdited('buyerStatus'); setBuyerStatus(value) }} />
                    <QualificationChoiceGroup label="Working with an agent?" options={agentRelationshipOptions} value={alreadyWorkingWithAgent} onChange={(value) => { markPriceFieldEdited('alreadyWorkingWithAgent'); setAlreadyWorkingWithAgent(value) }} />
                    <RequestInput label="Lender / bank optional" value={lenderName} onChangeText={(value) => { markPriceFieldEdited('lenderName'); setLenderName(value) }} placeholder="Bank of Guam, Coast360..." />
                    <RequestInput label="Budget min" value={budgetMin} onChangeText={(value) => { markPriceFieldEdited('budgetMin'); setBudgetMin(value) }} placeholder="450000" keyboardType="number-pad" />
                    <RequestInput label="Budget max optional" value={budgetMax} onChangeText={(value) => { markPriceFieldEdited('budgetMax'); setBudgetMax(value) }} placeholder={targetPrice || '650000'} keyboardType="number-pad" />
                  </View>
                )}
              </View>
              {error && <Text style={styles.requestError}>{error}</Text>}
              <Pressable disabled={submitting} style={[styles.primaryCta, submitting && styles.ctaDisabled]} onPress={handleSubmit}>
                <Text style={styles.primaryCtaText}>{submitting ? 'Sending request...' : 'Send price watch request'}</Text>
              </Pressable>
            </ScrollView>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

function QualificationChoiceGroup({ label, options, value, onChange }: { label: string; options: Array<{ value: string; label: string }>; value: string; onChange: (value: string) => void }) {
  return (
    <View>
      <Text style={styles.requestLabel}>{label}</Text>
      <View style={styles.qualificationChoiceRow}>
        {options.map((option) => (
          <Pressable key={option.value || 'blank'} onPress={() => onChange(option.value)} style={[styles.qualificationChoice, value === option.value && styles.qualificationChoiceActive]} accessibilityRole="button">
            <Text style={[styles.qualificationChoiceText, value === option.value && styles.qualificationChoiceTextActive]}>{option.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  )
}

function RequestInput({ label, value, onChangeText, placeholder = '', keyboardType, autoCapitalize, secureTextEntry, labelStyle }: { label: string; value: string; onChangeText: (value: string) => void; placeholder?: string; keyboardType?: 'default' | 'email-address' | 'phone-pad' | 'number-pad'; autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters'; secureTextEntry?: boolean; labelStyle?: object }) {
  return (
    <View>
      <Text style={[styles.requestLabel, labelStyle]}>{label}</Text>
      <TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor="#7b8a84" keyboardType={keyboardType} autoCapitalize={autoCapitalize} secureTextEntry={secureTextEntry} style={styles.requestInput} />
    </View>
  )
}

function CenteredState({ label, loading = false }: { label: string; loading?: boolean }) {
  return (
    <View style={styles.centeredState}>
      {loading && <ActivityIndicator color="#0f3d35" />}
      <Text style={styles.centeredText}>{label}</Text>
    </View>
  )
}

const colors = {
  green: '#0f3d35',
  green2: '#0f705e',
  mint: '#e9f5ef',
  sand: '#f6f1e8',
  amber: '#e99f3e',
  ink: '#17211f',
  muted: '#53645f',
  line: '#d7ded9',
}

const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: colors.green },
  header: { backgroundColor: colors.green, paddingHorizontal: 18, paddingBottom: 16, paddingTop: 12 },
  brandRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', gap: 12, marginBottom: 16 },
  brandIdentity: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: 12, minWidth: 0 },
  brandMark: { alignItems: 'center', backgroundColor: '#0b312b', borderRadius: 18, height: 52, justifyContent: 'center', overflow: 'hidden', width: 52 },
  brandMarkImage: { height: 52, width: 52 },
  brandMarkText: { color: colors.amber, fontSize: 18, fontWeight: '900' },
  brandTitle: { color: 'white', fontSize: 28, fontWeight: '900', letterSpacing: -0.8 },
  brandSubtitle: { color: '#bdebdc', fontSize: 12, fontWeight: '700', marginTop: 2, textTransform: 'uppercase' },
  headerSignInPill: { alignItems: 'center', backgroundColor: 'white', borderRadius: 999, justifyContent: 'center', paddingHorizontal: 14, paddingVertical: 10 },
  headerSignInText: { color: colors.green, fontSize: 12, fontWeight: '900' },
  headerAccountPill: { alignItems: 'center', backgroundColor: 'white', borderColor: 'rgba(255,255,255,0.28)', borderRadius: 999, borderWidth: 1, height: 40, justifyContent: 'center', width: 40 },
  headerAccountInitial: { color: colors.green, fontSize: 15, fontWeight: '900' },
  searchBar: { alignItems: 'center', backgroundColor: 'white', borderRadius: 24, flexDirection: 'row', gap: 10, minHeight: 56, paddingHorizontal: 16 },
  searchIcon: { color: colors.muted, fontSize: 24 },
  searchInput: { color: colors.ink, flex: 1, fontSize: 16, fontWeight: '700' },
  segmentedControl: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 22, flexDirection: 'row', gap: 6, marginTop: 12, padding: 5 },
  segmentButton: { borderRadius: 17, flex: 1, paddingVertical: 11 },
  segmentButtonActive: { backgroundColor: 'white' },
  segmentText: { color: 'rgba(255,255,255,0.75)', fontSize: 16, fontWeight: '900', textAlign: 'center' },
  segmentTextActive: { color: colors.green },
  resultCount: { color: 'rgba(255,255,255,0.72)', fontSize: 12, fontWeight: '900', letterSpacing: 2, paddingHorizontal: 8, textTransform: 'uppercase' },
  content: { backgroundColor: colors.sand, flex: 1 },
  fullMapContent: { backgroundColor: '#9fd2eb' },
  listContent: { gap: 14, padding: 16, paddingBottom: 96 },
  listHeaderStack: { gap: 12 },
  screenIntro: { backgroundColor: 'white', borderRadius: 28, padding: 18 },
  demoInventoryNotice: { backgroundColor: '#fff8ea', borderColor: '#e7c88f', borderRadius: 20, borderWidth: 1, padding: 14 },
  demoInventoryTitle: { color: '#5f4826', fontSize: 13, fontWeight: '900' },
  demoInventoryCopy: { color: '#705a36', fontSize: 12, fontWeight: '700', lineHeight: 18, marginTop: 4 },
  demoMapNotice: { alignSelf: 'center', backgroundColor: 'rgba(255,248,234,0.96)', borderColor: '#e7c88f', borderRadius: 999, borderWidth: 1, left: 22, paddingHorizontal: 12, paddingVertical: 7, position: 'absolute', right: 22, top: 92 },
  demoMapNoticeText: { color: '#5f4826', fontSize: 11, fontWeight: '900', textAlign: 'center' },
  kicker: { color: colors.green2, fontSize: 11, fontWeight: '900', letterSpacing: 2.2, textTransform: 'uppercase' },
  screenTitle: { color: colors.ink, fontSize: 30, fontWeight: '900', letterSpacing: -1.1, marginTop: 5 },
  screenCopy: { color: colors.muted, fontSize: 14, fontWeight: '600', lineHeight: 21, marginTop: 8 },
  card: { backgroundColor: 'white', borderRadius: 28, overflow: 'hidden', shadowColor: colors.green, shadowOpacity: 0.08, shadowRadius: 18, shadowOffset: { width: 0, height: 8 } },
  cardImage: { backgroundColor: '#dbe8df', height: 190, width: '100%' },
  cardBody: { padding: 16 },
  cardTopRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  price: { color: colors.ink, fontSize: 24, fontWeight: '900', letterSpacing: -0.8 },
  saveButton: { alignItems: 'center', borderColor: colors.line, borderRadius: 18, borderWidth: 1, height: 36, justifyContent: 'center', width: 36 },
  saveButtonActive: { backgroundColor: colors.mint, borderColor: colors.green },
  saveText: { color: colors.muted, fontSize: 22, fontWeight: '900' },
  saveTextActive: { color: colors.green },
  cardTitle: { color: colors.ink, fontSize: 18, fontWeight: '800', marginTop: 4 },
  cardMeta: { color: colors.muted, fontSize: 13, fontWeight: '700', lineHeight: 19, marginTop: 5 },
  cardStats: { color: '#324640', fontSize: 13, fontWeight: '800', marginTop: 10 },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 12 },
  pill: { backgroundColor: colors.mint, borderRadius: 999, color: colors.green2, fontSize: 11, fontWeight: '900', overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 6 },
  tabBar: { backgroundColor: 'rgba(255,255,255,0.96)', borderTopColor: 'rgba(0,0,0,0.08)', borderTopWidth: 1, flexDirection: 'row', paddingBottom: 4, paddingTop: 5 },
  tabButton: { alignItems: 'center', borderRadius: 18, flex: 1, gap: 1, height: 60, justifyContent: 'center', marginHorizontal: 3, paddingBottom: 2, paddingTop: 2 },
  tabButtonActive: { backgroundColor: colors.mint },
  tabIndicator: { backgroundColor: 'transparent', borderRadius: 999, height: 3, marginBottom: 2, width: 24 },
  tabIndicatorActive: { backgroundColor: colors.green },
  tabIcon: { color: colors.muted, fontSize: 22, fontWeight: '800', lineHeight: 25, textAlign: 'center' },
  tabLabel: { color: colors.muted, fontSize: 11, fontWeight: '800', lineHeight: 14, textAlign: 'center' },
  tabActive: { color: colors.green },
  centeredState: { alignItems: 'center', flex: 1, gap: 12, justifyContent: 'center', padding: 24 },
  centeredText: { color: colors.muted, fontSize: 15, fontWeight: '700', lineHeight: 22, textAlign: 'center' },
  mapScreen: { flex: 1 },
  nativeMapFrame: { backgroundColor: '#9fd2eb', flex: 1, overflow: 'hidden' },
  nativeMap: { flex: 1 },
  mapFallback: { alignItems: 'center', backgroundColor: '#9fd2eb', flex: 1, justifyContent: 'center', padding: 28 },
  mapOverlay: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.94)', borderRadius: 24, flexDirection: 'row', justifyContent: 'space-between', left: 14, padding: 14, position: 'absolute', right: 14, top: 14 },
  mapOverlayFull: { top: 12 },
  mapTitle: { color: colors.ink, fontSize: 20, fontWeight: '900' },
  mapOverlayHint: { color: colors.muted, fontSize: 11, fontWeight: '800', marginTop: 2 },
  mapOverlayActions: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  mapCount: { backgroundColor: colors.mint, borderRadius: 999, color: colors.green, fontSize: 13, fontWeight: '900', overflow: 'hidden', paddingHorizontal: 12, paddingVertical: 8 },
  mapFullButton: { backgroundColor: colors.green, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 9 },
  mapFullButtonText: { color: 'white', fontSize: 12, fontWeight: '900' },
  mapCanvasTitle: { color: colors.green, fontSize: 20, fontWeight: '900', textAlign: 'center' },
  mapCanvasCopy: { color: colors.muted, fontSize: 14, fontWeight: '700', lineHeight: 21, marginTop: 8, textAlign: 'center' },
  mapLoadingOverlay: { alignItems: 'center', backgroundColor: 'rgba(159,210,235,0.76)', bottom: 0, justifyContent: 'center', left: 0, position: 'absolute', right: 0, top: 0 },
  mapLoadingCard: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.94)', borderRadius: 28, maxWidth: 260, padding: 20, shadowColor: colors.green, shadowOpacity: 0.12, shadowRadius: 18, shadowOffset: { width: 0, height: 8 } },
  mapLoadingTitle: { color: colors.ink, fontSize: 18, fontWeight: '900', marginTop: 10 },
  mapLoadingCopy: { color: colors.muted, fontSize: 13, fontWeight: '700', lineHeight: 19, marginTop: 4, textAlign: 'center' },
  mapPreviewCard: { backgroundColor: 'white', borderRadius: 28, bottom: 16, flexDirection: 'row', gap: 12, left: 14, padding: 12, position: 'absolute', right: 14, shadowColor: colors.green, shadowOpacity: 0.18, shadowRadius: 22, shadowOffset: { width: 0, height: 10 } },
  mapPreviewImage: { backgroundColor: '#dbe8df', borderRadius: 20, height: 104, width: 104 },
  mapPreviewBody: { flex: 1, minWidth: 0 },
  mapPreviewPrice: { color: colors.ink, fontSize: 20, fontWeight: '900', letterSpacing: -0.6 },
  mapPreviewActions: { alignItems: 'center', flexDirection: 'row', gap: 7 },
  mapPreviewClose: { alignItems: 'center', backgroundColor: colors.sand, borderRadius: 999, height: 34, justifyContent: 'center', width: 34 },
  mapPreviewCloseText: { color: colors.muted, fontSize: 24, fontWeight: '700', lineHeight: 28 },
  mapPreviewCta: { alignItems: 'center', backgroundColor: colors.green, borderRadius: 16, marginTop: 10, paddingVertical: 10 },
  mapPreviewCtaText: { color: 'white', fontSize: 13, fontWeight: '900' },
  mapMarker: { backgroundColor: colors.green, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9, shadowColor: colors.green, shadowOpacity: 0.25, shadowRadius: 16, shadowOffset: { width: 0, height: 8 } },
  mapMarkerText: { color: 'white', fontSize: 13, fontWeight: '900' },
  agentCard: { alignItems: 'center', backgroundColor: 'white', borderRadius: 22, flexDirection: 'row', gap: 12, padding: 14 },
  agentAvatar: { alignItems: 'center', backgroundColor: colors.green, borderRadius: 20, height: 44, justifyContent: 'center', width: 44 },
  agentInitial: { color: colors.amber, fontSize: 18, fontWeight: '900' },
  agentInfo: { flex: 1 },
  agentName: { color: colors.ink, fontSize: 16, fontWeight: '900' },
  agentMeta: { color: colors.muted, fontSize: 12, fontWeight: '700', marginTop: 2 },
  agentCta: { color: colors.green2, fontSize: 13, fontWeight: '900' },
  agentDirectoryCard: { backgroundColor: 'white', borderColor: 'rgba(15,61,53,0.08)', borderRadius: 26, borderWidth: 1, gap: 12, marginBottom: 12, padding: 16 },
  agentDirectoryCardActive: { borderColor: colors.green2, shadowColor: colors.green, shadowOpacity: 0.12, shadowRadius: 14, shadowOffset: { width: 0, height: 8 } },
  agentDirectoryHeader: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  agentDirectoryAvatar: { alignItems: 'center', backgroundColor: colors.green, borderRadius: 22, height: 56, justifyContent: 'center', overflow: 'hidden', width: 56 },
  agentDirectoryPhoto: { height: '100%', width: '100%' },
  agentBio: { color: colors.muted, fontSize: 13, fontWeight: '700', lineHeight: 20 },
  agentDetailHeaderTitle: { color: 'white', fontSize: 16, fontWeight: '900' },
  agentDetailContent: { backgroundColor: colors.sand, gap: 14, padding: 16, paddingBottom: 32 },
  agentDetailHero: { alignItems: 'center', backgroundColor: colors.green, borderRadius: 30, padding: 24 },
  agentDetailAvatar: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 30, height: 88, justifyContent: 'center', overflow: 'hidden', width: 88 },
  agentDetailInitial: { color: colors.amber, fontSize: 28, fontWeight: '900' },
  agentDetailKicker: { color: colors.mint, fontSize: 11, fontWeight: '900', letterSpacing: 1.8, marginTop: 16, textTransform: 'uppercase' },
  agentDetailName: { color: 'white', fontSize: 30, fontWeight: '900', letterSpacing: -0.9, marginTop: 6, textAlign: 'center' },
  agentDetailBrokerage: { color: 'rgba(255,255,255,0.76)', fontSize: 14, fontWeight: '800', marginTop: 5 },
  agentDetailLicense: { color: 'rgba(255,255,255,0.54)', fontSize: 11, fontWeight: '900', letterSpacing: 1, marginTop: 5, textTransform: 'uppercase' },
  agentDetailCard: { backgroundColor: 'white', borderRadius: 26, padding: 18 },
  agentDetailContact: { color: colors.green, fontSize: 13, fontWeight: '800', lineHeight: 20, marginTop: 14 },
  agentRoutingNote: { backgroundColor: colors.sand, borderRadius: 18, color: colors.muted, fontSize: 12, fontWeight: '700', lineHeight: 18, marginTop: 14, padding: 13 },
  agentListingsTitle: { color: colors.ink, fontSize: 24, fontWeight: '900', letterSpacing: -0.7, marginTop: 5 },
  agentEmptyCopy: { color: colors.muted, fontSize: 14, fontWeight: '700', lineHeight: 21, marginTop: 18 },
  agentListingRow: { alignItems: 'center', borderColor: '#e3ebe6', borderRadius: 20, borderWidth: 1, flexDirection: 'row', gap: 12, marginTop: 12, overflow: 'hidden', padding: 10 },
  agentListingImage: { backgroundColor: '#dbe8df', borderRadius: 14, height: 72, width: 82 },
  agentListingBody: { flex: 1, minWidth: 0 },
  agentListingPrice: { color: colors.green, fontSize: 15, fontWeight: '900' },
  agentListingTitle: { color: colors.ink, fontSize: 14, fontWeight: '900', lineHeight: 18, marginTop: 3 },
  agentListingArrow: { color: colors.green2, fontSize: 28, fontWeight: '700' },
  selectedAgentCta: { backgroundColor: colors.mint },
  selectedAgentCtaText: { color: colors.green },
  agentChoiceList: { gap: 8, marginTop: 12 },
  agentChoice: { backgroundColor: 'white', borderColor: '#d7e5de', borderRadius: 18, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12 },
  agentChoiceActive: { backgroundColor: colors.mint, borderColor: colors.green2 },
  agentChoiceText: { color: colors.ink, fontSize: 14, fontWeight: '900' },
  agentChoiceTextActive: { color: colors.green },
  featureRow: { alignItems: 'center', backgroundColor: 'white', borderRadius: 18, flexDirection: 'row', gap: 10, padding: 14 },
  featureBullet: { color: colors.green2, fontSize: 16, fontWeight: '900' },
  featureText: { color: colors.ink, fontSize: 15, fontWeight: '800' },
  moreHeroCard: { backgroundColor: colors.green, borderRadius: 30, gap: 10, padding: 20, shadowColor: colors.green, shadowOpacity: 0.18, shadowRadius: 20, shadowOffset: { width: 0, height: 10 } },
  moreHeroKicker: { color: colors.mint, fontSize: 11, fontWeight: '900', letterSpacing: 1.8, textTransform: 'uppercase' },
  moreHeroTitle: { color: 'white', fontSize: 28, fontWeight: '900', letterSpacing: -0.8 },
  moreHeroCopy: { color: 'rgba(255,255,255,0.76)', fontSize: 14, fontWeight: '700', lineHeight: 21 },
  moreHeroCta: { alignItems: 'center', backgroundColor: 'white', borderRadius: 22, marginTop: 8, paddingVertical: 14 },
  moreHeroCtaText: { color: colors.green, fontSize: 15, fontWeight: '900' },
  moreMenuSection: { gap: 10, marginTop: 16 },
  moreMenuItem: { alignItems: 'center', backgroundColor: 'white', borderRadius: 24, flexDirection: 'row', gap: 14, padding: 16, shadowColor: colors.green, shadowOpacity: 0.05, shadowRadius: 14, shadowOffset: { width: 0, height: 6 } },
  moreMenuMark: { alignItems: 'center', backgroundColor: colors.mint, borderRadius: 16, height: 46, justifyContent: 'center', width: 46 },
  moreMenuMarkText: { color: colors.green2, fontSize: 11, fontWeight: '900', letterSpacing: 0.4 },
  moreMenuCopy: { flex: 1, gap: 4 },
  moreMenuTitle: { color: colors.ink, fontSize: 18, fontWeight: '900', letterSpacing: -0.3 },
  moreMenuDescription: { color: colors.muted, fontSize: 13, fontWeight: '700', lineHeight: 18 },
  moreMenuArrow: { color: colors.green2, fontSize: 32, fontWeight: '300', lineHeight: 34 },
  moreSectionLabel: { color: colors.green2, fontSize: 11, fontWeight: '900', letterSpacing: 1.7, marginBottom: 2, textTransform: 'uppercase' },
  resourceRow: { alignItems: 'center', backgroundColor: 'white', borderRadius: 20, flexDirection: 'row', gap: 12, padding: 15 },
  resourceBullet: { backgroundColor: colors.green2, borderRadius: 999, height: 9, width: 9 },
  resourceText: { color: colors.ink, fontSize: 16, fontWeight: '900' },
  profileScreenHeader: { gap: 8, marginBottom: 4 },
  profileBackButton: { alignSelf: 'flex-start', backgroundColor: 'white', borderRadius: 999, paddingHorizontal: 16, paddingVertical: 10 },
  profileBackText: { color: colors.green, fontSize: 14, fontWeight: '900' },
  profileSettingsStack: { gap: 12 },
  profileDetailsPanel: { backgroundColor: 'white', borderColor: '#eadfce', borderRadius: 28, borderWidth: 1, gap: 12, padding: 16 },
  profileActionsPanel: { backgroundColor: 'white', borderColor: '#eadfce', borderRadius: 24, borderWidth: 1, gap: 12, padding: 16 },
  profileSectionTitle: { color: colors.ink, fontSize: 20, fontWeight: '900', letterSpacing: -0.4 },
  profileSectionCopy: { color: colors.muted, fontSize: 13, fontWeight: '700', lineHeight: 19 },
  searchProfileMeter: { backgroundColor: colors.mint, borderRadius: 20, gap: 6, padding: 12 },
  searchProfileMeterKicker: { color: colors.green2, fontSize: 11, fontWeight: '900', letterSpacing: 1.6, textTransform: 'uppercase' },
  profileErrorText: { color: '#b91c1c', fontSize: 13, fontWeight: '800', lineHeight: 18 },
  deleteAccountPanel: { backgroundColor: '#fff8f6', borderColor: '#fecaca', borderRadius: 24, borderWidth: 1, gap: 10, padding: 16 },
  deleteAccountTitle: { color: '#7f1d1d', fontSize: 20, fontWeight: '900', letterSpacing: -0.4 },
  deleteAccountCopy: { color: '#7c4a43', fontSize: 13, fontWeight: '700', lineHeight: 19 },
  accountCard: { backgroundColor: colors.green, borderRadius: 26, gap: 10, marginBottom: 12, padding: 18 },
  accountKicker: { color: colors.mint, fontSize: 12, fontWeight: '900', letterSpacing: 1.8, textTransform: 'uppercase' },
  accountTitle: { color: 'white', fontSize: 22, fontWeight: '900', letterSpacing: -0.5 },
  accountCopy: { color: 'rgba(255,255,255,0.78)', fontSize: 14, fontWeight: '700', lineHeight: 21 },
  profileForm: { backgroundColor: 'rgba(255,255,255,0.08)', borderColor: 'rgba(255,255,255,0.14)', borderRadius: 22, borderWidth: 1, gap: 10, padding: 14 },
  fieldLabel: { color: colors.mint, fontSize: 11, fontWeight: '900', letterSpacing: 1.1, marginTop: 2, textTransform: 'uppercase' },
  profileFieldLabel: { color: colors.mint },
  segmentRow: { backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 18, flexDirection: 'row', gap: 6, padding: 5 },
  segmentOption: { alignItems: 'center', borderRadius: 14, flex: 1, paddingVertical: 10 },
  segmentOptionActive: { backgroundColor: 'white' },
  segmentOptionText: { color: 'rgba(255,255,255,0.72)', fontSize: 13, fontWeight: '900' },
  segmentOptionTextActive: { color: colors.green },
  dangerZone: { backgroundColor: 'rgba(255,255,255,0.08)', borderColor: 'rgba(255,255,255,0.14)', borderRadius: 22, borderWidth: 1, gap: 8, marginTop: 6, padding: 14 },
  dangerTitle: { color: '#fee2e2', fontSize: 16, fontWeight: '900' },
  dangerCopy: { color: 'rgba(255,255,255,0.74)', fontSize: 13, fontWeight: '700', lineHeight: 19 },
  dangerError: { color: '#fecaca', fontSize: 13, fontWeight: '800', lineHeight: 18 },
  dangerCta: { alignItems: 'center', backgroundColor: '#fee2e2', borderRadius: 18, marginTop: 4, paddingVertical: 12 },
  dangerCtaText: { color: '#7f1d1d', fontSize: 14, fontWeight: '900' },
  authModalShell: { backgroundColor: colors.sand, flex: 1 },
  authKeyboard: { flex: 1 },
  authHeader: { alignItems: 'flex-start', flexDirection: 'row', justifyContent: 'space-between', padding: 20, paddingBottom: 12 },
  authEyebrow: { color: colors.green2, fontSize: 11, fontWeight: '900', letterSpacing: 1.8, marginBottom: 4, textTransform: 'uppercase' },
  authTitle: { color: colors.ink, flexShrink: 1, fontSize: 28, fontWeight: '900', letterSpacing: -0.8, maxWidth: 260 },
  authCloseButton: { backgroundColor: 'white', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 10 },
  authClose: { color: colors.green, fontSize: 15, fontWeight: '900' },
  authBody: { gap: 14, padding: 20, paddingBottom: 42 },
  authHeroCard: { backgroundColor: colors.green, borderRadius: 28, gap: 8, padding: 18 },
  authHeroTitle: { color: 'white', fontSize: 25, fontWeight: '900', letterSpacing: -0.7 },
  authHeroCopy: { color: 'rgba(255,255,255,0.78)', fontSize: 14, fontWeight: '700', lineHeight: 21 },
  authIntro: { color: colors.muted, fontSize: 14, fontWeight: '700', lineHeight: 21 },
  authModeTabs: { backgroundColor: '#e9dfcf', borderRadius: 20, flexDirection: 'row', gap: 6, padding: 5 },
  authModeTab: { alignItems: 'center', borderRadius: 16, flex: 1, paddingVertical: 11 },
  authModeTabActive: { backgroundColor: 'white' },
  authModeText: { color: colors.muted, fontSize: 14, fontWeight: '900' },
  authModeTextActive: { color: colors.green },
  nativeAppleButtonWrap: { height: 54 },
  nativeAppleButton: { height: 54, width: '100%' },
  socialCta: { alignItems: 'center', backgroundColor: 'white', borderColor: '#eadfce', borderRadius: 20, borderWidth: 1, flexDirection: 'row', gap: 12, justifyContent: 'center', padding: 15 },
  socialCtaMark: { alignItems: 'center', backgroundColor: colors.sand, borderRadius: 999, height: 28, justifyContent: 'center', width: 28 },
  socialCtaMarkText: { color: colors.green, fontSize: 14, fontWeight: '900' },
  socialCtaText: { color: colors.ink, fontSize: 15, fontWeight: '900' },
  authDividerRow: { alignItems: 'center', flexDirection: 'row', gap: 10, marginVertical: 2 },
  authDividerLine: { backgroundColor: '#eadfce', flex: 1, height: 1 },
  authDividerText: { color: colors.muted, fontSize: 11, fontWeight: '900', letterSpacing: 1, textTransform: 'uppercase' },
  authFormCard: { backgroundColor: 'white', borderRadius: 28, gap: 13, padding: 16 },
  authMessage: { color: colors.muted, fontSize: 13, fontWeight: '800', lineHeight: 19 },
  localIntelCard: { backgroundColor: colors.mint, borderColor: '#cfe2d9', borderRadius: 26, borderWidth: 1, marginTop: 24, padding: 16 },
  localIntelHeader: { alignItems: 'flex-start', flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  localIntelTitle: { color: colors.ink, fontSize: 24, fontWeight: '900', letterSpacing: -0.8, marginTop: 4 },
  localIntelRegion: { backgroundColor: 'white', borderRadius: 999, color: colors.green, fontSize: 11, fontWeight: '900', overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 7, textTransform: 'uppercase' },
  localIntelSummary: { color: colors.muted, fontSize: 14, fontWeight: '700', lineHeight: 21, marginTop: 10 },
  localIntelGroup: { backgroundColor: 'rgba(255,255,255,0.72)', borderRadius: 18, marginTop: 12, padding: 12 },
  localIntelGroupTitle: { color: colors.green, fontSize: 13, fontWeight: '900', marginBottom: 7, textTransform: 'uppercase' },
  localIntelBulletRow: { alignItems: 'flex-start', flexDirection: 'row', gap: 8, marginTop: 5 },
  localIntelBullet: { backgroundColor: colors.green2, borderRadius: 999, height: 6, marginTop: 7, width: 6 },
  localIntelBulletText: { color: colors.ink, flex: 1, fontSize: 13, fontWeight: '800', lineHeight: 19 },
  localIntelNote: { color: colors.muted, fontSize: 12, fontWeight: '700', lineHeight: 18, marginTop: 8 },
  localIntelDisclaimer: { color: colors.muted, fontSize: 11, fontWeight: '800', lineHeight: 16, marginTop: 12 },
  detailScroll: { backgroundColor: colors.sand },
  detailContent: { paddingBottom: 28 },
  detailHeader: { alignItems: 'center', backgroundColor: colors.green, flexDirection: 'row', justifyContent: 'space-between', padding: 16 },
  backButton: { backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 10 },
  backButtonText: { color: 'white', fontSize: 14, fontWeight: '900' },
  detailSaveButton: { alignItems: 'center', backgroundColor: 'white', borderRadius: 999, height: 42, justifyContent: 'center', width: 42 },
  detailImageWrap: { backgroundColor: '#dbe8df', position: 'relative' },
  detailImage: { backgroundColor: '#dbe8df', height: 330, width: '100%' },
  photoNavButton: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: 999, height: 44, justifyContent: 'center', position: 'absolute', top: 150, width: 44 },
  photoNavLeft: { left: 14 },
  photoNavRight: { right: 14 },
  photoNavText: { color: colors.green, fontSize: 32, fontWeight: '800', lineHeight: 34 },
  photoCountBadge: { alignSelf: 'center', backgroundColor: 'rgba(15,61,53,0.72)', borderRadius: 999, bottom: 42, paddingHorizontal: 12, paddingVertical: 7, position: 'absolute' },
  photoCountText: { color: 'white', fontSize: 12, fontWeight: '900' },
  detailPanel: { backgroundColor: 'white', borderTopLeftRadius: 32, borderTopRightRadius: 32, marginTop: -26, padding: 20 },
  priceLarge: { color: colors.ink, fontSize: 32, fontWeight: '900', letterSpacing: -1.2 },
  detailTitle: { color: colors.ink, fontSize: 25, fontWeight: '900', letterSpacing: -0.8, marginTop: 6 },
  detailStats: { color: '#324640', fontSize: 15, fontWeight: '900', marginTop: 14 },
  listingFactsCard: { backgroundColor: colors.sand, borderRadius: 20, gap: 7, marginTop: 14, padding: 14 },
  factLine: { color: colors.muted, fontSize: 13, fontWeight: '800' },
  factValue: { color: colors.ink, fontWeight: '900' },
  sectionTitle: { color: colors.green, fontSize: 17, fontWeight: '900', marginTop: 24 },
  detailCopy: { color: colors.muted, fontSize: 15, fontWeight: '600', lineHeight: 24, marginTop: 8 },
  primaryCta: { alignItems: 'center', backgroundColor: colors.green, borderRadius: 20, marginTop: 22, padding: 16 },
  primaryCtaText: { color: 'white', fontSize: 15, fontWeight: '900' },
  ctaDisabled: { opacity: 0.62 },
  secondaryCta: { alignItems: 'center', backgroundColor: colors.mint, borderRadius: 20, marginTop: 10, padding: 16 },
  secondaryCtaText: { color: colors.green, fontSize: 15, fontWeight: '900' },
  calculatorCard: { backgroundColor: colors.mint, borderColor: '#cfe2d9', borderRadius: 24, borderWidth: 1, marginTop: 14, padding: 16 },
  calculatorHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  calculatorTotal: { color: colors.green, fontSize: 30, fontWeight: '900', letterSpacing: -1, marginTop: 4 },
  calculatorBadge: { backgroundColor: 'white', borderRadius: 999, color: colors.green2, fontSize: 11, fontWeight: '900', overflow: 'hidden', paddingHorizontal: 12, paddingVertical: 7, textTransform: 'uppercase' },
  calculatorCopy: { color: colors.muted, fontSize: 12, fontWeight: '700', lineHeight: 18, marginTop: 8 },
  calculatorGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 14 },
  calculatorField: { flexBasis: '47%', flexGrow: 1 },
  calculatorLabel: { color: colors.green, fontSize: 11, fontWeight: '900', marginBottom: 6, textTransform: 'uppercase' },
  calculatorInputShell: { alignItems: 'center', backgroundColor: 'white', borderColor: '#d7e5de', borderRadius: 16, borderWidth: 1, flexDirection: 'row', minHeight: 46, paddingHorizontal: 12 },
  calculatorInput: { color: colors.ink, flex: 1, fontSize: 16, fontWeight: '900', minWidth: 44, paddingVertical: 8 },
  calculatorAffix: { color: colors.muted, fontSize: 13, fontWeight: '900' },
  calculatorBreakdown: { backgroundColor: 'rgba(255,255,255,0.68)', borderRadius: 18, gap: 7, marginTop: 14, padding: 12 },
  breakdownLine: { color: colors.muted, fontSize: 13, fontWeight: '800' },
  breakdownValue: { color: colors.ink, fontWeight: '900' },
  sheetBackdrop: { flex: 1, justifyContent: 'flex-end' },
  sheetScrim: { backgroundColor: 'rgba(9,24,21,0.44)', bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 },
  requestSheet: { backgroundColor: 'white', borderTopLeftRadius: 32, borderTopRightRadius: 32, maxHeight: '86%', padding: 18, paddingBottom: 28 },
  sheetHandle: { alignSelf: 'center', backgroundColor: '#c9d6d0', borderRadius: 999, height: 5, marginBottom: 14, width: 52 },
  sheetHeaderRow: { alignItems: 'flex-start', flexDirection: 'row', justifyContent: 'space-between' },
  sheetHeaderCopy: { flex: 1, paddingRight: 12 },
  sheetCloseButton: { alignItems: 'center', backgroundColor: colors.sand, borderRadius: 999, height: 42, justifyContent: 'center', width: 42 },
  sheetCloseText: { color: colors.muted, fontSize: 28, fontWeight: '700', lineHeight: 32 },
  requestTitle: { color: colors.ink, fontSize: 27, fontWeight: '900', letterSpacing: -0.9, marginTop: 4 },
  requestCopy: { color: colors.muted, fontSize: 15, fontWeight: '700', lineHeight: 23, marginTop: 10 },
  intentSummaryText: { backgroundColor: colors.sand, borderRadius: 16, color: colors.muted, fontSize: 12, fontWeight: '900', letterSpacing: 0.8, lineHeight: 18, marginTop: 12, padding: 12, textTransform: 'uppercase' },
  requestListingSummary: { backgroundColor: colors.sand, borderRadius: 22, marginTop: 16, padding: 14 },
  requestListingPrice: { color: colors.green, fontSize: 23, fontWeight: '900', letterSpacing: -0.7 },
  requestListingTitle: { color: colors.ink, fontSize: 15, fontWeight: '900', marginTop: 3 },
  requestFieldGroup: { gap: 12, marginTop: 16 },
  optionalDetailsToggle: { alignItems: 'center', backgroundColor: colors.sand, borderColor: colors.line, borderRadius: 20, borderWidth: 1, flexDirection: 'row', justifyContent: 'space-between', padding: 14 },
  optionalDetailsCopy: { flex: 1 },
  optionalDetailsTitle: { color: colors.green, fontSize: 15, fontWeight: '900' },
  optionalDetailsSubtitle: { color: colors.muted, fontSize: 12, fontWeight: '700', marginTop: 3 },
  optionalDetailsIcon: { color: colors.green2, fontSize: 24, fontWeight: '700' },
  optionalDetailsFields: { gap: 12 },
  requestLabel: { color: colors.green, fontSize: 11, fontWeight: '900', letterSpacing: 1.1, marginBottom: 6, textTransform: 'uppercase' },
  requestInput: { backgroundColor: colors.sand, borderColor: '#eadfce', borderRadius: 18, borderWidth: 1, color: colors.ink, fontSize: 15, fontWeight: '800', minHeight: 50, paddingHorizontal: 14, paddingVertical: 12 },
  requestMessageInput: { minHeight: 96, textAlignVertical: 'top' },
  contactSegmentRow: { backgroundColor: colors.sand, borderRadius: 18, flexDirection: 'row', gap: 6, padding: 5 },
  contactSegment: { alignItems: 'center', borderRadius: 14, flex: 1, paddingVertical: 10 },
  contactSegmentActive: { backgroundColor: 'white', shadowColor: colors.green, shadowOpacity: 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  contactSegmentText: { color: colors.muted, fontSize: 13, fontWeight: '900', textTransform: 'capitalize' },
  contactSegmentTextActive: { color: colors.green },
  qualificationChoiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  qualificationChoice: { backgroundColor: colors.sand, borderColor: colors.line, borderRadius: 999, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 9 },
  qualificationChoiceActive: { backgroundColor: colors.mint, borderColor: colors.green2 },
  qualificationChoiceText: { color: colors.muted, fontSize: 12, fontWeight: '900' },
  qualificationChoiceTextActive: { color: colors.green2 },
  profilePromptToggle: { backgroundColor: colors.sand, borderColor: colors.line, borderRadius: 18, borderWidth: 1, padding: 13 },
  profilePromptToggleActive: { backgroundColor: colors.mint, borderColor: colors.green2 },
  profilePromptToggleText: { color: colors.muted, fontSize: 13, fontWeight: '800', lineHeight: 18 },
  profilePromptToggleTextActive: { color: colors.green },
  requestError: { color: '#a33b2f', fontSize: 13, fontWeight: '800', lineHeight: 19, marginTop: 12 },
  requestWarning: { backgroundColor: '#fff7ed', borderColor: '#fed7aa', borderRadius: 16, borderWidth: 1, color: '#9a3412', fontSize: 13, fontWeight: '800', lineHeight: 19, marginTop: 12, padding: 12 },
  requestSuccess: { paddingVertical: 20 },
  requestDetailHeader: { gap: 8, marginBottom: 4 },
  requestHistoryCard: { backgroundColor: 'white', borderRadius: 26, marginTop: 12, overflow: 'hidden', shadowColor: colors.green, shadowOpacity: 0.08, shadowRadius: 18, shadowOffset: { width: 0, height: 8 } },
  requestHistoryImage: { backgroundColor: '#dbe8df', height: 170, width: '100%' },
  requestHistoryBody: { padding: 16 },
  requestHistoryStatus: { color: colors.green2, fontSize: 11, fontWeight: '900', letterSpacing: 1.6, textTransform: 'uppercase' },
  requestStatusCard: { backgroundColor: colors.green, borderRadius: 18, marginBottom: 14, padding: 14 },
  requestStatusTitle: { color: 'white', fontSize: 22, fontWeight: '900', letterSpacing: -0.5, marginTop: 5 },
  requestStatusMeta: { color: 'rgba(255,255,255,0.78)', fontSize: 13, fontWeight: '700', lineHeight: 20, marginTop: 6 },
  requestHistoryTitle: { color: colors.ink, fontSize: 20, fontWeight: '900', letterSpacing: -0.4, marginTop: 5 },
  requestHistoryMeta: { color: colors.muted, fontSize: 13, fontWeight: '700', lineHeight: 20, marginTop: 4 },
  requestHistoryMessage: { color: colors.muted, fontSize: 13, fontWeight: '700', lineHeight: 20, marginTop: 12 },
  requestPrivacyCard: { backgroundColor: colors.mint, borderColor: '#cfe2d9', borderRadius: 20, borderWidth: 1, marginTop: 12, padding: 16 },
  showingSummaryCard: { backgroundColor: colors.sand, borderRadius: 16, marginTop: 10, padding: 12 },
})
