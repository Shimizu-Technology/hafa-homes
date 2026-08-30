import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { Map as MapboxMap, Marker as MapboxMarker } from 'mapbox-gl'
import { Link, Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { SignedIn, SignedOut, SignInButton, UserButton } from './components/AuthControls'
import { Brand } from './components/Brand'
import { PostHogPageView, captureAnalyticsEvent } from './providers/PostHogProvider'
import {
  ArrowLeft,
  Bath,
  BedDouble,
  Bell,
  Building2,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock3,
  Compass,
  DatabaseZap,
  Heart,
  Home,
  Info,
  Map,
  MapPin,
  Maximize2,
  Menu,
  Mail,
  ChevronLeft,
  ChevronRight as ChevronRightIcon,
  MessageSquare,
  Phone,
  PanelLeftClose,
  PanelLeftOpen,
  Ruler,
  Search,
  Share2,
  ShieldCheck,
  History,
  SlidersHorizontal,
  TrendingUp,
  UserRound,
  UsersRound,
  Waves,
  X,
} from 'lucide-react'
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query'
import { apiFetch, authHeaders } from './lib/api'
import { routes, safeInternalPath as safeReturnPath } from './lib/routes'
import { datetimeLocalValue, zonedDateTimeToIso } from './lib/dateTime'
import { useAuthContext } from './contexts/AuthContext'
import type { Brokerage } from './contexts/BrokerageContext'
import { groupListingsByVillage } from './lib/mapClusters'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'
const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN
const FALLBACK_LISTING_IMAGE = 'https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?auto=format&fit=crop&w=1400&q=80'
const IOS_APP_STORE_URL = 'https://apps.apple.com/us/app/hafa-homes/id6773042903'
const LEAD_INTENT_SESSION_TOKEN_KEY = 'hafaHomes:leadIntentSessionToken'
const LEAD_INTENT_CONTEXT_REQUIRED_KEY = 'hafaHomes:leadIntentContextRequired'
const MEANINGFUL_LEAD_INTENT_EVENTS = new Set(['listing_detail_viewed', 'listing_saved', 'search_filter_changed', 'map_marker_clicked', 'saved_search_created'])

class ApiFetchError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiFetchError'
    this.status = status
  }
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

function displayErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}

function currentLeadIntentSessionToken() {
  if (typeof window === 'undefined') return ''

  return window.localStorage.getItem(LEAD_INTENT_SESSION_TOKEN_KEY) || ''
}

function leadIntentSessionToken() {
  if (typeof window === 'undefined') return ''

  const existing = currentLeadIntentSessionToken()
  if (existing) return existing

  const token = window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`
  window.localStorage.setItem(LEAD_INTENT_SESSION_TOKEN_KEY, token)
  return token
}

function clearLeadIntentSessionToken() {
  if (typeof window === 'undefined') return

  window.localStorage.removeItem(LEAD_INTENT_SESSION_TOKEN_KEY)
}

function resetLeadIntentSessionToken() {
  clearLeadIntentSessionToken()
  return leadIntentSessionToken()
}

type LeadIntentContextGuard = { token?: string; eventCount: number; meaningfulEventCount: number; startedAt: number }

function markLeadIntentCurrentContextRequired() {
  if (typeof window === 'undefined') return

  window.localStorage.setItem(LEAD_INTENT_CONTEXT_REQUIRED_KEY, JSON.stringify({ eventCount: 0, meaningfulEventCount: 0, startedAt: Date.now() }))
}

function leadIntentCurrentContextGuard(): LeadIntentContextGuard | null {
  if (typeof window === 'undefined') return null

  const raw = window.localStorage.getItem(LEAD_INTENT_CONTEXT_REQUIRED_KEY)
  if (!raw) return null
  if (raw === 'true') return { eventCount: 0, meaningfulEventCount: 0, startedAt: Date.now() }

  try {
    const parsed = JSON.parse(raw) as Partial<LeadIntentContextGuard>
    return { token: parsed.token, eventCount: Number(parsed.eventCount || 0), meaningfulEventCount: Number(parsed.meaningfulEventCount || 0), startedAt: Number(parsed.startedAt || Date.now()) }
  } catch {
    return { eventCount: 0, meaningfulEventCount: 0, startedAt: Date.now() }
  }
}

function saveLeadIntentCurrentContextGuard(guard: LeadIntentContextGuard) {
  if (typeof window === 'undefined') return

  window.localStorage.setItem(LEAD_INTENT_CONTEXT_REQUIRED_KEY, JSON.stringify(guard))
}

function clearLeadIntentCurrentContextRequired() {
  if (typeof window === 'undefined') return

  window.localStorage.removeItem(LEAD_INTENT_CONTEXT_REQUIRED_KEY)
}

function leadIntentCurrentContextRequired() {
  return leadIntentCurrentContextGuard() !== null
}

function noteLeadIntentCurrentContextEvent(sessionToken: string, eventName: string) {
  const guard = leadIntentCurrentContextGuard()
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
    clearLeadIntentCurrentContextRequired()
  } else {
    saveLeadIntentCurrentContextGuard(nextGuard)
  }
}

function leadIntentClientEventId(eventName: string) {
  return `${eventName}:${Date.now()}:${Math.random().toString(36).slice(2)}`
}

async function recordLeadIntentEvent(eventName: string, payload: { listing_id?: number; village_id?: number; agent_id?: number; source?: string; metadata?: Record<string, unknown> } = {}) {
  let sessionToken = leadIntentSessionToken()
  if (!sessionToken) return null
  const clientEventId = leadIntentClientEventId(eventName)

  async function postEvent(token: string) {
    return apiFetch(`${API_URL}/api/v1/lead_intent/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
      body: JSON.stringify({
        lead_intent_event: {
          session_token: token,
          event_name: eventName,
          client_event_id: clientEventId,
          source: payload.source || 'web',
          listing_id: payload.listing_id,
          village_id: payload.village_id,
          agent_id: payload.agent_id,
          metadata: payload.metadata || {},
        },
      }),
    })
  }

  try {
    let response = await postEvent(sessionToken)
    if (response.status === 409) {
      sessionToken = resetLeadIntentSessionToken()
      if (!sessionToken) return null
      response = await postEvent(sessionToken)
    }
    if (!response.ok) return null

    noteLeadIntentCurrentContextEvent(sessionToken, eventName)
    const result = await response.json() as LeadIntentEventResponse
    if (result.prompt?.eligible && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('hafaHomes:leadIntentPrompt', { detail: { prompt: result.prompt, sessionToken } }))
    }
    return result
  } catch (intentError) {
    console.warn('Unable to record Hafa Homes lead intent', intentError)
    return null
  }
}

async function dismissLeadIntentPrompt(promptKey?: string, reason = 'dismissed') {
  const sessionToken = currentLeadIntentSessionToken()
  if (!sessionToken) return

  try {
    const response = await apiFetch(`${API_URL}/api/v1/lead_intent/dismiss`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
      body: JSON.stringify({ lead_intent: { session_token: sessionToken, prompt_key: promptKey, reason } }),
    })
    if (response.status === 409) {
      clearLeadIntentSessionToken()
      markLeadIntentCurrentContextRequired()
    }
  } catch (intentError) {
    console.warn('Unable to dismiss Hafa Homes lead intent prompt', intentError)
  }
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
  region: string
  description?: string
  latitude?: number
  longitude?: number
  local_intel?: LocalIntel
  active_listings_count?: number
}

type Feature = {
  id: number
  name: string
  slug: string
  category: string
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

type Listing = {
  id: number
  external_id?: string
  source?: string
  title: string
  status: string
  listing_kind: 'sale' | 'rent'
  property_type: string
  price: number
  address: string
  village: Village
  beds: number
  baths: number
  square_feet: number
  lot_square_feet?: number
  year_built?: number
  latitude?: number
  longitude?: number
  description?: string
  agent_name?: string
  brokerage_name?: string
  brokerage?: Brokerage | null
  agent?: Agent | null
  primary_photo_url: string
  photos?: { id: number; url: string; position: number; alt_text: string }[]
  features: Feature[]
}

type ListingsResponse = { listings: Listing[] }
type ListingResponse = { listing: Listing }
type VillagesResponse = { villages: Village[] }
type VillageResponse = { village: Village }
type AgentsResponse = { agents: Agent[] }
type AgentDetailResponse = { agent: Agent; attributed_listings: Listing[]; pagination: PaginationMeta }
type SyncRun = {
  id: number
  provider: string
  status: string
  started_at: string
  finished_at: string
  imported_count: number
  updated_count: number
  inactive_count: number
  error_count: number
  notes: string
}
type SyncRunsResponse = { data_sync_runs: SyncRun[] }

type LeadStatus = 'new' | 'contacted' | 'showing_scheduled' | 'nurturing' | 'closed' | 'lost' | 'spam' | 'archived'
type ShowingStatus = 'proposed' | 'confirmed' | 'completed' | 'cancelled' | 'no_show'
type PromptMode = 'growth' | 'balanced' | 'selective'

type NotificationDelivery = {
  id: number
  channel: 'email' | 'sms'
  provider: 'resend' | 'clicksend'
  recipient_role: 'consumer' | 'agent'
  recipient: string
  event_name: string
  subject?: string
  body_preview?: string
  status: 'queued' | 'sending' | 'sent' | 'skipped' | 'failed'
  error_message?: string
  queued_at?: string
  sent_at?: string
  failed_at?: string
  created_at: string
}

type LeadUser = {
  id: number
  full_name: string
  email: string
  role: string
}

type LeadNote = {
  id: number
  lead_id: number
  body: string
  visibility: 'internal'
  archived_at?: string
  author?: LeadUser | null
  archived_by?: LeadUser | null
  created_at: string
  updated_at?: string
}

type LeadTask = {
  id: number
  lead_id: number
  title: string
  notes?: string
  status: 'open' | 'completed' | 'cancelled'
  due_at?: string
  completed_at?: string
  archived_at?: string
  overdue: boolean
  assigned_to?: LeadUser | null
  created_by?: LeadUser | null
  completed_by?: LeadUser | null
  archived_by?: LeadUser | null
  created_at: string
  updated_at?: string
}

type LeadActivity = {
  id: number
  lead_id: number
  action: string
  summary?: string
  metadata?: Record<string, unknown>
  occurred_at: string
  actor?: LeadUser | null
  subject_type?: string
  subject_id?: number
  created_at: string
}

type CrmSummary = {
  open_task_count: number
  overdue_task_count: number
  completed_task_count?: number
  archived_task_count?: number
  note_count?: number
  archived_note_count?: number
  activity_count?: number
  next_task_due_at?: string
  last_activity_at?: string
}

type ShowingAppointment = {
  id: number
  lead_id: number
  listing_id?: number
  brokerage_id?: number
  agent_id?: number | null
  scheduled_starts_at?: string
  scheduled_ends_at?: string
  timezone: string
  tour_type: 'in_person' | 'virtual'
  status: ShowingStatus
  location?: string
  consumer_notes?: string
  internal_notes?: string
  created_at: string
  updated_at?: string
  lead?: Pick<Lead, 'id' | 'lead_type' | 'name' | 'email' | 'phone' | 'status'> | null
  listing?: { id: number; title: string; address?: string; price?: number; listing_kind?: 'sale' | 'rent'; village?: string; primary_photo_url?: string } | null
  brokerage?: Brokerage | null
  agent?: Agent | null
  created_by?: Pick<CurrentUser, 'id' | 'full_name' | 'email' | 'role'> | null
}

type LeadIntentSummary = {
  id?: number
  status?: string
  prompt_mode?: string
  last_seen_at?: string
  converted_at?: string
  requested_agent_id?: number
  requested_agent?: Agent | null
  events_count?: number
  listing_view_count?: number
  unique_listing_view_count?: number
  saved_listing_count?: number
  top_villages?: Array<{ name: string; count: number }>
  viewed_price_min?: number
  viewed_price_max?: number
  latest_listing_id?: number
  latest_listing_title?: string
  form_open_count?: number
  form_abandon_count?: number
  search_filter_count?: number
  agent_selected_count?: number
  narrative?: string | null
}

type LeadIntentPrompt = {
  eligible: boolean
  key?: string
  trigger?: string
  title?: string
  body?: string
  cta?: string
  snooze_hours?: number
  profile_prompt?: boolean
  profile_prompt_kind?: 'finish_search_profile' | 'update_search_profile'
  create_lead_default?: boolean
  suggested?: Partial<SearchProfile> & {
    listing_id?: number
  }
  summary?: LeadIntentSummary
  reason?: string
}

type LeadIntentEventResponse = {
  lead_intent_session: LeadIntentSummary
  lead_intent_event?: { id: number; event_name: string; occurred_at: string }
  prompt: LeadIntentPrompt
}

type AdminLeadIntentEvent = {
  id: number
  event_name: string
  label?: string
  source?: string
  occurred_at: string
  metadata?: Record<string, unknown>
  listing?: { id: number; title: string; price?: number; listing_kind?: 'sale' | 'rent'; village?: string; primary_photo_url?: string } | null
  village?: { id: number; name: string } | null
  agent?: Agent | null
}

type AdminLeadIntentSession = LeadIntentSummary & {
  user?: { id: number; full_name: string; email: string; role: string } | null
  identity_label?: string
  brokerage?: Brokerage | null
  converted_lead?: { id: number; name: string; email: string; status: string } | null
  prompt_snoozed_until?: string
  last_prompt_key?: string
  last_prompt_dismissed_at?: string
  prompt_dismissal_count?: number
  high_intent?: boolean
  recent_events?: AdminLeadIntentEvent[]
}

type AdminLeadIntentSessionsResponse = {
  lead_intent_sessions: AdminLeadIntentSession[]
  metrics: { active_sessions: number; signed_in_sessions: number; high_intent_sessions: number; converted_sessions: number }
  top_villages: Array<{ name: string; count: number }>
  top_listings: Array<{ id: number; title: string; village?: string; price?: number; listing_kind?: 'sale' | 'rent'; primary_photo_url?: string; view_count: number }>
  pagination: PaginationMeta
}

type Lead = {
  id: number
  lead_type: string
  name: string
  email: string
  phone?: string
  preferred_contact_method?: string
  preferred_time?: string
  preferred_tour_date?: string
  tour_type?: string
  target_price?: number
  message?: string
  status: LeadStatus
  quality_status?: string
  quality_score?: number
  quality_label?: string
  has_qualification_details?: boolean
  qualification_summary?: string
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
  qualification_notes?: string
  lead_source?: string
  source_campaign?: string
  source_url?: string
  last_contacted_at?: string
  listing_id?: number
  user_id?: number
  brokerage_id?: number
  requested_agent_id?: number
  assigned_agent_id?: number
  created_at: string
  updated_at?: string
  consumer_status_label?: string
  latest_showing_appointment?: ShowingAppointment | null
  intent_summary?: LeadIntentSummary | null
  showing_appointments?: ShowingAppointment[]
  notification_deliveries?: NotificationDelivery[]
  lead_notes?: LeadNote[]
  lead_tasks?: LeadTask[]
  lead_activities?: LeadActivity[]
  crm_summary?: CrmSummary
  current_search_profile?: SearchProfile | null
  listing?: { id: number; title: string; address?: string; price: number; listing_kind: 'sale' | 'rent'; property_type?: string; village: string; primary_photo_url?: string; brokerage?: Brokerage | null; agent?: Agent | null } | null
  brokerage?: Brokerage | null
  requested_agent?: Agent | null
  assigned_agent?: Agent | null
}

type LeadsResponse = {
  leads: Lead[]
  assignable_agents: Agent[]
  metrics: { open_leads: number; new_leads: number; showing_leads: number; price_watch_leads: number }
  pagination: PaginationMeta
}
type LeadResponse = { lead: Lead; assignable_agents: Agent[] }
type AdminCustomerWorkspaceResponse = {
  customer: {
    id: number
    full_name: string
    email: string
    phone?: string
    preferred_contact_method?: 'phone' | 'text' | 'email'
    account_created_at: string
  }
  brokerage: Brokerage
  search_profile: SearchProfile | null
  requests: Lead[]
  metrics: { total_requests: number; open_requests: number; upcoming_showings: number; last_request_at?: string }
  pagination: PaginationMeta
}
type PaginationMeta = { page: number; per_page: number; total_count: number; total_pages: number; previous_page?: number | null; next_page?: number | null }
type LeadNotesPageResponse = { lead_notes: LeadNote[]; pagination: PaginationMeta }
type LeadTasksPageResponse = { lead_tasks: LeadTask[]; pagination: PaginationMeta }
type LeadActivitiesPageResponse = { lead_activities: LeadActivity[]; pagination: PaginationMeta }
type MyLeadsResponse = { leads: Lead[]; pagination: PaginationMeta }
type MyLeadResponse = { lead: Lead }
type ShowingAppointmentsResponse = { showing_appointments: ShowingAppointment[]; pagination: PaginationMeta }
type ShowingAppointmentResponse = { showing_appointment: ShowingAppointment }
type AdminDashboardResponse = {
  metrics: { total_open_leads: number; new_leads: number; unassigned_leads: number; upcoming_showings: number; overdue_followups: number }
  recent_leads: Lead[]
  upcoming_showing_appointments: ShowingAppointment[]
}

type CurrentUser = {
  id: number
  email: string
  first_name?: string
  last_name?: string
  full_name: string
  role: 'platform_admin' | 'brokerage_admin' | 'agent' | 'consumer'
  phone?: string
  preferred_contact_method?: 'phone' | 'text' | 'email'
  invitation_status?: string
  archived_at?: string
  archived_by?: LeadUser | null
  is_staff: boolean
  is_platform_admin: boolean
  brokerages?: { role: string; status: string; brokerage?: Brokerage }[]
}

type AdminUser = CurrentUser & {
  agent_profiles?: Agent[]
}

type AdminUsersResponse = { users: AdminUser[]; brokerages: Brokerage[]; agents: Agent[] }
type AuditEvent = {
  id: number
  action: string
  actor?: LeadUser | null
  actor_email?: string
  target_type?: string
  target_id?: number
  target_label?: string
  brokerage_id?: number
  lead_id?: number
  metadata?: Record<string, unknown>
  changes?: Record<string, { from?: unknown; to?: unknown }>
  ip_address?: string
  user_agent?: string
  created_at: string
}
type AuditEventsResponse = { audit_events: AuditEvent[]; pagination: PaginationMeta }
type SavedListingsResponse = { listing_ids: number[]; listings: Listing[] }
type SaveListingResponse = { listing: Listing; listing_id: number; saved: boolean }

type MeResponse = { user: CurrentUser }

type SearchProfile = {
  id?: number
  user_id?: number
  brokerage_id?: number
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
  completed_at?: string
  completion_status?: 'complete' | 'incomplete'
  completion_percentage?: number
  completion_missing_fields?: string[]
  qualification_summary?: string
  last_prompted_at?: string
  created_at?: string
  updated_at?: string
}

type SearchProfileResponse = { search_profile: SearchProfile }
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

type LeadPayload = {
  lead_type: string
  name: string
  email: string
  phone: string
  preferred_contact_method: string
  preferred_time?: string
  preferred_tour_date?: string
  tour_type?: string
  target_price?: string
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
  source_campaign?: string
  source_url?: string
  message: string
  listing_id?: number
  requested_agent_id?: number
}

type LeadUpdatePayload = Partial<Omit<LeadPayload, 'listing_id'>> & {
  status?: LeadStatus
  assigned_agent_id?: number | null
  quality_status?: string
  source_campaign?: string
  source_url?: string
}

const quickFilters = [
  { label: 'Near Andersen AFB', slug: 'near-andersen-afb' },
  { label: 'Near Navy Base', slug: 'near-naval-base-guam' },
  { label: 'Pet friendly', slug: 'pet-friendly' },
  { label: 'Furnished', slug: 'furnished' },
  { label: 'Ocean view', slug: 'ocean-view' },
  { label: 'Typhoon shutters', slug: 'typhoon-shutters' },
]

const propertyTypes = [
  { label: 'Any type', value: '' },
  { label: 'Homes', value: 'home' },
  { label: 'Condos', value: 'condo' },
  { label: 'Land', value: 'land' },
]

const SELECTED_AGENT_ID_KEY = 'hafaHomes:selectedAgentId'

function storedSelectedAgentId() {
  if (typeof window === 'undefined') return null
  const stored = Number(window.localStorage.getItem(SELECTED_AGENT_ID_KEY))
  return Number.isFinite(stored) && stored > 0 ? stored : null
}

function storeSelectedAgentId(agentId: number | null) {
  if (typeof window === 'undefined') return
  if (agentId) window.localStorage.setItem(SELECTED_AGENT_ID_KEY, String(agentId))
  else window.localStorage.removeItem(SELECTED_AGENT_ID_KEY)
}

function initialsFromName(name?: string | null) {
  return (name || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('') || 'HH'
}

function agentInitials(agent: Agent) {
  return initialsFromName(agent.name)
}

function buildQuery(params: Record<string, string | undefined>) {
  const search = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value) search.set(key, value)
  })
  return search.toString()
}

async function fetchListings(params: Record<string, string | undefined> = {}): Promise<ListingsResponse> {
  const query = buildQuery(params)
  const response = await apiFetch(`${API_URL}/api/v1/listings${query ? `?${query}` : ''}`)
  if (!response.ok) throw new Error('Unable to load listings')
  return response.json()
}

async function fetchListing(id: string): Promise<ListingResponse> {
  const response = await apiFetch(`${API_URL}/api/v1/listings/${id}`)
  if (!response.ok) throw new Error('Unable to load listing')
  return response.json()
}

async function fetchVillages(): Promise<VillagesResponse> {
  const response = await apiFetch(`${API_URL}/api/v1/villages`)
  if (!response.ok) throw new Error('Unable to load villages')
  return response.json()
}

async function fetchVillage(slug: string): Promise<VillageResponse> {
  const response = await apiFetch(`${API_URL}/api/v1/villages/${encodeURIComponent(slug)}`)
  if (!response.ok) throw new ApiFetchError(await apiErrorMessage(response, 'Unable to load this village'), response.status)
  return response.json()
}

async function fetchAgents(): Promise<AgentsResponse> {
  const response = await apiFetch(`${API_URL}/api/v1/agents`)
  if (!response.ok) throw new Error('Unable to load agents')
  return response.json()
}

async function fetchAgent(id: string, page = 1): Promise<AgentDetailResponse> {
  const response = await apiFetch(`${API_URL}/api/v1/agents/${encodeURIComponent(id)}?page=${page}&per_page=6`)
  if (!response.ok) throw new ApiFetchError(await apiErrorMessage(response, 'Unable to load this agent'), response.status)
  return response.json()
}

async function fetchMe(): Promise<MeResponse> {
  const response = await apiFetch(`${API_URL}/api/v1/me`, { headers: await authHeaders() })
  if (!response.ok) {
    throw new ApiFetchError('Unable to load current user', response.status)
  }
  return response.json()
}

async function updateMe(payload: Partial<Pick<CurrentUser, 'first_name' | 'last_name' | 'phone' | 'preferred_contact_method'>>): Promise<MeResponse> {
  const response = await apiFetch(`${API_URL}/api/v1/me`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify({ user: payload }),
  })
  if (!response.ok) throw new ApiFetchError(await apiErrorMessage(response, 'Unable to update profile'), response.status)
  return response.json()
}

async function fetchSearchProfile(): Promise<SearchProfileResponse> {
  const response = await apiFetch(`${API_URL}/api/v1/me/search_profile`, { headers: await authHeaders() })
  if (!response.ok) throw new ApiFetchError(await apiErrorMessage(response, 'Unable to load search profile'), response.status)
  return response.json()
}

async function updateSearchProfile(payload: SearchProfilePayload): Promise<SearchProfileResponse> {
  const response = await apiFetch(`${API_URL}/api/v1/me/search_profile`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify({ search_profile: payload }),
  })
  if (!response.ok) throw new ApiFetchError(await apiErrorMessage(response, 'Unable to update search profile'), response.status)
  return response.json()
}

async function deleteCurrentAccount(): Promise<{ deleted: boolean }> {
  const response = await apiFetch(`${API_URL}/api/v1/me`, { method: 'DELETE', headers: await authHeaders() })
  if (!response.ok) throw new ApiFetchError(await apiErrorMessage(response, 'Unable to delete account'), response.status)
  return response.json()
}

async function fetchSyncRuns(): Promise<SyncRunsResponse> {
  const response = await apiFetch(`${API_URL}/api/v1/data_sync_runs`, { headers: await authHeaders() })
  if (!response.ok) throw new Error('Unable to load sync runs')
  return response.json()
}

async function fetchLeads(params: { assigned_agent_id?: string; lead_type?: string; status?: string; q?: string; sort?: string; page?: string; per_page?: string } = {}): Promise<LeadsResponse> {
  const query = buildQuery(params)
  const response = await apiFetch(`${API_URL}/api/v1/leads${query ? `?${query}` : ''}`, { headers: await authHeaders() })
  if (!response.ok) throw new Error('Unable to load leads')
  return response.json()
}

async function fetchLead(id: string): Promise<LeadResponse> {
  const response = await apiFetch(`${API_URL}/api/v1/leads/${id}`, { headers: await authHeaders() })
  if (!response.ok) throw new Error('Unable to load lead')
  return response.json()
}

async function fetchAdminCustomerWorkspace(brokerageId: string, userId: string, page = 1): Promise<AdminCustomerWorkspaceResponse> {
  const response = await apiFetch(`${API_URL}/api/v1/admin/brokerages/${encodeURIComponent(brokerageId)}/customers/${encodeURIComponent(userId)}?page=${page}&per_page=10`, { headers: await authHeaders() })
  if (!response.ok) throw new ApiFetchError(await apiErrorMessage(response, 'Unable to load this customer workspace'), response.status)
  return response.json()
}

async function fetchMyLeads(page = 1): Promise<MyLeadsResponse> {
  const response = await apiFetch(`${API_URL}/api/v1/me/leads?page=${page}&per_page=10`, { headers: await authHeaders() })
  if (!response.ok) throw new ApiFetchError(await apiErrorMessage(response, 'Unable to load your requests'), response.status)
  return response.json()
}

async function fetchMyLead(id: string): Promise<MyLeadResponse> {
  const response = await apiFetch(`${API_URL}/api/v1/me/leads/${encodeURIComponent(id)}`, { headers: await authHeaders() })
  if (!response.ok) throw new ApiFetchError(await apiErrorMessage(response, 'Unable to load this request'), response.status)
  return response.json()
}

async function fetchAdminDashboard(): Promise<AdminDashboardResponse> {
  const response = await apiFetch(`${API_URL}/api/v1/admin/dashboard`, { headers: await authHeaders() })
  if (!response.ok) throw new Error('Unable to load admin dashboard')
  return response.json()
}

async function fetchAdminLeadIntentSessions(params: { status?: string; identity?: string; q?: string; sort?: string; page?: string; per_page?: string } = {}): Promise<AdminLeadIntentSessionsResponse> {
  const query = buildQuery({ status: params.status, identity: params.identity, q: params.q, sort: params.sort, page: params.page, per_page: params.per_page })
  const response = await apiFetch(`${API_URL}/api/v1/admin/lead_intent_sessions${query ? `?${query}` : ''}`, { headers: await authHeaders() })
  if (!response.ok) throw new ApiFetchError(await apiErrorMessage(response, 'Unable to load search intent'), response.status)
  return response.json()
}

async function fetchShowingAppointments(page = 1): Promise<ShowingAppointmentsResponse> {
  const response = await apiFetch(`${API_URL}/api/v1/showing_appointments?page=${page}&per_page=25`, { headers: await authHeaders() })
  if (!response.ok) throw new Error('Unable to load showing schedule')
  return response.json()
}

async function fetchShowingAppointment(id: string): Promise<ShowingAppointmentResponse> {
  const response = await apiFetch(`${API_URL}/api/v1/showing_appointments/${encodeURIComponent(id)}`, { headers: await authHeaders() })
  if (!response.ok) throw new ApiFetchError(await apiErrorMessage(response, 'Unable to load this showing'), response.status)
  return response.json()
}

async function fetchAdminUsers(): Promise<AdminUsersResponse> {
  const response = await apiFetch(`${API_URL}/api/v1/admin/users`, { headers: await authHeaders() })
  if (!response.ok) throw new ApiFetchError(await apiErrorMessage(response, 'Unable to load users'), response.status)
  return response.json()
}

async function fetchAdminBrokerages(): Promise<{ brokerages: Brokerage[] }> {
  const response = await apiFetch(`${API_URL}/api/v1/admin/brokerages`, { headers: await authHeaders() })
  if (!response.ok) throw new ApiFetchError(await apiErrorMessage(response, 'Unable to load brokerages'), response.status)
  return response.json()
}

async function updateAdminBrokerage(id: number, payload: Record<string, unknown>): Promise<{ brokerage: Brokerage }> {
  const response = await apiFetch(`${API_URL}/api/v1/admin/brokerages/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify({ brokerage: payload }),
  })
  if (!response.ok) throw new ApiFetchError(await apiErrorMessage(response, 'Unable to update brokerage'), response.status)
  return response.json()
}

async function fetchAuditEvents(page = 1): Promise<AuditEventsResponse> {
  const response = await apiFetch(`${API_URL}/api/v1/admin/audit_events?page=${page}&per_page=50`, { headers: await authHeaders() })
  if (!response.ok) throw new ApiFetchError(await apiErrorMessage(response, 'Unable to load audit history'), response.status)
  return response.json()
}

async function createAdminUser(payload: Record<string, unknown>): Promise<{ user: AdminUser }> {
  const response = await apiFetch(`${API_URL}/api/v1/admin/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify({ user: payload }),
  })
  if (!response.ok) throw new ApiFetchError(await apiErrorMessage(response, 'Unable to create user'), response.status)
  return response.json()
}

async function updateLead(id: number, payload: LeadUpdatePayload): Promise<LeadResponse> {
  const response = await apiFetch(`${API_URL}/api/v1/leads/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify({ lead: payload }),
  })
  if (!response.ok) throw new ApiFetchError(await apiErrorMessage(response, 'Unable to update lead'), response.status)
  return response.json()
}

async function createLeadNote(id: number, payload: { body: string }): Promise<{ lead_note: LeadNote; lead: Lead }> {
  const response = await apiFetch(`${API_URL}/api/v1/leads/${id}/notes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify({ lead_note: payload }),
  })
  if (!response.ok) throw new ApiFetchError(await apiErrorMessage(response, 'Unable to add note'), response.status)
  return response.json()
}

async function updateLeadNote(id: number, payload: Partial<Pick<LeadNote, 'body'>> & { archived?: boolean }): Promise<{ lead_note: LeadNote; lead: Lead }> {
  const response = await apiFetch(`${API_URL}/api/v1/lead_notes/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify({ lead_note: payload }),
  })
  if (!response.ok) throw new ApiFetchError(await apiErrorMessage(response, 'Unable to update note'), response.status)
  return response.json()
}

async function fetchLeadNotesPage(leadId: number, page: number, perPage = 10): Promise<LeadNotesPageResponse> {
  const response = await apiFetch(`${API_URL}/api/v1/leads/${leadId}/notes?page=${page}&per_page=${perPage}`, { headers: await authHeaders() })
  if (!response.ok) throw new ApiFetchError(await apiErrorMessage(response, 'Unable to load notes'), response.status)
  return response.json()
}

async function fetchLeadTasksPage(leadId: number, status: 'open' | 'completed' | 'archived', page: number, perPage = 10): Promise<LeadTasksPageResponse> {
  const response = await apiFetch(`${API_URL}/api/v1/leads/${leadId}/tasks?status=${status}&page=${page}&per_page=${perPage}`, { headers: await authHeaders() })
  if (!response.ok) throw new ApiFetchError(await apiErrorMessage(response, 'Unable to load tasks'), response.status)
  return response.json()
}

async function fetchLeadActivitiesPage(leadId: number, page: number, perPage = 10): Promise<LeadActivitiesPageResponse> {
  const response = await apiFetch(`${API_URL}/api/v1/leads/${leadId}/activities?page=${page}&per_page=${perPage}`, { headers: await authHeaders() })
  if (!response.ok) throw new ApiFetchError(await apiErrorMessage(response, 'Unable to load activity'), response.status)
  return response.json()
}

async function createLeadTask(id: number, payload: { title: string; notes?: string; due_at?: string }): Promise<{ lead_task: LeadTask; lead: Lead }> {
  const response = await apiFetch(`${API_URL}/api/v1/leads/${id}/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify({ lead_task: payload }),
  })
  if (!response.ok) throw new ApiFetchError(await apiErrorMessage(response, 'Unable to add task'), response.status)
  return response.json()
}

async function updateLeadTask(id: number, payload: Partial<Pick<LeadTask, 'title' | 'notes' | 'status' | 'due_at'>>): Promise<{ lead_task: LeadTask; lead: Lead }> {
  const response = await apiFetch(`${API_URL}/api/v1/lead_tasks/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify({ lead_task: payload }),
  })
  if (!response.ok) throw new ApiFetchError(await apiErrorMessage(response, 'Unable to update task'), response.status)
  return response.json()
}

async function sendLeadNotification(id: number, payload: { channel: 'email' | 'sms'; recipient_role: 'consumer' | 'agent'; event_name?: string; subject?: string; title?: string; body?: string }): Promise<{ notification_delivery: NotificationDelivery }> {
  const response = await apiFetch(`${API_URL}/api/v1/leads/${id}/notifications`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify({ notification: payload }),
  })
  if (!response.ok) throw new ApiFetchError(await apiErrorMessage(response, 'Unable to queue notification'), response.status)
  return response.json()
}

async function createShowingAppointment(payload: Partial<ShowingAppointment> & { lead_id: number }): Promise<{ showing_appointment: ShowingAppointment; lead: Lead }> {
  const response = await apiFetch(`${API_URL}/api/v1/showing_appointments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify({ showing_appointment: payload }),
  })
  if (!response.ok) throw new ApiFetchError(await apiErrorMessage(response, 'Unable to schedule showing'), response.status)
  return response.json()
}

async function updateShowingAppointment(id: number, payload: Partial<ShowingAppointment>): Promise<{ showing_appointment: ShowingAppointment; lead: Lead }> {
  const response = await apiFetch(`${API_URL}/api/v1/showing_appointments/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify({ showing_appointment: payload }),
  })
  if (!response.ok) throw new ApiFetchError(await apiErrorMessage(response, 'Unable to update showing'), response.status)
  return response.json()
}

async function updateAdminUser(id: number, payload: Record<string, unknown>): Promise<{ user: AdminUser }> {
  const response = await apiFetch(`${API_URL}/api/v1/admin/users/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify({ user: payload }),
  })
  if (!response.ok) throw new ApiFetchError(await apiErrorMessage(response, 'Unable to update user'), response.status)
  return response.json()
}

async function fetchSavedListings(): Promise<SavedListingsResponse> {
  const response = await apiFetch(`${API_URL}/api/v1/me/saved_listings`, { headers: await authHeaders() })
  if (!response.ok) throw new ApiFetchError(await apiErrorMessage(response, 'Unable to load saved homes'), response.status)
  return response.json()
}

async function saveListingForUser(listingId: number): Promise<SaveListingResponse> {
  const response = await apiFetch(`${API_URL}/api/v1/listings/${listingId}/save`, { method: 'POST', headers: await authHeaders() })
  if (!response.ok) throw new ApiFetchError(await apiErrorMessage(response, 'Unable to save home'), response.status)
  return response.json()
}

async function removeSavedListingForUser(listingId: number): Promise<{ listing_id: number; saved: boolean }> {
  const response = await apiFetch(`${API_URL}/api/v1/listings/${listingId}/save`, { method: 'DELETE', headers: await authHeaders() })
  if (!response.ok) throw new ApiFetchError(await apiErrorMessage(response, 'Unable to remove saved home'), response.status)
  return response.json()
}

async function saveSearch(payload: { name: string; email: string; alert_frequency: string; filters: Record<string, string> }) {
  const response = await apiFetch(`${API_URL}/api/v1/saved_searches`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ saved_search: payload }),
  })
  if (!response.ok) throw new Error('Unable to save search')
  return response.json()
}

async function createLead(payload: LeadPayload): Promise<{ lead: Lead }> {
  return submitLead(payload, true)
}

async function submitLead(payload: LeadPayload, retryAfterIntentReset: boolean): Promise<{ lead: Lead }> {
  if (payload.lead_type === 'search_assist' && !payload.intent_session_token) {
    throw new ApiFetchError('Your search session refreshed. Please keep browsing or reopen the prompt so we can attach the right search context.', 409)
  }

  if (!payload.intent_session_token && leadIntentCurrentContextRequired()) {
    throw new ApiFetchError('Your search session refreshed after sign-in. Please view the home again and reopen this form before submitting.', 409)
  }

  const response = await apiFetch(`${API_URL}/api/v1/leads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify({ lead: payload }),
  })

  if (response.status === 409 && retryAfterIntentReset && payload.intent_session_token) {
    const conflictPayload = await response.clone().json().catch(() => null) as { reset_session?: boolean } | null
    if (conflictPayload?.reset_session) {
      clearLeadIntentSessionToken()
      markLeadIntentCurrentContextRequired()
      throw new ApiFetchError('Your search session refreshed after sign-in. Please view the home again and reopen this form before submitting.', response.status)
    }
  }

  if (!response.ok) throw new ApiFetchError(await apiErrorMessage(response, 'Unable to submit lead'), response.status)
  clearLeadIntentCurrentContextRequired()
  return response.json()
}

function searchProfilePayloadFromForm(form: FormData): SearchProfilePayload {
  return {
    preferred_contact_method: String(form.get('preferred_contact_method') || '').trim(),
    phone: String(form.get('phone') || '').trim(),
    prequalified_status: String(form.get('prequalified_status') || '').trim(),
    lender_name: String(form.get('lender_name') || '').trim(),
    purchase_timeline: String(form.get('purchase_timeline') || '').trim(),
    budget_min: String(form.get('budget_min') || '').trim(),
    budget_max: String(form.get('budget_max') || '').trim(),
    desired_villages: String(form.get('desired_villages') || '').trim(),
    desired_beds: String(form.get('desired_beds') || '').trim(),
    desired_baths: String(form.get('desired_baths') || '').trim(),
    buyer_status: String(form.get('buyer_status') || '').trim(),
    already_working_with_agent: String(form.get('already_working_with_agent') || '').trim(),
    notes: String(form.get('notes') || form.get('qualification_notes') || '').trim(),
  }
}

function profileDefault(profile: SearchProfile | undefined | null, field: keyof SearchProfile, fallback = '') {
  const value = profile?.[field]
  return value === undefined || value === null ? fallback : String(value)
}

function mergedPromptProfile(prompt: LeadIntentPrompt, searchProfile?: SearchProfile | null): SearchProfile {
  return { ...(searchProfile || {}), ...(prompt.suggested || {}) }
}

function leadFieldsFromSearchProfile(profile?: SearchProfile | null) {
  return {
    prequalified_status: profileDefault(profile, 'prequalified_status'),
    lender_name: profileDefault(profile, 'lender_name'),
    purchase_timeline: profileDefault(profile, 'purchase_timeline'),
    budget_min: profileDefault(profile, 'budget_min'),
    budget_max: profileDefault(profile, 'budget_max'),
    desired_villages: profileDefault(profile, 'desired_villages'),
    desired_beds: profileDefault(profile, 'desired_beds'),
    desired_baths: profileDefault(profile, 'desired_baths'),
    buyer_status: profileDefault(profile, 'buyer_status'),
    already_working_with_agent: profileDefault(profile, 'already_working_with_agent'),
    qualification_notes: profileDefault(profile, 'notes'),
  }
}

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
  { value: '', label: 'Not sure / prefer to discuss' },
  { value: 'yes', label: 'Yes, I am prequalified' },
  { value: 'in_progress', label: 'I am working on prequalification' },
  { value: 'no', label: 'No, not yet' },
  { value: 'not_sure', label: 'Not sure' },
]

const purchaseTimelineOptions = [
  { value: '', label: 'Timeline not set' },
  { value: 'asap', label: 'ASAP' },
  { value: '1_3_months', label: '1–3 months' },
  { value: '3_6_months', label: '3–6 months' },
  { value: '6_plus_months', label: '6+ months' },
  { value: 'just_browsing', label: 'Just browsing' },
]

const buyerStatusOptions = [
  { value: '', label: 'Not provided' },
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
  { value: '', label: 'Not provided' },
  { value: 'no', label: 'No' },
  { value: 'yes', label: 'Yes' },
  { value: 'not_sure', label: 'Not sure' },
]

const leadStatuses: Array<{ value: LeadStatus; label: string }> = [
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'showing_scheduled', label: 'Showing scheduled' },
  { value: 'nurturing', label: 'Nurturing' },
  { value: 'closed', label: 'Closed' },
  { value: 'lost', label: 'Lost' },
  { value: 'spam', label: 'Spam' },
  { value: 'archived', label: 'Archived' },
]

const leadTypeOptions = [
  { value: 'showing_request', label: 'Showing request' },
  { value: 'price_tracker', label: 'Price watch request' },
  { value: 'search_assist', label: 'Search assist' },
  { value: 'general_inquiry', label: 'General inquiry' },
]

const leadSortOptions = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'updated', label: 'Recently updated' },
  { value: 'quality_desc', label: 'Highest readiness' },
  { value: 'quality_asc', label: 'Lowest readiness' },
]

function leadTypeLabel(value?: string) {
  const option = leadTypeOptions.find((item) => item.value === value)
  return option?.label ?? (value ? value.replaceAll('_', ' ') : 'Lead')
}

function leadTypeBadgeClasses(value?: string) {
  if (value === 'showing_request') return 'bg-[#e9f5ef] text-[#0f705e]'
  if (value === 'price_tracker') return 'bg-[#fff3d8] text-[#7a4b00]'
  if (value === 'search_assist') return 'bg-[#e8f1ff] text-[#164a7a]'
  return 'bg-[#edf0ec] text-[#53645f]'
}

function formatDateTime(value?: string, timeZone?: string) {
  if (!value) return 'Not recorded'
  const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }
  if (!timeZone) return new Date(value).toLocaleString('en-US', options)

  try {
    return new Date(value).toLocaleString('en-US', { ...options, timeZone })
  } catch {
    return new Date(value).toLocaleString('en-US', options)
  }
}

function formatDate(value?: string, timeZone = 'Pacific/Guam') {
  if (!value) return 'Not recorded'
  const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric', timeZone }

  try {
    return new Date(value).toLocaleDateString('en-US', options)
  } catch {
    return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }
}

function currency(value: number, kind: string) {
  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value)

  return kind === 'rent' ? `${formatted}/mo` : formatted
}

function qualityBadgeClasses(label?: string) {
  const normalized = label?.toLowerCase()
  if (normalized === 'hot') return 'bg-[#fee6ca] text-[#7a3a00]'
  if (normalized === 'warm') return 'bg-[#fff5d9] text-[#6b4508]'
  if (normalized === 'early') return 'bg-[#e9f5ef] text-[#0f705e]'
  return 'bg-[#edf0ec] text-[#53645f]'
}

function compactMoney(value?: number) {
  if (value === undefined || value === null) return ''
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value)
}

function leadBudgetLabel(lead: Lead) {
  if (lead.budget_range_label) return lead.budget_range_label
  if (lead.budget_min && lead.budget_max) return `${compactMoney(lead.budget_min)}–${compactMoney(lead.budget_max)}`
  if (lead.budget_min) return `${compactMoney(lead.budget_min)}+`
  if (lead.budget_max) return `Up to ${compactMoney(lead.budget_max)}`
  return 'Not provided'
}

function hasQualificationDetails(lead: Lead) {
  return Boolean(lead.has_qualification_details)
}

function leadQualificationItems(lead: Lead) {
  return [
    ['Prequalified', lead.prequalified_status_label || 'Not provided'],
    ['Timeline', lead.purchase_timeline_label || 'Not provided'],
    ['Budget', leadBudgetLabel(lead)],
    ['Villages', lead.desired_villages || 'Not provided'],
    ['Beds / baths', [lead.desired_beds ? `${lead.desired_beds}+ beds` : '', lead.desired_baths ? `${lead.desired_baths}+ baths` : ''].filter(Boolean).join(' · ') || 'Not provided'],
    ['Buyer type', lead.buyer_status_label || 'Not provided'],
    ['Agent relationship', lead.already_working_with_agent_label || 'Not provided'],
  ]
}

function tourDateOptions(count = 4) {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date()
    date.setDate(date.getDate() + index + 1)
    return {
      value: date.toISOString().slice(0, 10),
      label: date.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' }),
    }
  })
}

function RequireStaff({ children }: { children: React.ReactNode }) {
  const { isClerkEnabled, isSignedIn, isLoading, userId } = useAuthContext()
  const { data, isLoading: isMeLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['me', userId],
    queryFn: fetchMe,
    enabled: isClerkEnabled && isSignedIn && Boolean(userId),
    retry: false,
  })

  if (!isClerkEnabled) {
    return (
      <Shell compact>
        <ContentHeader kicker="Admin access" title="Clerk is not configured yet." description="Add VITE_CLERK_PUBLISHABLE_KEY on the web app and Clerk JWKS settings on the API to enable protected brokerage/admin access." />
      </Shell>
    )
  }

  if (isLoading || isMeLoading) {
    return (
      <Shell compact>
        <StateCard>Checking admin access...</StateCard>
      </Shell>
    )
  }

  if (!isSignedIn) {
    return (
      <Shell compact>
        <section className="mx-auto max-w-3xl px-5 py-12">
          <div className="rounded-[2rem] bg-white p-8 text-center shadow-sm">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#0f705e]">Admin access</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-[-0.05em]">Sign in to continue.</h1>
            <p className="mt-3 text-[#66746f]">Brokerage, agent, and platform dashboards are protected with Clerk.</p>
            <SignInButton mode="modal">
              <button className="mt-6 rounded-full bg-[var(--brand-primary)] px-6 py-3 text-sm font-bold text-white shadow-lg shadow-[var(--brand-primary)]/20">Sign in</button>
            </SignInButton>
          </div>
        </section>
      </Shell>
    )
  }

  if (isError || !data?.user) {
    const status = error instanceof ApiFetchError ? error.status : null
    const description = status === 401
      ? 'Your session could not be verified. Sign out and sign back in, or retry after the API is back online.'
      : 'We could not reach the Hafa Homes API to verify your role. This can happen during a deploy, local server restart, or temporary network issue.'

    return (
      <Shell compact>
        <section className="mx-auto max-w-3xl px-5 py-12">
          <div className="rounded-[2rem] bg-white p-8 text-center shadow-sm">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#b45309]">Admin check unavailable</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-[-0.05em]">Unable to verify admin access.</h1>
            <p className="mt-3 text-[#66746f]">{description}</p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <button type="button" onClick={() => refetch()} disabled={isFetching} className="rounded-full bg-[var(--brand-primary)] px-6 py-3 text-sm font-bold text-white shadow-lg shadow-[var(--brand-primary)]/20 disabled:opacity-60">
                {isFetching ? 'Checking...' : 'Try again'}
              </button>
              <UserButton />
            </div>
          </div>
        </section>
      </Shell>
    )
  }

  if (!data.user.is_staff) {
    return (
      <Shell compact>
        <section className="mx-auto max-w-3xl px-5 py-12">
          <div className="rounded-[2rem] bg-white p-8 text-center shadow-sm">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#b45309]">Access pending</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-[-0.05em]">This account does not have admin access.</h1>
            <p className="mt-3 text-[#66746f]">Use the platform admin account or ask a platform admin to assign a brokerage or agent role.</p>
            <div className="mt-5 flex justify-center"><UserButton /></div>
          </div>
        </section>
      </Shell>
    )
  }

  return <>{children}</>
}

function App() {
  const { isClerkEnabled, isSignedIn, isLoading } = useAuthContext()

  useEffect(() => {
    if (isClerkEnabled && !isLoading && !isSignedIn) storeSelectedAgentId(null)
  }, [isClerkEnabled, isLoading, isSignedIn])

  return (
    <>
      <PostHogPageView />
      <Routes>
        <Route path="/" element={<SearchPage />} />
        <Route path="/listings/:id" element={<ListingDetailPage />} />
        <Route path="/villages" element={<VillagesPage />} />
        <Route path="/villages/:slug" element={<VillageDetailPage />} />
        <Route path="/agents" element={<AgentsPage />} />
        <Route path="/agents/:id" element={<AgentDetailPage />} />
        <Route path="/military" element={<MilitaryPage />} />
        <Route path="/saved" element={<SavedPage />} />
        <Route path="/account" element={<AccountPage />} />
        <Route path="/account/requests" element={<RequestsPage />} />
        <Route path="/account/requests/:id" element={<RequestDetailPage />} />
        <Route path="/requests" element={<RequestsPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/open" element={<OpenInAppPage />} />
        <Route path="/admin" element={<RequireStaff><AdminDashboardPage /></RequireStaff>} />
        <Route path="/admin/sync" element={<RequireStaff><SyncPage /></RequireStaff>} />
        <Route path="/admin/leads" element={<RequireStaff><LeadsPage /></RequireStaff>} />
        <Route path="/admin/intent" element={<RequireStaff><AdminIntentPage /></RequireStaff>} />
        <Route path="/admin/leads/:id" element={<RequireStaff><LeadDetailPage /></RequireStaff>} />
        <Route path="/admin/brokerages/:brokerageId/customers/:customerId" element={<RequireStaff><CustomerWorkspacePage /></RequireStaff>} />
        <Route path="/admin/showings" element={<RequireStaff><AdminShowingsPage /></RequireStaff>} />
        <Route path="/admin/showings/:id" element={<RequireStaff><ShowingDetailPage /></RequireStaff>} />
        <Route path="/admin/users" element={<RequireStaff><AdminUsersPage /></RequireStaff>} />
        <Route path="/admin/audit" element={<RequireStaff><AdminAuditPage /></RequireStaff>} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
      <ProgressiveLeadPrompt />
    </>
  )
}

function ProgressiveLeadPrompt() {
  const [prompt, setPrompt] = useState<LeadIntentPrompt | null>(null)
  const [dismissedKey, setDismissedKey] = useState<string | null>(null)
  const [conversionModalOpen, setConversionModalOpen] = useState(false)
  const mutation = useMutation({
    mutationFn: async (variables: { profilePayload?: SearchProfilePayload; leadPayload?: LeadPayload; createLeadRequested: boolean; profilePrompt: boolean }) => {
      const profileResponse = variables.profilePrompt && variables.profilePayload ? await updateSearchProfile(variables.profilePayload) : null
      if (variables.createLeadRequested && variables.leadPayload) {
        try {
          const leadResponse = await createLead(variables.leadPayload)
          return { search_profile: profileResponse?.search_profile, lead: leadResponse.lead, profile_only: false, follow_up_failed: false }
        } catch (leadError) {
          if (!profileResponse) throw leadError

          return {
            search_profile: profileResponse.search_profile,
            lead: undefined,
            profile_only: true,
            follow_up_failed: true,
            follow_up_error: displayErrorMessage(leadError, 'The agent follow-up request did not send.'),
          }
        }
      }

      return { search_profile: profileResponse?.search_profile, lead: undefined, profile_only: true, follow_up_failed: false }
    },
  })
  const { isClerkEnabled, isSignedIn, userId } = useAuthContext()
  const { data: meData } = useQuery({
    queryKey: ['me', userId, 'progressive-lead-prompt'],
    queryFn: fetchMe,
    enabled: Boolean(prompt) && isClerkEnabled && isSignedIn && Boolean(userId),
    retry: false,
  })
  const { data: searchProfileData, refetch: refetchSearchProfile } = useQuery({
    queryKey: ['me', userId, 'search-profile', 'progressive-lead-prompt'],
    queryFn: fetchSearchProfile,
    enabled: Boolean(prompt) && isClerkEnabled && isSignedIn && Boolean(userId),
    retry: false,
  })
  const { data: agentsData } = useQuery({
    queryKey: ['agents', 'routing', 'progressive-lead-prompt'],
    queryFn: () => fetchAgents(),
    enabled: Boolean(prompt) && isClerkEnabled && isSignedIn,
  })
  const profile = meData?.user
  const searchProfile = searchProfileData?.search_profile

  useEffect(() => {
    function handlePrompt(event: Event) {
      const detail = (event as CustomEvent<{ prompt?: LeadIntentPrompt }>).detail
      const nextPrompt = detail?.prompt
      if (!nextPrompt?.eligible || !nextPrompt.key || nextPrompt.key === dismissedKey) return
      setPrompt(nextPrompt)
      mutation.reset()
    }

    window.addEventListener('hafaHomes:leadIntentPrompt', handlePrompt)
    return () => window.removeEventListener('hafaHomes:leadIntentPrompt', handlePrompt)
  }, [dismissedKey, mutation])

  useEffect(() => {
    const handleModalState = (event: Event) => {
      setConversionModalOpen(Boolean((event as CustomEvent<{ open?: boolean }>).detail?.open))
    }
    window.addEventListener('hafaHomes:conversionModalState', handleModalState)
    return () => window.removeEventListener('hafaHomes:conversionModalState', handleModalState)
  }, [])

  if (!prompt || conversionModalOpen) return null

  const activePrompt = prompt
  const selectedAgentId = isClerkEnabled && isSignedIn ? storedSelectedAgentId() : null
  const selectedAgent = agentsData?.agents.find((agent) => agent.id === selectedAgentId)
  const promptTitle = activePrompt.title || 'Want an agent to send matching homes?'
  const promptBody = activePrompt.body || 'Share a few details and the brokerage team can follow up with useful Guam listings.'
  const promptProfile = mergedPromptProfile(activePrompt, searchProfile)
  const isProfilePrompt = Boolean(activePrompt.profile_prompt)

  function handleDismiss(reason = 'dismissed') {
    setDismissedKey(activePrompt.key || null)
    dismissLeadIntentPrompt(activePrompt.key, reason)
    setPrompt(null)
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const name = String(form.get('name') || profile?.full_name || '').trim()
    const email = String(form.get('email') || profile?.email || '').trim()
    if (!email) return

    const profilePrompt = Boolean(activePrompt.profile_prompt)
    const profilePayload = searchProfilePayloadFromForm(form)
    const createLeadRequested = !profilePrompt || form.get('agent_help_requested') === 'on'
    const leadProfileFields = leadFieldsFromSearchProfile({ ...searchProfilePayloadFromForm(form), notes: String(form.get('notes') || form.get('qualification_notes') || '') } as SearchProfile)
    const leadPayload: LeadPayload = {
      listing_id: activePrompt.suggested?.listing_id,
      lead_type: 'search_assist',
      name: name || 'Hafa Homes searcher',
      email,
      phone: String(form.get('phone') || profile?.phone || '').trim(),
      preferred_contact_method: String(form.get('preferred_contact_method') || profile?.preferred_contact_method || 'email'),
      source_campaign: `progressive_prompt:${activePrompt.trigger || 'search_intent'}`,
      source_url: typeof window !== 'undefined' ? window.location.href : '',
      requested_agent_id: selectedAgent?.id,
      ...leadProfileFields,
      intent_session_token: currentLeadIntentSessionToken(),
      message: `Progressive search assist prompt: ${activePrompt.trigger || 'search_intent'}`,
    }

    mutation.mutate({ profilePayload, leadPayload, createLeadRequested, profilePrompt }, {
      onSuccess: () => {
        setDismissedKey(activePrompt.key || null)
        if (profilePrompt) void refetchSearchProfile()
      },
    })
  }

  return (
    <div className="fixed inset-x-3 bottom-3 z-[85] mx-auto max-w-xl rounded-[2rem] border border-white/60 bg-white/95 p-4 shadow-2xl shadow-[var(--brand-primary)]/20 backdrop-blur md:bottom-6 md:p-5">
      {mutation.isSuccess ? (
        <div className="text-center">
          <CheckCircle2 className="mx-auto text-[#0f705e]" size={36} />
          <h2 className="mt-3 text-2xl font-semibold tracking-[-0.05em]">{mutation.data?.follow_up_failed || mutation.data?.profile_only ? 'Search profile saved' : 'Search details sent'}</h2>
          <p className="mt-2 text-sm leading-6 text-[#66746f]">
            {mutation.data?.follow_up_failed
              ? 'Your saved preferences can now prefill future requests. The optional agent follow-up did not send, so please request a showing or price watch from a listing if you still want the team to reach out.'
              : mutation.data?.profile_only
                ? 'Your saved preferences can now prefill future requests across Hafa Homes.'
                : 'The brokerage team can use your search context to follow up with better matches.'}
          </p>
          {mutation.data?.follow_up_failed && <p className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold leading-6 text-amber-900">Agent follow-up was not sent: {mutation.data.follow_up_error}</p>}
          <button onClick={() => setPrompt(null)} className="mt-4 min-h-11 w-full rounded-2xl bg-[var(--brand-primary)] px-4 text-sm font-bold text-white">Done</button>
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#0f705e]">Search assist</p>
              <h2 className="mt-1 text-2xl font-semibold tracking-[-0.05em]">{promptTitle}</h2>
              <p className="mt-2 text-sm leading-6 text-[#66746f]">{promptBody}</p>
            </div>
            <button type="button" onClick={() => handleDismiss('closed')} className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[#d7ded9] text-[#304942]"><X size={18} /></button>
          </div>

          {activePrompt.summary?.narrative && <p className="mt-3 rounded-2xl bg-[#f6f1e8] p-3 text-xs font-bold uppercase tracking-[0.12em] text-[#53645f]">{activePrompt.summary.narrative}</p>}

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <Input name="email" label="Email" type="email" defaultValue={profile?.email || ''} required />
            <Input name="name" label="Name" defaultValue={profile?.full_name || ''} />
            <Input name="phone" label="Phone optional" defaultValue={profileDefault(promptProfile, 'phone', profile?.phone || '+1671')} inputMode="tel" />
            <label className="grid gap-2 text-sm font-semibold text-[#304942]">
              Preferred contact
              <select name="preferred_contact_method" defaultValue={profileDefault(promptProfile, 'preferred_contact_method', profile?.preferred_contact_method || 'email')} className="min-h-12 rounded-2xl border border-[#dce5df] bg-white px-4">
                {preferredContactOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <label className="grid gap-2 text-sm font-semibold text-[#304942]">
              Timeline
              <select name="purchase_timeline" defaultValue={profileDefault(promptProfile, 'purchase_timeline')} className="min-h-12 rounded-2xl border border-[#dce5df] bg-white px-4">
                {purchaseTimelineOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <Input name="desired_villages" label="Desired villages" defaultValue={profileDefault(promptProfile, 'desired_villages')} placeholder="Dededo, Yigo, Tamuning" />
            <label className="grid gap-2 text-sm font-semibold text-[#304942]">
              Prequalified?
              <select name="prequalified_status" defaultValue={profileDefault(promptProfile, 'prequalified_status')} className="min-h-12 rounded-2xl border border-[#dce5df] bg-white px-4">
                {prequalifiedOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <Input name="lender_name" label="Lender / bank optional" defaultValue={profileDefault(promptProfile, 'lender_name')} placeholder="Bank of Guam, Coast360..." />
            <Input name="budget_min" label="Budget min optional" type="number" min="0" step="1000" defaultValue={profileDefault(promptProfile, 'budget_min')} />
            <Input name="budget_max" label="Budget max optional" type="number" min="0" step="1000" defaultValue={profileDefault(promptProfile, 'budget_max')} />
            <Input name="desired_beds" label="Beds optional" type="number" min="0" step="1" defaultValue={profileDefault(promptProfile, 'desired_beds')} />
            <Input name="desired_baths" label="Baths optional" type="number" min="0" step="0.5" defaultValue={profileDefault(promptProfile, 'desired_baths')} />
            <label className="grid gap-2 text-sm font-semibold text-[#304942]">
              Buyer type
              <select name="buyer_status" defaultValue={profileDefault(promptProfile, 'buyer_status')} className="min-h-12 rounded-2xl border border-[#dce5df] bg-white px-4">
                {buyerStatusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <label className="grid gap-2 text-sm font-semibold text-[#304942]">
              Working with an agent?
              <select name="already_working_with_agent" defaultValue={profileDefault(promptProfile, 'already_working_with_agent')} className="min-h-12 rounded-2xl border border-[#dce5df] bg-white px-4">
                {agentRelationshipOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
          </div>

          <label className="mt-3 grid gap-2 text-sm font-semibold text-[#304942]">
            Notes for your search profile
            <textarea name="notes" rows={3} defaultValue={profileDefault(promptProfile, 'notes')} className="rounded-2xl border border-[#dce5df] bg-white px-4 py-3" placeholder="Relocating this summer, needs pet-friendly, prefers central Guam..." />
          </label>

          {isProfilePrompt && (
            <label className="mt-3 flex items-start gap-3 rounded-2xl bg-[#e9f5ef] p-3 text-sm font-semibold leading-6 text-[#304942]">
              <input name="agent_help_requested" type="checkbox" className="mt-1 h-4 w-4 rounded border-[#0f705e] text-[#0f705e]" />
              <span>Also ask a Hafa Homes agent to follow up using this search context.</span>
            </label>
          )}

          {mutation.isError && <p className="mt-3 text-sm font-semibold text-red-700">{displayErrorMessage(mutation.error, 'Unable to save search details right now.')}</p>}
          <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
            <button disabled={mutation.isPending} className="min-h-12 rounded-2xl bg-[var(--brand-primary)] px-5 text-sm font-bold text-white disabled:opacity-60">{mutation.isPending ? 'Saving...' : activePrompt.cta || 'Get matched with an agent'}</button>
            <button type="button" onClick={() => handleDismiss('not_now')} className="min-h-12 rounded-2xl bg-[#edf0ec] px-5 text-sm font-bold text-[#304942]">Not now</button>
          </div>
        </form>
      )}
    </div>
  )
}

function currentUtmCampaign() {
  if (typeof window === 'undefined') return ''
  return new URLSearchParams(window.location.search).get('utm_campaign') || ''
}

function safeInternalPath(path: string | null) {
  if (!path) return '/'
  const decoded = path.trim()
  if (!decoded.startsWith('/') || decoded.startsWith('//')) return '/'
  return decoded
}

function OpenInAppPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const target = safeInternalPath(searchParams.get('target'))

  useEffect(() => {
    const isMobile = /Android|iPhone|iPad|iPod/i.test(window.navigator.userAgent)
    if (!isMobile || target.startsWith('/admin')) {
      navigate(target, { replace: true })
      return
    }

    const appUrl = `hafahomes://${target}`
    window.location.href = appUrl
    const fallback = window.setTimeout(() => navigate(target, { replace: true }), 1400)
    return () => window.clearTimeout(fallback)
  }, [navigate, target])

  return (
    <Shell compact>
      <section className="mx-auto max-w-3xl px-5 py-12">
        <div className="rounded-[2rem] bg-white p-8 text-center shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#0f705e]">Opening Hafa Homes</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-0.05em]">Taking you to your request.</h1>
          <p className="mt-3 text-[#66746f]">If the app is installed, it should open automatically. Otherwise we’ll continue on the web.</p>
          <Link to={target} className="mt-6 inline-flex rounded-full bg-[var(--brand-primary)] px-6 py-3 text-sm font-bold text-white">Continue on web</Link>
        </div>
      </section>
    </Shell>
  )
}

function NotFoundPage() {
  return (
    <Shell compact>
      <section className="mx-auto max-w-3xl px-5 py-12">
        <div className="rounded-[2rem] bg-white p-8 text-center shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#0f705e]">Page not found</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-0.05em]">We could not find that Hafa Homes page.</h1>
          <p className="mt-3 text-[#66746f]">Use the links below to continue your search or review your account activity.</p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link to="/" className="rounded-full bg-[var(--brand-primary)] px-5 py-3 text-sm font-bold text-white">Search homes</Link>
            <Link to="/account/requests" className="rounded-full border border-[#d7ded9] px-5 py-3 text-sm font-bold text-[var(--brand-primary)]">My requests</Link>
          </div>
        </div>
      </section>
    </Shell>
  )
}

export function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [showFilters, setShowFilters] = useState(false)
  const [saveSearchOpen, setSaveSearchOpen] = useState(false)
  const [fullMapOpen, setFullMapOpen] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [mobileMapHeight, setMobileMapHeight] = useState<number | undefined>()
  const mobileHeaderRef = useRef<HTMLDivElement | null>(null)
  const kind = (searchParams.get('kind') as 'sale' | 'rent') || 'sale'
  const village = searchParams.get('village') || ''
  const propertyType = searchParams.get('property_type') || ''
  const features = searchParams.get('features') || ''
  const beds = searchParams.get('beds') || ''
  const maxPrice = searchParams.get('max_price') || ''
  const query = searchParams.get('q') || ''
  const viewParam = searchParams.get('view')
  const viewMode: 'list' | 'map' = viewParam === 'map' ? 'map' : 'list'
  const searchReturnPath = routes.search(searchParams)
  const [searchInput, setSearchInput] = useState(query)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['listings', kind, village, propertyType, features, beds, maxPrice, query],
    queryFn: () => fetchListings({ kind, village, property_type: propertyType, features, beds, max_price: maxPrice, q: query }),
  })
  const { data: villagesData } = useQuery({ queryKey: ['villages'], queryFn: fetchVillages })

  const listings = data?.listings ?? []
  const usesDemoInventory = listings.some((listing) => listing.brokerage?.demo_data)
  const featureList = features ? features.split(',').filter(Boolean) : []

  useEffect(() => {
    if (viewParam === 'list' || viewParam === 'map') return

    const next = new URLSearchParams(searchParams)
    next.set('view', window.matchMedia('(max-width: 767px)').matches ? 'map' : 'list')
    setSearchParams(next, { replace: true })
  }, [searchParams, setSearchParams, viewParam])

  useEffect(() => {
    setSearchInput(query)
  }, [query])

  useEffect(() => {
    const updateMobileMapHeight = () => {
      if (!window.matchMedia('(max-width: 767px)').matches) {
        setMobileMapHeight(undefined)
        return
      }

      const viewportHeight = window.visualViewport?.height ?? window.innerHeight
      const headerHeight = mobileHeaderRef.current?.getBoundingClientRect().height ?? 0
      const navHeight = document.querySelector('[data-mobile-nav]')?.getBoundingClientRect().height ?? 0
      const nextHeight = Math.max(0, Math.floor(viewportHeight - headerHeight - navHeight))
      setMobileMapHeight(nextHeight)
    }

    updateMobileMapHeight()
    const resizeObserver = new ResizeObserver(updateMobileMapHeight)
    if (mobileHeaderRef.current) resizeObserver.observe(mobileHeaderRef.current)
    window.addEventListener('resize', updateMobileMapHeight)
    window.visualViewport?.addEventListener('resize', updateMobileMapHeight)

    return () => {
      resizeObserver.disconnect()
      window.removeEventListener('resize', updateMobileMapHeight)
      window.visualViewport?.removeEventListener('resize', updateMobileMapHeight)
    }
  }, [])

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(searchParams)
    if (value) next.set(key, value)
    else next.delete(key)
    setSearchParams(next)
    captureAnalyticsEvent('search_filter_changed', { filter: key, value: value || null, listing_kind: kind })
    recordLeadIntentEvent('search_filter_changed', { source: 'web', metadata: { filter: key, value: value || '', listing_kind: kind, surface: 'search_page' } })
  }

  function changeViewMode(value: 'list' | 'map', surface: string) {
    const next = new URLSearchParams(searchParams)
    next.set('view', value)
    setSearchParams(next)
    captureAnalyticsEvent('search_view_changed', { view_mode: value, surface })
    recordLeadIntentEvent('search_view_changed', { source: 'web', metadata: { view_mode: value, surface } })
  }

  function toggleFeature(slug: string) {
    const nextFeatures = featureList.includes(slug)
      ? featureList.filter((item) => item !== slug)
      : [...featureList, slug]
    setParam('features', nextFeatures.join(','))
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setParam('q', searchInput.trim())
  }

  function clearMobileFilters() {
    const next = new URLSearchParams(searchParams)
    ;['village', 'property_type', 'beds', 'max_price', 'features'].forEach((key) => next.delete(key))
    setSearchParams(next)
    captureAnalyticsEvent('search_filter_cleared', { listing_kind: kind, surface: 'mobile_filter_sheet' })
    recordLeadIntentEvent('search_filter_changed', { source: 'web', metadata: { filter: 'clear', value: '', listing_kind: kind, surface: 'mobile_filter_sheet' } })
  }

  return (
    <Shell mobileBottomPadding={viewMode !== 'map'}>
      <div ref={mobileHeaderRef}>
        <MobileAppSearchHeader
          kind={kind}
          viewMode={viewMode}
          listingsCount={listings.length}
          onKindChange={(value) => setParam('kind', value)}
          onViewModeChange={(value) => changeViewMode(value, 'mobile_header')}
          onFilterClick={() => setShowFilters(true)}
          onMenuClick={() => setMobileMenuOpen(true)}
          searchInput={searchInput}
          onSearchInputChange={setSearchInput}
          onSearch={submitSearch}
        />
      </div>
      <MobileFilterSheet
        open={showFilters}
        onClose={() => setShowFilters(false)}
        kind={kind}
        village={village}
        villages={villagesData?.villages ?? []}
        propertyType={propertyType}
        beds={beds}
        maxPrice={maxPrice}
        featureList={featureList}
        onParamChange={setParam}
        onFeatureToggle={toggleFeature}
        onClear={clearMobileFilters}
      />
      <div className="hidden md:block">
        <HeroHeader kind={kind} onKindChange={(value) => setParam('kind', value)} />
      </div>

      <section className="relative z-10 mx-auto hidden max-w-7xl px-5 md:-mt-10 md:block">
        <div className="rounded-[2rem] border border-black/5 bg-white p-4 shadow-2xl shadow-[var(--brand-primary)]/10">
          <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto] lg:items-center">
            <form onSubmit={submitSearch} role="search" className="flex min-w-0 items-center gap-3 rounded-2xl border border-[#dce5df] px-4 py-2 text-[#50625e] focus-within:border-[#0f705e] focus-within:ring-4 focus-within:ring-[#dff3ec]">
              <Search size={18} />
              <input
                type="search"
                aria-label="Search listings"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Village, address, base, feature, or listing ID"
                className="min-w-0 flex-1 bg-transparent text-sm text-[#304942] outline-none placeholder:text-[#66746f]"
              />
              <button type="submit" className="rounded-xl bg-[var(--brand-primary)] px-3 py-2 text-xs font-bold text-white">Search</button>
            </form>
            <select
              value={village}
              onChange={(event) => setParam('village', event.target.value)}
              className="min-h-12 rounded-2xl border border-[#dce5df] bg-white px-4 text-sm font-semibold text-[#304942]"
            >
              <option value="">All villages</option>
              {villagesData?.villages.map((item) => (
                <option key={item.id} value={item.slug}>{item.name}</option>
              ))}
            </select>
            <button
              onClick={() => setShowFilters((value) => !value)}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#e99f3e] px-5 text-sm font-bold text-[#25170b]"
            >
              <SlidersHorizontal size={18} /> Filters
            </button>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {quickFilters.map((chip) => {
              const active = featureList.includes(chip.slug)
              return (
                <button
                  key={chip.slug}
                  onClick={() => toggleFeature(chip.slug)}
                  className={`rounded-full px-3 py-2 text-xs font-semibold transition ${
                    active ? 'bg-[var(--brand-primary)] text-white' : 'bg-[#f6f1e8] text-[#53645f] hover:bg-[#e8ded0]'
                  }`}
                >
                  {chip.label}
                </button>
              )
            })}
          </div>

          {showFilters && (
            <div className="mt-5 hidden gap-4 border-t border-[#edf0ec] pt-5 md:grid md:grid-cols-3">
              <label className="grid gap-2 text-sm font-semibold text-[#304942]">
                Property type
                <select
                  value={propertyType}
                  onChange={(event) => setParam('property_type', event.target.value)}
                  className="min-h-12 rounded-2xl border border-[#dce5df] bg-white px-4"
                >
                  {propertyTypes.map((type) => (
                    <option key={type.value} value={type.value}>{type.label}</option>
                  ))}
                </select>
              </label>
              <label className="grid gap-2 text-sm font-semibold text-[#304942]">
                Minimum beds
                <select value={beds} onChange={(event) => setParam('beds', event.target.value)} className="min-h-12 rounded-2xl border border-[#dce5df] bg-white px-4">
                  <option value="">Any beds</option>
                  <option value="2">2+</option>
                  <option value="3">3+</option>
                  <option value="4">4+</option>
                </select>
              </label>
              <label className="grid gap-2 text-sm font-semibold text-[#304942]">
                Maximum price
                <select value={maxPrice} onChange={(event) => setParam('max_price', event.target.value)} className="min-h-12 rounded-2xl border border-[#dce5df] bg-white px-4">
                  <option value="">No max</option>
                  <option value={kind === 'rent' ? '2500' : '500000'}>{kind === 'rent' ? '$2,500/mo' : '$500,000'}</option>
                  <option value={kind === 'rent' ? '3500' : '700000'}>{kind === 'rent' ? '$3,500/mo' : '$700,000'}</option>
                  <option value={kind === 'rent' ? '5000' : '1000000'}>{kind === 'rent' ? '$5,000/mo' : '$1,000,000'}</option>
                </select>
              </label>
            </div>
          )}
        </div>
      </section>

      <section className={`mx-auto max-w-7xl gap-6 py-0 md:px-5 md:py-8 ${viewMode === 'map' ? 'grid' : 'grid px-5 pt-6 lg:grid-cols-[1fr_420px]'}`}>
        <div>
          <div className="hidden md:block">
            <SectionHeading
              kicker="Listings"
              title={`Latest Guam ${kind === 'sale' ? 'homes for sale' : 'rentals'}`}
              action={
                <div className="hidden items-center gap-2 md:flex">
                  <button onClick={() => { setSaveSearchOpen(true); recordLeadIntentEvent('saved_search_opened', { source: 'web', metadata: { surface: 'desktop_toolbar', listing_kind: kind } }) }} className="inline-flex items-center gap-2 rounded-full border border-[#d7ded9] bg-white px-4 py-2 text-sm font-semibold"><Bell size={16} /> Save search</button>
                  <button onClick={() => {
                    const nextViewMode = viewMode === 'list' ? 'map' : 'list'
                    changeViewMode(nextViewMode, 'desktop_toolbar')
                  }} className="inline-flex items-center gap-2 rounded-full border border-[#d7ded9] bg-white px-4 py-2 text-sm font-semibold"><Map size={16} /> {viewMode === 'list' ? 'Map view' : 'List view'}</button>
                  <Link to="/account/requests" className="inline-flex items-center gap-2 rounded-full border border-[#d7ded9] bg-white px-4 py-2 text-sm font-semibold"><MessageSquare size={16} /> My requests</Link>
                </div>
              }
            />
          </div>

          {isLoading && <StateCard>Loading listings...</StateCard>}
          {isError && <StateCard tone="error">We could not load listings right now. Please try again shortly.</StateCard>}
          {!isLoading && listings.length === 0 && <StateCard>No listings match those filters yet.</StateCard>}
          {usesDemoInventory && <DemoInventoryNotice className="mb-4" />}

          {viewMode === 'map' ? (
            fullMapOpen ? (
              <div style={mobileMapHeight ? { height: mobileMapHeight } : undefined} className="h-[calc(100svh-330px)] rounded-none border border-black/5 bg-[#dbe8df] md:h-auto md:min-h-[760px] md:rounded-[2rem]" />
            ) : (
              <MapPanel listings={listings} returnTo={searchReturnPath} onExpand={() => setFullMapOpen(true)} mobileMapHeight={mobileMapHeight} />
            )
          ) : (
            <div className="grid gap-4">
              {listings.map((listing) => <ListingCard key={listing.id} listing={listing} returnTo={searchReturnPath} />)}
            </div>
          )}

          {viewMode === 'list' && (
            <button onClick={() => setSaveSearchOpen(true)} className="mt-5 w-full rounded-2xl bg-[var(--brand-primary)] px-4 py-3 text-sm font-bold text-white md:hidden">Save this search</button>
          )}
        </div>

        {viewMode === 'list' && <SearchAside listings={listings} />}
      </section>
      <SaveSearchModal
        open={saveSearchOpen}
        onClose={() => setSaveSearchOpen(false)}
        filters={{ kind, village, property_type: propertyType, features, beds, max_price: maxPrice }}
      />
      <FullMapModal open={fullMapOpen} onClose={() => setFullMapOpen(false)} listings={listings} returnTo={searchReturnPath} />
      <MobileMenuDrawer open={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)} />
    </Shell>
  )
}

function MobileAppSearchHeader({
  kind,
  viewMode,
  listingsCount,
  onKindChange,
  onViewModeChange,
  onFilterClick,
  onMenuClick,
  searchInput,
  onSearchInputChange,
  onSearch,
}: {
  kind: 'sale' | 'rent'
  viewMode: 'list' | 'map'
  listingsCount: number
  onKindChange: (value: 'sale' | 'rent') => void
  onViewModeChange: (value: 'list' | 'map') => void
  onFilterClick: () => void
  onMenuClick: () => void
  searchInput: string
  onSearchInputChange: (value: string) => void
  onSearch: (event: FormEvent<HTMLFormElement>) => void
}) {
  return (
    <header className="safe-top sticky top-0 z-40 border-b border-white/10 bg-[var(--brand-primary)] text-white shadow-xl shadow-[var(--brand-primary)]/20 md:hidden">
      <div className="px-4 pb-2 pt-2">
        <div className="flex items-center justify-between gap-3">
          <Brand light />
          <button onClick={onMenuClick} className="grid h-11 w-11 place-items-center rounded-full border border-white/20 text-white/86">
            <Menu size={22} />
          </button>
        </div>
        <form onSubmit={onSearch} role="search" className="mt-3 grid grid-cols-[1fr_auto] gap-2">
          <div className="flex min-h-11 min-w-0 items-center gap-2 rounded-2xl bg-white px-3 text-[#53645f] focus-within:ring-4 focus-within:ring-[#f5c16c]/35">
            <Search size={17} />
            <input
              type="search"
              aria-label="Search listings"
              value={searchInput}
              onChange={(event) => onSearchInputChange(event.target.value)}
              placeholder="Address, village, or listing ID"
              className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-[#304942] outline-none placeholder:text-[#53645f]"
            />
          </div>
          <button type="submit" className="rounded-2xl bg-[#e99f3e] px-4 text-sm font-bold text-[#25170b]">Search</button>
        </form>
        <div className="mt-2 grid grid-cols-3 gap-2 text-sm font-bold">
          <button onClick={onFilterClick} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-2xl bg-white/10 text-white/86"><SlidersHorizontal size={17} /> Filter</button>
          <button onClick={() => onViewModeChange('map')} className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-2xl ${viewMode === 'map' ? 'bg-white text-[var(--brand-primary)]' : 'bg-white/10 text-white/86'}`}><Map size={17} /> Map</button>
          <button onClick={() => onViewModeChange('list')} className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-2xl ${viewMode === 'list' ? 'bg-white text-[var(--brand-primary)]' : 'bg-white/10 text-white/86'}`}><Menu size={17} /> List</button>
        </div>
        <div className="mt-2 flex items-center justify-between gap-3 rounded-2xl bg-white/10 p-1 text-sm font-bold">
          {(['sale', 'rent'] as const).map((option) => (
            <button
              key={option}
              onClick={() => onKindChange(option)}
              className={`min-h-9 flex-1 rounded-xl capitalize ${kind === option ? 'bg-white text-[var(--brand-primary)]' : 'text-white/75'}`}
            >
              {option === 'sale' ? 'Buy' : 'Rent'}
            </button>
          ))}
          <span className="px-3 text-xs uppercase tracking-[0.14em] text-white/68">{listingsCount} found</span>
        </div>
      </div>
    </header>
  )
}

function MobileFilterSheet({
  open,
  onClose,
  kind,
  village,
  villages,
  propertyType,
  beds,
  maxPrice,
  featureList,
  onParamChange,
  onFeatureToggle,
  onClear,
}: {
  open: boolean
  onClose: () => void
  kind: 'sale' | 'rent'
  village: string
  villages: Village[]
  propertyType: string
  beds: string
  maxPrice: string
  featureList: string[]
  onParamChange: (key: string, value: string) => void
  onFeatureToggle: (slug: string) => void
  onClear: () => void
}) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-[65] grid place-items-end bg-black/45 p-2 backdrop-blur-sm md:hidden">
      <div className="safe-bottom max-h-[calc(100svh-1rem)] w-full overflow-y-auto rounded-[1.5rem] bg-white p-4 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#0f705e]">Filters</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-[-0.05em]">Refine your search</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-full border border-[#d7ded9] px-3 py-2 text-sm font-bold">Close</button>
        </div>

        <div className="mt-5 grid gap-4">
          <label className="grid gap-2 text-sm font-semibold text-[#304942]">
            Village
            <select value={village} onChange={(event) => onParamChange('village', event.target.value)} className="min-h-12 rounded-2xl border border-[#dce5df] bg-white px-4">
              <option value="">All villages</option>
              {villages.map((item) => (
                <option key={item.id} value={item.slug}>{item.name}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-2 text-sm font-semibold text-[#304942]">
            Property type
            <select value={propertyType} onChange={(event) => onParamChange('property_type', event.target.value)} className="min-h-12 rounded-2xl border border-[#dce5df] bg-white px-4">
              {propertyTypes.map((type) => (
                <option key={type.value} value={type.value}>{type.label}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-2 text-sm font-semibold text-[#304942]">
            Minimum beds
            <select value={beds} onChange={(event) => onParamChange('beds', event.target.value)} className="min-h-12 rounded-2xl border border-[#dce5df] bg-white px-4">
              <option value="">Any beds</option>
              <option value="2">2+</option>
              <option value="3">3+</option>
              <option value="4">4+</option>
            </select>
          </label>
          <label className="grid gap-2 text-sm font-semibold text-[#304942]">
            Maximum price
            <select value={maxPrice} onChange={(event) => onParamChange('max_price', event.target.value)} className="min-h-12 rounded-2xl border border-[#dce5df] bg-white px-4">
              <option value="">No max</option>
              <option value={kind === 'rent' ? '2500' : '500000'}>{kind === 'rent' ? '$2,500/mo' : '$500,000'}</option>
              <option value={kind === 'rent' ? '3500' : '700000'}>{kind === 'rent' ? '$3,500/mo' : '$700,000'}</option>
              <option value={kind === 'rent' ? '5000' : '1000000'}>{kind === 'rent' ? '$5,000/mo' : '$1,000,000'}</option>
            </select>
          </label>
        </div>

        <div className="mt-5 border-t border-[#edf0ec] pt-4">
          <p className="text-sm font-semibold text-[#304942]">Popular features</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {quickFilters.map((chip) => {
              const active = featureList.includes(chip.slug)
              return (
                <button
                  key={chip.slug}
                  type="button"
                  onClick={() => onFeatureToggle(chip.slug)}
                  className={`rounded-full px-3 py-2 text-xs font-semibold ${active ? 'bg-[var(--brand-primary)] text-white' : 'bg-[#f6f1e8] text-[#53645f]'}`}
                >
                  {chip.label}
                </button>
              )
            })}
          </div>
        </div>

        <div className="mt-5 grid grid-cols-[auto_1fr] gap-3">
          <button
            type="button"
            onClick={onClear}
            className="rounded-2xl border border-[#d7ded9] px-4 py-3 text-sm font-bold text-[#304942]"
          >
            Clear
          </button>
          <button type="button" onClick={onClose} className="rounded-2xl bg-[var(--brand-primary)] px-4 py-3 text-sm font-bold text-white">
            Show results
          </button>
        </div>
      </div>
    </div>
  )
}

function HeroHeader({ kind, onKindChange }: { kind: 'sale' | 'rent'; onKindChange: (value: 'sale' | 'rent') => void }) {
  return (
    <section className="relative overflow-hidden bg-[var(--brand-primary)] px-5 pb-12 pt-5 text-white md:pb-14 md:pt-6">
      <div className="absolute inset-0 opacity-30 [background:radial-gradient(circle_at_20%_20%,#79d0b2,transparent_28%),radial-gradient(circle_at_85%_10%,#f5c16c,transparent_24%),linear-gradient(135deg,var(--brand-primary),#071b18)]" />
      <div className="relative mx-auto max-w-7xl">
        <TopNav />
        <div className="mt-10 grid gap-7 md:mt-14 lg:grid-cols-[1fr_400px] lg:items-end">
          <div className="max-w-3xl pb-4 md:pb-6">
            <p className="text-xs font-medium uppercase tracking-[0.22em] text-[#bdebdc] md:text-sm md:tracking-[0.24em]">Find your home on Guam</p>
            <h1 className="mt-3 text-[3rem] font-semibold leading-[0.94] tracking-[-0.065em] sm:text-6xl lg:text-7xl">
              Homes, rentals, and neighborhoods built for island life.
            </h1>
            <p className="mt-4 max-w-xl text-sm leading-6 text-white/78 md:mt-5 md:text-base md:leading-7">
              Search by village, base commute, pets, furnished rentals, ocean views, typhoon-ready features, and the details that matter on Guam.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <a
                href={IOS_APP_STORE_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-bold text-[var(--brand-primary)] shadow-xl shadow-black/10 transition hover:-translate-y-0.5 hover:bg-[#f6f1e8] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                <Phone size={17} /> Get the iOS app
              </a>
              <span className="rounded-full border border-white/18 bg-white/8 px-4 py-3 text-sm font-bold text-white/78">Android coming soon</span>
            </div>
          </div>
          <div className="rounded-[2rem] border border-white/15 bg-white/10 p-4 backdrop-blur">
            <div className="flex rounded-full bg-black/20 p-1">
              {(['sale', 'rent'] as const).map((option) => (
                <button
                  key={option}
                  onClick={() => onKindChange(option)}
                  className={`flex-1 rounded-full px-5 py-3 text-sm font-semibold capitalize transition ${kind === option ? 'bg-white text-[var(--brand-primary)] shadow' : 'text-white/80'}`}
                >
                  {option === 'sale' ? 'Buy' : 'Rent'}
                </button>
              ))}
            </div>
            <p className="mt-4 text-sm leading-6 text-white/72">Switch between homes for sale and rentals, then narrow by village, commute, and island-ready features.</p>
          </div>
        </div>
      </div>
    </section>
  )
}

function DemoInventoryNotice({ className = '' }: { className?: string }) {
  return (
    <div className={`rounded-2xl border border-[#e7c88f] bg-[#fff8ea] px-4 py-3 text-sm font-semibold leading-6 text-[#5f4826] ${className}`} role="note">
      <span className="md:hidden"><span className="font-black">Demonstration inventory.</span> Availability and pricing are not live.</span>
      <span className="hidden md:inline"><span className="font-black">Demonstration inventory.</span> Listing facts and photos are sample content while authorized Guam MLS/IDX access is being completed. Availability and pricing are not live.</span>
    </div>
  )
}

function ListingCard({ listing, returnTo }: { listing: Listing; returnTo?: string }) {
  const { isClerkEnabled, isSignedIn, userId } = useAuthContext()
  const { data: savedData, refetch: refetchSaved } = useQuery({ queryKey: ['saved-listings', userId], queryFn: fetchSavedListings, enabled: isClerkEnabled && isSignedIn })
  const [optimisticSaved, setOptimisticSaved] = useState(false)
  const isSaved = savedData?.listing_ids?.includes(listing.id) ?? optimisticSaved
  const saveMutation = useMutation({
    mutationFn: () => isSaved ? removeSavedListingForUser(listing.id) : saveListingForUser(listing.id),
    onMutate: () => setOptimisticSaved((current) => !current),
    onSuccess: (response) => {
      refetchSaved()
      recordLeadIntentEvent(response.saved ? 'listing_saved' : 'listing_unsaved', { listing_id: listing.id, source: 'web', metadata: { surface: 'listing_card', listing_kind: listing.listing_kind, selected: response.saved } })
    },
    onError: () => setOptimisticSaved((current) => !current),
  })

  const heartButton = (
    <button
      onClick={isSignedIn ? () => {
        const nextSaved = !isSaved
        captureAnalyticsEvent('listing_saved_toggled', { listing_id: listing.id, saved: nextSaved, source: 'listing_card' })
        saveMutation.mutate()
      } : undefined}
      className={`rounded-full border p-2 ${isSaved ? 'border-[var(--brand-primary)] bg-[#e9f5ef] text-[var(--brand-primary)]' : 'border-[#d7ded9] text-[#53645f]'}`}
      aria-label={isSaved ? 'Saved listing' : 'Save listing'}
    >
      <Heart size={17} fill={isSaved ? 'var(--brand-primary)' : 'none'} />
    </button>
  )

  return (
    <article className="group overflow-hidden rounded-[1.7rem] border border-black/5 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-xl hover:shadow-[var(--brand-primary)]/10 md:grid md:min-h-[260px] md:grid-cols-[260px_1fr]">
      <Link to={routes.listing(listing.id, returnTo)} onClick={() => captureAnalyticsEvent('listing_opened', { listing_id: listing.id, source: 'listing_image' })} className="block overflow-hidden">
        <img src={listing.primary_photo_url} onError={(event) => { event.currentTarget.onerror = null; event.currentTarget.src = FALLBACK_LISTING_IMAGE }} alt="" className="h-56 w-full object-cover transition duration-500 group-hover:scale-105 md:h-[260px]" />
      </Link>
      <div className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-2xl font-bold tracking-[-0.04em]">{currency(listing.price, listing.listing_kind)}</p>
            <Link to={routes.listing(listing.id, returnTo)} onClick={() => captureAnalyticsEvent('listing_opened', { listing_id: listing.id, source: 'listing_title' })} className="mt-1 block text-lg font-semibold transition hover:text-[#0f705e]">{listing.title}</Link>
            <p className="mt-1 flex items-center gap-1 text-sm text-[#66746f]"><MapPin size={14} /> {listing.village.name} · {listing.address}</p>
          </div>
          <span className="rounded-full bg-[#e9f5ef] px-3 py-1 text-xs font-bold uppercase tracking-wide text-[#0f705e]">{listing.listing_kind}</span>
        </div>
        <PropertyStats listing={listing} />
        <FeaturePills features={listing.features.slice(0, 4)} />
        <div className="mt-5 flex items-center justify-between">
          <Link to={routes.listing(listing.id, returnTo)} onClick={() => captureAnalyticsEvent('listing_opened', { listing_id: listing.id, source: 'listing_card' })} className="inline-flex items-center gap-2 text-sm font-bold text-[var(--brand-primary)]">View details <ChevronRight size={16} /></Link>
          {isSignedIn ? heartButton : <SignInButton mode="modal">{heartButton}</SignInButton>}
        </div>
      </div>
    </article>
  )
}

export function ListingDetailPage() {
  const { id = '' } = useParams()
  const location = useLocation()
  const [detailParams] = useSearchParams()
  const fromAdmin = detailParams.get('from') === 'admin'
  const adminLeadId = detailParams.get('lead_id')
  const parsedAdminLeadId = Number(adminLeadId)
  const hasValidAdminLeadId = Boolean(adminLeadId && /^\d+$/.test(adminLeadId) && Number.isSafeInteger(parsedAdminLeadId) && parsedAdminLeadId > 0)
  const requestedBackPath = safeReturnPath(detailParams.get('return_to'), '/')
  const adminBackPath = hasValidAdminLeadId ? `/admin/leads/${parsedAdminLeadId}` : requestedBackPath.startsWith('/admin/') ? requestedBackPath : '/admin/leads'
  const listingBackPath = fromAdmin ? adminBackPath : requestedBackPath
  const listingPath = `${location.pathname}${location.search}`
  const listingBackLabel = fromAdmin
    ? adminBackPath.startsWith('/admin/intent') ? 'Back to intent' : 'Back to lead'
    : listingBackPath.startsWith('/admin/showings/')
      ? 'Back to showing'
      : listingBackPath.startsWith('/account/requests/')
      ? 'Back to request'
      : listingBackPath.startsWith('/account/requests')
        ? 'Back to requests'
        : listingBackPath.startsWith('/agents/')
          ? 'Back to agent'
        : listingBackPath.startsWith('/saved')
          ? 'Back to saved homes'
          : listingBackPath.startsWith('/villages/')
            ? 'Back to village'
            : 'Back to search'
  const [leadOpen, setLeadOpen] = useState(false)
  const [priceTrackerOpen, setPriceTrackerOpen] = useState(false)
  const { isClerkEnabled, isSignedIn, userId } = useAuthContext()
  const [selectedAgentId, setSelectedAgentId] = useState<number | null>(null)
  const [localSaved, setLocalSaved] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [photoIndex, setPhotoIndex] = useState(0)
  const viewedListingRef = useRef<number | null>(null)
  const { data, isLoading, isError } = useQuery({ queryKey: ['listing', id], queryFn: () => fetchListing(id), enabled: Boolean(id) })
  const { data: savedData, refetch: refetchSaved } = useQuery({ queryKey: ['saved-listings', userId], queryFn: fetchSavedListings, enabled: isClerkEnabled && isSignedIn })
  const { data: routingAgentsData, isLoading: routingAgentsLoading } = useQuery({ queryKey: ['agents', 'routing', 'listing-detail'], queryFn: () => fetchAgents(), enabled: Boolean(data?.listing) })
  const listing = data?.listing
  const routingAgents = routingAgentsData?.agents ?? []
  const saved = listing ? (savedData?.listing_ids?.includes(listing.id) ?? localSaved) : false
  const saveMutation = useMutation({
    mutationFn: () => listing && saved ? removeSavedListingForUser(listing.id) : listing ? saveListingForUser(listing.id) : Promise.reject(new Error('No listing loaded')),
    onMutate: () => setLocalSaved((current) => !current),
    onSuccess: (response) => {
      refetchSaved()
      if (listing) recordLeadIntentEvent(response.saved ? 'listing_saved' : 'listing_unsaved', { listing_id: listing.id, source: 'web', metadata: { surface: 'listing_detail', listing_kind: listing.listing_kind, selected: response.saved } })
    },
    onError: () => setLocalSaved((current) => !current),
  })
  const photos = listing?.photos?.length ? listing.photos : listing ? [{ id: 0, url: listing.primary_photo_url, position: 1, alt_text: listing.title }] : []

  useEffect(() => {
    if (isClerkEnabled && isSignedIn) setSelectedAgentId(storedSelectedAgentId())
    else setSelectedAgentId(null)
  }, [isClerkEnabled, isSignedIn, listing?.id])

  useEffect(() => {
    if (!listing || fromAdmin || viewedListingRef.current === listing.id) return

    viewedListingRef.current = listing.id
    recordLeadIntentEvent('listing_detail_viewed', {
      listing_id: listing.id,
      source: 'web',
      metadata: { surface: 'listing_detail', listing_kind: listing.listing_kind, path: window.location.pathname },
    })
  }, [fromAdmin, listing])

  function selectPreferredAgent(agentId: number | null) {
    if (!isClerkEnabled || !isSignedIn) return

    setSelectedAgentId(agentId)
    storeSelectedAgentId(agentId)
    captureAnalyticsEvent(agentId ? 'agent_selected' : 'agent_selection_cleared', { agent_id: agentId ?? undefined, source: 'listing_detail' })
    if (agentId) recordLeadIntentEvent('agent_selected', { agent_id: agentId, listing_id: listing?.id, source: 'web', metadata: { surface: 'listing_detail' } })
  }

  async function shareListing() {
    if (!listing) return
    const shareData = { title: listing.title, text: `${listing.title} — ${currency(listing.price, listing.listing_kind)}`, url: window.location.href }
    captureAnalyticsEvent('listing_shared', { listing_id: listing.id, listing_kind: listing.listing_kind })

    try {
      if (navigator.share) await navigator.share(shareData)
      else await navigator.clipboard?.writeText(window.location.href)
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      console.warn('Unable to share listing', error)
    }
  }

  return (
    <main className="min-h-screen bg-[#f6f1e8] pb-28 text-[#17211f] md:pb-0">
      {isLoading && <div className="p-5"><StateCard>Loading listing...</StateCard></div>}
      {isError && <div className="p-5"><StateCard tone="error">Unable to load listing.</StateCard></div>}
      {listing && (
        <>
          <div className="mobile-detail-header sticky top-0 z-40 border-b border-white/10 bg-[var(--brand-primary)] px-4 pb-4 text-white shadow-xl shadow-[var(--brand-primary)]/15 md:hidden">
            <div className="flex items-center justify-between gap-3">
              <Link to={listingBackPath} className="inline-flex min-h-12 items-center gap-2 rounded-full bg-white/10 px-4 text-sm font-bold hover:bg-white/15 active:scale-[0.98]"><ArrowLeft size={18} /> {listingBackLabel.replace('Back to ', '')}</Link>
              <div className="flex items-center gap-2">
                <button onClick={() => {
                  setLeadOpen(true)
                  captureAnalyticsEvent('lead_modal_opened', { listing_id: listing.id, source: 'mobile_header' })
                  recordLeadIntentEvent('showing_form_opened', { listing_id: listing.id, source: 'web', metadata: { surface: 'mobile_header', listing_kind: listing.listing_kind } })
                }} className="min-h-12 rounded-2xl bg-[#e99f3e] px-5 text-sm font-bold text-[#25170b] hover:bg-[#f2ad4e] active:scale-[0.98]">Request</button>
                <button onClick={() => setMenuOpen(true)} className="grid h-12 w-12 place-items-center rounded-full bg-white/10 hover:bg-white/15 active:scale-[0.98]"><Menu size={20} /></button>
              </div>
            </div>
          </div>

          <div className="hidden bg-[var(--brand-primary)] px-5 py-5 text-white md:block"><div className="mx-auto max-w-7xl"><TopNav /></div></div>
          {fromAdmin && (
            <div className="border-b border-[#eadfce] bg-[#fff8ea] px-5 py-3">
              <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 text-sm font-bold text-[#304942]">
                <span>You are viewing this public listing from {adminBackPath.startsWith('/admin/intent') ? 'search intent' : 'the admin CRM'}.</span>
                <Link to={adminBackPath} className="inline-flex items-center gap-2 rounded-full bg-[var(--brand-primary)] px-4 py-2 text-white"><ArrowLeft size={16} /> {listingBackLabel}</Link>
              </div>
            </div>
          )}

          <section className="mx-auto max-w-7xl md:px-5 md:py-6">
            <Link to={listingBackPath} className="mb-6 hidden items-center gap-2 text-sm font-bold text-[#0f705e] md:inline-flex"><ArrowLeft size={16} /> {listingBackLabel}</Link>
            <div className="grid gap-6 lg:grid-cols-[1fr_390px]">
              <div>
                <div className="relative mx-4 mt-5 overflow-hidden rounded-[2rem] bg-[var(--brand-primary)] shadow-xl shadow-[var(--brand-primary)]/10 md:mx-0 md:mt-0">
                  <img
                    src={photos[photoIndex]?.url || listing.primary_photo_url}
                    onError={(event) => { event.currentTarget.onerror = null; event.currentTarget.src = FALLBACK_LISTING_IMAGE }}
                    alt=""
                    className="h-[40svh] min-h-[300px] w-full object-cover md:h-[560px]"
                  />
                  {photos.length > 1 && (
                    <>
                      <button onClick={() => setPhotoIndex((photoIndex - 1 + photos.length) % photos.length)} className="absolute left-3 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-[var(--brand-primary)] shadow-lg hover:bg-white active:scale-95"><ChevronLeft size={22} /></button>
                      <button onClick={() => setPhotoIndex((photoIndex + 1) % photos.length)} className="absolute right-3 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-[var(--brand-primary)] shadow-lg hover:bg-white active:scale-95"><ChevronRightIcon size={22} /></button>
                    </>
                  )}
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-[var(--brand-primary)]/70 to-transparent p-4 text-center text-sm font-bold text-white">
                    {photos.length > 1 ? `${photoIndex + 1} of ${photos.length}` : '1 photo'}
                  </div>
                </div>

                <div className="relative z-10 mx-4 mt-5 rounded-[2rem] bg-white p-5 shadow-xl shadow-[var(--brand-primary)]/10 md:mx-0 md:mt-6 md:p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-4xl font-semibold tracking-[-0.06em] md:text-5xl">{currency(listing.price, listing.listing_kind)}</p>
                      <h1 className="mt-2 text-xl font-semibold leading-snug tracking-[-0.03em] md:text-4xl">{listing.address}</h1>
                      <p className="mt-1 text-sm font-semibold text-[#66746f]"><Link to={routes.village(listing.village.slug, listingPath)} className="underline decoration-[#b6ccc3] underline-offset-4 transition hover:text-[#0f705e]">{listing.village.name}</Link> · {listing.property_type}</p>
                    </div>
                    <span className="inline-flex shrink-0 items-center gap-2 rounded-full bg-[#e9f5ef] px-3 py-2 text-sm font-bold text-[#0f705e]"><span className="h-3 w-3 rounded-full bg-[#32aa42]" /> {listing.status}</span>
                  </div>

                  <div className="mt-6 grid grid-cols-4 gap-3 text-center">
                    <DetailStat icon={<BedDouble />} value={`${listing.beds}`} label="Beds" />
                    <DetailStat icon={<Bath />} value={`${listing.baths}`} label="Baths" />
                    <DetailStat icon={<Ruler />} value={listing.square_feet?.toLocaleString() || '—'} label="Sqft" />
                    <DetailStat icon={<TrendingUp />} value={listing.listing_kind === 'rent' ? 'Rent' : 'Est.'} label={listing.listing_kind === 'rent' ? 'Monthly' : 'Payment'} />
                  </div>

                  <p className="mt-7 max-w-3xl text-base leading-8 text-[#3d4d48]">{listing.description}</p>
                  {listing.brokerage?.demo_data && <DemoInventoryNotice className="mt-6" />}
                  <FeaturePills features={listing.features} />
                  <ListingAgentRoutingPanel listing={listing} routingAgents={routingAgents} selectedAgentId={selectedAgentId} canSelectAgent={isClerkEnabled && isSignedIn} isClerkEnabled={isClerkEnabled} isLoadingAgents={routingAgentsLoading} onSelectAgent={selectPreferredAgent} className="mt-6 lg:hidden" />
                  {listing.listing_kind === 'sale' && <WebMortgageCalculator listing={listing} />}
                  <LocalIntelPanel listing={listing} />
                  {listing.brokerage?.compliance_disclaimer && <p className="mt-6 rounded-2xl bg-[#f6f1e8] p-4 text-xs font-semibold leading-6 text-[#66746f]">{listing.brokerage.compliance_disclaimer}</p>}
                </div>
              </div>

              <aside className="hidden lg:sticky lg:top-6 lg:block lg:self-start">
                <div className="rounded-[2rem] border border-black/5 bg-white p-6 shadow-xl shadow-[var(--brand-primary)]/10">
                  <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#7b8a84]">Request info</p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">Ask about this property</h2>
                  <p className="mt-3 text-sm leading-6 text-[#66746f]">Schedule a tour, ask about price changes, or save this listing for later.</p>
                  <button onClick={() => {
                    setLeadOpen(true)
                    captureAnalyticsEvent('lead_modal_opened', { listing_id: listing.id, source: 'desktop_aside' })
                    recordLeadIntentEvent('showing_form_opened', { listing_id: listing.id, source: 'web', metadata: { surface: 'desktop_aside', listing_kind: listing.listing_kind } })
                  }} className="mt-5 w-full rounded-2xl bg-[var(--brand-primary)] px-4 py-3 text-sm font-bold text-white">Request a showing</button>
                  <button onClick={() => {
                    setPriceTrackerOpen(true)
                    captureAnalyticsEvent('price_tracker_opened', { listing_id: listing.id, source: 'desktop_aside' })
                    recordLeadIntentEvent('price_tracker_opened', { listing_id: listing.id, source: 'web', metadata: { surface: 'desktop_aside', listing_kind: listing.listing_kind } })
                  }} className="mt-3 w-full rounded-2xl border border-[#d7ded9] px-4 py-3 text-sm font-bold text-[var(--brand-primary)]">Ask about price changes</button>
                  {isSignedIn ? (
                    <button onClick={() => saveMutation.mutate()} className="mt-3 w-full rounded-2xl border border-[#d7ded9] px-4 py-3 text-sm font-bold text-[var(--brand-primary)]">{saved ? 'Remove saved home' : 'Save home'}</button>
                  ) : (
                    <SignInButton mode="modal"><button className="mt-3 w-full rounded-2xl border border-[#d7ded9] px-4 py-3 text-sm font-bold text-[var(--brand-primary)]">Sign in to save</button></SignInButton>
                  )}
                  <ListingAgentRoutingPanel listing={listing} routingAgents={routingAgents} selectedAgentId={selectedAgentId} canSelectAgent={isClerkEnabled && isSignedIn} isClerkEnabled={isClerkEnabled} isLoadingAgents={routingAgentsLoading} onSelectAgent={selectPreferredAgent} className="mt-6" />
                  <dl className="mt-6 space-y-3 text-sm">
                    <InfoRow label="Listing ID" value={listing.external_id || `HH-${listing.id}`} />
                    <InfoRow label="Listed by" value={listing.agent_name || 'Listing agent'} />
                    <InfoRow label="Listing brokerage" value={listing.brokerage_name || 'Listing brokerage'} />
                  </dl>
                </div>
              </aside>
            </div>
          </section>

          <nav className="safe-bottom fixed inset-x-0 bottom-0 z-50 mx-4 mb-3 grid grid-cols-3 rounded-[1.5rem] border border-black/5 bg-white/95 px-3 pt-3 text-center text-xs font-bold text-[var(--brand-primary)] shadow-2xl shadow-[var(--brand-primary)]/15 backdrop-blur md:hidden">
            <button onClick={shareListing} className="flex min-h-16 flex-col items-center justify-center gap-1"><Share2 size={23} /> Share</button>
            <button onClick={() => {
              setPriceTrackerOpen(true)
              captureAnalyticsEvent('price_tracker_opened', { listing_id: listing.id, source: 'mobile_action_bar' })
              recordLeadIntentEvent('price_tracker_opened', { listing_id: listing.id, source: 'web', metadata: { surface: 'mobile_action_bar', listing_kind: listing.listing_kind } })
            }} className="flex min-h-16 flex-col items-center justify-center gap-1"><TrendingUp size={23} /> Price</button>
            {isSignedIn ? (
              <button onClick={() => {
                captureAnalyticsEvent('listing_saved_toggled', { listing_id: listing.id, saved: !saved })
                saveMutation.mutate()
              }} className="flex min-h-16 flex-col items-center justify-center gap-1"><Heart size={25} fill={saved ? 'var(--brand-primary)' : 'none'} /> {saved ? 'Saved' : 'Save'}</button>
            ) : (
              <SignInButton mode="modal"><button className="flex min-h-16 flex-col items-center justify-center gap-1"><Heart size={25} /> Save</button></SignInButton>
            )}
          </nav>

          <MobileMenuDrawer open={menuOpen} onClose={() => setMenuOpen(false)} />
          <LeadModal listing={listing} open={leadOpen} onClose={() => setLeadOpen(false)} />
          <PriceTrackerModal listing={listing} open={priceTrackerOpen} onClose={() => setPriceTrackerOpen(false)} />
        </>
      )}
    </main>
  )
}

export function ListingAgentRoutingPanel({
  listing,
  routingAgents,
  selectedAgentId,
  canSelectAgent,
  isClerkEnabled,
  isLoadingAgents,
  onSelectAgent,
  className = '',
}: {
  listing: Listing
  routingAgents: Agent[]
  selectedAgentId: number | null
  canSelectAgent: boolean
  isClerkEnabled: boolean
  isLoadingAgents: boolean
  onSelectAgent: (agentId: number | null) => void
  className?: string
}) {
  const location = useLocation()
  const listedAgentName = listing.agent?.name || listing.agent_name || 'Listing agent unavailable'
  const listedBrokerageName = listing.agent?.brokerage?.name || listing.brokerage?.name || listing.brokerage_name || 'Listing brokerage'
  const selectedAgent = routingAgents.find((agent) => agent.id === selectedAgentId)
  const storefrontListingAgent = listing.agent && routingAgents.some((agent) => agent.id === listing.agent?.id) ? listing.agent : null

  return (
    <section className={`${className} rounded-[1.5rem] border border-[#dfe8e2] bg-[#fbfcf8] p-4`}>
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#0f705e]">Listed by</p>
        <div className="mt-3 flex items-center gap-3">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[var(--brand-primary)] text-sm font-black text-[#f5c16c]">
            {listing.agent?.photo_url ? <img src={listing.agent.photo_url} alt="" className="h-full w-full rounded-2xl object-cover" /> : initialsFromName(listedAgentName)}
          </div>
          <div className="min-w-0">
            <p className="truncate text-base font-extrabold tracking-[-0.03em] text-[#17211f]">{listedAgentName}</p>
            <p className="truncate text-sm font-semibold text-[#66746f]">{listedBrokerageName}</p>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#7b8a84]">Listing attribution</p>
            {storefrontListingAgent && <Link to={routes.agent(storefrontListingAgent.id, `${location.pathname}${location.search}`)} className="mt-2 inline-flex min-h-11 items-center text-sm font-bold text-[var(--brand-primary)]">View agent profile <ChevronRight size={16} /></Link>}
          </div>
        </div>
      </div>

      <div className="mt-5 border-t border-[#e5ede8] pt-5">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#0f705e]">Work with</p>
        <h3 className="mt-2 text-lg font-semibold tracking-[-0.04em] text-[#17211f]">Choose your preferred Hafa Homes agent.</h3>
        <p className="mt-2 text-sm leading-6 text-[#66746f]">This controls who follows up with you. The listing attribution above stays unchanged for MLS/brokerage compliance.</p>

        {!canSelectAgent ? (
          <div className="mt-4 rounded-2xl bg-[#e9f5ef] p-4">
            <p className="text-sm font-semibold leading-6 text-[#304942]">Sign in to choose a preferred agent for future requests. You can still send a showing request without an account.</p>
            {isClerkEnabled ? (
              <SignInButton mode="modal">
                <button type="button" className="mt-3 min-h-11 rounded-full bg-[var(--brand-primary)] px-5 text-sm font-bold text-white">Sign in to choose</button>
              </SignInButton>
            ) : (
              <button type="button" disabled className="mt-3 min-h-11 rounded-full bg-[var(--brand-primary)]/60 px-5 text-sm font-bold text-white">Sign-in coming online</button>
            )}
          </div>
        ) : isLoadingAgents ? (
          <p className="mt-4 rounded-2xl bg-[#f6f1e8] p-4 text-sm font-semibold text-[#66746f]">Loading brokerage agents...</p>
        ) : routingAgents.length > 0 ? (
          <div className="mt-4 grid gap-2">
            <button type="button" onClick={() => onSelectAgent(null)} className={`min-h-11 rounded-2xl border px-4 text-left text-sm font-bold transition ${selectedAgent ? 'border-[#d7ded9] text-[#304942] hover:border-[#0f705e]' : 'border-[#0f705e] bg-[#e9f5ef] text-[#0f705e]'}`}>
              Brokerage team / no preference
            </button>
            {routingAgents.map((agent) => {
              const selected = selectedAgentId === agent.id
              return (
                <button key={agent.id} type="button" onClick={() => onSelectAgent(agent.id)} className={`min-h-11 rounded-2xl border px-4 text-left text-sm font-bold transition ${selected ? 'border-[#0f705e] bg-[#e9f5ef] text-[#0f705e]' : 'border-[#d7ded9] text-[#304942] hover:border-[#0f705e]'}`}>
                  {agent.name}
                </button>
              )
            })}
          </div>
        ) : (
          <p className="mt-4 rounded-2xl bg-[#f6f1e8] p-4 text-sm font-semibold text-[#66746f]">No preferred-agent options are available yet. Requests will route to the brokerage team.</p>
        )}
      </div>
    </section>
  )
}

function DetailStat({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <div className="rounded-2xl bg-[#f6f1e8] p-3 ring-1 ring-[#eadfce] md:p-3">
      <div className="mx-auto grid h-9 w-9 place-items-center text-[var(--brand-primary)] [&_svg]:h-7 [&_svg]:w-7">{icon}</div>
      <p className="mt-2 text-lg font-extrabold leading-none tracking-[-0.03em]">{value}</p>
      <p className="mt-1 text-xs font-bold text-[#53645f]">{label}</p>
    </div>
  )
}

function WebMortgageCalculator({ listing }: { listing: Listing }) {
  const [downPaymentPercent, setDownPaymentPercent] = useState('10')
  const [interestRate, setInterestRate] = useState('6.75')
  const [loanTermYears, setLoanTermYears] = useState('30')
  const downPayment = listing.price * (Number(downPaymentPercent || 0) / 100)
  const loanAmount = Math.max(listing.price - downPayment, 0)
  const monthlyRate = Number(interestRate || 0) / 100 / 12
  const payments = Number(loanTermYears || 30) * 12
  const principalAndInterest = monthlyRate > 0 ? loanAmount * (monthlyRate * ((1 + monthlyRate) ** payments)) / (((1 + monthlyRate) ** payments) - 1) : loanAmount / Math.max(payments, 1)

  return (
    <div className="mt-6 rounded-[1.5rem] bg-[#e9f5ef] p-5">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#0f705e]">Mortgage estimate</p>
      <h2 className="mt-2 text-3xl font-semibold tracking-[-0.05em]">{currency(principalAndInterest || 0, 'sale')}/mo</h2>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <Input label="Down payment %" value={downPaymentPercent} onChange={(event) => setDownPaymentPercent(event.target.value)} inputMode="decimal" />
        <Input label="Interest rate %" value={interestRate} onChange={(event) => setInterestRate(event.target.value)} inputMode="decimal" />
        <Input label="Loan term years" value={loanTermYears} onChange={(event) => setLoanTermYears(event.target.value)} inputMode="numeric" />
      </div>
      <p className="mt-3 text-xs font-semibold leading-5 text-[#66746f]">Estimate only. Taxes, insurance, HOA dues, lender fees, and Guam-specific costs should be verified with professionals.</p>
    </div>
  )
}

function LocalIntelPanel({ listing }: { listing: Listing }) {
  const location = useLocation()
  const intel = listing.village.local_intel
  if (!intel || Object.keys(intel).length === 0) return null

  return (
    <div className="mt-6 rounded-[1.75rem] border border-[#cfe4da] bg-[#e9f5ef] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#0f705e]">Local intel</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-[-0.05em]">Around {listing.village.name}</h2>
        </div>
        {listing.village.region && <span className="rounded-full bg-white px-4 py-2 text-xs font-bold uppercase tracking-[0.12em] text-[var(--brand-primary)]">{listing.village.region}</span>}
      </div>
      {intel.summary && <p className="mt-4 text-base font-semibold leading-7 text-[#53645f]">{intel.summary}</p>}
      <Link to={routes.village(listing.village.slug, `${location.pathname}${location.search}`)} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-4 text-sm font-bold text-[var(--brand-primary)]">Explore {listing.village.name} <ChevronRight size={16} /></Link>
      {Boolean(intel.lifestyle_tags?.length) && <div className="mt-4 flex flex-wrap gap-2">{intel.lifestyle_tags?.slice(0, 5).map((tag) => <span key={tag} className="rounded-full bg-white px-3 py-1 text-xs font-bold text-[#0f705e]">{tag}</span>)}</div>}
      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <LocalIntelGroup title="Nearby schools" items={intel.nearby_schools} note={intel.schools_note} />
        <LocalIntelGroup title="Parks and recreation" items={intel.parks_and_recreation} />
        <LocalIntelGroup title="Daily life" items={intel.daily_life} />
        <LocalIntelGroup title="Commute notes" items={intel.commute_notes} />
      </div>
      <p className="mt-4 text-xs font-semibold leading-5 text-[#66746f]">School assignments, access, and commute times should be verified before making housing decisions.</p>
    </div>
  )
}

function LocalIntelGroup({ title, items, note }: { title: string; items?: string[]; note?: string }) {
  if (!items?.length && !note) return null
  return (
    <div className="rounded-2xl bg-white p-4">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#0f705e]">{title}</p>
      <ul className="mt-3 grid gap-2 text-sm font-semibold leading-6 text-[#304942]">
        {items?.slice(0, 5).map((item) => <li key={item}>• {item}</li>)}
      </ul>
      {note && <p className="mt-3 text-sm leading-6 text-[#66746f]">{note}</p>}
    </div>
  )
}

function VillagesPage() {
  const { data, isLoading } = useQuery({ queryKey: ['villages'], queryFn: fetchVillages })
  return (
    <Shell compact>
      <ContentHeader kicker="Guam village guide" title="Search by how each part of Guam actually lives." description="North, central, south, base access, resort areas, and everyday commute patterns all shape housing decisions on island." />
      <section className="mx-auto grid max-w-7xl gap-4 px-5 pb-10 md:grid-cols-2 lg:grid-cols-3">
        {isLoading && <StateCard>Loading villages...</StateCard>}
        {data?.villages.map((village) => (
          <Link key={village.id} to={`/villages/${village.slug}`} className="group rounded-[2rem] bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-xl hover:shadow-[var(--brand-primary)]/10">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#0f705e]">{village.region}</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.05em]">{village.name}</h2>
            <p className="mt-3 line-clamp-3 text-sm leading-6 text-[#66746f]">{village.description}</p>
            <p className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-[var(--brand-primary)]">Explore listings <ChevronRight size={16} /></p>
          </Link>
        ))}
      </section>
    </Shell>
  )
}

function AgentsPage() {
  const { isClerkEnabled, isSignedIn } = useAuthContext()
  const { data, isLoading, isError } = useQuery({ queryKey: ['agents'], queryFn: () => fetchAgents() })
  const [selectedAgentId, setSelectedAgentId] = useState<number | null>(null)
  const agents = data?.agents ?? []
  const canSelectAgent = isClerkEnabled && isSignedIn

  useEffect(() => {
    if (canSelectAgent) setSelectedAgentId(storedSelectedAgentId())
    else setSelectedAgentId(null)
  }, [canSelectAgent])

  function selectAgent(agent: Agent) {
    if (!canSelectAgent) return

    setSelectedAgentId(agent.id)
    storeSelectedAgentId(agent.id)
    captureAnalyticsEvent('agent_selected', { agent_id: agent.id, brokerage_id: agent.brokerage_id, source: 'agents_page' })
  }

  function clearSelectedAgent() {
    if (!canSelectAgent) return

    setSelectedAgentId(null)
    storeSelectedAgentId(null)
    captureAnalyticsEvent('agent_selection_cleared', { source: 'agents_page' })
  }

  return (
    <Shell compact>
      <ContentHeader
        kicker="Agent network"
        title="Choose who you want to work with."
        description="Browse active brokerage agents. Sign in to set a preferred contact, and Hafa Homes can route future requests to that agent while listing attribution stays intact."
      />
      <section className="mx-auto max-w-7xl px-5 pb-10">
        <div className="mb-5 rounded-[2rem] bg-[var(--brand-primary)] p-5 text-white shadow-xl shadow-[var(--brand-primary)]/10 md:p-6">
          <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-center">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#bdebdc]">Lead routing</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-[-0.05em] md:text-3xl">{canSelectAgent ? 'Your selected agent follows you into showing requests.' : 'Sign in before choosing a preferred agent.'}</h2>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-white/72">Listing attribution stays intact for MLS/brokerage compliance, while signed-in customers can choose the agent who owns follow-up in the CRM.</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row md:flex-col lg:flex-row">
              {canSelectAgent && selectedAgentId && <button type="button" onClick={clearSelectedAgent} className="inline-flex min-h-12 items-center justify-center rounded-full border border-white/25 px-5 text-sm font-bold text-white">Clear preference</button>}
              <Link to="/" className="inline-flex min-h-12 items-center justify-center rounded-full bg-white px-5 text-sm font-bold text-[var(--brand-primary)]">Search listings</Link>
            </div>
          </div>
        </div>

        {isLoading && <StateCard>Loading agents...</StateCard>}
        {isError && <StateCard tone="error">Unable to load agents right now.</StateCard>}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {agents.map((agent) => {
            const selected = selectedAgentId === agent.id
            return (
              <article key={agent.id} className={`rounded-[2rem] bg-white p-5 shadow-sm ring-1 transition hover:-translate-y-0.5 hover:shadow-xl hover:shadow-[var(--brand-primary)]/10 ${selected ? 'ring-[#0f705e]' : 'ring-black/5'}`}>
                <div className="flex items-start gap-4">
                  <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-2xl bg-[var(--brand-primary)] text-lg font-black text-[#f5c16c]">
                    {agent.photo_url ? <img src={agent.photo_url} alt="" className="h-full w-full object-cover" /> : agentInitials(agent)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xl font-semibold tracking-[-0.04em] text-[#17211f]">{agent.name}</p>
                    <p className="mt-1 text-sm font-semibold text-[#66746f]">{agent.brokerage?.name ?? 'Brokerage partner'}</p>
                    {agent.license_number && <p className="mt-1 text-xs font-bold uppercase tracking-[0.14em] text-[#7b8a84]">License {agent.license_number}</p>}
                  </div>
                </div>
                {agent.bio && <p className="mt-4 line-clamp-3 text-sm leading-6 text-[#53645f]">{agent.bio}</p>}
                <div className="mt-5 grid gap-2 text-sm font-semibold text-[#53645f]">
                  {agent.email && <span className="inline-flex items-center gap-2"><Mail size={15} /> {agent.email}</span>}
                  {agent.phone && <span className="inline-flex items-center gap-2"><Phone size={15} /> {agent.phone}</span>}
                </div>
                <Link to={routes.agent(agent.id, '/agents')} className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-[#d7ded9] px-4 text-sm font-bold text-[var(--brand-primary)]">View profile <ChevronRight size={16} /></Link>
                {canSelectAgent ? (
                  <button
                    type="button"
                    onClick={() => selectAgent(agent)}
                    className={`mt-5 w-full rounded-2xl px-4 py-3 text-sm font-bold transition ${selected ? 'bg-[#e9f5ef] text-[#0f705e]' : 'bg-[var(--brand-primary)] text-white hover:bg-[#174c43]'}`}
                  >
                    {selected ? 'Selected for future requests' : `Work with ${agent.name.split(' ')[0]}`}
                  </button>
                ) : isClerkEnabled ? (
                  <SignInButton mode="modal">
                    <button type="button" className="mt-5 w-full rounded-2xl bg-[var(--brand-primary)] px-4 py-3 text-sm font-bold text-white transition hover:bg-[#174c43]">Sign in to work with {agent.name.split(' ')[0]}</button>
                  </SignInButton>
                ) : (
                  <button type="button" disabled className="mt-5 w-full rounded-2xl bg-[var(--brand-primary)]/60 px-4 py-3 text-sm font-bold text-white">Sign-in coming online</button>
                )}
              </article>
            )
          })}
        </div>
        {agents.length === 0 && !isLoading && <StateCard>No active agents are published yet.</StateCard>}
      </section>
    </Shell>
  )
}

export function AgentDetailPage() {
  const { id = '' } = useParams()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const returnPath = safeReturnPath(searchParams.get('return_to'), '/agents')
  const rawPage = Number(searchParams.get('page') || '1')
  const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1
  const { isClerkEnabled, isSignedIn } = useAuthContext()
  const [selectedAgentId, setSelectedAgentId] = useState<number | null>(null)
  const { data, isLoading, error } = useQuery({
    queryKey: ['agent', id, page],
    queryFn: () => fetchAgent(id, page),
    enabled: Boolean(id),
    retry: false,
    placeholderData: keepPreviousData,
  })
  const canSelectAgent = isClerkEnabled && isSignedIn
  const agentPath = `${location.pathname}${location.search}`
  const isUnavailable = error instanceof ApiFetchError && error.status === 404

  useEffect(() => {
    if (canSelectAgent) setSelectedAgentId(storedSelectedAgentId())
    else setSelectedAgentId(null)
  }, [canSelectAgent])

  const selectAgent = () => {
    if (!canSelectAgent || !data?.agent) return

    setSelectedAgentId(data.agent.id)
    storeSelectedAgentId(data.agent.id)
    captureAnalyticsEvent('agent_selected', { agent_id: data.agent.id, brokerage_id: data.agent.brokerage_id, source: 'agent_detail' })
    recordLeadIntentEvent('agent_selected', { agent_id: data.agent.id, source: 'web', metadata: { surface: 'agent_detail' } })
  }

  const setPage = (nextPage: number) => {
    const next = new URLSearchParams(searchParams)
    if (nextPage > 1) next.set('page', String(nextPage))
    else next.delete('page')
    setSearchParams(next)
  }

  return (
    <Shell compact>
      <section className="mx-auto max-w-7xl px-5 pb-10 pt-6">
        <Link to={returnPath} className="mb-6 inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-5 text-sm font-bold text-[#304942]"><ArrowLeft size={16} /> Back to {returnPath.startsWith('/listings/') ? 'listing' : 'agents'}</Link>
        {isLoading && <StateCard>Loading agent profile...</StateCard>}
        {isUnavailable && <StateCard tone="error">This agent is not available in this storefront.</StateCard>}
        {error && !isUnavailable && <StateCard tone="error">{displayErrorMessage(error, 'Unable to load this agent profile.')}</StateCard>}
        {data?.agent && (
          <div className="grid gap-5">
            <header className="overflow-hidden rounded-[2rem] bg-[var(--brand-primary)] p-5 text-white shadow-xl shadow-[var(--brand-primary)]/15 sm:p-7">
              <div className="grid gap-6 md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-center">
                <div className="grid h-24 w-24 place-items-center overflow-hidden rounded-[1.75rem] bg-white/10 text-3xl font-black text-[#f5c16c]">
                  {data.agent.photo_url ? <img src={data.agent.photo_url} alt="" className="h-full w-full object-cover" /> : agentInitials(data.agent)}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#bdebdc]">Storefront agent</p>
                  <h1 className="mt-3 break-words text-4xl font-semibold tracking-[-0.06em] sm:text-5xl">{data.agent.name}</h1>
                  <p className="mt-2 text-sm font-semibold text-white/72">{data.agent.brokerage?.name}</p>
                  {data.agent.license_number && <p className="mt-1 text-xs font-bold uppercase tracking-[0.14em] text-white/52">License {data.agent.license_number}</p>}
                </div>
                {canSelectAgent ? (
                  <button type="button" onClick={selectAgent} className={`min-h-12 rounded-full px-5 text-sm font-bold ${selectedAgentId === data.agent.id ? 'bg-[#e9f5ef] text-[#0f705e]' : 'bg-white text-[var(--brand-primary)]'}`}>{selectedAgentId === data.agent.id ? 'Selected for requests' : `Work with ${data.agent.name.split(' ')[0]}`}</button>
                ) : isClerkEnabled ? (
                  <SignInButton mode="modal"><button type="button" className="min-h-12 rounded-full bg-white px-5 text-sm font-bold text-[var(--brand-primary)]">Sign in to work together</button></SignInButton>
                ) : null}
              </div>
            </header>

            <div className="grid gap-5 lg:grid-cols-[minmax(280px,0.7fr)_minmax(0,1.3fr)]">
              <aside className="grid content-start gap-5 rounded-[1.75rem] bg-white p-5 shadow-sm">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#0f705e]">About</p>
                  <p className="mt-3 text-sm leading-7 text-[#53645f]">{data.agent.bio || 'Contact this brokerage agent for help with your Guam home search.'}</p>
                </div>
                <div className="grid gap-2 border-t border-[#edf0ec] pt-5 text-sm font-semibold text-[#304942]">
                  {data.agent.email && <a href={`mailto:${data.agent.email}`} className="inline-flex min-h-11 items-center gap-2"><Mail size={16} /> {data.agent.email}</a>}
                  {data.agent.phone && <a href={`tel:${data.agent.phone}`} className="inline-flex min-h-11 items-center gap-2"><Phone size={16} /> {data.agent.phone}</a>}
                </div>
                <p className="rounded-2xl bg-[#f6f1e8] p-4 text-xs font-semibold leading-6 text-[#66746f]">Preferred-agent selection controls request routing. Listing attribution below remains source-of-truth for each property.</p>
              </aside>

              <section className="min-w-0 rounded-[1.75rem] bg-white p-4 shadow-sm sm:p-6">
                <div className="border-b border-[#edf0ec] pb-5">
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#0f705e]">Attributed inventory</p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">Active listings</h2>
                  <p className="mt-2 text-sm leading-6 text-[#66746f]">Properties whose current listing attribution names this agent.</p>
                </div>
                <div className="mt-5 grid gap-4">
                  {data.attributed_listings.map((listing) => <ListingCard key={listing.id} listing={listing} returnTo={agentPath} />)}
                  {data.attributed_listings.length === 0 && <StateCard>No active attributed listings are published for this agent.</StateCard>}
                </div>
                {data.pagination.total_pages > 1 && <div className="mt-5 border-t border-[#edf0ec] pt-5"><PaginationControls pagination={data.pagination} onPageChange={setPage} /></div>}
              </section>
            </div>
          </div>
        )}
      </section>
    </Shell>
  )
}

export function VillageDetailPage() {
  const { slug = '' } = useParams()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const returnPath = safeReturnPath(searchParams.get('return_to'), '/villages')
  const villagePath = `${location.pathname}${location.search}`
  const { data: villageData, isLoading, error } = useQuery({
    queryKey: ['village', slug],
    queryFn: () => fetchVillage(slug),
    enabled: Boolean(slug),
    retry: false,
  })
  const { data: listingsData, isLoading: listingsLoading, isError: listingsError } = useQuery({
    queryKey: ['listings', 'village-record', slug],
    queryFn: () => fetchListings({ village: slug }),
    enabled: Boolean(villageData?.village),
  })
  const village = villageData?.village
  const listings = listingsData?.listings ?? []
  const isUnavailable = error instanceof ApiFetchError && error.status === 404

  return (
    <Shell compact>
      <section className="mx-auto max-w-7xl px-5 pt-6"><Link to={returnPath} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-5 text-sm font-bold text-[#304942]"><ArrowLeft size={16} /> Back to {returnPath.startsWith('/listings/') ? 'listing' : 'villages'}</Link></section>
      {isLoading && <section className="mx-auto max-w-7xl px-5 py-10"><StateCard>Loading village...</StateCard></section>}
      {isUnavailable && <section className="mx-auto max-w-7xl px-5 py-10"><StateCard tone="error">This village is not available.</StateCard></section>}
      {error && !isUnavailable && <section className="mx-auto max-w-7xl px-5 py-10"><StateCard tone="error">{displayErrorMessage(error, 'Unable to load this village.')}</StateCard></section>}
      {village && (
        <>
          <ContentHeader kicker={village.region || 'Village'} title={village.name} description={village.description || 'Village detail and matching listings.'} />
          <section className="mx-auto grid max-w-7xl gap-4 px-5 pb-10 lg:grid-cols-[1fr_360px]">
            <div className="grid content-start gap-4">
              {listingsLoading && <StateCard>Loading village listings...</StateCard>}
              {listingsError && <StateCard tone="error">Unable to load this village's listings.</StateCard>}
              {listings.map((listing) => <ListingCard key={listing.id} listing={listing} returnTo={villagePath} />)}
              {!listingsLoading && !listingsError && listings.length === 0 && <StateCard>No active listings are published for this village.</StateCard>}
            </div>
            <div className="rounded-[2rem] bg-[#173f38] p-6 text-white lg:self-start">
              <Compass className="text-[#bdebdc]" />
              <h2 className="mt-4 text-2xl font-semibold tracking-[-0.04em]">{village.active_listings_count ?? listings.length} active listings</h2>
              <p className="mt-3 text-sm leading-6 text-white/75">Explore current homes alongside local context for {village.name}. Availability and pricing should be verified with the listing brokerage.</p>
            </div>
          </section>
        </>
      )}
    </Shell>
  )
}

function MilitaryPage() {
  const cards = [
    ['Andersen AFB', 'Northern rentals and homes with fast base access.', 'near-andersen-afb'],
    ['Naval Base Guam', 'Southern and central routes for Navy families.', 'near-naval-base-guam'],
    ['Camp Blaz', 'Marine Corps relocation and northern village search.', 'near-camp-blaz'],
  ]
  return (
    <Shell compact>
      <ContentHeader kicker="PCS and relocation" title="Military housing search built around Guam realities." description="A dedicated path for families comparing base access, OHA-friendly rentals, pets, furnished homes, and arrival timelines." />
      <section className="mx-auto grid max-w-7xl gap-5 px-5 pb-10 lg:grid-cols-3">
        {cards.map(([title, description, slug]) => (
          <Link key={slug} to={`/?kind=rent&features=${slug}`} className="rounded-[2rem] bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-xl hover:shadow-[var(--brand-primary)]/10">
            <ShieldCheck className="text-[#0f705e]" />
            <h2 className="mt-5 text-3xl font-semibold tracking-[-0.05em]">{title}</h2>
            <p className="mt-3 text-sm leading-6 text-[#66746f]">{description}</p>
            <p className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-[var(--brand-primary)]">Search rentals <ChevronRight size={16} /></p>
          </Link>
        ))}
      </section>
    </Shell>
  )
}

export function SavedPage() {
  const { isClerkEnabled, isSignedIn, isLoading, userId } = useAuthContext()
  const { data, isLoading: savesLoading, refetch } = useQuery({ queryKey: ['saved-listings', userId], queryFn: fetchSavedListings, enabled: isClerkEnabled && isSignedIn })
  const removeMutation = useMutation({ mutationFn: removeSavedListingForUser, onSuccess: () => refetch() })

  if (isLoading) return <Shell compact><StateCard>Checking account...</StateCard></Shell>

  if (!isSignedIn) {
    return (
      <Shell compact>
        <ContentHeader kicker="Saved homes" title="Sign in to see your saved Guam homes." description="Favorites sync across web and mobile once they are tied to your Hafa Homes account." />
        <section className="mx-auto max-w-3xl px-5 pb-10"><div className="rounded-[2rem] bg-white p-8 text-center shadow-sm"><SignInButton mode="modal"><button className="rounded-full bg-[var(--brand-primary)] px-6 py-3 text-sm font-bold text-white">Sign in or create account</button></SignInButton></div></section>
      </Shell>
    )
  }

  const savedListings = data?.listings ?? []

  return (
    <Shell compact>
      <ContentHeader kicker="Saved homes" title="Your synced Guam shortlist." description="These homes are server-backed and shared between the web and native app for your account." />
      <section className="mx-auto max-w-6xl px-5 pb-10">
        {savesLoading && <StateCard>Loading saved homes...</StateCard>}
        <div className="grid gap-4 md:grid-cols-2">
          {savedListings.map((listing) => (
            <article key={listing.id} className="overflow-hidden rounded-[2rem] bg-white shadow-sm md:grid md:grid-cols-[220px_1fr]">
              <Link to={routes.listing(listing.id, '/saved')}><img src={listing.primary_photo_url || FALLBACK_LISTING_IMAGE} alt="" className="h-52 w-full object-cover md:h-full" /></Link>
              <div className="p-5">
                <p className="text-2xl font-bold tracking-[-0.04em]">{currency(listing.price, listing.listing_kind)}</p>
                <Link to={routes.listing(listing.id, '/saved')} className="mt-1 block text-xl font-semibold tracking-[-0.04em] text-[#17211f] hover:text-[#0f705e]">{listing.title}</Link>
                <p className="mt-2 text-sm font-semibold text-[#66746f]">{listing.village.name} · {listing.address}</p>
                <div className="mt-5 flex flex-wrap gap-3">
                  <Link to={routes.listing(listing.id, '/saved')} className="rounded-full bg-[var(--brand-primary)] px-4 py-2 text-sm font-bold text-white">View details</Link>
                  <button onClick={() => removeMutation.mutate(listing.id)} className="rounded-full border border-[#d7ded9] px-4 py-2 text-sm font-bold text-[var(--brand-primary)]">Remove</button>
                </div>
              </div>
            </article>
          ))}
        </div>
        {savedListings.length === 0 && !savesLoading && <StateCard>No saved homes yet. Tap the heart on a listing to build your shortlist.</StateCard>}
      </section>
    </Shell>
  )
}

function AccountPage() {
  const { isClerkEnabled, isSignedIn, isLoading, signOut, userId } = useAuthContext()
  const navigate = useNavigate()
  const [deletePanelOpen, setDeletePanelOpen] = useState(false)
  const [confirmation, setConfirmation] = useState('')
  const { data, isLoading: isMeLoading, refetch } = useQuery({
    queryKey: ['me', userId, 'account'],
    queryFn: fetchMe,
    enabled: isClerkEnabled && isSignedIn && Boolean(userId),
    retry: false,
  })
  const { data: searchProfileData, isLoading: isSearchProfileLoading, isError: isSearchProfileError, error: searchProfileError, refetch: refetchSearchProfile } = useQuery({
    queryKey: ['me', userId, 'search-profile', 'account'],
    queryFn: fetchSearchProfile,
    enabled: isClerkEnabled && isSignedIn && Boolean(userId),
    retry: false,
  })
  const profileMutation = useMutation({ mutationFn: updateMe, onSuccess: () => refetch() })
  const searchProfileMutation = useMutation({ mutationFn: updateSearchProfile, onSuccess: () => refetchSearchProfile() })
  const deleteMutation = useMutation({
    mutationFn: deleteCurrentAccount,
    onSuccess: async () => {
      try {
        await signOut?.()
      } catch (signOutError) {
        console.warn('Account deleted but sign-out failed', signOutError)
      } finally {
        navigate('/', { replace: true })
      }
    },
  })

  if (isLoading || isMeLoading) return <Shell compact><StateCard>Checking account...</StateCard></Shell>

  if (!isClerkEnabled) {
    return (
      <Shell compact>
        <ContentHeader kicker="Account" title="Account tools are coming online." description="Clerk must be configured before synced saved homes, request history, and account deletion are available." />
      </Shell>
    )
  }

  if (!isSignedIn) {
    return (
      <Shell compact>
        <ContentHeader kicker="Account" title="Sign in to manage your Hafa Homes account." description="Public browsing stays open. Accounts unlock synced saved homes, request history, and self-service account deletion." />
        <section className="mx-auto max-w-3xl px-5 pb-10"><div className="rounded-[2rem] bg-white p-8 text-center shadow-sm"><SignInButton mode="modal"><button className="rounded-full bg-[var(--brand-primary)] px-6 py-3 text-sm font-bold text-white">Sign in or create account</button></SignInButton></div></section>
      </Shell>
    )
  }

  const user = data?.user
  const canDelete = confirmation.trim().toUpperCase() === 'DELETE' && !deleteMutation.isPending

  function handleProfileSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    profileMutation.mutate({
      first_name: String(form.get('first_name') || '').trim(),
      last_name: String(form.get('last_name') || '').trim(),
      phone: String(form.get('phone') || '').trim(),
      preferred_contact_method: String(form.get('preferred_contact_method') || '') as CurrentUser['preferred_contact_method'],
    })
  }

  return (
    <Shell compact>
      <ContentHeader kicker="Profile & settings" title="Manage your Hafa Homes account." description="Keep your contact profile current so showing requests can prefill cleanly across web and mobile." />
      <section className="mx-auto grid max-w-6xl gap-5 px-5 pb-12 lg:grid-cols-[1fr_0.9fr]">
        <form onSubmit={handleProfileSubmit} className="rounded-[2rem] bg-white p-6 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#0f705e]">Profile</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-[#17211f]">{user?.full_name || user?.email || 'Hafa Homes account'}</h2>
          {user?.email && <p className="mt-2 text-sm font-semibold text-[#66746f]">{user.email}</p>}

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-semibold text-[#304942]">
              First name
              <input name="first_name" defaultValue={user?.first_name || ''} className="min-h-12 rounded-2xl border border-[#d7ded9] px-4 outline-none focus:border-[#0f705e] focus:ring-4 focus:ring-[#dff3ec]" />
            </label>
            <label className="grid gap-2 text-sm font-semibold text-[#304942]">
              Last name
              <input name="last_name" defaultValue={user?.last_name || ''} className="min-h-12 rounded-2xl border border-[#d7ded9] px-4 outline-none focus:border-[#0f705e] focus:ring-4 focus:ring-[#dff3ec]" />
            </label>
            <label className="grid gap-2 text-sm font-semibold text-[#304942]">
              Phone
              <input name="phone" defaultValue={user?.phone || ''} inputMode="tel" placeholder="671-555-1234" className="min-h-12 rounded-2xl border border-[#d7ded9] px-4 outline-none focus:border-[#0f705e] focus:ring-4 focus:ring-[#dff3ec]" />
            </label>
            <label className="grid gap-2 text-sm font-semibold text-[#304942]">
              Preferred contact
              <select name="preferred_contact_method" defaultValue={user?.preferred_contact_method || 'email'} className="min-h-12 rounded-2xl border border-[#d7ded9] px-4 outline-none focus:border-[#0f705e] focus:ring-4 focus:ring-[#dff3ec]">
                {preferredContactOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
          </div>
          {profileMutation.isError && <p className="mt-3 text-sm font-semibold text-red-700">{displayErrorMessage(profileMutation.error, 'Unable to update profile right now.')}</p>}
          {profileMutation.isSuccess && <p className="mt-3 text-sm font-semibold text-[#0f705e]">Profile saved.</p>}
          <div className="mt-5 flex flex-wrap gap-3">
            <button type="submit" disabled={profileMutation.isPending} className="rounded-full bg-[var(--brand-primary)] px-5 py-3 text-sm font-bold text-white disabled:opacity-60">{profileMutation.isPending ? 'Saving...' : 'Save profile'}</button>
            <Link to="/saved" className="rounded-full border border-[#d7ded9] px-5 py-3 text-sm font-bold text-[var(--brand-primary)]">Saved homes</Link>
            <Link to="/account/requests" className="rounded-full border border-[#d7ded9] px-5 py-3 text-sm font-bold text-[var(--brand-primary)]">Request history</Link>
            <button
              type="button"
              onClick={async () => {
                try {
                  await signOut?.()
                } finally {
                  navigate('/', { replace: true })
                }
              }}
              className="rounded-full border border-[#d7ded9] px-5 py-3 text-sm font-bold text-[var(--brand-primary)]"
            >
              Sign out
            </button>
          </div>
        </form>

        <SearchProfileCard key={searchProfileData?.search_profile?.updated_at || searchProfileData?.search_profile?.id || 'new-search-profile'} profile={searchProfileData?.search_profile} user={user} mutation={searchProfileMutation} isLoading={isSearchProfileLoading} error={isSearchProfileError ? searchProfileError : null} />

        <div className="rounded-[2rem] border border-red-200 bg-[#fff8f6] p-6 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-red-700">Delete account</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-[#491d1d]">Permanently remove your account.</h2>
          <p className="mt-3 text-sm leading-6 text-[#7c4a43]">This deletes your Clerk/Hafa Homes account, synced saved homes, and saved search profile. Showing/contact requests are preserved for brokerage follow-up, but they will no longer be linked to your account.</p>

          {!deletePanelOpen ? (
            <button type="button" onClick={() => setDeletePanelOpen(true)} className="mt-5 rounded-full bg-red-700 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-red-900/10">Delete account</button>
          ) : (
            <div className="mt-5 rounded-3xl bg-white p-4">
              <label className="grid gap-2 text-sm font-semibold text-[#491d1d]">
                Type DELETE to confirm
                <input
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                  className="min-h-12 rounded-2xl border border-red-200 px-4 outline-none focus:border-red-600 focus:ring-4 focus:ring-red-100"
                />
              </label>
              {deleteMutation.isError && <p className="mt-3 text-sm font-semibold text-red-700">{displayErrorMessage(deleteMutation.error, 'Unable to delete account right now.')}</p>}
              <div className="mt-4 flex flex-wrap gap-3">
                <button type="button" onClick={() => deleteMutation.mutate()} disabled={!canDelete} className="rounded-full bg-red-700 px-5 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-45">
                  {deleteMutation.isPending ? 'Deleting...' : 'Delete permanently'}
                </button>
                <button type="button" onClick={() => { setDeletePanelOpen(false); setConfirmation('') }} className="rounded-full border border-[#d7ded9] px-5 py-3 text-sm font-bold text-[var(--brand-primary)]">Cancel</button>
              </div>
            </div>
          )}
        </div>
      </section>
    </Shell>
  )
}

type SearchProfileMutation = { mutate: (payload: SearchProfilePayload) => void; isPending: boolean; isError: boolean; isSuccess: boolean; error: unknown }

function SearchProfileCard({ profile, user, mutation, isLoading = false, error = null }: { profile?: SearchProfile; user?: CurrentUser; mutation: SearchProfileMutation; isLoading?: boolean; error?: unknown }) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    mutation.mutate({
      ...searchProfilePayloadFromForm(new FormData(event.currentTarget)),
      preferred_contact_method: user?.preferred_contact_method ?? profileDefault(profile, 'preferred_contact_method', 'email'),
      phone: user ? (user.phone || '') : profileDefault(profile, 'phone'),
    })
  }

  if (isLoading) {
    return (
      <section className="rounded-[2rem] bg-[#102f2a] p-6 text-white shadow-2xl shadow-[var(--brand-primary)]/15 lg:col-span-2">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#bdebdc]">Search profile</p>
        <h2 className="mt-3 text-3xl font-semibold tracking-[-0.05em]">Loading saved search preferences.</h2>
        <p className="mt-3 text-sm leading-6 text-white/70">Your contact details are ready above. This search profile section will appear as soon as saved preferences load.</p>
      </section>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-[2rem] bg-[#102f2a] p-6 text-white shadow-2xl shadow-[var(--brand-primary)]/15 lg:col-span-2">
      <div className="grid gap-5 lg:grid-cols-[0.85fr_1.15fr]">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#bdebdc]">Search profile</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.05em]">Save what you are looking for once.</h2>
          <p className="mt-3 text-sm leading-6 text-white/70">Your contact details above handle phone and preferred contact. These search preferences prefill showing requests, price watch requests, and future prompts.</p>
          {Boolean(error) && <p className="mt-3 rounded-2xl bg-[#fff8f6] p-3 text-xs font-bold leading-5 text-red-700">{displayErrorMessage(error, 'Unable to load your saved search profile. You can still edit contact details above and retry this section later.')}</p>}
          <div className="mt-5 rounded-3xl bg-white/10 p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-bold uppercase tracking-[0.16em] text-white/55">Completion</span>
              <span className="rounded-full bg-white px-3 py-1 text-xs font-black uppercase tracking-[0.12em] text-[var(--brand-primary)]">{profile?.completion_status === 'complete' ? 'Complete' : `${profile?.completion_percentage ?? 0}%`}</span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/15">
              <div className="h-full rounded-full bg-[#f5c16c]" style={{ width: `${profile?.completion_percentage ?? 0}%` }} />
            </div>
            <p className="mt-3 text-xs font-semibold leading-5 text-white/62">{profile?.qualification_summary || 'Add timeline, search criteria, and readiness. Contact preference comes from your profile above.'}</p>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="grid gap-2 text-sm font-semibold text-white/86">
            Timeline
            <select name="purchase_timeline" defaultValue={profileDefault(profile, 'purchase_timeline')} className="min-h-12 rounded-2xl border border-white/10 bg-white px-4 text-[#17211f]">
              {purchaseTimelineOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label className="grid gap-2 text-sm font-semibold text-white/86">
            Prequalified?
            <select name="prequalified_status" defaultValue={profileDefault(profile, 'prequalified_status')} className="min-h-12 rounded-2xl border border-white/10 bg-white px-4 text-[#17211f]">
              {prequalifiedOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <Input name="lender_name" label="Lender / bank optional" defaultValue={profileDefault(profile, 'lender_name')} labelClassName="!text-white/86" className="border-white/10 bg-white text-[#17211f]" />
          <Input name="desired_villages" label="Desired villages" defaultValue={profileDefault(profile, 'desired_villages')} placeholder="Dededo, Yigo, Tamuning" labelClassName="!text-white/86" className="border-white/10 bg-white text-[#17211f]" />
          <Input name="budget_min" label="Budget min" type="number" min="0" step="1000" defaultValue={profileDefault(profile, 'budget_min')} labelClassName="!text-white/86" className="border-white/10 bg-white text-[#17211f]" />
          <Input name="budget_max" label="Budget max" type="number" min="0" step="1000" defaultValue={profileDefault(profile, 'budget_max')} labelClassName="!text-white/86" className="border-white/10 bg-white text-[#17211f]" />
          <Input name="desired_beds" label="Beds" type="number" min="0" step="1" defaultValue={profileDefault(profile, 'desired_beds')} labelClassName="!text-white/86" className="border-white/10 bg-white text-[#17211f]" />
          <Input name="desired_baths" label="Baths" type="number" min="0" step="0.5" defaultValue={profileDefault(profile, 'desired_baths')} labelClassName="!text-white/86" className="border-white/10 bg-white text-[#17211f]" />
          <label className="grid gap-2 text-sm font-semibold text-white/86">
            Buyer type
            <select name="buyer_status" defaultValue={profileDefault(profile, 'buyer_status')} className="min-h-12 rounded-2xl border border-white/10 bg-white px-4 text-[#17211f]">
              {buyerStatusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label className="grid gap-2 text-sm font-semibold text-white/86">
            Working with an agent?
            <select name="already_working_with_agent" defaultValue={profileDefault(profile, 'already_working_with_agent')} className="min-h-12 rounded-2xl border border-white/10 bg-white px-4 text-[#17211f]">
              {agentRelationshipOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label className="grid gap-2 text-sm font-semibold text-white/86 md:col-span-2">
            Notes
            <textarea name="notes" rows={3} defaultValue={profileDefault(profile, 'notes')} className="rounded-2xl border border-white/10 bg-white px-4 py-3 text-[#17211f]" placeholder="Relocating, school zone, pet-friendly, commute, or must-haves..." />
          </label>
          {mutation.isError && <p className="text-sm font-semibold text-[#ffd6d6] md:col-span-2">{displayErrorMessage(mutation.error, 'Unable to save search profile right now.')}</p>}
          {mutation.isSuccess && <p className="text-sm font-semibold text-[#bdebdc] md:col-span-2">Search profile saved.</p>}
          <button disabled={mutation.isPending} className="min-h-12 rounded-2xl bg-[#f5c16c] px-5 text-sm font-black text-[#102f2a] disabled:opacity-60 md:col-span-2">{mutation.isPending ? 'Saving...' : 'Save search profile'}</button>
        </div>
      </div>
    </form>
  )
}

function RequestsPage() {
  const { isClerkEnabled, isSignedIn, isLoading, userId } = useAuthContext()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedPage = Number(searchParams.get('page') || '1')
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1
  const { data, isLoading: requestsLoading, isError } = useQuery({ queryKey: ['my-leads', userId, page], queryFn: () => fetchMyLeads(page), enabled: isClerkEnabled && isSignedIn, placeholderData: keepPreviousData })

  function selectPage(nextPage: number) {
    const next = new URLSearchParams(searchParams)
    if (nextPage <= 1) next.delete('page')
    else next.set('page', String(nextPage))
    setSearchParams(next)
  }

  if (isLoading) return <Shell compact><StateCard>Checking account...</StateCard></Shell>

  if (!isSignedIn) {
    return (
      <Shell compact>
        <ContentHeader kicker="My requests" title="Sign in to view your showing requests." description="Signed-in requests can show status, assigned agent, and scheduled appointment details." />
        <section className="mx-auto max-w-3xl px-5 pb-10"><div className="rounded-[2rem] bg-white p-8 text-center shadow-sm"><SignInButton mode="modal"><button className="rounded-full bg-[var(--brand-primary)] px-6 py-3 text-sm font-bold text-white">Sign in or create account</button></SignInButton></div></section>
      </Shell>
    )
  }

  const requests = data?.leads ?? []

  return (
    <Shell compact>
      <ContentHeader kicker="My requests" title="Your showing and price watch requests." description="Track what you submitted, who is assigned, and when confirmed showings are scheduled." />
      <section className="mx-auto max-w-6xl px-5 pb-10">
        {requestsLoading && <StateCard>Loading requests...</StateCard>}
        {isError && <StateCard tone="error">Unable to load your requests.</StateCard>}
        <div className="grid gap-4">
          {requests.map((lead) => <ConsumerRequestCard key={lead.id} lead={lead} returnTo={`${location.pathname}${location.search}`} />)}
        </div>
        {requests.length === 0 && !requestsLoading && <StateCard>No requests yet. Request a showing or send a price watch request from any listing.</StateCard>}
        {data?.pagination && data.pagination.total_pages > 1 && (
          <div className="mt-5 rounded-[1.5rem] bg-white p-4 shadow-sm">
            <PaginationControls pagination={data.pagination} onPageChange={selectPage} />
          </div>
        )}
      </section>
    </Shell>
  )
}

function ConsumerRequestCard({ lead, returnTo }: { lead: Lead; returnTo: string }) {
  const showing = lead.latest_showing_appointment
  const requestPath = routes.request(lead.id, returnTo)
  return (
    <article className="overflow-hidden rounded-[2rem] bg-white shadow-sm md:grid md:grid-cols-[240px_1fr]">
      {lead.listing?.primary_photo_url && <Link to={requestPath} aria-label={`View request for ${lead.listing.title}`} className="block overflow-hidden"><img src={lead.listing.primary_photo_url} alt="" className="h-56 w-full object-cover transition duration-500 hover:scale-105 md:h-full" /></Link>}
      <div className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className={`inline-flex rounded-full px-3 py-1 text-xs font-black uppercase tracking-[0.16em] ${leadTypeBadgeClasses(lead.lead_type)}`}>{leadTypeLabel(lead.lead_type)}</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">{lead.listing?.title ?? 'Hafa Homes request'}</h2>
            <p className="mt-2 text-sm font-semibold text-[#66746f]">Submitted {formatDateTime(lead.created_at)}</p>
          </div>
          <span className="rounded-full bg-[#e9f5ef] px-4 py-2 text-sm font-bold text-[#0f705e]">{lead.consumer_status_label ?? lead.status.replaceAll('_', ' ')}</span>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <LeadMeta icon={<UserRound size={16} />} label="Agent" value={lead.assigned_agent?.name ?? 'Pending assignment'} />
          <LeadMeta icon={<Building2 size={16} />} label="Brokerage" value={lead.brokerage?.name ?? 'Hafa Homes'} />
          <LeadMeta icon={<MessageSquare size={16} />} label="Preferred contact" value={lead.preferred_contact_method || 'Not provided'} />
        </div>
        {hasQualificationDetails(lead) && (
          <div className="mt-4 rounded-2xl bg-[#e9f5ef] p-4">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#0f705e]">Search readiness</p>
            <p className="mt-2 text-sm font-semibold text-[#304942]">{lead.qualification_summary}</p>
          </div>
        )}
        {showing && (
          <div className="mt-4 rounded-2xl bg-[#f6f1e8] p-4">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#0f705e]">Showing appointment</p>
            <p className="mt-2 text-sm font-semibold text-[#304942]">{formatDateTime(showing.scheduled_starts_at)} · {showing.status.replaceAll('_', ' ')} · {showing.tour_type.replaceAll('_', ' ')}</p>
            {showing.location && <p className="mt-2 text-sm text-[#66746f]">{showing.location}</p>}
            {showing.consumer_notes && <p className="mt-2 text-sm text-[#66746f]">{showing.consumer_notes}</p>}
          </div>
        )}
        <Link to={requestPath} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-full bg-[var(--brand-primary)] px-5 text-sm font-bold text-white transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-[var(--brand-primary)]/20">
          View request details <ChevronRight size={16} />
        </Link>
      </div>
    </article>
  )
}

export function RequestDetailPage() {
  const { id = '' } = useParams()
  const [searchParams] = useSearchParams()
  const { isClerkEnabled, isSignedIn, isLoading: authLoading, userId } = useAuthContext()
  const returnPath = safeReturnPath(searchParams.get('return_to'), routes.requests())
  const { data, isLoading, error } = useQuery({
    queryKey: ['my-lead', userId, id],
    queryFn: () => fetchMyLead(id),
    enabled: isClerkEnabled && isSignedIn && Boolean(id),
    retry: (attempts, requestError) => !(requestError instanceof ApiFetchError && requestError.status === 404) && attempts < 2,
  })

  if (authLoading) return <Shell compact><StateCard>Checking account...</StateCard></Shell>

  if (!isSignedIn) {
    return (
      <Shell compact>
        <ContentHeader kicker="Request details" title="Sign in to view this request." description="Request records are private to your account and the brokerage storefront where you submitted them." />
        <section className="mx-auto max-w-3xl px-5 pb-10">
          <div className="rounded-[2rem] bg-white p-8 text-center shadow-sm">
            <SignInButton mode="modal"><button className="rounded-full bg-[var(--brand-primary)] px-6 py-3 text-sm font-bold text-white">Sign in or create account</button></SignInButton>
          </div>
        </section>
      </Shell>
    )
  }

  if (isLoading) return <Shell compact><section className="mx-auto max-w-6xl px-5 py-10"><StateCard>Loading request...</StateCard></section></Shell>

  if (error || !data?.lead) {
    const notFound = error instanceof ApiFetchError && error.status === 404
    return (
      <Shell compact>
        <section className="mx-auto max-w-4xl px-5 py-10">
          <Link to={returnPath} className="mb-6 inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-5 text-sm font-bold text-[#304942] shadow-sm"><ArrowLeft size={16} /> Back to requests</Link>
          <StateCard tone="error">{notFound ? 'This request is not available in this brokerage storefront.' : displayErrorMessage(error, 'Unable to load this request.')}</StateCard>
        </section>
      </Shell>
    )
  }

  const lead = data.lead
  const requestPath = routes.request(lead.id, returnPath)
  const listingPath = lead.listing ? routes.listing(lead.listing.id, requestPath) : null
  const appointments = lead.showing_appointments ?? []

  return (
    <Shell compact>
      <section className="mx-auto max-w-6xl px-5 pb-12 pt-7">
        <Link to={returnPath} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-5 text-sm font-bold text-[#304942] shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"><ArrowLeft size={16} /> Back to requests</Link>

        <header className="relative mt-5 overflow-hidden rounded-[2.25rem] bg-[var(--brand-primary)] p-6 text-white shadow-2xl shadow-[var(--brand-primary)]/20 md:p-9">
          <div className="absolute -right-16 -top-20 h-64 w-64 rounded-full bg-[#f5c16c]/15 blur-3xl" />
          <div className="relative flex flex-col gap-7 md:flex-row md:items-end md:justify-between">
            <div className="max-w-3xl">
              <div className="flex flex-wrap items-center gap-3">
                <span className={`inline-flex rounded-full px-3 py-1 text-xs font-black uppercase tracking-[0.16em] ${leadTypeBadgeClasses(lead.lead_type)}`}>{leadTypeLabel(lead.lead_type)}</span>
                <span className="text-xs font-bold uppercase tracking-[0.18em] text-white/60">Request HH-{lead.id}</span>
              </div>
              <h1 className="mt-5 text-3xl font-semibold leading-tight tracking-[-0.05em] md:text-5xl">{lead.listing?.title ?? 'Your Håfa Homes request'}</h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-white/72">Submitted {formatDateTime(lead.created_at)} through {lead.brokerage?.app_display_name || lead.brokerage?.name || 'this brokerage storefront'}.</p>
            </div>
            <div className="shrink-0 rounded-2xl bg-white/10 px-5 py-4 backdrop-blur-sm">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-white/60">Current status</p>
              <p className="mt-2 text-xl font-semibold">{lead.consumer_status_label ?? lead.status.replaceAll('_', ' ')}</p>
            </div>
          </div>
        </header>

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="grid gap-6">
            {lead.listing && listingPath && (
              <article className="overflow-hidden rounded-[2rem] bg-white shadow-sm md:grid md:grid-cols-[260px_1fr]">
                <Link to={listingPath} aria-label={`Open related listing ${lead.listing.title}`} className="group block overflow-hidden">
                  <img src={lead.listing.primary_photo_url || FALLBACK_LISTING_IMAGE} onError={(event) => { event.currentTarget.onerror = null; event.currentTarget.src = FALLBACK_LISTING_IMAGE }} alt="" className="h-60 w-full object-cover transition duration-700 ease-out group-hover:scale-105 md:h-full" />
                </Link>
                <div className="p-6">
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#0f705e]">Related listing</p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">{lead.listing.title}</h2>
                  {lead.listing.address && <p className="mt-2 flex items-start gap-2 text-sm font-semibold text-[#66746f]"><MapPin className="mt-0.5 shrink-0" size={16} /> {lead.listing.address}{lead.listing.village ? ` · ${lead.listing.village}` : ''}</p>}
                  <p className="mt-4 text-2xl font-bold text-[var(--brand-primary)]">{currency(lead.listing.price, lead.listing.listing_kind)}</p>
                  {(lead.listing.agent || lead.listing.brokerage) && <p className="mt-3 text-xs leading-5 text-[#7b8a84]">Listing attribution: {lead.listing.agent?.name ?? 'Listing agent'} · {lead.listing.brokerage?.name ?? 'Listing brokerage'}</p>}
                  <Link to={listingPath} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-full border border-[#d7ded9] px-5 text-sm font-bold text-[var(--brand-primary)] transition hover:border-[var(--brand-primary)]">Open listing <ChevronRight size={16} /></Link>
                </div>
              </article>
            )}

            <section className="rounded-[2rem] bg-white p-6 shadow-sm md:p-7">
              <div className="flex items-center gap-3">
                <div className="grid h-11 w-11 place-items-center rounded-2xl bg-[#e9f5ef] text-[#0f705e]"><ClipboardList size={21} /></div>
                <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-[#7b8a84]">Request record</p><h2 className="mt-1 text-2xl font-semibold tracking-[-0.04em]">What you asked for</h2></div>
              </div>
              <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <LeadMeta icon={<MessageSquare size={16} />} label="Request type" value={leadTypeLabel(lead.lead_type)} />
                <LeadMeta icon={<Phone size={16} />} label="Preferred contact" value={lead.preferred_contact_method || 'Not provided'} />
                <LeadMeta icon={<Clock3 size={16} />} label="Preferred time" value={lead.preferred_time || lead.preferred_tour_date || 'Flexible'} />
              </div>
              {lead.message && <div className="mt-4 rounded-2xl border border-[#e3e9e5] p-4"><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#7b8a84]">Your message</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#3d4d48]">{lead.message}</p></div>}
              {lead.qualification_summary && <div className="mt-4 rounded-2xl bg-[#e9f5ef] p-4"><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#0f705e]">Search profile shared</p><p className="mt-2 text-sm font-semibold leading-6 text-[#304942]">{lead.qualification_summary}</p></div>}
            </section>

            <section className="rounded-[2rem] bg-white p-6 shadow-sm md:p-7">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-[#7b8a84]">Showing coordination</p><h2 className="mt-1 text-2xl font-semibold tracking-[-0.04em]">Appointments</h2></div>
                <span className="rounded-full bg-[#f6f1e8] px-3 py-1 text-xs font-bold text-[#66746f]">{appointments.length} {appointments.length === 1 ? 'appointment' : 'appointments'}</span>
              </div>
              {appointments.length === 0 ? (
                <p className="mt-5 rounded-2xl bg-[#f6f1e8] p-4 text-sm leading-6 text-[#66746f]">No appointment has been scheduled yet. Your brokerage can coordinate one as the request progresses.</p>
              ) : (
                <div className="mt-5 grid gap-4">
                  {appointments.map((showing) => (
                    <article key={showing.id} className="rounded-2xl border border-[#e3e9e5] p-5">
                      <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-lg font-semibold">{formatDateTime(showing.scheduled_starts_at, showing.timezone)}</p><p className="mt-1 text-sm text-[#66746f]">{showing.tour_type.replaceAll('_', ' ')}{showing.timezone ? ` · ${showing.timezone}` : ''}</p></div><span className="rounded-full bg-[#e9f5ef] px-3 py-1 text-xs font-bold uppercase tracking-wide text-[#0f705e]">{showing.status.replaceAll('_', ' ')}</span></div>
                      {showing.location && <p className="mt-4 flex items-start gap-2 text-sm text-[#3d4d48]"><MapPin className="mt-0.5 shrink-0 text-[#0f705e]" size={16} /> {showing.location}</p>}
                      {showing.consumer_notes && <p className="mt-3 rounded-xl bg-[#f6f1e8] p-3 text-sm leading-6 text-[#66746f]">{showing.consumer_notes}</p>}
                    </article>
                  ))}
                </div>
              )}
            </section>
          </div>

          <aside className="grid content-start gap-5 lg:sticky lg:top-6">
            <section className="rounded-[2rem] bg-white p-6 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#7b8a84]">Your brokerage team</p>
              <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em]">Who is helping</h2>
              <div className="mt-5 grid gap-3">
                <LeadMeta icon={<UserRound size={16} />} label="Requested agent" value={lead.requested_agent?.name ?? 'No preference selected'} />
                <LeadMeta icon={<UsersRound size={16} />} label="Coordinating agent" value={lead.assigned_agent?.name ?? 'Pending assignment'} />
                <LeadMeta icon={<Building2 size={16} />} label="Conversation owner" value={lead.brokerage?.name ?? 'This brokerage'} />
              </div>
              <p className="mt-4 text-xs leading-5 text-[#7b8a84]">These roles belong to the brokerage handling your request. Listing attribution is shown separately on the property record.</p>
            </section>

            <section className="rounded-[2rem] bg-[#101f1c] p-6 text-white shadow-xl shadow-[var(--brand-primary)]/15">
              <ShieldCheck size={24} className="text-[#f5c16c]" />
              <h2 className="mt-4 text-xl font-semibold">Private to this storefront</h2>
              <p className="mt-3 text-sm leading-6 text-white/68">This request is connected only to your signed-in account and the brokerage storefront where you submitted it. Other broker storefronts cannot open it.</p>
            </section>
          </aside>
        </div>
      </section>
    </Shell>
  )
}

function PrivacyPage() {
  return (
    <Shell compact>
      <ContentHeader
        kicker="Privacy"
        title="Hafa Homes privacy policy"
        description="This preview app helps people explore Guam homes, rentals, and real estate resources while collecting only the information needed to support the experience."
      />
      <section className="mx-auto max-w-4xl px-5 pb-12">
        <div className="grid gap-5 rounded-[2rem] bg-white p-6 text-sm leading-7 text-[#3d4d48] shadow-sm md:p-8">
          <p><strong className="text-[#17211f]">Information we collect.</strong> Hafa Homes may collect contact details you submit through showing requests, price watch requests, saved searches, or similar forms, plus first-party app usage information such as listing views, saved homes, search filters, agent selections, and request-form interactions.</p>
          <p><strong className="text-[#17211f]">How we use it.</strong> We use submitted information and first-party search activity to respond to inquiries, coordinate real estate follow-up, suggest more relevant listings, improve listing search, troubleshoot the app, and understand aggregate product usage.</p>
          <p><strong className="text-[#17211f]">Saved listings and search profile.</strong> Signed-in saved homes and buyer/search profile preferences are stored with your Hafa Homes account so they can sync across web and mobile and prefill future requests. The native app may also cache listing details locally on your device for performance.</p>
          <p><strong className="text-[#17211f]">Retention.</strong> Anonymous browsing-intent sessions that never become an account or inquiry are scheduled for deletion after 90 days. Account preferences remain until you update or delete the account. Submitted real-estate requests may be retained by the receiving brokerage for follow-up, compliance, and recordkeeping.</p>
          <p><strong className="text-[#17211f]">Account deletion.</strong> Signed-in users can delete their account from the Account screen in the web app or the More screen in the mobile app. Deleting an account removes synced saved homes and search profile data and disconnects account links from request history while preserving submitted showing/contact requests for brokerage follow-up.</p>
          <p><strong className="text-[#17211f]">Third-party services.</strong> The app may use services such as Clerk for authentication, Mapbox for maps, hosting providers for the API/web app, and analytics or monitoring tools when enabled.</p>
          <p><strong className="text-[#17211f]">Contact.</strong> For privacy questions or data requests, email <a className="font-bold text-[#0f705e]" href="mailto:hello@hafahomes.com">hello@hafahomes.com</a>.</p>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#7b8a84]">Last updated July 10, 2026</p>
        </div>
      </section>
    </Shell>
  )
}

function SyncPage() {
  const { data, isLoading } = useQuery({ queryKey: ['sync-runs'], queryFn: fetchSyncRuns })
  return (
    <AdminShell kicker="Data sync" title="Listing data monitor">
      <section className="mx-auto max-w-5xl px-5 pb-10">
        <div className="rounded-[2rem] bg-[#101f1c] p-6 text-white shadow-2xl shadow-[var(--brand-primary)]/20">
          <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-5">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#bdebdc]">Sync monitor</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-[-0.05em]">MLS import monitor</h2>
            </div>
            <DatabaseZap className="text-[#e99f3e]" />
          </div>
          {isLoading && <p className="py-6 text-white/70">Loading sync run...</p>}
          <div className="mt-5 grid gap-4">
            {data?.data_sync_runs.map((run) => (
              <div key={run.id} className="rounded-3xl border border-white/10 bg-white/8 p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="font-bold">{run.provider}</p>
                  <span className="rounded-full bg-[#153f35] px-3 py-1 text-xs font-bold uppercase text-[#bdebdc]">{run.status}</span>
                </div>
                <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
                  <Metric label="Imported" value={run.imported_count} />
                  <Metric label="Updated" value={run.updated_count} />
                  <Metric label="Inactive" value={run.inactive_count} />
                  <Metric label="Errors" value={run.error_count} />
                </div>
                <p className="mt-4 text-sm leading-6 text-white/65">{run.notes}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </AdminShell>
  )
}


function MapPanel({ listings, returnTo, onExpand, immersive = false, mobileMapHeight }: { listings: Listing[]; returnTo: string; onExpand?: () => void; immersive?: boolean; mobileMapHeight?: number }) {
  const points = listings.filter((listing) => listing.latitude && listing.longitude)
  const mapHeight = immersive ? 'h-[100svh]' : 'h-[calc(100svh-330px)] md:h-auto md:min-h-[760px]'
  const mapStyle = !immersive && mobileMapHeight ? { height: mobileMapHeight } : undefined

  if (!MAPBOX_TOKEN) {
    return <FallbackMapPanel listings={listings} returnTo={returnTo} onExpand={onExpand} immersive={immersive} mapStyle={mapStyle} />
  }

  return (
    <div className={`hafa-map-panel ${!immersive ? 'hafa-map-panel--standard' : ''} relative overflow-hidden border border-black/5 bg-[#dbe8df] shadow-sm ${immersive ? 'h-[100svh] rounded-none' : 'rounded-none md:rounded-[2rem]'}`}>
      <RealMap listings={points} returnTo={returnTo} immersive={immersive} className={mapHeight} style={mapStyle} />
      <MapOverlayHeader listingsCount={points.length} onExpand={onExpand} realMap />
      {!immersive && (
        <div className="absolute bottom-5 left-5 z-10 hidden max-w-md rounded-3xl bg-white/92 p-4 text-sm leading-6 text-[#53645f] shadow-xl shadow-[var(--brand-primary)]/10 backdrop-blur md:block">
          Tap a price marker to open the listing details. Use full map for the best search experience.
        </div>
      )}
    </div>
  )
}

function RealMap({ listings, returnTo, className, immersive, style }: { listings: Listing[]; returnTo: string; className: string; immersive: boolean; style?: React.CSSProperties }) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<MapboxMap | null>(null)
  const mapboxRef = useRef<typeof import('mapbox-gl').default | null>(null)
  const markersRef = useRef<MapboxMarker[]>([])
  const [mapReady, setMapReady] = useState(false)
  const [mapError, setMapError] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    let cancelled = false

    async function initializeMap() {
      const [mapboxModule] = await Promise.all([
        import('mapbox-gl'),
        import('mapbox-gl/dist/mapbox-gl.css'),
      ])
      if (cancelled || !containerRef.current) return

      const mapbox = mapboxModule.default
      mapbox.accessToken = MAPBOX_TOKEN
      mapboxRef.current = mapbox

      const map = new mapbox.Map({
        container: containerRef.current,
        style: 'mapbox://styles/mapbox/outdoors-v12',
        center: [144.7937, 13.4443],
        zoom: immersive ? 10.8 : 10.2,
        attributionControl: false,
      })

      map.addControl(new mapbox.NavigationControl({ showCompass: false }), 'bottom-right')
      map.addControl(new mapbox.AttributionControl({ compact: true }), 'bottom-left')
      map.on('load', () => setMapReady(true))
      mapRef.current = map
    }

    setMapError(false)
    initializeMap().catch((error) => {
      console.warn('Unable to initialize Mapbox map', error)
      if (!cancelled) setMapError(true)
    })

    return () => {
      cancelled = true
      markersRef.current.forEach((marker) => marker.remove())
      markersRef.current = []
      mapRef.current?.remove()
      mapRef.current = null
      mapboxRef.current = null
      setMapReady(false)
      setMapError(false)
    }
  }, [immersive])

  useEffect(() => {
    const map = mapRef.current
    const mapbox = mapboxRef.current
    if (!map || !mapbox || !mapReady) return

    markersRef.current.forEach((marker) => marker.remove())
    markersRef.current = []

    const bounds = new mapbox.LngLatBounds()

    const priceMarkers: MapboxMarker[] = []
    const clusterMarkers: MapboxMarker[] = []
    const villageGroups = groupListingsByVillage(listings)

    listings.forEach((listing) => {
      if (!listing.latitude || !listing.longitude) return

      const markerElement = document.createElement('button')
      markerElement.type = 'button'
      markerElement.className = 'hafa-map-marker'
      markerElement.textContent = currency(listing.price, listing.listing_kind).replace('/mo', '')
      markerElement.setAttribute('aria-label', `Open ${listing.title}`)
      markerElement.addEventListener('click', () => {
        captureAnalyticsEvent('map_marker_clicked', { listing_id: listing.id, listing_kind: listing.listing_kind })
        recordLeadIntentEvent('map_marker_clicked', { listing_id: listing.id, source: 'web', metadata: { surface: 'map_marker', listing_kind: listing.listing_kind } })
        navigate(routes.listing(listing.id, returnTo))
      })

      const marker = new mapbox.Marker({ element: markerElement, anchor: 'center' })
        .setLngLat([listing.longitude, listing.latitude])
        .addTo(map)

      markersRef.current.push(marker)
      priceMarkers.push(marker)
      bounds.extend([listing.longitude, listing.latitude])

    })

    villageGroups.forEach((group) => {
      const markerElement = document.createElement('button')
      markerElement.type = 'button'
      markerElement.className = 'hafa-map-cluster'
      const countElement = document.createElement('strong')
      const labelElement = document.createElement('span')
      countElement.textContent = String(group.count)
      labelElement.textContent = group.village
      markerElement.append(countElement, labelElement)
      markerElement.setAttribute('aria-label', `${group.count} listings in ${group.village}`)
      markerElement.addEventListener('click', () => {
        map.easeTo({
          center: [group.longitude, group.latitude],
          zoom: Math.max(map.getZoom() + 1.4, 11.4),
          duration: 450,
        })
      })

      const marker = new mapbox.Marker({ element: markerElement, anchor: 'center' })
        .setLngLat([group.longitude, group.latitude])
        .addTo(map)

      markersRef.current.push(marker)
      clusterMarkers.push(marker)
    })

    const updateMarkerVisibility = () => {
      const showPrices = map.getZoom() >= 11.35
      priceMarkers.forEach((marker) => { marker.getElement().style.display = showPrices ? 'block' : 'none' })
      clusterMarkers.forEach((marker) => { marker.getElement().style.display = showPrices ? 'none' : 'inline-flex' })
    }

    map.on('zoom', updateMarkerVisibility)
    updateMarkerVisibility()

    if (!bounds.isEmpty()) {
      map.fitBounds(bounds, {
        padding: immersive ? 96 : { top: 130, right: 70, bottom: 120, left: 70 },
        maxZoom: 12.2,
        duration: 650,
      })
    }

    return () => { map.off('zoom', updateMarkerVisibility) }
  }, [listings, returnTo, immersive, navigate, mapReady])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const timeout = window.setTimeout(() => map.resize(), 120)
    return () => window.clearTimeout(timeout)
  }, [immersive, style?.height])

  if (mapError) {
    return (
      <div className={`grid w-full place-items-center bg-[#dbe8df] px-6 text-center ${className}`}>
        <div className="rounded-3xl bg-white/90 p-5 shadow-xl shadow-[var(--brand-primary)]/10">
          <p className="text-sm font-bold text-[var(--brand-primary)]">Map temporarily unavailable</p>
          <p className="mt-2 max-w-xs text-sm leading-6 text-[#53645f]">Listings are still available in list view while the map finishes loading.</p>
        </div>
      </div>
    )
  }

  return <div ref={containerRef} style={style} className={`w-full ${className}`} />
}

function MapOverlayHeader({ listingsCount, onExpand, realMap = false }: { listingsCount: number; onExpand?: () => void; realMap?: boolean }) {
  return (
    <div className="absolute left-3 right-3 top-3 z-20 flex items-center justify-between gap-2 rounded-2xl bg-white/90 p-2 shadow-lg shadow-[var(--brand-primary)]/10 backdrop-blur md:left-5 md:right-5 md:top-5 md:rounded-3xl md:p-4">
      <div className="min-w-0">
        <p className="hidden text-xs font-bold uppercase tracking-[0.2em] text-[#0f705e] md:block">{realMap ? 'Interactive map' : 'Map concept'}</p>
        <h3 className="truncate text-sm font-extrabold tracking-[-0.03em] text-[#17211f] md:mt-1 md:text-xl">Map</h3>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="rounded-full bg-[#edf4ef] px-3 py-2 text-xs font-bold text-[var(--brand-primary)] md:hidden">{listingsCount} listings</span>
        <span className="hidden rounded-full bg-[var(--brand-primary)] px-3 py-1 text-xs font-bold text-white md:inline-flex">{listingsCount} pins</span>
        {onExpand && (
          <button onClick={onExpand} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-[#d7ded9] bg-white px-3 text-xs font-bold text-[var(--brand-primary)] md:min-h-0 md:rounded-full md:py-2">
            <Maximize2 size={14} /> <span className="hidden sm:inline">Open full map</span><span className="sm:hidden">Full</span>
          </button>
        )}
      </div>
    </div>
  )
}

function FallbackMapPanel({ listings, returnTo, onExpand, immersive = false, mapStyle }: { listings: Listing[]; returnTo: string; onExpand?: () => void; immersive?: boolean; mapStyle?: React.CSSProperties }) {
  const points = listings.filter((listing) => listing.latitude && listing.longitude)
  const mapHeight = immersive ? 'h-[100svh]' : 'h-[calc(100svh-330px)] md:h-auto md:min-h-[760px]'

  return (
    <div className={`overflow-hidden border border-black/5 bg-[#dbe8df] shadow-sm ${immersive ? 'h-[100svh] rounded-none' : 'rounded-none md:rounded-[2rem]'}`}>
      <div style={mapStyle} className={`relative ${mapHeight} bg-[radial-gradient(circle_at_30%_20%,rgba(15,112,94,0.18),transparent_24%),radial-gradient(circle_at_70%_70%,rgba(233,159,62,0.22),transparent_26%),linear-gradient(135deg,#e8f0ea,#c9ddd1)] p-3 md:p-5`}>
        <div className="absolute inset-0 opacity-35 [background-image:linear-gradient(rgba(15,61,53,.16)_1px,transparent_1px),linear-gradient(90deg,rgba(15,61,53,.16)_1px,transparent_1px)] [background-size:42px_42px]" />
        <MapOverlayHeader listingsCount={points.length} onExpand={onExpand} />
        {points.map((listing, index) => {
          const left = 18 + ((index * 23) % 62)
          const top = 24 + ((index * 29) % 52)
          return (
            <Link
              key={listing.id}
              to={routes.listing(listing.id, returnTo)}
              style={{ left: `${left}%`, top: `${top}%` }}
              className="absolute z-20 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--brand-primary)] px-3 py-2 text-xs font-bold text-white shadow-xl shadow-[var(--brand-primary)]/30 transition hover:scale-105 md:px-4 md:text-sm"
            >
              {currency(listing.price, listing.listing_kind).replace('/mo', '')}
            </Link>
          )
        })}
        {!immersive && (
          <div className="absolute bottom-5 left-5 z-10 hidden max-w-md rounded-3xl bg-white/92 p-4 text-sm leading-6 text-[#53645f] backdrop-blur md:block">
            Add <code className="rounded bg-[#edf4ef] px-1 font-bold text-[var(--brand-primary)]">VITE_MAPBOX_TOKEN</code> to enable the real interactive Mapbox map.
          </div>
        )}
      </div>
    </div>
  )
}

function FullMapModal({ open, onClose, listings, returnTo }: { open: boolean; onClose: () => void; listings: Listing[]; returnTo: string }) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-[80] bg-[#f6f1e8]">
      <div className="absolute left-3 right-3 top-3 z-30 flex items-center justify-between rounded-3xl bg-white/90 p-3 shadow-xl shadow-[var(--brand-primary)]/10 backdrop-blur md:left-6 md:right-6 md:top-6">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#0f705e] md:text-xs">Full map search</p>
          <h2 className="text-lg font-semibold tracking-[-0.04em] md:text-2xl">Explore Guam listings</h2>
        </div>
        <button onClick={onClose} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[var(--brand-primary)] px-4 text-sm font-bold text-white">
          <X size={16} /> Close
        </button>
      </div>
      <MapPanel listings={listings} returnTo={returnTo} immersive />
    </div>
  )
}

function SaveSearchModal({ open, onClose, filters }: { open: boolean; onClose: () => void; filters: Record<string, string> }) {
  const mutation = useMutation({ mutationFn: saveSearch })
  const { isClerkEnabled, isSignedIn, userId } = useAuthContext()
  const { data: meData } = useQuery({
    queryKey: ['me', userId, 'save-search-prefill'],
    queryFn: fetchMe,
    enabled: open && isClerkEnabled && isSignedIn && Boolean(userId),
    retry: false,
  })
  const profile = meData?.user
  if (!open) return null

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    mutation.mutate({
      name: String(form.get('name') || 'Guam housing search'),
      email: String(form.get('email') || ''),
      alert_frequency: String(form.get('alert_frequency') || 'daily'),
      filters,
    }, {
      onSuccess: () => recordLeadIntentEvent('saved_search_created', { source: 'web', metadata: { surface: 'save_search_modal' } }),
    })
  }

  return (
    <div className="fixed inset-0 z-[70] grid place-items-end bg-black/45 p-3 backdrop-blur-sm md:place-items-center">
      <div className="w-full max-w-md rounded-[2rem] bg-white p-6 shadow-2xl">
        {mutation.isSuccess ? (
          <div className="py-8 text-center">
            <CheckCircle2 className="mx-auto text-[#0f705e]" size={44} />
            <h2 className="mt-4 text-3xl font-semibold tracking-[-0.05em]">Search saved</h2>
            <p className="mt-3 text-sm leading-6 text-[#66746f]">Your search has been saved. Matching homes and price changes can be sent as alerts.</p>
            <button onClick={onClose} className="mt-6 w-full rounded-2xl bg-[var(--brand-primary)] px-4 py-3 text-sm font-bold text-white">Close</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#7b8a84]">Listing alerts</p>
                <h2 className="mt-2 text-3xl font-semibold tracking-[-0.05em]">Save this search</h2>
              </div>
              <button type="button" onClick={onClose} className="rounded-full border border-[#d7ded9] px-3 py-2 text-sm font-bold">Close</button>
            </div>
            <div className="mt-5 grid gap-3">
              <Input name="name" label="Search name" defaultValue={profile?.full_name ? `${profile.full_name}'s Guam home search` : 'My Guam home search'} required />
              <Input name="email" label="Email" type="email" defaultValue={profile?.email || ''} required />
              <label className="grid gap-2 text-sm font-semibold text-[#304942]">
                Alert frequency
                <select name="alert_frequency" className="min-h-12 rounded-2xl border border-[#dce5df] px-4">
                  <option value="immediately">Immediately</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                </select>
              </label>
            </div>
            {mutation.isError && <p className="mt-3 text-sm font-semibold text-red-700">Unable to save search right now.</p>}
            <button disabled={mutation.isPending} className="mt-5 w-full rounded-2xl bg-[var(--brand-primary)] px-4 py-3 text-sm font-bold text-white disabled:opacity-60">
              {mutation.isPending ? 'Saving...' : 'Save search'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

function AdminShell({ children, title, kicker, description }: { children: React.ReactNode; title?: string; kicker?: string; description?: string }) {
  const location = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.localStorage.getItem('hafa-admin-sidebar-collapsed') === 'true'
  })
  const navGroups = [
    {
      label: 'Workspace',
      items: [
        { label: 'Dashboard', href: '/admin', icon: <Home size={18} /> },
        { label: 'Leads', href: '/admin/leads', icon: <ClipboardList size={18} /> },
        { label: 'Search intent', href: '/admin/intent', icon: <Compass size={18} /> },
        { label: 'Showings', href: '/admin/showings', icon: <Clock3 size={18} /> },
      ],
    },
    {
      label: 'Settings',
      items: [
        { label: 'Team access', href: '/admin/users', icon: <UsersRound size={18} /> },
        { label: 'Audit history', href: '/admin/audit', icon: <History size={18} /> },
        { label: 'Data sync', href: '/admin/sync', icon: <DatabaseZap size={18} /> },
      ],
    },
  ]

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem('hafa-admin-sidebar-collapsed', String(collapsed))
  }, [collapsed])

  const isActive = (href: string) => href === '/admin' ? location.pathname === '/admin' : location.pathname === href || location.pathname.startsWith(`${href}/`)
  const sidebarCollapsed = collapsed && !mobileOpen

  const navLink = (item: { label: string; href: string; icon: React.ReactNode }) => {
    const active = isActive(item.href)
    return (
      <Link
        key={item.href}
        to={item.href}
        onClick={() => setMobileOpen(false)}
        aria-label={sidebarCollapsed ? item.label : undefined}
        title={sidebarCollapsed ? item.label : undefined}
        className={`group relative flex min-h-12 items-center rounded-2xl text-sm font-bold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#bdebdc] ${sidebarCollapsed ? 'justify-center px-2' : 'gap-3 px-4'} ${active ? 'bg-white text-[var(--brand-primary)] shadow-xl shadow-black/10' : 'text-white/72 hover:bg-white/10 hover:text-white'}`}
      >
        <span className={active ? 'text-[#0f705e]' : 'text-white/70'}>{item.icon}</span>
        {!sidebarCollapsed && <span>{item.label}</span>}
        {sidebarCollapsed && (
          <span className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 hidden -translate-y-1/2 whitespace-nowrap rounded-xl bg-[#17211f] px-3 py-2 text-xs font-bold text-white opacity-0 shadow-2xl transition group-hover:opacity-100 group-focus-visible:opacity-100 lg:block">
            {item.label}
          </span>
        )}
      </Link>
    )
  }

  const sidebar = (
    <aside className={`fixed inset-y-0 left-0 z-[80] flex flex-col border-r border-white/10 bg-[var(--brand-primary)] px-4 py-5 text-white shadow-2xl shadow-black/20 transition-all duration-200 lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 lg:shadow-none ${collapsed ? 'lg:w-[88px]' : 'lg:w-72'} ${mobileOpen ? 'translate-x-0' : '-translate-x-full'} w-72`}>
      <div className={`flex items-center ${sidebarCollapsed ? 'justify-center' : 'justify-between'} gap-3`}>
        <Link to="/admin" onClick={() => setMobileOpen(false)} className={`flex items-center gap-3 ${sidebarCollapsed ? 'justify-center' : ''}`} aria-label="Hafa Homes admin dashboard">
          <img src="/hafa-homes-mark.svg" alt="" className="h-10 w-10 shrink-0 rounded-2xl shadow-sm" />
          {!sidebarCollapsed && (
            <span className="leading-none">
              <span className="block text-lg font-extrabold tracking-[-0.04em] text-white">Hafa Homes</span>
              <span className="mt-1 block text-[10px] font-bold uppercase tracking-[0.18em] text-white/58">Admin workspace</span>
            </span>
          )}
        </Link>
        <button onClick={() => setMobileOpen(false)} className="grid h-10 w-10 place-items-center rounded-full bg-white/10 lg:hidden" aria-label="Close admin navigation"><X size={18} /></button>
      </div>

      <button
        type="button"
        onClick={() => setCollapsed((value) => !value)}
        className={`mt-5 hidden min-h-11 items-center rounded-2xl border border-white/10 bg-white/8 px-3 text-xs font-bold text-white/74 transition hover:bg-white/12 hover:text-white lg:flex ${collapsed ? 'justify-center' : 'justify-between'}`}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        aria-expanded={!collapsed}
      >
        {!collapsed && <span>Collapse</span>}
        {collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
      </button>

      <nav className="mt-7 grid gap-6">
        {navGroups.map((group) => (
          <div key={group.label} className="grid gap-2">
            {!sidebarCollapsed && <p className="px-3 text-[10px] font-extrabold uppercase tracking-[0.2em] text-white/38">{group.label}</p>}
            {group.items.map(navLink)}
          </div>
        ))}
      </nav>

      <div className="mt-auto grid gap-2 border-t border-white/10 pt-4">
        <Link to="/" onClick={() => setMobileOpen(false)} className={`group flex min-h-12 items-center rounded-2xl text-sm font-bold text-white/72 transition hover:bg-white/10 hover:text-white ${sidebarCollapsed ? 'justify-center px-2' : 'gap-3 px-4'}`} aria-label={sidebarCollapsed ? 'View public site' : undefined} title={sidebarCollapsed ? 'View public site' : undefined}>
          <Home size={18} />
          {!sidebarCollapsed && <span>View public site</span>}
        </Link>
      </div>
    </aside>
  )

  return (
    <main className="min-h-screen bg-[#f6f1e8] text-[#17211f]">
      {mobileOpen && <button aria-label="Close admin navigation" onClick={() => setMobileOpen(false)} className="fixed inset-0 z-[70] bg-black/35 backdrop-blur-sm lg:hidden" />}
      <div className={`grid min-h-screen transition-[grid-template-columns] duration-200 ${collapsed ? 'lg:grid-cols-[88px_1fr]' : 'lg:grid-cols-[288px_1fr]'}`}>
        {sidebar}
        <section className="min-w-0">
          <div className="sticky top-0 z-40 border-b border-[#e1d7c7] bg-white/82 px-4 py-3 backdrop-blur sm:px-5">
            <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 sm:gap-4">
              <div className="flex items-center gap-3">
                <button onClick={() => setMobileOpen(true)} className="grid h-11 w-11 place-items-center rounded-full border border-[#d7ded9] bg-white text-[var(--brand-primary)] lg:hidden" aria-label="Open admin navigation"><Menu size={18} /></button>
                <Link to="/" className="text-sm font-bold text-[#0f705e]">View public site</Link>
              </div>
              <UserButton />
            </div>
          </div>
          {title && (
            <header className="mx-auto max-w-7xl px-4 py-6 sm:px-5 sm:py-8">
              {kicker && <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#0f705e]">{kicker}</p>}
              <h1 className="mt-2 max-w-4xl text-3xl font-semibold tracking-[-0.06em] sm:text-4xl md:text-5xl">{title}</h1>
              {description && <p className="mt-4 max-w-3xl text-base leading-7 text-[#66746f]">{description}</p>}
            </header>
          )}
          {children}
        </section>
      </div>
    </main>
  )
}

function AdminDashboardPage() {
  const { data, isLoading, isError } = useQuery({ queryKey: ['admin-dashboard'], queryFn: fetchAdminDashboard })
  const metrics = data?.metrics

  return (
    <AdminShell kicker="Dashboard" title="Today’s broker workspace">
      <section className="mx-auto max-w-7xl px-4 pb-12 sm:px-5">
        {isLoading && <StateCard>Loading dashboard...</StateCard>}
        {isError && <StateCard tone="error">Unable to load dashboard.</StateCard>}
        {metrics && (
          <>
            <div className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-5">
              <AdminMetric label="Open leads" value={metrics.total_open_leads} tone="dark" />
              <AdminMetric label="New" value={metrics.new_leads} />
              <AdminMetric label="Unassigned" value={metrics.unassigned_leads} />
              <AdminMetric label="Showings" value={metrics.upcoming_showings} />
              <AdminMetric label="Needs follow-up" value={metrics.overdue_followups} tone="warn" />
            </div>
            <div className="mt-6 grid gap-5 lg:grid-cols-2">
              <AdminPanel title="Recent leads">
                <div className="grid gap-3">
                  {data.recent_leads.map((lead) => <LeadCompactRow key={lead.id} lead={lead} />)}
                  {data.recent_leads.length === 0 && <p className="text-sm font-semibold text-[#66746f]">No leads yet.</p>}
                </div>
              </AdminPanel>
              <AdminPanel title="Upcoming showings">
                <div className="grid gap-3">
                  {data.upcoming_showing_appointments.map((showing) => <ShowingCompactRow key={showing.id} showing={showing} />)}
                  {data.upcoming_showing_appointments.length === 0 && <p className="text-sm font-semibold text-[#66746f]">No showings scheduled yet.</p>}
                </div>
              </AdminPanel>
            </div>
          </>
        )}
      </section>
    </AdminShell>
  )
}

function AdminMetric({ label, value, tone = 'light' }: { label: string; value: number; tone?: 'light' | 'dark' | 'warn' }) {
  const classes = tone === 'dark' ? 'bg-[var(--brand-primary)] text-white' : tone === 'warn' ? 'bg-[#fff5d9] text-[#6b4508]' : 'bg-white text-[#17211f]'
  return <div className={`rounded-[1.25rem] p-3 shadow-sm sm:rounded-[1.5rem] sm:p-5 ${classes}`}><p className="text-[10px] font-bold uppercase tracking-[0.14em] opacity-60 sm:text-xs sm:tracking-[0.18em]">{label}</p><p className="mt-2 text-2xl font-semibold tracking-[-0.06em] sm:mt-3 sm:text-4xl">{value}</p></div>
}

function AdminPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="rounded-[1.75rem] bg-white p-4 shadow-sm sm:rounded-[2rem] sm:p-5"><h2 className="text-xl font-semibold tracking-[-0.04em] sm:text-2xl">{title}</h2><div className="mt-4">{children}</div></div>
}

export function AdminIntentPage() {
  const { userId } = useAuthContext()
  const [searchParams, setSearchParams] = useSearchParams()
  const [searchInput, setSearchInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const rawStatusFilter = searchParams.get('status') || ''
  const statusFilter = ['', 'active', 'snoozed', 'converted'].includes(rawStatusFilter) ? rawStatusFilter : ''
  const rawIdentityFilter = searchParams.get('identity') || ''
  const identityFilter = ['', 'signed_in', 'anonymous'].includes(rawIdentityFilter) ? rawIdentityFilter : ''
  const rawSortBy = searchParams.get('sort') || 'last_seen'
  const sortBy = ['last_seen', 'oldest', 'views_desc', 'saved_desc', 'forms_desc'].includes(rawSortBy) ? rawSortBy : 'last_seen'
  const rawPage = Number(searchParams.get('page') || '1')
  const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1
  const canonicalParams = new URLSearchParams()
  if (statusFilter) canonicalParams.set('status', statusFilter)
  if (identityFilter) canonicalParams.set('identity', identityFilter)
  if (sortBy !== 'last_seen') canonicalParams.set('sort', sortBy)
  if (page > 1) canonicalParams.set('page', String(page))
  const canonicalQuery = canonicalParams.toString()
  const currentQuery = searchParams.toString()

  useEffect(() => {
    if (currentQuery !== canonicalQuery) setSearchParams(new URLSearchParams(canonicalQuery), { replace: true })
  }, [canonicalQuery, currentQuery, setSearchParams])

  const setOperationalParams = (updates: Record<string, string>, resetPage = true) => {
    const next = new URLSearchParams(canonicalParams)
    Object.entries(updates).forEach(([key, value]) => value ? next.set(key, value) : next.delete(key))
    if (resetPage) next.delete('page')
    setSearchParams(next)
  }
  const setPage = (nextPage: number) => setOperationalParams({ page: nextPage > 1 ? String(nextPage) : '' }, false)
  const intentPath = routes.adminIntent(canonicalParams)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-lead-intent-sessions', userId, statusFilter, identityFilter, sortBy, searchQuery, page],
    queryFn: () => fetchAdminLeadIntentSessions({ status: statusFilter || undefined, identity: identityFilter || undefined, sort: sortBy || undefined, q: searchQuery || undefined, page: String(page), per_page: '10' }),
  })
  const { data: brokeragesData, refetch: refetchBrokerages } = useQuery({ queryKey: ['admin-brokerages', 'prompt-settings'], queryFn: fetchAdminBrokerages })
  const promptSettingsMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Record<string, unknown> }) => updateAdminBrokerage(id, payload),
    onSuccess: () => refetchBrokerages(),
  })
  const sessions = data?.lead_intent_sessions ?? []
  const metrics = data?.metrics
  const pagination = data?.pagination
  const brokerages = brokeragesData?.brokerages ?? []
  const primaryBrokerage = brokerages[0]

  return (
    <AdminShell kicker="Search intent" title="Live buyer intent" description="First-party browsing signals from Hafa Homes search, saves, form opens, and progressive prompts. Signed-in shoppers are identified; anonymous visitors stay anonymous until they submit a lead.">
      <section className="mx-auto max-w-7xl px-4 pb-12 sm:px-5">
        <div className="mb-5 flex flex-col gap-4 rounded-[1.75rem] border border-[#dfe8e2] bg-white/85 p-4 shadow-sm backdrop-blur sm:rounded-[2rem] sm:p-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-3xl">
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-[#0f705e]"><SlidersHorizontal size={15} /> Progressive prompt rules</div>
            <h2 className="mt-2 text-2xl font-semibold tracking-[-0.05em] text-[#17211f]">Control how often buyers see the lead prompt.</h2>
            <p className="mt-2 text-sm font-semibold leading-6 text-[#66746f]">
              {primaryBrokerage ? promptModeSummary(promptModeFromSettings(primaryBrokerage.settings), primaryBrokerage.settings) : 'Balanced mode prompts after a few clear buying signals, then waits before asking again.'}
            </p>
          </div>
          <button type="button" onClick={() => setSettingsOpen(true)} className="inline-flex min-h-14 w-full items-center justify-center gap-2 whitespace-nowrap rounded-[1.35rem] bg-[var(--brand-primary)] px-7 py-3.5 text-sm font-bold text-white shadow-xl shadow-[var(--brand-primary)]/15 transition hover:-translate-y-0.5 hover:bg-[#0c312b] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#bdebdc] sm:w-auto sm:min-w-[190px]">
            <SlidersHorizontal size={17} /> Prompt settings
          </button>
        </div>
        <PromptSettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} brokerages={brokerages} mutation={promptSettingsMutation} />
        {metrics && (
          <div className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4">
            <AdminMetric label="Active sessions" value={metrics.active_sessions} tone="dark" />
            <AdminMetric label="Signed in" value={metrics.signed_in_sessions} />
            <AdminMetric label="High intent" value={metrics.high_intent_sessions} tone="warn" />
            <AdminMetric label="Converted" value={metrics.converted_sessions} />
          </div>
        )}

        <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="rounded-[1.75rem] bg-white p-4 shadow-sm sm:rounded-[2rem] sm:p-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-2xl font-semibold tracking-[-0.05em]">Recent search sessions</h2>
                <p className="mt-2 text-sm font-semibold leading-6 text-[#66746f]">Use this as a coaching surface: saves, repeated village interest, and abandoned forms are the strongest outreach signals.</p>
              </div>
              <form onSubmit={(event) => { event.preventDefault(); setSearchQuery(searchInput.trim()); if (page > 1) setPage(1) }} className="grid w-full gap-2 lg:max-w-3xl">
                <div className="flex flex-wrap gap-2">
                  <input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Search user, email, village, listing, or behavior" className="min-h-11 min-w-0 flex-1 rounded-2xl border border-[#dce5df] bg-white px-3 text-sm font-bold text-[#304942] sm:min-w-[240px]" />
                  <button className="min-h-11 w-full rounded-2xl bg-[var(--brand-primary)] px-4 text-sm font-bold text-white sm:w-auto">Search</button>
                </div>
                <div className="flex flex-wrap gap-2">
                  <select aria-label="Intent status" value={statusFilter} onChange={(event) => setOperationalParams({ status: event.target.value })} className="min-h-11 w-full rounded-2xl border border-[#dce5df] bg-white px-3 text-sm font-bold text-[#304942] sm:w-auto">
                    <option value="">All statuses</option>
                    <option value="active">Active</option>
                    <option value="snoozed">Snoozed</option>
                    <option value="converted">Converted</option>
                  </select>
                  <select aria-label="Visitor identity" value={identityFilter} onChange={(event) => setOperationalParams({ identity: event.target.value })} className="min-h-11 w-full rounded-2xl border border-[#dce5df] bg-white px-3 text-sm font-bold text-[#304942] sm:w-auto">
                    <option value="">All visitors</option>
                    <option value="signed_in">Signed in</option>
                    <option value="anonymous">Anonymous</option>
                  </select>
                  <select aria-label="Intent sort" value={sortBy} onChange={(event) => setOperationalParams({ sort: event.target.value === 'last_seen' ? '' : event.target.value })} className="min-h-11 w-full rounded-2xl border border-[#dce5df] bg-white px-3 text-sm font-bold text-[#304942] sm:w-auto">
                    <option value="last_seen">Last seen newest</option>
                    <option value="oldest">Last seen oldest</option>
                    <option value="views_desc">Most listings viewed</option>
                    <option value="saved_desc">Most saved homes</option>
                    <option value="forms_desc">Most abandoned forms</option>
                  </select>
                </div>
              </form>
            </div>

            <div className="mt-5 grid gap-4">
              {isLoading && <StateCard>Loading search intent...</StateCard>}
              {isError && <StateCard tone="error">Unable to load search intent.</StateCard>}
              {sessions.map((session) => <AdminIntentSessionCard key={session.id} session={session} returnTo={intentPath} />)}
              {!isLoading && sessions.length === 0 && <StateCard>No search intent sessions match these filters yet.</StateCard>}
              {pagination && pagination.total_pages > 1 && (
                <PaginationControls pagination={pagination} onPageChange={setPage} />
              )}
            </div>
          </div>

          <aside className="space-y-4">
            <div className="rounded-[1.75rem] bg-[var(--brand-primary)] p-5 text-white shadow-xl shadow-[var(--brand-primary)]/15 sm:rounded-[2rem]">
              <TrendingUp className="text-[#bdebdc]" />
              <p className="mt-5 text-xs font-bold uppercase tracking-[0.2em] text-white/55">Top villages</p>
              <div className="mt-4 grid gap-2">
                {(data?.top_villages ?? []).map((village) => (
                  <div key={village.name} className="flex items-center justify-between rounded-2xl bg-white/10 px-3 py-2">
                    <span className="text-sm font-bold">{village.name}</span>
                    <span className="text-xs font-black uppercase tracking-[0.14em] text-[#bdebdc]">{village.count}</span>
                  </div>
                ))}
                {data?.top_villages?.length === 0 && <p className="text-sm font-semibold leading-6 text-white/68">Village patterns will appear after shoppers view listing detail pages.</p>}
              </div>
            </div>
            <div className="rounded-[1.75rem] bg-white p-5 shadow-sm sm:rounded-[2rem]">
              <Home className="text-[#0f705e]" />
              <p className="mt-5 text-xs font-bold uppercase tracking-[0.2em] text-[#7b8a84]">Top viewed homes</p>
              <div className="mt-4 grid gap-3">
                {(data?.top_listings ?? []).map((listing) => (
                  <Link key={listing.id} to={routes.adminListing(listing.id, intentPath)} className="grid gap-1 rounded-2xl bg-[#fbfaf6] p-3 transition hover:bg-[#f6f1e8]">
                    <span className="text-sm font-black text-[#17211f]">{listing.title}</span>
                    <span className="text-xs font-bold text-[#66746f]">{listing.village || 'Guam'} · {listing.price ? currency(listing.price, listing.listing_kind || 'sale') : 'Price not shown'}</span>
                    <span className="text-[10px] font-black uppercase tracking-[0.14em] text-[#0f705e]">{listing.view_count} views</span>
                  </Link>
                ))}
                {data?.top_listings?.length === 0 && <p className="text-sm font-semibold leading-6 text-[#66746f]">Listing-level view counts will appear after shoppers open property detail pages.</p>}
              </div>
            </div>
            <div className="rounded-[1.75rem] border border-[#dfe8e2] bg-white p-5 shadow-sm sm:rounded-[2rem]">
              <ShieldCheck className="text-[#0f705e]" />
              <h2 className="mt-4 text-xl font-semibold tracking-[-0.04em]">Privacy guardrails</h2>
              <p className="mt-2 text-sm font-semibold leading-6 text-[#66746f]">Anonymous visitors remain anonymous. Signed-in users are visible because they have an account. Prioritize outreach around saved homes, abandoned forms, and converted leads.</p>
            </div>
          </aside>
        </div>
      </section>
    </AdminShell>
  )
}

type PromptSettingsMutation = { mutate: (variables: { id: number; payload: Record<string, unknown> }) => void; isPending: boolean; isError: boolean; error: unknown }

function PromptSettingsModal({ open, onClose, brokerages, mutation }: { open: boolean; onClose: () => void; brokerages: Brokerage[]; mutation: PromptSettingsMutation }) {
  const [modeGuideOpen, setModeGuideOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    setModeGuideOpen(false)
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[80] overflow-y-auto bg-[#0b1f1b]/55 px-2 py-3 backdrop-blur-sm sm:px-4 sm:py-8" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <div role="dialog" aria-modal="true" aria-labelledby="prompt-settings-title" className="mx-auto w-full max-w-5xl rounded-[1.75rem] bg-[#fbfaf6] p-4 shadow-2xl shadow-black/25 sm:rounded-[2.25rem] sm:p-6">
        <div className="border-b border-[#dfe8e2] pb-4 sm:pb-5">
          <div className="flex items-center justify-between gap-3">
            <div className="inline-flex items-center gap-2 rounded-full bg-[#e9f5ef] px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.16em] text-[#0f705e] sm:text-xs sm:tracking-[0.18em]"><SlidersHorizontal size={14} /> Prompt intensity</div>
            <button type="button" onClick={onClose} aria-label="Close prompt settings" className="inline-flex h-11 w-11 shrink-0 items-center justify-center gap-2 rounded-2xl border border-[#d7ded9] bg-white text-sm font-bold text-[#304942] transition hover:bg-[#f6f1e8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0f705e] sm:w-auto sm:px-4 sm:py-2.5"><X size={17} /> <span className="hidden sm:inline">Close</span></button>
          </div>
          <div className="mt-4 max-w-3xl">
            <h2 id="prompt-settings-title" className="text-2xl font-semibold leading-[1.02] tracking-[-0.06em] text-[#17211f] sm:text-3xl md:text-4xl">Set the right level of follow-up.</h2>
            <p className="mt-3 text-sm font-semibold leading-6 text-[#66746f] sm:text-base sm:leading-7">These rules control when the progressive lead prompt appears while shoppers browse. Use Growth for lead-hungry teams, Balanced for the default experience, and Selective when you only want stronger intent.</p>
          </div>
        </div>

        <button type="button" onClick={() => setModeGuideOpen((value) => !value)} aria-expanded={modeGuideOpen} className="mt-4 flex w-full items-center justify-between gap-4 rounded-[1.35rem] border border-[#dfe8e2] bg-white px-4 py-3 text-left shadow-sm transition hover:bg-[#f8f4ed] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0f705e]">
          <span>
            <span className="block text-sm font-black uppercase tracking-[0.16em] text-[#0f705e]">Mode guide</span>
            <span className="mt-1 block text-sm font-semibold leading-5 text-[#66746f]">Compare Growth, Balanced, and Selective defaults.</span>
          </span>
          <ChevronRight className={`shrink-0 text-[#0f705e] transition-transform ${modeGuideOpen ? 'rotate-90' : ''}`} size={20} />
        </button>

        {modeGuideOpen && (
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            {(['growth', 'balanced', 'selective'] as PromptMode[]).map((mode) => (
              <div key={mode} className="rounded-[1.35rem] border border-[#dfe8e2] bg-white p-4 shadow-sm">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-[#0f705e]">{promptModeTitle(mode)}</p>
                <h3 className="mt-2 text-lg font-semibold tracking-[-0.05em] text-[#17211f] sm:text-xl">{promptModeHeadline(mode)}</h3>
                <p className="mt-2 text-sm font-semibold leading-6 text-[#66746f]">{promptModeDescription(mode)}</p>
                <div className="mt-3 grid gap-1 text-xs font-black uppercase tracking-[0.12em] text-[#53645f]">
                  <span>{defaultPromptThreshold(mode)} listing views</span>
                  <span>{promptModeDefaults(mode).searchFilters} filter changes</span>
                  <span>{defaultPromptSnooze(mode)}h dismissal snooze</span>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 grid gap-4">
          {brokerages.map((brokerage) => <PromptSettingsCard key={`${brokerage.id}-${JSON.stringify(brokerage.settings || {})}`} brokerage={brokerage} mutation={mutation} />)}
          {brokerages.length === 0 && <StateCard>No brokerages are available for prompt settings.</StateCard>}
        </div>
      </div>
    </div>
  )
}

function PromptSettingsCard({ brokerage, mutation }: { brokerage: Brokerage; mutation: PromptSettingsMutation }) {
  const settings = brokerage.settings || {}
  const mode = promptModeFromSettings(settings)
  const enabled = settings.progressive_prompts_enabled === false || settings.progressive_prompts_enabled === 'false' ? 'false' : 'true'
  const listingThreshold = promptSettingString(settings, 'listing_views_threshold')
  const snoozeHours = promptSettingString(settings, 'prompt_snooze_hours')
  const defaults = promptModeDefaults(mode)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const nextMode = promptModeFromValue(String(form.get('lead_prompt_mode') || 'balanced'))
    const listingViews = String(form.get('listing_views_threshold') || '').trim()
    const snooze = String(form.get('prompt_snooze_hours') || '').trim()
    mutation.mutate({
      id: brokerage.id,
      payload: {
        lead_prompt_mode: nextMode,
        progressive_prompts_enabled: String(form.get('progressive_prompts_enabled') || 'true'),
        listing_views_threshold: listingViews || null,
        prompt_snooze_hours: snooze || null,
      },
    })
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-[1.5rem] border border-[#dfe8e2] bg-white p-4 shadow-sm sm:rounded-[2rem] sm:p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-2xl">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-[#7b8a84]">Brokerage</p>
          <h3 className="mt-1 text-2xl font-semibold tracking-[-0.05em] text-[#17211f]">{brokerage.name}</h3>
          <p className="mt-2 text-sm font-semibold leading-6 text-[#66746f]">{promptModeSummary(mode, settings)}</p>
        </div>
        <button disabled={mutation.isPending} className="min-h-14 w-full whitespace-nowrap rounded-[1.35rem] bg-[var(--brand-primary)] px-7 py-3.5 text-sm font-bold text-white shadow-xl shadow-[var(--brand-primary)]/15 transition hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-55 sm:w-auto">{mutation.isPending ? 'Saving...' : 'Save settings'}</button>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-4 lg:items-start">
        <label className="grid content-start gap-2 text-sm font-bold text-[#304942]">
          <PromptSettingLabel label="Mode" help="The mode sets the default trigger level: Growth prompts sooner, Balanced waits for a few clear signals, Selective waits for stronger repeated behavior." />
          <select name="lead_prompt_mode" defaultValue={mode} className="min-h-14 min-w-0 rounded-2xl border border-[#dce5df] bg-white px-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0f705e]">
            <option value="growth">Growth · sooner prompts</option>
            <option value="balanced">Balanced · default</option>
            <option value="selective">Selective · fewer prompts</option>
          </select>
        </label>
        <label className="grid content-start gap-2 text-sm font-bold text-[#304942]">
          <PromptSettingLabel label="Prompts" help="Turn this off to keep tracking search intent for admins while hiding the progressive lead prompt from public shoppers." />
          <select name="progressive_prompts_enabled" defaultValue={enabled} className="min-h-14 min-w-0 rounded-2xl border border-[#dce5df] bg-white px-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0f705e]">
            <option value="true">Enabled</option>
            <option value="false">Disabled</option>
          </select>
        </label>
        <label className="grid content-start gap-2 text-sm font-bold text-[#304942]">
          <PromptSettingLabel label="Listing views" help="How many unique property detail pages someone can open before the multiple-listing prompt is allowed. Leave blank to use the mode default." />
          <input name="listing_views_threshold" type="number" min="1" max="20" defaultValue={listingThreshold} placeholder={`Auto · ${defaults.listingViews}`} className="min-h-14 min-w-0 rounded-2xl border border-[#dce5df] bg-white px-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0f705e]" />
          <span className="text-xs font-semibold leading-5 text-[#7b8a84]">Auto uses {defaults.listingViews} for {promptModeTitle(mode)}.</span>
        </label>
        <label className="grid content-start gap-2 text-sm font-bold text-[#304942]">
          <PromptSettingLabel label="Snooze hours" help="How long to stay quiet after a shopper dismisses a prompt. Stronger new intent can still unlock a respectful re-prompt; repeated dismissals hard-snooze." />
          <input name="prompt_snooze_hours" type="number" min="1" max="168" defaultValue={snoozeHours} placeholder={`Auto · ${defaults.snoozeHours}`} className="min-h-14 min-w-0 rounded-2xl border border-[#dce5df] bg-white px-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0f705e]" />
          <span className="text-xs font-semibold leading-5 text-[#7b8a84]">Auto uses {defaults.snoozeHours} hours.</span>
        </label>
      </div>
      {mutation.isError && <p className="mt-3 text-sm font-semibold text-[#b42318]">{displayErrorMessage(mutation.error, 'Unable to save prompt settings.')}</p>}
    </form>
  )
}

function PromptSettingLabel({ label, help }: { label: string; help: string }) {
  return (
    <span className="flex min-h-7 items-center gap-2">
      <span>{label}</span>
      <span className="group relative inline-flex">
        <button type="button" aria-label={help} className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-[#cbd8d1] bg-[#fbfaf6] text-[#0f705e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0f705e]"><Info size={12} /></button>
        <span className="pointer-events-none absolute right-0 top-full z-20 mt-2 hidden w-64 rounded-2xl bg-[#17211f] p-3 text-xs font-semibold leading-5 text-white shadow-2xl group-hover:block group-focus-within:block sm:left-1/2 sm:right-auto sm:-translate-x-1/2">{help}</span>
      </span>
    </span>
  )
}

function promptModeFromSettings(settings?: Record<string, unknown>): PromptMode {
  return promptModeFromValue(String(settings?.lead_prompt_mode || 'balanced'))
}

function promptModeFromValue(value: string): PromptMode {
  if (value === 'growth' || value === 'low_friction') return 'growth'
  if (value === 'selective' || value === 'strict') return 'selective'
  return 'balanced'
}

function promptSettingString(settings: Record<string, unknown>, key: string) {
  const value = settings[key]
  return value === undefined || value === null || value === '' ? '' : String(value)
}

function promptModeDefaults(mode: PromptMode) {
  if (mode === 'growth') return { listingViews: 2, sameVillage: 2, searchFilters: 2, snoozeHours: 8, dismissals: 3 }
  if (mode === 'selective') return { listingViews: 5, sameVillage: 3, searchFilters: 5, snoozeHours: 72, dismissals: 1 }
  return { listingViews: 3, sameVillage: 2, searchFilters: 3, snoozeHours: 24, dismissals: 2 }
}

function promptModeTitle(mode: PromptMode) {
  if (mode === 'growth') return 'Growth'
  if (mode === 'selective') return 'Selective'
  return 'Balanced'
}

function promptModeHeadline(mode: PromptMode) {
  if (mode === 'growth') return 'For teams that want more at-bats.'
  if (mode === 'selective') return 'For established teams that want fewer interruptions.'
  return 'For a respectful default cadence.'
}

function promptModeDescription(mode: PromptMode) {
  if (mode === 'growth') return 'Prompt after lighter intent signals and allow more re-prompts when behavior keeps getting stronger.'
  if (mode === 'selective') return 'Wait for more property views or repeated searches, then stay quiet longer after a dismissal.'
  return 'Prompt after a few meaningful actions, then cap repeated asks so browsing still feels open.'
}

function promptModeSummary(mode: PromptMode, settings?: Record<string, unknown>) {
  const defaults = promptModeDefaults(mode)
  const listingViews = promptSettingString(settings || {}, 'listing_views_threshold') || String(defaults.listingViews)
  const snoozeHours = promptSettingString(settings || {}, 'prompt_snooze_hours') || String(defaults.snoozeHours)
  const disabled = settings?.progressive_prompts_enabled === false || settings?.progressive_prompts_enabled === 'false'
  const prefix = disabled ? 'Prompts are currently disabled. If enabled, ' : `${promptModeTitle(mode)} mode: `
  return `${prefix}first prompt can appear after about ${listingViews} unique listing views, ${defaults.sameVillage} repeated same-area views, or ${defaults.searchFilters} search filter changes. Dismissed prompts stay quiet for about ${snoozeHours} hours, with respectful re-prompts only after stronger new intent.`
}

function defaultPromptThreshold(mode: PromptMode) {
  return String(promptModeDefaults(mode).listingViews)
}

function defaultPromptSnooze(mode: PromptMode) {
  return String(promptModeDefaults(mode).snoozeHours)
}

function AdminIntentSessionCard({ session, returnTo }: { session: AdminLeadIntentSession; returnTo: string }) {
  const topVillages = session.top_villages ?? []
  const events = session.recent_events ?? []
  const statusClasses = intentStatusClasses(session.status)

  return (
    <article className="rounded-[1.5rem] border border-[#dfe8e2] bg-[#fbfaf6] p-4 transition hover:-translate-y-0.5 hover:shadow-xl hover:shadow-[var(--brand-primary)]/10 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[#0f705e]">{session.user ? 'Signed-in shopper' : 'Anonymous visitor'}</p>
            {session.high_intent && <span className="rounded-full bg-[#fee6ca] px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-[#7a3a00]">High intent</span>}
          </div>
          <h3 className="mt-2 text-2xl font-semibold tracking-[-0.05em]">{session.identity_label || 'Anonymous visitor'}</h3>
          <p className="mt-2 text-sm font-semibold leading-6 text-[#53645f]">{session.narrative || 'Browsing context is still warming up.'}</p>
          {session.user?.email && <p className="mt-1 text-sm font-bold text-[#0f705e]">{session.user.email}</p>}
        </div>
        <div className="text-right">
          <span className={`rounded-full px-3 py-1 text-xs font-black uppercase tracking-[0.12em] ${statusClasses}`}>{session.status || 'active'}</span>
          <p className="mt-2 text-xs font-bold uppercase tracking-[0.14em] text-[#7b8a84]">Last seen {formatDateTime(session.last_seen_at)}</p>
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <IntentStat label="Viewed" value={`${session.unique_listing_view_count ?? 0} listings`} />
        <IntentStat label="Saved" value={`${session.saved_listing_count ?? 0} homes`} />
        <IntentStat label="Forms" value={`${session.form_open_count ?? 0} opened`} />
        <IntentStat label="Abandoned" value={`${session.form_abandon_count ?? 0}`} />
        <IntentStat label="Price range" value={intentPriceRange(session)} />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {topVillages.slice(0, 4).map((village) => <span key={village.name} className="rounded-full bg-white px-3 py-1 text-xs font-bold text-[#53645f]">{village.name} · {village.count}</span>)}
        {session.requested_agent?.name && <span className="rounded-full bg-[#e9f5ef] px-3 py-1 text-xs font-bold text-[#0f705e]">Preferred agent: {session.requested_agent.name}</span>}
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.7fr)]">
        <div className="rounded-2xl bg-white p-3">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#7b8a84]">Recent activity</p>
          <div className="mt-3 grid gap-2">
            {events.slice(0, 5).map((event) => <IntentEventRow key={event.id} event={event} />)}
            {events.length === 0 && <p className="text-sm font-semibold text-[#66746f]">No event trail yet.</p>}
          </div>
        </div>
        <div className="rounded-2xl bg-white p-3">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#7b8a84]">Next action</p>
          {session.converted_lead ? (
            <Link to={routes.adminLead(session.converted_lead.id, returnTo)} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-full bg-[var(--brand-primary)] px-4 text-sm font-bold text-white">Open converted lead <ChevronRight size={16} /></Link>
          ) : session.user ? (
            <p className="mt-3 text-sm font-semibold leading-6 text-[#304942]">Signed-in shopper. Prioritize follow-up only when they save homes, request help, or repeatedly revisit a focused search.</p>
          ) : (
            <p className="mt-3 text-sm font-semibold leading-6 text-[#304942]">Anonymous visitor. Let the progressive prompt convert them before outreach.</p>
          )}
          {session.latest_listing_id && (
            <Link to={routes.adminListing(session.latest_listing_id, returnTo)} className="mt-3 inline-flex items-center gap-2 text-sm font-bold text-[#0f705e]">View latest listing <ChevronRight size={15} /></Link>
          )}
          {session.last_prompt_dismissed_at && <p className="mt-3 text-xs font-bold uppercase tracking-[0.14em] text-[#7b8a84]">Prompt dismissed {formatDateTime(session.last_prompt_dismissed_at)}</p>}
        </div>
      </div>
    </article>
  )
}

function IntentStat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl bg-white px-3 py-2"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#7b8a84]">{label}</p><p className="mt-1 text-sm font-bold text-[#17211f]">{value}</p></div>
}

function PaginationControls({ pagination, onPageChange }: { pagination: PaginationMeta; onPageChange: (page: number) => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[#fbfaf6] p-3">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#7b8a84]">Page {pagination.page} of {pagination.total_pages} · {pagination.total_count} total</p>
      <div className="flex gap-2">
        <button disabled={pagination.page <= 1} onClick={() => onPageChange(pagination.page - 1)} className="min-h-10 rounded-full border border-[#dce5df] bg-white px-4 text-sm font-bold text-[#304942] disabled:cursor-not-allowed disabled:opacity-45">Previous</button>
        <button disabled={pagination.page >= pagination.total_pages} onClick={() => onPageChange(pagination.page + 1)} className="min-h-10 rounded-full bg-[var(--brand-primary)] px-4 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-45">Next</button>
      </div>
    </div>
  )
}

function IntentEventRow({ event }: { event: AdminLeadIntentEvent }) {
  const context = event.listing?.title || event.village?.name || event.agent?.name || metadataSummary(event.metadata)
  return (
    <div className="rounded-2xl bg-[#fbfaf6] px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-bold text-[#17211f]">{event.label || event.event_name.replaceAll('_', ' ')}</p>
        <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#7b8a84]">{formatDateTime(event.occurred_at)}</span>
      </div>
      {context && <p className="mt-1 text-xs font-semibold leading-5 text-[#66746f]">{context}</p>}
    </div>
  )
}

function intentStatusClasses(status?: string) {
  if (status === 'converted') return 'bg-[#e9f5ef] text-[#0f705e]'
  if (status === 'snoozed') return 'bg-[#fff5d9] text-[#6b4508]'
  return 'bg-[#dceee8] text-[var(--brand-primary)]'
}

function intentPriceRange(intent: LeadIntentSummary) {
  if (intent.viewed_price_min && intent.viewed_price_max) return `${currency(intent.viewed_price_min, 'sale')}–${currency(intent.viewed_price_max, 'sale')}`
  if (intent.viewed_price_max) return `Up to ${currency(intent.viewed_price_max, 'sale')}`
  return 'Not clear yet'
}

function metadataSummary(metadata?: Record<string, unknown>) {
  if (!metadata) return ''
  const parts = ['surface', 'filter', 'value', 'view_mode'].map((key) => metadata[key]).filter(Boolean).map(String)
  return parts.join(' · ')
}

function LeadCompactRow({ lead }: { lead: Lead }) {
  return (
    <Link to={`/admin/leads/${lead.id}`} className="block rounded-2xl bg-[#f6f1e8] p-4 transition hover:bg-[#efe6d7]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-[#17211f]">{lead.name}</p>
          <p className="mt-1 text-xs font-semibold text-[#66746f]">{lead.listing?.title ?? leadTypeLabel(lead.lead_type)}</p>
        </div>
        <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-[#0f705e]">{lead.status.replaceAll('_', ' ')}</span>
      </div>
    </Link>
  )
}

function ShowingCompactRow({ showing }: { showing: ShowingAppointment }) {
  return (
    <Link to={routes.adminShowing(showing.id, '/admin')} className="block rounded-2xl bg-[#f6f1e8] p-4 transition hover:bg-[#efe6d7]">
      <p className="text-sm font-bold text-[#17211f]">{showing.listing?.title ?? 'Showing appointment'}</p>
      <p className="mt-1 text-xs font-semibold text-[#66746f]">{formatDateTime(showing.scheduled_starts_at, showing.timezone)} · {showing.agent?.name ?? 'Unassigned agent'}</p>
    </Link>
  )
}

export function LeadsPage() {
  const { userId } = useAuthContext()
  const [searchParams, setSearchParams] = useSearchParams()
  const [searchFilter, setSearchFilter] = useState('')
  const rawAgentFilter = searchParams.get('assigned_agent_id') || ''
  const agentFilter = rawAgentFilter === 'unassigned' || /^\d+$/.test(rawAgentFilter) ? rawAgentFilter : ''
  const rawLeadTypeFilter = searchParams.get('lead_type') || ''
  const leadTypeFilter = leadTypeOptions.some((option) => option.value === rawLeadTypeFilter) ? rawLeadTypeFilter : ''
  const rawStatusFilter = searchParams.get('status') || ''
  const statusFilter = leadStatuses.some((option) => option.value === rawStatusFilter) ? rawStatusFilter : ''
  const rawSortFilter = searchParams.get('sort') || 'newest'
  const sortFilter = leadSortOptions.some((option) => option.value === rawSortFilter) ? rawSortFilter : 'newest'
  const rawPage = Number(searchParams.get('page') || '1')
  const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1
  const canonicalParams = new URLSearchParams()
  if (agentFilter) canonicalParams.set('assigned_agent_id', agentFilter)
  if (leadTypeFilter) canonicalParams.set('lead_type', leadTypeFilter)
  if (statusFilter) canonicalParams.set('status', statusFilter)
  if (sortFilter !== 'newest') canonicalParams.set('sort', sortFilter)
  if (page > 1) canonicalParams.set('page', String(page))
  const canonicalQuery = canonicalParams.toString()
  const currentQuery = searchParams.toString()

  useEffect(() => {
    if (currentQuery !== canonicalQuery) setSearchParams(new URLSearchParams(canonicalQuery), { replace: true })
  }, [canonicalQuery, currentQuery, setSearchParams])

  const setOperationalParams = (updates: Record<string, string>, resetPage = true) => {
    const next = new URLSearchParams(canonicalParams)
    Object.entries(updates).forEach(([key, value]) => value ? next.set(key, value) : next.delete(key))
    if (resetPage) next.delete('page')
    setSearchParams(next)
  }
  const setPage = (nextPage: number) => setOperationalParams({ page: nextPage > 1 ? String(nextPage) : '' }, false)
  const leadInboxPath = routes.adminLeads(canonicalParams)
  const leadQueryParams = {
    assigned_agent_id: agentFilter || undefined,
    lead_type: leadTypeFilter || undefined,
    status: statusFilter || undefined,
    q: searchFilter.trim() || undefined,
    sort: sortFilter,
    page: String(page),
    per_page: '25',
  }
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['leads', userId, leadQueryParams], queryFn: () => fetchLeads(leadQueryParams), placeholderData: keepPreviousData })
  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: LeadStatus }) => updateLead(id, { status }),
    onSuccess: () => refetch(),
  })
  const leads = data?.leads ?? []
  const assignableAgents = data?.assignable_agents ?? []
  const openLeads = data?.metrics.open_leads ?? 0
  const newLeads = data?.metrics.new_leads ?? 0
  const scheduledLeads = data?.metrics.showing_leads ?? 0
  const priceWatchLeads = data?.metrics.price_watch_leads ?? 0
  const hasActiveFilters = Boolean(agentFilter || leadTypeFilter || statusFilter || searchFilter.trim() || sortFilter !== 'newest')
  const resetFilters = () => {
    setSearchFilter('')
    setSearchParams(new URLSearchParams())
  }

  return (
    <AdminShell kicker="Leads" title="Lead inbox">
      <section className="mx-auto max-w-7xl px-4 pb-10 sm:px-5">
        <div className="mb-5 grid gap-3 md:grid-cols-4">
          <div className="rounded-[1.75rem] bg-[var(--brand-primary)] p-5 text-white"><p className="text-xs font-bold uppercase tracking-[0.18em] text-white/55">Open leads</p><p className="mt-2 text-4xl font-semibold tracking-[-0.06em]">{openLeads}</p></div>
          <div className="rounded-[1.75rem] bg-white p-5"><p className="text-xs font-bold uppercase tracking-[0.18em] text-[#7b8a84]">New</p><p className="mt-2 text-4xl font-semibold tracking-[-0.06em]">{newLeads}</p></div>
          <div className="rounded-[1.75rem] bg-white p-5"><p className="text-xs font-bold uppercase tracking-[0.18em] text-[#7b8a84]">Showings</p><p className="mt-2 text-4xl font-semibold tracking-[-0.06em]">{scheduledLeads}</p></div>
          <div className="rounded-[1.75rem] bg-white p-5"><p className="text-xs font-bold uppercase tracking-[0.18em] text-[#7b8a84]">Price watch</p><p className="mt-2 text-4xl font-semibold tracking-[-0.06em]">{priceWatchLeads}</p></div>
        </div>
        <div className="mb-5 rounded-[1.75rem] bg-white p-4 shadow-sm sm:p-5">
          <div className="grid gap-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <label className="grid min-w-0 flex-1 gap-2 text-sm font-semibold text-[#304942] lg:max-w-3xl">
                Search leads
                <div className="relative">
                  <Search size={17} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#7b8a84]" />
                  <input value={searchFilter} onChange={(event) => { setSearchFilter(event.target.value); if (page > 1) setPage(1) }} placeholder="Name, email, phone, listing..." className="min-h-12 w-full min-w-0 rounded-2xl border border-[#dce5df] bg-white pl-11 pr-4" />
                </div>
                <span className="text-xs font-medium leading-5 text-[#7b8a84]">Private search text stays out of the page URL. Operational filters and pagination are shareable.</span>
              </label>
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-sm font-semibold text-[#66746f]">Showing {leads.length} of {data?.pagination.total_count ?? 0} lead{data?.pagination.total_count === 1 ? '' : 's'}{isLoading ? '...' : ''}</p>
                {hasActiveFilters && <button type="button" onClick={resetFilters} className="rounded-full bg-[#edf0ec] px-4 py-2 text-sm font-bold text-[#304942]">Reset filters</button>}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(150px,0.9fr)_minmax(150px,0.9fr)_minmax(220px,1.2fr)_minmax(160px,0.9fr)]">
              <label className="grid min-w-0 gap-2 text-sm font-semibold text-[#304942]">
                Type
                <select value={leadTypeFilter} onChange={(event) => setOperationalParams({ lead_type: event.target.value })} className="min-h-12 w-full min-w-0 rounded-2xl border border-[#dce5df] bg-white px-4">
                  <option value="">All lead types</option>
                  {leadTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              <label className="grid min-w-0 gap-2 text-sm font-semibold text-[#304942]">
                Status
                <select value={statusFilter} onChange={(event) => setOperationalParams({ status: event.target.value })} className="min-h-12 w-full min-w-0 rounded-2xl border border-[#dce5df] bg-white px-4">
                  <option value="">All statuses</option>
                  {leadStatuses.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
                </select>
              </label>
              <label className="grid min-w-0 gap-2 text-sm font-semibold text-[#304942]">
                Assigned agent
                <select value={agentFilter} onChange={(event) => setOperationalParams({ assigned_agent_id: event.target.value })} className="min-h-12 w-full min-w-0 rounded-2xl border border-[#dce5df] bg-white px-4">
                  <option value="">All agents</option>
                  <option value="unassigned">Unassigned leads</option>
                  {assignableAgents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name} · {agent.brokerage?.name}</option>)}
                </select>
              </label>
              <label className="grid min-w-0 gap-2 text-sm font-semibold text-[#304942]">
                Sort
                <select value={sortFilter} onChange={(event) => setOperationalParams({ sort: event.target.value === 'newest' ? '' : event.target.value })} className="min-h-12 w-full min-w-0 rounded-2xl border border-[#dce5df] bg-white px-4">
                  {leadSortOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
            </div>
          </div>
        </div>
        {isLoading && <StateCard>Loading leads...</StateCard>}
        {isError && <StateCard tone="error">Unable to load leads.</StateCard>}
        {statusMutation.isError && <StateCard tone="error">{displayErrorMessage(statusMutation.error, 'Unable to update lead right now.')}</StateCard>}
        <div className="grid gap-4">
          {leads.map((lead) => (
            <article key={lead.id} className="rounded-[1.75rem] bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-xl hover:shadow-[var(--brand-primary)]/10 sm:rounded-[2rem] sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className={`inline-flex rounded-full px-3 py-1 text-xs font-black uppercase tracking-[0.16em] ${leadTypeBadgeClasses(lead.lead_type)}`}>{leadTypeLabel(lead.lead_type)}</p>
                  <Link to={routes.adminLead(lead.id, leadInboxPath)} className="mt-3 block text-2xl font-semibold tracking-[-0.04em] hover:text-[#0f705e]">{lead.name}</Link>
                  <div className="mt-2 flex flex-wrap gap-3 text-sm font-semibold text-[#53645f]">
                    <span className="inline-flex items-center gap-1"><Mail size={15} /> {lead.email}</span>
                    {lead.phone && <span className="inline-flex items-center gap-1"><Phone size={15} /> {lead.phone}</span>}
                  </div>
                </div>
                <LeadStatusSelect
                  value={lead.status}
                  onChange={(status) => statusMutation.mutate({ id: lead.id, status })}
                  disabled={statusMutation.isPending}
                />
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <LeadMeta icon={<Building2 size={16} />} label="Brokerage" value={lead.brokerage?.name ?? 'Unassigned brokerage'} />
                <LeadMeta icon={<UserRound size={16} />} label="Requested agent" value={lead.requested_agent?.name ?? 'Brokerage team'} />
                <LeadMeta icon={<ClipboardList size={16} />} label="Assigned agent" value={lead.assigned_agent?.name ?? 'Needs assignment'} />
              </div>
              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                <LeadQualificationCard lead={lead} compact />
                <LeadIntentCard intent={lead.intent_summary} compact />
              </div>
              {lead.listing && <p className="mt-4 rounded-2xl bg-[#f6f1e8] p-3 text-sm font-semibold text-[#304942]">Interested in {lead.listing.title} · {lead.listing.village} · {currency(lead.listing.price, lead.listing.listing_kind)}</p>}
              {lead.message && <p className="mt-4 line-clamp-2 text-sm leading-6 text-[#66746f]">{lead.message}</p>}
              <div className="mt-4 flex flex-wrap justify-end gap-2">
                {lead.user_id && lead.brokerage_id && (
                  <Link to={routes.adminCustomer(lead.brokerage_id, lead.user_id, leadInboxPath)} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#edf0ec] px-4 text-sm font-bold text-[#304942]">Customer workspace <UsersRound size={16} /></Link>
                )}
                <Link to={routes.adminLead(lead.id, leadInboxPath)} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[var(--brand-primary)] px-4 text-sm font-bold text-white">Open lead <ChevronRight size={16} /></Link>
              </div>
            </article>
          ))}
          {leads.length === 0 && !isLoading && <StateCard>No matching leads. New tour requests and price watch requests will appear here.</StateCard>}
        </div>
        {data?.pagination && data.pagination.total_pages > 1 && (
          <div className="mt-5 rounded-[1.5rem] bg-white p-4 shadow-sm">
            <PaginationControls pagination={data.pagination} onPageChange={setPage} />
          </div>
        )}
      </section>
    </AdminShell>
  )
}

export function CustomerWorkspacePage() {
  const { brokerageId, customerId } = useParams()
  const { userId: staffUserId } = useAuthContext()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const returnPath = safeReturnPath(searchParams.get('return_to'), routes.adminLeads())
  const returnLabel = returnPath.startsWith('/admin/leads/') ? 'Back to lead' : 'Back to lead inbox'
  const rawPage = Number(searchParams.get('page') || '1')
  const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1
  const workspacePath = `${location.pathname}${location.search}`
  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-customer-workspace', staffUserId, brokerageId, customerId, page],
    queryFn: () => fetchAdminCustomerWorkspace(brokerageId || '', customerId || '', page),
    enabled: Boolean(staffUserId && brokerageId && customerId),
    placeholderData: keepPreviousData,
    retry: false,
  })

  const setPage = (nextPage: number) => {
    const next = new URLSearchParams(searchParams)
    if (nextPage > 1) next.set('page', String(nextPage))
    else next.delete('page')
    setSearchParams(next)
  }

  const customer = data?.customer
  const metrics = data?.metrics
  const isUnavailable = error instanceof ApiFetchError && error.status === 404

  return (
    <AdminShell>
      <section className="mx-auto max-w-7xl px-4 pb-10 pt-6 sm:px-5">
        <Link to={returnPath} className="mb-6 inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-5 text-sm font-bold text-[#304942]"><ArrowLeft size={16} /> {returnLabel}</Link>
        {isLoading && <StateCard>Loading customer workspace...</StateCard>}
        {isUnavailable && <StateCard tone="error">This customer is not available in this brokerage workspace.</StateCard>}
        {error && !isUnavailable && <StateCard tone="error">{displayErrorMessage(error, 'Unable to load this customer workspace.')}</StateCard>}
        {customer && metrics && (
          <div className="grid gap-5">
            <header className="overflow-hidden rounded-[2rem] bg-[#101f1c] text-white shadow-2xl shadow-[var(--brand-primary)]/15">
              <div className="grid gap-6 p-5 sm:p-7 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-black uppercase tracking-[0.16em] text-[#bdebdc]">Customer workspace</span>
                    <span className="rounded-full bg-[#f5c16c]/15 px-3 py-1 text-xs font-bold text-[#f5c16c]">{data.brokerage.name}</span>
                  </div>
                  <h1 className="mt-5 break-words text-4xl font-semibold tracking-[-0.06em] sm:text-5xl">{customer.full_name}</h1>
                  <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm font-semibold text-white/72">
                    <a href={`mailto:${customer.email}`} className="inline-flex min-h-11 items-center gap-2 hover:text-white"><Mail size={16} /> {customer.email}</a>
                    {customer.phone && <a href={`tel:${customer.phone}`} className="inline-flex min-h-11 items-center gap-2 hover:text-white"><Phone size={16} /> {customer.phone}</a>}
                  </div>
                </div>
                <div className="rounded-[1.5rem] border border-white/10 bg-white/8 p-4 lg:min-w-64">
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-white/48">Account relationship</p>
                  <p className="mt-2 text-sm font-semibold leading-6 text-white/82">Signed-in customer #{customer.id}</p>
                  <p className="text-sm leading-6 text-white/62">Preferred contact: {customer.preferred_contact_method || 'Not provided'}</p>
                  <p className="text-sm leading-6 text-white/62">Since {formatDate(customer.account_created_at)}</p>
                </div>
              </div>
              <div className="grid border-t border-white/10 sm:grid-cols-2 lg:grid-cols-4">
                <CustomerMetric label="Visible requests" value={String(metrics.total_requests)} />
                <CustomerMetric label="Open requests" value={String(metrics.open_requests)} />
                <CustomerMetric label="Upcoming showings" value={String(metrics.upcoming_showings)} />
                <CustomerMetric label="Latest request" value={metrics.last_request_at ? formatDate(metrics.last_request_at) : 'None'} />
              </div>
            </header>

            <div className="grid gap-5 xl:grid-cols-[minmax(320px,0.72fr)_minmax(0,1.28fr)]">
              <aside className="grid content-start gap-5">
                {data.search_profile ? <LeadSearchProfileSnapshot profile={data.search_profile} /> : (
                  <section className="rounded-[1.75rem] border border-[#dfe8e2] bg-white p-5 shadow-sm">
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#0f705e]">Current search profile</p>
                    <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em]">No brokerage profile yet</h2>
                    <p className="mt-3 text-sm leading-6 text-[#66746f]">This signed-in customer has not saved buyer criteria in {data.brokerage.name}. Request-specific qualification stays on each lead.</p>
                  </section>
                )}
                <section className="rounded-[1.75rem] bg-white p-5 shadow-sm">
                  <ShieldCheck className="text-[#0f705e]" />
                  <h2 className="mt-4 text-xl font-semibold tracking-[-0.03em]">Brokerage-scoped relationship</h2>
                  <p className="mt-3 text-sm leading-6 text-[#66746f]">This workspace uses the customer account plus {data.brokerage.name}. It includes only requests your current staff role can open and never joins anonymous requests by matching email.</p>
                </section>
              </aside>

              <section className="min-w-0 rounded-[1.75rem] bg-white p-4 shadow-sm sm:p-6">
                <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[#edf0ec] pb-5">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#0f705e]">Related records</p>
                    <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">Customer requests</h2>
                  </div>
                  <p className="text-sm font-semibold text-[#66746f]">{data.pagination.total_count} visible request{data.pagination.total_count === 1 ? '' : 's'}</p>
                </div>
                <div className="mt-4 grid gap-3">
                  {data.requests.map((request) => (
                    <article key={request.id} className="rounded-[1.5rem] border border-[#dfe8e2] bg-[#fbfaf6] p-4 transition hover:border-[#bdd8cc] hover:bg-white">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${leadTypeBadgeClasses(request.lead_type)}`}>{leadTypeLabel(request.lead_type)}</span>
                            <span className="rounded-full bg-white px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-[#53645f]">{request.status.replaceAll('_', ' ')}</span>
                          </div>
                          <h3 className="mt-3 text-lg font-semibold tracking-[-0.03em]">Request HH-{request.id}</h3>
                          <p className="mt-1 text-sm font-semibold text-[#66746f]">{formatDateTime(request.created_at, 'Pacific/Guam')}</p>
                        </div>
                        <Link to={routes.adminLead(request.id, workspacePath)} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[var(--brand-primary)] px-4 text-sm font-bold text-white">Open lead <ChevronRight size={16} /></Link>
                      </div>
                      <div className="mt-4 grid gap-2 sm:grid-cols-2">
                        <LeadMeta icon={<Home size={16} />} label="Listing" value={request.listing?.title ?? 'General request'} />
                        <LeadMeta icon={<ClipboardList size={16} />} label="Assigned agent" value={request.assigned_agent?.name ?? 'Needs assignment'} />
                      </div>
                    </article>
                  ))}
                  {data.requests.length === 0 && <StateCard>No authorized requests are available for this customer.</StateCard>}
                </div>
                {data.pagination.total_pages > 1 && (
                  <div className="mt-5 border-t border-[#edf0ec] pt-5">
                    <PaginationControls pagination={data.pagination} onPageChange={setPage} />
                  </div>
                )}
              </section>
            </div>
          </div>
        )}
      </section>
    </AdminShell>
  )
}

function CustomerMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-white/10 p-5 sm:border-r sm:last:border-r-0">
      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/45">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-white">{value}</p>
    </div>
  )
}

export function LeadDetailPage() {
  const { id } = useParams()
  const { userId } = useAuthContext()
  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const returnPath = safeReturnPath(searchParams.get('return_to'), '/admin/leads')
  const returnsToCustomer = /^\/admin\/brokerages\/[^/?]+\/customers\/[^/?]+(?:[/?]|$)/.test(returnPath)
  const leadReturnLabel = returnPath.startsWith('/admin/showings/')
    ? 'Back to showing'
    : returnPath.startsWith('/admin/showings')
      ? 'Back to showings'
      : returnPath.startsWith('/admin/intent')
        ? 'Back to intent'
        : returnsToCustomer
          ? 'Back to customer'
          : 'Back to leads'
  const leadPath = `${location.pathname}${location.search}`
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['lead', userId, id], queryFn: () => fetchLead(id || ''), enabled: Boolean(userId && id) })
  const mutation = useMutation({
    mutationFn: (payload: LeadUpdatePayload) => updateLead(data!.lead.id, payload),
    onSuccess: () => refetch(),
  })
  const showingMutation = useMutation({
    mutationFn: (payload: Partial<ShowingAppointment> & { lead_id: number; id?: number }) => payload.id ? updateShowingAppointment(payload.id, payload) : createShowingAppointment(payload),
    onSuccess: () => refetch(),
  })
  const noteMutation = useMutation({
    mutationFn: (payload: { body: string }) => createLeadNote(Number(id), payload),
    onSuccess: () => refetch(),
  })
  const noteUpdateMutation = useMutation({
    mutationFn: ({ noteId, payload }: { noteId: number; payload: Partial<Pick<LeadNote, 'body'>> & { archived?: boolean } }) => updateLeadNote(noteId, payload),
    onSuccess: () => refetch(),
  })
  const taskMutation = useMutation({
    mutationFn: (payload: { title: string; notes?: string; due_at?: string }) => createLeadTask(Number(id), payload),
    onSuccess: () => refetch(),
  })
  const taskUpdateMutation = useMutation({
    mutationFn: ({ taskId, payload }: { taskId: number; payload: Partial<Pick<LeadTask, 'title' | 'notes' | 'status' | 'due_at'>> }) => updateLeadTask(taskId, payload),
    onSuccess: () => refetch(),
  })
  const notificationMutation = useMutation({
    mutationFn: (payload: { channel: 'email' | 'sms'; recipient_role: 'consumer' | 'agent'; event_name?: string; subject?: string; title?: string; body?: string }) => sendLeadNotification(Number(id), payload),
    onSuccess: () => refetch(),
  })
  const lead = data?.lead
  const assignableAgents = data?.assignable_agents ?? []

  return (
    <AdminShell>
      <section className="mx-auto max-w-7xl px-4 pb-10 pt-6 sm:px-5">
        <button onClick={() => navigate(returnPath)} className="mb-6 inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-5 text-sm font-bold text-[#304942]"><ArrowLeft size={16} /> {leadReturnLabel}</button>
        {isLoading && <StateCard>Loading lead...</StateCard>}
        {isError && <StateCard tone="error">Unable to load this lead.</StateCard>}
        {mutation.isError && <StateCard tone="error">{displayErrorMessage(mutation.error, 'Unable to update lead right now.')}</StateCard>}
        {lead && (
          <div className="grid gap-4 sm:gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(380px,0.75fr)]">
            <div className="space-y-4 sm:space-y-5">
              <article className="rounded-[1.75rem] bg-white p-4 shadow-sm sm:rounded-[2rem] sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#0f705e]">Lead detail</p>
                    <h1 className="mt-3 text-3xl font-semibold tracking-[-0.06em] sm:text-4xl md:text-5xl">{lead.name}</h1>
                    <p className="mt-3 text-sm font-semibold text-[#66746f]">Created {formatDateTime(lead.created_at)} · Source {lead.lead_source?.replaceAll('_', ' ') ?? 'Hafa Homes'}</p>
                    {lead.user_id && lead.brokerage_id && (
                      <Link to={returnsToCustomer ? returnPath : routes.adminCustomer(lead.brokerage_id, lead.user_id, leadPath)} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-full bg-[#edf4ef] px-4 text-sm font-bold text-[var(--brand-primary)]">Open customer workspace <UsersRound size={16} /></Link>
                    )}
                  </div>
                  <LeadStatusSelect value={lead.status} onChange={(status) => mutation.mutate({ status })} disabled={mutation.isPending} />
                </div>

                <LeadEditForm lead={lead} mutation={mutation} />
              </article>

              <LeadQualificationCard lead={lead} />

              <LeadSearchProfileSnapshot profile={lead.current_search_profile} />

              <LeadIntentCard intent={lead.intent_summary} />

              <LeadCrmPanel lead={lead} noteMutation={noteMutation} noteUpdateMutation={noteUpdateMutation} taskMutation={taskMutation} taskUpdateMutation={taskUpdateMutation} />
            </div>

            <aside className="space-y-5">
              <div className="rounded-[1.75rem] bg-[var(--brand-primary)] p-4 text-white shadow-xl shadow-[var(--brand-primary)]/15 sm:rounded-[2rem] sm:p-6">
                <Building2 className="text-[#bdebdc]" />
                <p className="mt-5 text-xs font-bold uppercase tracking-[0.2em] text-white/55">Brokerage routing</p>
                <h2 className="mt-2 text-2xl font-semibold tracking-[-0.05em] sm:text-3xl">{lead.brokerage?.name ?? 'Unassigned brokerage'}</h2>
                <p className="mt-3 text-sm leading-6 text-white/70">Requested agent: {lead.requested_agent?.name ?? 'Brokerage team'}</p>
                <p className="mt-1 text-sm leading-6 text-white/70">Assigned agent: {lead.assigned_agent?.name ?? 'Not assigned yet'}</p>
                <label className="mt-5 grid gap-2 text-sm font-semibold text-white/80">
                  Assign agent
                  <select
                    value={lead.assigned_agent_id ?? ''}
                    onChange={(event) => mutation.mutate({ assigned_agent_id: event.target.value ? Number(event.target.value) : null })}
                    disabled={mutation.isPending || !assignableAgents.length}
                    className="min-h-12 w-full min-w-0 rounded-2xl border border-white/15 bg-white px-4 text-[#17211f]"
                  >
                    <option value="">Unassigned</option>
                    {assignableAgents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name} · {agent.brokerage?.name}</option>)}
                  </select>
                </label>
                {mutation.isError && <p className="mt-3 text-sm font-semibold text-[#ffd6d6]">{displayErrorMessage(mutation.error, 'Unable to update lead right now.')}</p>}
              </div>

              <LeadNotificationPanel lead={lead} mutation={notificationMutation} />

              <ShowingScheduler lead={lead} assignableAgents={assignableAgents} mutation={showingMutation} />

              {lead.listing && (
                <div className="rounded-[1.75rem] bg-white p-4 shadow-sm sm:rounded-[2rem] sm:p-6">
                  <Home className="text-[#0f705e]" />
                  <p className="mt-5 text-xs font-bold uppercase tracking-[0.2em] text-[#7b8a84]">Listing interest</p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">{lead.listing.title}</h2>
                  <p className="mt-2 text-sm font-semibold text-[#66746f]">{lead.listing.village} · {currency(lead.listing.price, lead.listing.listing_kind)}</p>
                  {lead.listing.address && <p className="mt-3 text-sm leading-6 text-[#304942]">{lead.listing.address}</p>}
                  <Link to={routes.adminListing(lead.listing.id, leadPath)} className="mt-5 inline-flex items-center gap-2 rounded-full bg-[#f6f1e8] px-4 py-2 text-sm font-bold text-[#304942]">View public listing <ChevronRight size={16} /></Link>
                </div>
              )}
            </aside>
          </div>
        )}
      </section>
    </AdminShell>
  )
}

type LeadMutation = {
  mutate: (payload: LeadUpdatePayload) => void
  isPending: boolean
  isError: boolean
  error: unknown
}

type ShowingMutation = {
  mutate: (payload: Partial<ShowingAppointment> & { lead_id: number; id?: number }) => void
  isPending: boolean
  isError: boolean
  error: unknown
}

type NotificationMutation = {
  mutate: (payload: { channel: 'email' | 'sms'; recipient_role: 'consumer' | 'agent'; event_name?: string; subject?: string; title?: string; body?: string }) => void
  isPending: boolean
  isError: boolean
  error: unknown
}

function LeadQualificationCard({ lead, compact = false }: { lead: Lead; compact?: boolean }) {
  const items = leadQualificationItems(lead)
  const visibleItems = compact ? items.slice(0, 4) : items

  return (
    <section className={`rounded-[1.5rem] border border-[#dfe8e2] bg-[#fbfaf6] ${compact ? 'p-3' : 'p-4 sm:p-5'}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#0f705e]">Buyer readiness snapshot</p>
          <p className="mt-2 text-sm font-semibold leading-6 text-[#304942]">{lead.qualification_summary || 'No readiness details captured yet'}</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-black uppercase tracking-[0.12em] ${qualityBadgeClasses(lead.quality_label)}`}>
          {lead.quality_label || 'Not scored'} · {lead.quality_score ?? 0}
        </span>
      </div>
      <div className={`mt-4 grid gap-2 ${compact ? 'md:grid-cols-4' : 'sm:grid-cols-2'}`}>
        {visibleItems.map(([label, value]) => (
          <div key={label} className="rounded-2xl bg-white px-3 py-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#7b8a84]">{label}</p>
            <p className="mt-1 text-sm font-bold text-[#17211f]">{value}</p>
          </div>
        ))}
      </div>
      {!compact && <p className="mt-3 text-xs font-semibold leading-5 text-[#7b8a84]">Readiness is based on first-party browsing and shopper-submitted details. It is not identity, phone, or financing verification.</p>}
      {!compact && lead.qualification_notes && (
        <p className="mt-3 rounded-2xl bg-white p-3 text-sm font-semibold leading-6 text-[#53645f]">{lead.qualification_notes}</p>
      )}
    </section>
  )
}

function LeadSearchProfileSnapshot({ profile }: { profile?: SearchProfile | null }) {
  if (!profile) return null

  const items = [
    ['Completion', profile.completion_status === 'complete' ? 'Complete' : `${profile.completion_percentage ?? 0}%`],
    ['Timeline', profile.purchase_timeline_label || 'Not provided'],
    ['Budget', profile.budget_range_label || 'Not provided'],
    ['Villages', profile.desired_villages || 'Not provided'],
    ['Beds / baths', `${profile.desired_beds ? `${profile.desired_beds}+ beds` : 'Beds not set'} · ${profile.desired_baths ? `${profile.desired_baths}+ baths` : 'Baths not set'}`],
    ['Prequalification', profile.prequalified_status_label || 'Not provided'],
  ]

  return (
    <section className="rounded-[1.5rem] border border-[#dfe8e2] bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#0f705e]">Current search profile</p>
          <p className="mt-2 text-sm font-semibold leading-6 text-[#304942]">{profile.qualification_summary || 'Signed-in shopper profile is still incomplete.'}</p>
        </div>
        <span className="rounded-full bg-[#f6f1e8] px-3 py-1 text-xs font-black uppercase tracking-[0.12em] text-[var(--brand-primary)]">Live profile</span>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {items.map(([label, value]) => (
          <div key={label} className="rounded-2xl bg-[#fbfaf6] px-3 py-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#7b8a84]">{label}</p>
            <p className="mt-1 text-sm font-bold text-[#17211f]">{value}</p>
          </div>
        ))}
      </div>
      {profile.notes && <p className="mt-3 rounded-2xl bg-[#fbfaf6] p-3 text-sm font-semibold leading-6 text-[#53645f]">{profile.notes}</p>}
    </section>
  )
}

function LeadIntentCard({ intent, compact = false }: { intent?: LeadIntentSummary | null; compact?: boolean }) {
  const hasIntent = Boolean(intent && ((intent.unique_listing_view_count ?? 0) > 0 || (intent.saved_listing_count ?? 0) > 0 || (intent.search_filter_count ?? 0) > 0 || (intent.form_open_count ?? 0) > 0))

  return (
    <section className={`rounded-[1.5rem] border border-[#dfe8e2] bg-white ${compact ? 'p-3' : 'p-4 sm:p-5'}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#0f705e]">Search intent</p>
          <p className="mt-2 text-sm font-semibold leading-6 text-[#304942]">{intent?.narrative || 'No first-party browsing intent captured yet'}</p>
        </div>
        {hasIntent && <span className="rounded-full bg-[#e9f5ef] px-3 py-1 text-xs font-black uppercase tracking-[0.12em] text-[#0f705e]">Tracked</span>}
      </div>
      <div className={`mt-4 grid gap-2 ${compact ? 'md:grid-cols-4' : 'sm:grid-cols-2 lg:grid-cols-4'}`}>
        <div className="rounded-2xl bg-[#fbfaf6] px-3 py-2">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#7b8a84]">Viewed</p>
          <p className="mt-1 text-sm font-bold text-[#17211f]">{intent?.unique_listing_view_count ?? 0} listings</p>
        </div>
        <div className="rounded-2xl bg-[#fbfaf6] px-3 py-2">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#7b8a84]">Saved</p>
          <p className="mt-1 text-sm font-bold text-[#17211f]">{intent?.saved_listing_count ?? 0} homes</p>
        </div>
        <div className="rounded-2xl bg-[#fbfaf6] px-3 py-2">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#7b8a84]">Filters</p>
          <p className="mt-1 text-sm font-bold text-[#17211f]">{intent?.search_filter_count ?? 0} changes</p>
        </div>
        <div className="rounded-2xl bg-[#fbfaf6] px-3 py-2">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#7b8a84]">Forms opened</p>
          <p className="mt-1 text-sm font-bold text-[#17211f]">{intent?.form_open_count ?? 0}</p>
        </div>
      </div>
      {!compact && intent?.top_villages && intent.top_villages.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {intent.top_villages.slice(0, 4).map((village) => <span key={village.name} className="rounded-full bg-[#f6f1e8] px-3 py-1 text-xs font-bold text-[#53645f]">{village.name} · {village.count}</span>)}
        </div>
      )}
    </section>
  )
}

function LeadEditForm({ lead, mutation }: { lead: Lead; mutation: LeadMutation }) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    mutation.mutate({
      name: String(form.get('name') || '').trim(),
      email: String(form.get('email') || '').trim(),
      phone: String(form.get('phone') || '').trim(),
      preferred_contact_method: String(form.get('preferred_contact_method') || '').trim(),
      lead_type: String(form.get('lead_type') || '').trim(),
      tour_type: String(form.get('tour_type') || '').trim(),
      preferred_tour_date: String(form.get('preferred_tour_date') || '').trim(),
      preferred_time: String(form.get('preferred_time') || '').trim(),
      target_price: String(form.get('target_price') || '').trim(),
      quality_status: String(form.get('quality_status') || '').trim(),
      source_campaign: String(form.get('source_campaign') || '').trim(),
      source_url: String(form.get('source_url') || '').trim(),
      prequalified_status: String(form.get('prequalified_status') || '').trim(),
      lender_name: String(form.get('lender_name') || '').trim(),
      purchase_timeline: String(form.get('purchase_timeline') || '').trim(),
      budget_min: String(form.get('budget_min') || '').trim(),
      budget_max: String(form.get('budget_max') || '').trim(),
      desired_villages: String(form.get('desired_villages') || '').trim(),
      desired_beds: String(form.get('desired_beds') || '').trim(),
      desired_baths: String(form.get('desired_baths') || '').trim(),
      buyer_status: String(form.get('buyer_status') || '').trim(),
      already_working_with_agent: String(form.get('already_working_with_agent') || '').trim(),
      qualification_notes: String(form.get('qualification_notes') || '').trim(),
      message: String(form.get('message') || '').trim(),
    })
  }

  return (
    <form key={`${lead.id}-${lead.updated_at}`} onSubmit={handleSubmit} className="mt-6 rounded-[1.75rem] border border-[#edf0ec] bg-[#fbfaf6] p-4 md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#7b8a84]">Customer details</p>
          <p className="mt-1 text-sm font-semibold text-[#66746f]">Agents can correct contact info and request preferences after a customer call.</p>
        </div>
        <button disabled={mutation.isPending} className="min-h-11 w-full rounded-full bg-[var(--brand-primary)] px-5 text-sm font-bold text-white disabled:opacity-60 sm:w-auto">
          {mutation.isPending ? 'Saving...' : 'Save changes'}
        </button>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <Input name="name" label="Name" defaultValue={lead.name} required />
        <Input name="email" label="Email" defaultValue={lead.email} type="email" required />
        <Input name="phone" label="Phone" defaultValue={lead.phone || '+1671'} inputMode="tel" />
        <label className="grid gap-2 text-sm font-semibold text-[#304942]">
          Preferred contact
          <select name="preferred_contact_method" defaultValue={lead.preferred_contact_method || ''} className="min-h-12 w-full min-w-0 rounded-2xl border border-[#dce5df] bg-white px-4">
            <option value="">Not provided</option>
            <option value="phone">Phone</option>
            <option value="text">Text</option>
            <option value="email">Email</option>
          </select>
        </label>
        <label className="grid gap-2 text-sm font-semibold text-[#304942]">
          Request type
          <select name="lead_type" defaultValue={lead.lead_type} className="min-h-12 w-full min-w-0 rounded-2xl border border-[#dce5df] bg-white px-4">
            {!leadTypeOptions.some((option) => option.value === lead.lead_type) && <option value={lead.lead_type}>{leadTypeLabel(lead.lead_type)}</option>}
            {leadTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label className="grid gap-2 text-sm font-semibold text-[#304942]">
          Tour type
          <select name="tour_type" defaultValue={lead.tour_type || ''} className="min-h-12 w-full min-w-0 rounded-2xl border border-[#dce5df] bg-white px-4">
            <option value="">Not requested</option>
            <option value="in_person">In person</option>
            <option value="virtual">Virtual</option>
          </select>
        </label>
        <Input name="preferred_tour_date" label="Preferred date" defaultValue={lead.preferred_tour_date || ''} type="date" />
        <label className="grid gap-2 text-sm font-semibold text-[#304942]">
          Preferred time
          <select name="preferred_time" defaultValue={lead.preferred_time || ''} className="min-h-12 w-full min-w-0 rounded-2xl border border-[#dce5df] bg-white px-4">
            <option value="">Not provided</option>
            {preferredTimeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <Input name="target_price" label="Target price" defaultValue={lead.target_price ? String(lead.target_price) : ''} type="number" min="0" step="1000" />
        <label className="grid gap-2 text-sm font-semibold text-[#304942]">
          Verification status
          <select name="quality_status" defaultValue={lead.quality_status || 'unknown'} className="min-h-12 w-full min-w-0 rounded-2xl border border-[#dce5df] bg-white px-4">
            <option value="unknown">Unknown</option>
            <option value="verified">Verified</option>
            <option value="unverified">Unverified</option>
            <option value="duplicate">Duplicate</option>
            <option value="spam">Spam</option>
          </select>
        </label>
        <Input name="source_campaign" label="Campaign/source detail" defaultValue={lead.source_campaign || ''} />
        <Input name="source_url" label="Source URL" defaultValue={lead.source_url || ''} type="url" />
        <label className="grid gap-2 text-sm font-semibold text-[#304942]">
          Prequalified
          <select name="prequalified_status" defaultValue={lead.prequalified_status || ''} className="min-h-12 w-full min-w-0 rounded-2xl border border-[#dce5df] bg-white px-4">
            {prequalifiedOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label className="grid gap-2 text-sm font-semibold text-[#304942]">
          Timeline
          <select name="purchase_timeline" defaultValue={lead.purchase_timeline || ''} className="min-h-12 w-full min-w-0 rounded-2xl border border-[#dce5df] bg-white px-4">
            {purchaseTimelineOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <Input name="lender_name" label="Lender / bank" defaultValue={lead.lender_name || ''} />
        <label className="grid gap-2 text-sm font-semibold text-[#304942]">
          Buyer type
          <select name="buyer_status" defaultValue={lead.buyer_status || ''} className="min-h-12 w-full min-w-0 rounded-2xl border border-[#dce5df] bg-white px-4">
            {buyerStatusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <Input name="budget_min" label="Budget min" defaultValue={lead.budget_min ? String(lead.budget_min) : ''} type="number" min="0" step="1000" />
        <Input name="budget_max" label="Budget max" defaultValue={lead.budget_max ? String(lead.budget_max) : ''} type="number" min="0" step="1000" />
        <Input name="desired_villages" label="Desired villages" defaultValue={lead.desired_villages || ''} />
        <Input name="desired_beds" label="Desired beds" defaultValue={lead.desired_beds ? String(lead.desired_beds) : ''} type="number" min="0" step="1" />
        <Input name="desired_baths" label="Desired baths" defaultValue={lead.desired_baths ? String(lead.desired_baths) : ''} type="number" min="0" step="0.5" />
        <label className="grid gap-2 text-sm font-semibold text-[#304942]">
          Already working with an agent?
          <select name="already_working_with_agent" defaultValue={lead.already_working_with_agent || ''} className="min-h-12 w-full min-w-0 rounded-2xl border border-[#dce5df] bg-white px-4">
            {agentRelationshipOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
      </div>

      <label className="mt-3 grid gap-2 text-sm font-semibold text-[#304942]">
        Qualification notes
        <textarea name="qualification_notes" rows={3} defaultValue={lead.qualification_notes || ''} className="w-full min-w-0 rounded-2xl border border-[#dce5df] bg-white px-4 py-3" />
      </label>

      <label className="mt-3 grid gap-2 text-sm font-semibold text-[#304942]">
        Message
        <textarea name="message" rows={4} defaultValue={lead.message || ''} className="w-full min-w-0 rounded-2xl border border-[#dce5df] bg-white px-4 py-3" />
      </label>
      {mutation.isError && <p className="mt-3 text-sm font-semibold text-red-700">{displayErrorMessage(mutation.error, 'Unable to update lead right now.')}</p>}
    </form>
  )
}

type NoteMutation = {
  mutate: (payload: { body: string }, options?: { onSuccess?: () => void }) => void
  isPending: boolean
  isError: boolean
  error: unknown
}

type NoteUpdateMutation = {
  mutate: (payload: { noteId: number; payload: Partial<Pick<LeadNote, 'body'>> & { archived?: boolean } }, options?: { onSuccess?: () => void }) => void
  isPending: boolean
  isError: boolean
  error: unknown
}

type TaskMutation = {
  mutate: (payload: { title: string; notes?: string; due_at?: string }, options?: { onSuccess?: () => void }) => void
  isPending: boolean
  isError: boolean
  error: unknown
}

type TaskUpdateMutation = {
  mutate: (payload: { taskId: number; payload: Partial<Pick<LeadTask, 'title' | 'notes' | 'status' | 'due_at'>> }, options?: { onSuccess?: () => void }) => void
  isPending: boolean
  isError: boolean
  error: unknown
}

function LeadCrmPanel({ lead, noteMutation, noteUpdateMutation, taskMutation, taskUpdateMutation }: { lead: Lead; noteMutation: NoteMutation; noteUpdateMutation: NoteUpdateMutation; taskMutation: TaskMutation; taskUpdateMutation: TaskUpdateMutation }) {
  const initialNotes = useMemo(() => (lead.lead_notes ?? []).filter((note) => !note.archived_at), [lead.lead_notes])
  const initialTasks = useMemo(() => (lead.lead_tasks ?? []).filter((task) => task.status !== 'cancelled'), [lead.lead_tasks])
  const initialActivities = useMemo(() => lead.lead_activities ?? [], [lead.lead_activities])
  const initialOpenTasks = useMemo(() => initialTasks.filter((task) => task.status === 'open'), [initialTasks])
  const initialCompletedTasks = useMemo(() => initialTasks.filter((task) => task.status === 'completed'), [initialTasks])
  const [notes, setNotes] = useState(initialNotes)
  const [openTasks, setOpenTasks] = useState(initialOpenTasks)
  const [completedTasks, setCompletedTasks] = useState(initialCompletedTasks)
  const [activities, setActivities] = useState(initialActivities)
  const nextTask = openTasks.find((task) => task.due_at) ?? openTasks[0]
  const noteTotal = lead.crm_summary?.note_count ?? notes.length
  const openTaskTotal = lead.crm_summary?.open_task_count ?? openTasks.length
  const completedTaskTotal = lead.crm_summary?.completed_task_count ?? completedTasks.length
  const activityTotal = lead.crm_summary?.activity_count ?? activities.length
  const [visibleOpenTaskCount, setVisibleOpenTaskCount] = useState(5)
  const [visibleCompletedTaskCount, setVisibleCompletedTaskCount] = useState(3)
  const [visibleNoteCount, setVisibleNoteCount] = useState(4)
  const [visibleActivityCount, setVisibleActivityCount] = useState(8)
  const [loadingMore, setLoadingMore] = useState<'open_tasks' | 'completed_tasks' | 'notes' | 'activities' | null>(null)
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null)

  useEffect(() => {
    setNotes(initialNotes)
    setOpenTasks(initialOpenTasks)
    setCompletedTasks(initialCompletedTasks)
    setActivities(initialActivities)
    setVisibleOpenTaskCount(5)
    setVisibleCompletedTaskCount(3)
    setVisibleNoteCount(4)
    setVisibleActivityCount(8)
  }, [lead.id, lead.updated_at, initialActivities, initialCompletedTasks, initialNotes, initialOpenTasks])

  function handleNoteSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const body = String(new FormData(form).get('body') || '').trim()
    if (!body) return
    noteMutation.mutate({ body }, { onSuccess: () => form.reset() })
  }

  function handleTaskSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    const title = String(data.get('title') || '').trim()
    if (!title) return

    taskMutation.mutate({
      title,
      due_at: String(data.get('due_at') || '').trim(),
      notes: String(data.get('notes') || '').trim(),
    }, { onSuccess: () => form.reset() })
  }

  async function loadMoreNotes() {
    if (visibleNoteCount < notes.length) {
      setVisibleNoteCount((count) => count + 4)
      return
    }
    if (notes.length >= noteTotal) return

    setLoadingMore('notes')
    setLoadMoreError(null)
    try {
      const response = await fetchLeadNotesPage(lead.id, Math.floor(notes.length / 10) + 1, 10)
      setNotes((current) => appendUniqueById(current, response.lead_notes.filter((note) => !note.archived_at)))
      setVisibleNoteCount((count) => count + 4)
    } catch (error) {
      setLoadMoreError(displayErrorMessage(error, 'Unable to load more notes.'))
    } finally {
      setLoadingMore(null)
    }
  }

  async function loadMoreOpenTasks() {
    if (visibleOpenTaskCount < openTasks.length) {
      setVisibleOpenTaskCount((count) => count + 5)
      return
    }
    if (openTasks.length >= openTaskTotal) return

    setLoadingMore('open_tasks')
    setLoadMoreError(null)
    try {
      const response = await fetchLeadTasksPage(lead.id, 'open', Math.floor(openTasks.length / 10) + 1, 10)
      setOpenTasks((current) => appendUniqueById(current, response.lead_tasks.filter((task) => task.status === 'open')))
      setVisibleOpenTaskCount((count) => count + 5)
    } catch (error) {
      setLoadMoreError(displayErrorMessage(error, 'Unable to load more open tasks.'))
    } finally {
      setLoadingMore(null)
    }
  }

  async function loadMoreCompletedTasks() {
    if (visibleCompletedTaskCount < completedTasks.length) {
      setVisibleCompletedTaskCount((count) => count + 3)
      return
    }
    if (completedTasks.length >= completedTaskTotal) return

    setLoadingMore('completed_tasks')
    setLoadMoreError(null)
    try {
      const response = await fetchLeadTasksPage(lead.id, 'completed', Math.floor(completedTasks.length / 10) + 1, 10)
      setCompletedTasks((current) => appendUniqueById(current, response.lead_tasks.filter((task) => task.status === 'completed')))
      setVisibleCompletedTaskCount((count) => count + 3)
    } catch (error) {
      setLoadMoreError(displayErrorMessage(error, 'Unable to load more completed tasks.'))
    } finally {
      setLoadingMore(null)
    }
  }

  async function loadMoreActivities() {
    if (visibleActivityCount < activities.length) {
      setVisibleActivityCount((count) => count + 8)
      return
    }
    if (activities.length >= activityTotal) return

    setLoadingMore('activities')
    setLoadMoreError(null)
    try {
      const response = await fetchLeadActivitiesPage(lead.id, Math.floor(activities.length / 10) + 1, 10)
      setActivities((current) => appendUniqueById(current, response.lead_activities))
      setVisibleActivityCount((count) => count + 8)
    } catch (error) {
      setLoadMoreError(displayErrorMessage(error, 'Unable to load more activity.'))
    } finally {
      setLoadingMore(null)
    }
  }

  return (
    <section className="rounded-[1.75rem] bg-white p-4 shadow-sm sm:rounded-[2rem] sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#0f705e]">CRM workspace</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em] sm:text-3xl">Follow-up, notes, and activity</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#66746f]">Keep agent follow-up visible without exposing internal notes to the consumer request history.</p>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center sm:min-w-[300px]">
          <MiniCrmStat label="Open" value={openTaskTotal} />
          <MiniCrmStat label="Overdue" value={lead.crm_summary?.overdue_task_count ?? openTasks.filter((task) => task.overdue).length} tone="warn" />
          <MiniCrmStat label="Notes" value={noteTotal} />
        </div>
      </div>

      {loadMoreError && <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{loadMoreError}</p>}

      {nextTask && (
        <div className={`mt-5 rounded-[1.25rem] p-4 ${nextTask.overdue ? 'bg-[#fff5d9] text-[#6b4508]' : 'bg-[#e9f5ef] text-[var(--brand-primary)]'}`}>
          <p className="text-xs font-bold uppercase tracking-[0.18em] opacity-70">Next follow-up</p>
          <p className="mt-2 text-sm font-bold">{nextTask.title}</p>
          <p className="mt-1 text-xs font-semibold opacity-75">{nextTask.due_at ? formatDateTime(nextTask.due_at) : 'No due date set'}</p>
        </div>
      )}

      <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <div className="grid gap-4">
          <form onSubmit={handleTaskSubmit} className="rounded-[1.5rem] border border-[#edf0ec] bg-[#fbfaf6] p-4">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#7b8a84]">Add task</p>
            <div className="mt-3 grid gap-3">
              <Input name="title" label="Task" placeholder="Call back after work" required />
              <Input name="due_at" label="Due" type="datetime-local" />
              <label className="grid gap-2 text-sm font-semibold text-[#304942]">
                Notes optional
                <textarea name="notes" rows={3} className="w-full min-w-0 rounded-2xl border border-[#dce5df] bg-white px-4 py-3" />
              </label>
              {taskMutation.isError && <p className="text-sm font-semibold text-red-700">{displayErrorMessage(taskMutation.error, 'Unable to add task.')}</p>}
              <button disabled={taskMutation.isPending} className="min-h-11 rounded-2xl bg-[var(--brand-primary)] px-4 text-sm font-bold text-white disabled:opacity-60">
                {taskMutation.isPending ? 'Adding task...' : 'Add follow-up task'}
              </button>
            </div>
          </form>

          <form onSubmit={handleNoteSubmit} className="rounded-[1.5rem] border border-[#edf0ec] bg-[#fbfaf6] p-4">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#7b8a84]">Add note</p>
            <label className="mt-3 grid gap-2 text-sm font-semibold text-[#304942]">
              Internal note
              <textarea name="body" rows={4} className="w-full min-w-0 rounded-2xl border border-[#dce5df] bg-white px-4 py-3" required />
            </label>
            {noteMutation.isError && <p className="mt-3 text-sm font-semibold text-red-700">{displayErrorMessage(noteMutation.error, 'Unable to add note.')}</p>}
            {noteUpdateMutation.isError && <p className="mt-3 text-sm font-semibold text-red-700">{displayErrorMessage(noteUpdateMutation.error, 'Unable to update note.')}</p>}
            <button disabled={noteMutation.isPending} className="mt-3 min-h-11 w-full rounded-2xl border border-[#dce5df] px-4 text-sm font-bold text-[var(--brand-primary)] disabled:opacity-60">
              {noteMutation.isPending ? 'Adding note...' : 'Save internal note'}
            </button>
          </form>
        </div>

        <div className="grid gap-4">
          <div className="rounded-[1.5rem] border border-[#edf0ec] p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#7b8a84]">Tasks</p>
              <span className="rounded-full bg-[#f6f1e8] px-2.5 py-1 text-[11px] font-bold text-[#66746f]">{openTaskTotal}</span>
            </div>
            <div className="mt-3 grid gap-2">
              {openTasks.slice(0, visibleOpenTaskCount).map((task) => (
                <TaskRow key={task.id} task={task} mutation={taskUpdateMutation} />
              ))}
              {openTasks.length === 0 && <p className="rounded-2xl bg-[#f6f1e8] p-3 text-sm font-semibold text-[#66746f]">No open follow-up tasks.</p>}
              {openTasks.length > 0 && (
                <SectionPager
                  label="open tasks"
                  visibleCount={Math.min(visibleOpenTaskCount, openTasks.length)}
                  loadedCount={openTasks.length}
                  totalCount={openTaskTotal}
                  pageSize={5}
                  loading={loadingMore === 'open_tasks'}
                  onMore={() => void loadMoreOpenTasks()}
                  onReset={() => setVisibleOpenTaskCount(5)}
                />
              )}
              {completedTasks.length > 0 && (
                <div className="mt-2 border-t border-[#edf0ec] pt-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#7b8a84]">Recently completed</p>
                    <span className="rounded-full bg-[#f6f1e8] px-2.5 py-1 text-[11px] font-bold text-[#66746f]">{completedTaskTotal}</span>
                  </div>
                  <div className="mt-2 grid gap-2">
                    {completedTasks.slice(0, visibleCompletedTaskCount).map((task) => <TaskRow key={task.id} task={task} mutation={taskUpdateMutation} compact />)}
                  </div>
                  <SectionPager
                    label="completed tasks"
                    visibleCount={Math.min(visibleCompletedTaskCount, completedTasks.length)}
                    loadedCount={completedTasks.length}
                    totalCount={completedTaskTotal}
                    pageSize={3}
                    loading={loadingMore === 'completed_tasks'}
                    onMore={() => void loadMoreCompletedTasks()}
                    onReset={() => setVisibleCompletedTaskCount(3)}
                  />
                </div>
              )}
              {(lead.crm_summary?.archived_task_count ?? 0) > 0 && <p className="text-xs font-semibold text-[#7b8a84]">{lead.crm_summary?.archived_task_count} archived task{lead.crm_summary?.archived_task_count === 1 ? '' : 's'} hidden by default.</p>}
            </div>
          </div>

          <div className="rounded-[1.5rem] border border-[#edf0ec] p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#7b8a84]">Recent notes</p>
              <span className="rounded-full bg-[#f6f1e8] px-2.5 py-1 text-[11px] font-bold text-[#66746f]">{noteTotal}</span>
            </div>
            <div className="mt-3 grid gap-2">
              {notes.slice(0, visibleNoteCount).map((note) => <NoteCard key={note.id} note={note} mutation={noteUpdateMutation} />)}
              {notes.length === 0 && <p className="rounded-2xl bg-[#f6f1e8] p-3 text-sm font-semibold text-[#66746f]">No internal notes yet.</p>}
              {notes.length > 0 && (
                <SectionPager
                  label="notes"
                  visibleCount={Math.min(visibleNoteCount, notes.length)}
                  loadedCount={notes.length}
                  totalCount={noteTotal}
                  pageSize={4}
                  loading={loadingMore === 'notes'}
                  onMore={() => void loadMoreNotes()}
                  onReset={() => setVisibleNoteCount(4)}
                />
              )}
              {(lead.crm_summary?.archived_note_count ?? 0) > 0 && <p className="text-xs font-semibold text-[#7b8a84]">{lead.crm_summary?.archived_note_count} archived note{lead.crm_summary?.archived_note_count === 1 ? '' : 's'} hidden by default.</p>}
            </div>
          </div>

          <div className="rounded-[1.5rem] border border-[#edf0ec] p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#7b8a84]">Activity timeline</p>
              <span className="rounded-full bg-[#f6f1e8] px-2.5 py-1 text-[11px] font-bold text-[#66746f]">{activityTotal}</span>
            </div>
            <div className="mt-4 grid gap-3">
              {activities.slice(0, visibleActivityCount).map((activity) => <ActivityRow key={activity.id} activity={activity} />)}
              {activities.length === 0 && <p className="rounded-2xl bg-[#f6f1e8] p-3 text-sm font-semibold text-[#66746f]">No activity recorded yet.</p>}
              {activities.length > 0 && (
                <SectionPager
                  label="activity items"
                  visibleCount={Math.min(visibleActivityCount, activities.length)}
                  loadedCount={activities.length}
                  totalCount={activityTotal}
                  pageSize={8}
                  loading={loadingMore === 'activities'}
                  onMore={() => void loadMoreActivities()}
                  onReset={() => setVisibleActivityCount(8)}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function SectionPager({ label, visibleCount, totalCount, pageSize, loading = false, onMore, onReset }: { label: string; visibleCount: number; loadedCount: number; totalCount: number; pageSize: number; loading?: boolean; onMore: () => void; onReset: () => void }) {
  const hasMore = visibleCount < totalCount
  const isExpanded = visibleCount > pageSize

  return (
    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-[#7b8a84]">
      <span>Showing {Math.min(visibleCount, totalCount)} of {totalCount} {label}</span>
      <div className="flex flex-wrap gap-2">
        {hasMore && <button type="button" disabled={loading} onClick={onMore} className="rounded-full border border-[#dce5df] bg-white px-3 py-1.5 font-bold text-[var(--brand-primary)] disabled:opacity-60">{loading ? 'Loading...' : 'Show more'}</button>}
        {isExpanded && <button type="button" onClick={onReset} className="rounded-full border border-[#dce5df] bg-white px-3 py-1.5 font-bold text-[var(--brand-primary)]">Show latest only</button>}
      </div>
    </div>
  )
}

function appendUniqueById<T extends { id: number }>(current: T[], next: T[]) {
  const seen = new Set(current.map((item) => item.id))
  const appended = next.filter((item) => {
    if (seen.has(item.id)) return false
    seen.add(item.id)
    return true
  })
  return [...current, ...appended]
}

function MiniCrmStat({ label, value, tone = 'default' }: { label: string; value: number; tone?: 'default' | 'warn' }) {
  return (
    <div className={`rounded-2xl p-3 ${tone === 'warn' ? 'bg-[#fff5d9] text-[#6b4508]' : 'bg-[#f6f1e8] text-[#304942]'}`}>
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] opacity-65">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-[-0.05em]">{value}</p>
    </div>
  )
}

function NoteCard({ note, mutation }: { note: LeadNote; mutation: NoteUpdateMutation }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(note.body)

  useEffect(() => {
    setDraft(note.body)
  }, [note.body])

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const body = draft.trim()
    if (!body) return
    mutation.mutate({ noteId: note.id, payload: { body } }, { onSuccess: () => setEditing(false) })
  }

  function archiveNote() {
    if (!window.confirm('Archive this internal note? It will be hidden from the default CRM view.')) return
    mutation.mutate({ noteId: note.id, payload: { archived: true } })
  }

  if (editing) {
    return (
      <form onSubmit={handleSubmit} className="rounded-2xl bg-[#f6f1e8] p-3">
        <textarea value={draft} onChange={(event) => setDraft(event.target.value)} rows={4} className="w-full rounded-2xl border border-[#dce5df] bg-white px-3 py-2 text-sm leading-6 text-[#304942]" required />
        <div className="mt-2 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={() => { setDraft(note.body); setEditing(false) }} className="rounded-full border border-[#dce5df] bg-white px-3 py-1.5 text-xs font-bold text-[var(--brand-primary)]">Cancel</button>
          <button disabled={mutation.isPending} className="rounded-full bg-[var(--brand-primary)] px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60">Save note</button>
        </div>
      </form>
    )
  }

  return (
    <div className="rounded-2xl bg-[#f6f1e8] p-3">
      <p className="text-sm leading-6 text-[#304942]">{note.body}</p>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold text-[#66746f]">{note.author?.full_name ?? 'Team'} · {formatDateTime(note.created_at)}</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setEditing(true)} className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-[var(--brand-primary)]">Edit</button>
          <button type="button" disabled={mutation.isPending} onClick={archiveNote} className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-[#8a4b0f] disabled:opacity-60">Archive</button>
        </div>
      </div>
    </div>
  )
}

function TaskRow({ task, mutation, compact = false }: { task: LeadTask; mutation: TaskUpdateMutation; compact?: boolean }) {
  const completed = task.status === 'completed'
  const [editing, setEditing] = useState(false)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const title = String(data.get('title') || '').trim()
    if (!title) return

    mutation.mutate({
      taskId: task.id,
      payload: {
        title,
        due_at: String(data.get('due_at') || '').trim(),
        notes: String(data.get('notes') || '').trim(),
      },
    }, { onSuccess: () => setEditing(false) })
  }

  function archiveTask() {
    if (!window.confirm('Archive this task? It will be hidden from the default CRM view.')) return
    mutation.mutate({ taskId: task.id, payload: { status: 'cancelled' } })
  }

  if (editing) {
    return (
      <form onSubmit={handleSubmit} className="rounded-2xl bg-[#f6f1e8] p-3">
        <div className="grid gap-2 sm:grid-cols-2">
          <Input name="title" label="Task" defaultValue={task.title} required />
          <Input name="due_at" label="Due" type="datetime-local" defaultValue={datetimeLocalValue(task.due_at)} />
        </div>
        <label className="mt-2 grid gap-2 text-sm font-semibold text-[#304942]">
          Notes
          <textarea name="notes" rows={3} defaultValue={task.notes || ''} className="w-full rounded-2xl border border-[#dce5df] bg-white px-3 py-2 text-sm leading-6 text-[#304942]" />
        </label>
        <div className="mt-2 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={() => setEditing(false)} className="rounded-full border border-[#dce5df] bg-white px-3 py-1.5 text-xs font-bold text-[var(--brand-primary)]">Cancel</button>
          <button disabled={mutation.isPending} className="rounded-full bg-[var(--brand-primary)] px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60">Save task</button>
        </div>
      </form>
    )
  }

  return (
    <div className={`rounded-2xl ${completed ? 'bg-[#f6f1e8]/70' : task.overdue ? 'bg-[#fff5d9]' : 'bg-[#f6f1e8]'} p-3`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className={`text-sm font-bold ${completed ? 'text-[#66746f] line-through' : 'text-[#304942]'}`}>{task.title}</p>
          {!compact && task.notes && <p className="mt-1 text-xs leading-5 text-[#66746f]">{task.notes}</p>}
          <p className="mt-1 text-xs font-semibold text-[#66746f]">{task.due_at ? formatDateTime(task.due_at) : 'No due date'}{task.overdue ? ' · overdue' : ''}</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {completed ? (
            <button type="button" disabled={mutation.isPending} onClick={() => mutation.mutate({ taskId: task.id, payload: { status: 'open' } })} className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-[var(--brand-primary)] disabled:opacity-60">
              Reopen
            </button>
          ) : (
            <button type="button" disabled={mutation.isPending} onClick={() => mutation.mutate({ taskId: task.id, payload: { status: 'completed' } })} className="rounded-full bg-[var(--brand-primary)] px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60">
              Done
            </button>
          )}
          <button type="button" onClick={() => setEditing(true)} className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-[var(--brand-primary)]">Edit</button>
          <button type="button" disabled={mutation.isPending} onClick={archiveTask} className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-[#8a4b0f] disabled:opacity-60">Archive</button>
        </div>
      </div>
    </div>
  )
}

function ActivityRow({ activity }: { activity: LeadActivity }) {
  const [expanded, setExpanded] = useState(false)
  const changes = activityChanges(activity)
  const details = activityDetailRows(activity)
  const hasDetails = changes.length > 0 || details.length > 0

  return (
    <div className="relative pl-5">
      <span className="absolute left-0 top-1.5 h-2.5 w-2.5 rounded-full bg-[#0f705e]" />
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-bold text-[#304942]">{activity.summary || activity.action.replaceAll('_', ' ')}</p>
          <p className="mt-1 text-xs font-semibold text-[#66746f]">{activity.actor?.full_name ?? 'System'} · {formatDateTime(activity.occurred_at)}</p>
        </div>
        {hasDetails && (
          <button type="button" onClick={() => setExpanded((value) => !value)} className="rounded-full border border-[#dce5df] bg-white px-3 py-1.5 text-xs font-bold text-[var(--brand-primary)]">
            {expanded ? 'Hide details' : 'Details'}
          </button>
        )}
      </div>
      {expanded && hasDetails && (
        <div className="mt-3 rounded-2xl bg-[#f6f1e8] p-3">
          {changes.length > 0 && (
            <div className="grid gap-2">
              {changes.map((change, index) => (
                <div key={`${String(change.field ?? index)}-${index}`} className="rounded-xl bg-white p-3">
                  <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#7b8a84]">{String(change.label ?? change.field ?? 'Field')}</p>
                  <p className="mt-1 text-xs font-semibold text-[#304942]">
                    <span className="text-[#66746f]">From</span> {formatActivityValue(change.from)} <span className="text-[#66746f]">to</span> {formatActivityValue(change.to)}
                  </p>
                </div>
              ))}
            </div>
          )}
          {details.length > 0 && (
            <div className={`${changes.length > 0 ? 'mt-3 border-t border-[#dce5df] pt-3' : ''} grid gap-1.5`}>
              {details.map((detail) => (
                <p key={detail.label} className="text-xs font-semibold text-[#66746f]"><span className="text-[#304942]">{detail.label}:</span> {detail.value}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

type ActivityChange = {
  field?: unknown
  label?: unknown
  from?: unknown
  to?: unknown
}

function activityChanges(activity: LeadActivity): ActivityChange[] {
  const changes = activity.metadata?.changes
  if (!Array.isArray(changes)) return []
  return changes.filter((change): change is ActivityChange => Boolean(change) && typeof change === 'object')
}

function activityDetailRows(activity: LeadActivity) {
  const metadata = activity.metadata ?? {}
  const rows: Array<{ label: string; value: string }> = []
  const keys: Array<[string, string]> = [
    ['body_preview', 'Preview'],
    ['due_at', 'Due'],
    ['channel', 'Channel'],
    ['recipient_role', 'Recipient'],
    ['event_name', 'Event'],
    ['error_message', 'Error'],
  ]

  keys.forEach(([key, label]) => {
    const value = metadata[key]
    if (value === undefined || value === null || value === '') return
    rows.push({ label, value: formatActivityValue(value) })
  })

  return rows
}

function formatActivityValue(value: unknown): string {
  if (value === undefined || value === null || value === '') return 'Blank'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'number') return String(value)
  if (typeof value === 'string') {
    const parsed = new Date(value)
    if (value.includes('T') && !Number.isNaN(parsed.getTime())) return formatDateTime(value)
    return value.replaceAll('_', ' ')
  }

  return JSON.stringify(value)
}

function notificationStatusLabel(status: NotificationDelivery['status']) {
  return status === 'skipped' ? 'not sent' : status
}

function notificationStatusClass(status: NotificationDelivery['status']) {
  if (status === 'sent') return 'text-[#0f705e]'
  if (status === 'failed') return 'text-red-700'
  if (status === 'skipped') return 'text-[#8a4b0f]'
  return 'text-[#53645f]'
}

function notificationErrorMessage(message?: string) {
  if (!message) return ''
  if (message === 'sms notifications disabled or missing ClickSend configuration') return 'Not sent locally — LIVE_SMS_ENABLED is false or ClickSend credentials are missing.'
  if (message === 'email notifications disabled or missing Resend configuration') return 'Not sent locally — EMAIL_NOTIFICATIONS_ENABLED is false or Resend configuration is missing.'
  return message
}

function LeadNotificationPanel({ lead, mutation }: { lead: Lead; mutation: NotificationMutation }) {
  const deliveries = lead.notification_deliveries ?? []
  const [sendMode, setSendMode] = useState<'consumer_email' | 'consumer_sms' | 'agent_email'>('consumer_email')
  const [visibleDeliveryCount, setVisibleDeliveryCount] = useState(3)
  const hasCustomerPhone = Boolean(lead.phone)
  const hasAgentEmail = Boolean(lead.assigned_agent?.email)
  const isEmail = sendMode !== 'consumer_sms'
  const selectedModeUnavailable = sendMode === 'consumer_sms' ? !hasCustomerPhone : sendMode === 'agent_email' ? !hasAgentEmail : false
  const visibleDeliveries = deliveries.slice(0, visibleDeliveryCount)
  const hiddenDeliveryCount = Math.max(deliveries.length - visibleDeliveryCount, 0)

  useEffect(() => {
    setVisibleDeliveryCount(3)
  }, [lead.id])

  function defaultSubject() {
    if (sendMode === 'agent_email') return `Update on ${lead.name}`
    return `Update from Hafa Homes${lead.listing?.title ? ` about ${lead.listing.title}` : ''}`
  }

  function defaultTitle() {
    return sendMode === 'agent_email' ? 'Lead update' : 'Your Hafa Homes request'
  }

  function defaultBody() {
    if (sendMode === 'agent_email') return `Please follow up with ${lead.name} about ${lead.listing?.title ?? 'this Hafa Homes request'}.`
    return lead.latest_showing_appointment
      ? `Hi ${lead.name}, your showing details have been updated. Please check your Hafa Homes requests page for the latest appointment information.`
      : `Hi ${lead.name}, here is an update on your Hafa Homes request.`
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const mode = String(form.get('send_mode') || sendMode)
    const channel = mode === 'consumer_sms' ? 'sms' : 'email'
    const recipient_role = mode === 'agent_email' ? 'agent' : 'consumer'
    mutation.mutate({
      channel,
      recipient_role,
      event_name: 'manual_update',
      subject: String(form.get('subject') || '').trim(),
      title: String(form.get('title') || '').trim(),
      body: String(form.get('body') || '').trim(),
    })
  }

  return (
    <div className="rounded-[1.75rem] bg-white p-4 shadow-sm sm:rounded-[2rem] sm:p-6">
      <Bell className="text-[#0f705e]" />
      <p className="mt-5 text-xs font-bold uppercase tracking-[0.2em] text-[#7b8a84]">Notifications</p>
      <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">Send an update</h2>
      <p className="mt-2 text-sm leading-6 text-[#66746f]">Write the message before sending. Local/dev queues are recorded here; live delivery only runs when Resend or ClickSend is enabled.</p>
      <form onSubmit={handleSubmit} className="mt-5 grid gap-3">
        <label className="grid gap-2 text-sm font-semibold text-[#304942]">
          Send to
          <select name="send_mode" value={sendMode} onChange={(event) => setSendMode(event.target.value as typeof sendMode)} className="min-h-12 w-full min-w-0 rounded-2xl border border-[#dce5df] px-4">
            <option value="consumer_email">Customer email · {lead.email}</option>
            <option value="consumer_sms" disabled={!hasCustomerPhone}>Customer text{lead.phone ? ` · ${lead.phone}` : ' · no phone on file'}</option>
            <option value="agent_email" disabled={!hasAgentEmail}>Agent email{lead.assigned_agent?.email ? ` · ${lead.assigned_agent.email}` : ' · no agent email'}</option>
          </select>
        </label>
        {isEmail && (
          <>
            <Input key={`subject-${sendMode}`} name="subject" label="Subject" defaultValue={defaultSubject()} required />
            <Input key={`title-${sendMode}`} name="title" label="Email heading" defaultValue={defaultTitle()} />
          </>
        )}
        <label className="grid gap-2 text-sm font-semibold text-[#304942]">
          {isEmail ? 'Message' : 'Text message'}
          <textarea key={`body-${sendMode}`} name="body" rows={isEmail ? 5 : 4} required defaultValue={defaultBody()} maxLength={sendMode === 'consumer_sms' ? 320 : undefined} className="w-full min-w-0 rounded-2xl border border-[#dce5df] px-4 py-3" />
        </label>
        {sendMode === 'consumer_sms' && <p className="text-xs font-semibold text-[#66746f]">Texts are normalized to Guam +1671 format before ClickSend delivery.</p>}
        {mutation.isError && <p className="text-sm font-semibold text-red-700">{displayErrorMessage(mutation.error, 'Unable to queue notification right now.')}</p>}
        <button disabled={mutation.isPending || selectedModeUnavailable} className="min-h-12 rounded-2xl bg-[var(--brand-primary)] px-4 text-sm font-bold text-white disabled:opacity-50">
          {mutation.isPending ? 'Queueing...' : isEmail ? 'Queue email' : 'Queue text'}
        </button>
      </form>
      <div className="mt-5 border-t border-[#edf0ec] pt-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#7b8a84]">Recent sends</p>
          {deliveries.length > 0 && <span className="rounded-full bg-[#f6f1e8] px-2.5 py-1 text-[11px] font-bold text-[#66746f]">{deliveries.length}</span>}
        </div>
        <div className="mt-3 grid gap-2">
          {visibleDeliveries.map((delivery) => (
            <div key={delivery.id} className="rounded-[1.25rem] bg-[#f6f1e8] p-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <p className="font-bold capitalize text-[#304942]">{delivery.channel} to {delivery.recipient_role}</p>
                <span className={`rounded-full bg-white px-2 py-1 text-xs font-bold ${notificationStatusClass(delivery.status)}`}>{notificationStatusLabel(delivery.status)}</span>
              </div>
              <p className="mt-1 text-xs font-semibold text-[#66746f]">{delivery.recipient} · {formatDateTime(delivery.sent_at || delivery.failed_at || delivery.queued_at || delivery.created_at)}</p>
              {delivery.subject && <p className="mt-2 text-xs font-bold text-[#304942]">{delivery.subject}</p>}
              {delivery.body_preview && <p className="mt-1 text-xs leading-5 text-[#66746f]">{delivery.body_preview}</p>}
              {delivery.error_message && <p className="mt-1 text-xs font-semibold text-[#8a4b0f]">{notificationErrorMessage(delivery.error_message)}</p>}
            </div>
          ))}
          {deliveries.length === 0 && <p className="rounded-2xl bg-[#f6f1e8] p-3 text-sm font-semibold text-[#66746f]">No notifications queued yet.</p>}
        </div>
        {deliveries.length > 3 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {hiddenDeliveryCount > 0 && (
              <button type="button" onClick={() => setVisibleDeliveryCount((count) => Math.min(count + 3, deliveries.length))} className="min-h-9 rounded-full border border-[#dce5df] px-3 text-xs font-bold text-[var(--brand-primary)]">
                Show {Math.min(3, hiddenDeliveryCount)} more
              </button>
            )}
            {visibleDeliveryCount > 3 && (
              <button type="button" onClick={() => setVisibleDeliveryCount(3)} className="min-h-9 rounded-full px-3 text-xs font-bold text-[#66746f] hover:bg-[#f6f1e8]">
                Show latest only
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function ShowingScheduler({ lead, assignableAgents, mutation }: { lead: Lead; assignableAgents: Agent[]; mutation: ShowingMutation }) {
  const showing = lead.latest_showing_appointment ?? lead.showing_appointments?.[0] ?? null
  const effectiveTimezone = showing?.timezone || 'Pacific/Guam'

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const timezone = String(form.get('timezone') || effectiveTimezone)
    const payload: Partial<ShowingAppointment> & { lead_id: number; id?: number } = {
      lead_id: lead.id,
      id: showing?.id,
      agent_id: form.get('agent_id') ? Number(form.get('agent_id')) : null,
      scheduled_starts_at: zonedDateTimeToIso(String(form.get('scheduled_starts_at') || ''), timezone, showing?.scheduled_starts_at),
      scheduled_ends_at: zonedDateTimeToIso(String(form.get('scheduled_ends_at') || ''), timezone, showing?.scheduled_ends_at),
      timezone,
      tour_type: String(form.get('tour_type') || 'in_person') as ShowingAppointment['tour_type'],
      status: String(form.get('status') || 'proposed') as ShowingAppointment['status'],
      location: String(form.get('location') || ''),
      consumer_notes: String(form.get('consumer_notes') || ''),
      internal_notes: String(form.get('internal_notes') || ''),
    }
    mutation.mutate(payload)
  }

  return (
    <div className="rounded-[1.75rem] bg-white p-4 shadow-sm sm:rounded-[2rem] sm:p-6">
      <Clock3 className="text-[#0f705e]" />
      <p className="mt-5 text-xs font-bold uppercase tracking-[0.2em] text-[#7b8a84]">Showing schedule</p>
      <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">{showing ? 'Update appointment' : 'Schedule appointment'}</h2>
      {showing && (
        <div className="mt-2 rounded-2xl bg-[#e9f5ef] p-3 text-sm font-semibold text-[var(--brand-primary)]">
          <p>Current: {formatDateTime(showing.scheduled_starts_at, showing.timezone)} · {showing.status.replaceAll('_', ' ')} · {showing.agent?.name ?? 'Unassigned agent'}</p>
          <Link to={routes.adminShowing(showing.id, `/admin/leads/${lead.id}`)} className="mt-2 inline-flex items-center gap-1 text-xs font-black uppercase tracking-[0.12em]">Open showing record <ChevronRight size={14} /></Link>
        </div>
      )}
      <form onSubmit={handleSubmit} className="mt-5 grid gap-3">
        <label className="grid gap-2 text-sm font-semibold text-[#304942]">
          Agent
          <select name="agent_id" defaultValue={showing?.agent_id ?? lead.assigned_agent_id ?? ''} className="min-h-12 w-full min-w-0 rounded-2xl border border-[#dce5df] px-4">
            <option value="">Unassigned</option>
            {assignableAgents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name} · {agent.brokerage?.name}</option>)}
          </select>
        </label>
        <div className="grid gap-3 2xl:grid-cols-2">
          <Input name="scheduled_starts_at" label={`Starts (${effectiveTimezone})`} type="datetime-local" defaultValue={datetimeLocalValue(showing?.scheduled_starts_at, effectiveTimezone)} required />
          <Input name="scheduled_ends_at" label={`Ends (${effectiveTimezone})`} type="datetime-local" defaultValue={datetimeLocalValue(showing?.scheduled_ends_at, effectiveTimezone)} />
        </div>
        <div className="grid gap-3 2xl:grid-cols-2">
          <label className="grid gap-2 text-sm font-semibold text-[#304942]">
            Status
            <select name="status" defaultValue={showing?.status ?? 'confirmed'} className="min-h-12 w-full min-w-0 rounded-2xl border border-[#dce5df] px-4">
              <option value="proposed">Proposed</option>
              <option value="confirmed">Confirmed</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
              <option value="no_show">No-show</option>
            </select>
          </label>
          <label className="grid gap-2 text-sm font-semibold text-[#304942]">
            Tour type
            <select name="tour_type" defaultValue={showing?.tour_type ?? lead.tour_type ?? 'in_person'} className="min-h-12 w-full min-w-0 rounded-2xl border border-[#dce5df] px-4">
              <option value="in_person">In person</option>
              <option value="virtual">Virtual</option>
            </select>
          </label>
        </div>
        <input type="hidden" name="timezone" value={effectiveTimezone} />
        <Input name="location" label="Location or meeting point" defaultValue={showing?.location || lead.listing?.address || ''} />
        <label className="grid gap-2 text-sm font-semibold text-[#304942]">
          Notes for customer
          <textarea name="consumer_notes" rows={3} defaultValue={showing?.consumer_notes || ''} className="w-full min-w-0 rounded-2xl border border-[#dce5df] px-4 py-3" />
        </label>
        <label className="grid gap-2 text-sm font-semibold text-[#304942]">
          Internal notes
          <textarea name="internal_notes" rows={3} defaultValue={showing?.internal_notes || ''} className="w-full min-w-0 rounded-2xl border border-[#dce5df] px-4 py-3" />
        </label>
        {mutation.isError && <p className="text-sm font-semibold text-red-700">{displayErrorMessage(mutation.error, 'Unable to schedule showing right now.')}</p>}
        <button disabled={mutation.isPending} className="rounded-2xl bg-[var(--brand-primary)] px-4 py-3 text-sm font-bold text-white disabled:opacity-60">
          {mutation.isPending ? 'Saving...' : showing ? 'Update showing' : 'Schedule showing'}
        </button>
      </form>
    </div>
  )
}

function AdminShowingsPage() {
  const { userId } = useAuthContext()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedPage = Number(searchParams.get('page') || '1')
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1
  const { data, isLoading, isError } = useQuery({ queryKey: ['showing-appointments', userId, page], queryFn: () => fetchShowingAppointments(page), placeholderData: keepPreviousData })
  const showings = data?.showing_appointments ?? []

  function selectPage(nextPage: number) {
    const next = new URLSearchParams(searchParams)
    if (nextPage <= 1) next.delete('page')
    else next.set('page', String(nextPage))
    setSearchParams(next)
  }

  return (
    <AdminShell kicker="Showings" title="Showing schedule">
      <section className="mx-auto max-w-7xl px-4 pb-10 sm:px-5">
        {isLoading && <StateCard>Loading showings...</StateCard>}
        {isError && <StateCard tone="error">Unable to load showings.</StateCard>}
        <div className="grid gap-4">
          {showings.map((showing) => (
            <Link key={showing.id} to={routes.adminShowing(showing.id, `${location.pathname}${location.search}`)} className="rounded-[1.75rem] bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-xl hover:shadow-[var(--brand-primary)]/10 sm:rounded-[2rem] sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#0f705e]">{showing.status.replaceAll('_', ' ')}</p>
                  <h2 className="mt-2 text-xl font-semibold tracking-[-0.04em] sm:text-2xl">{showing.listing?.title ?? 'Showing appointment'}</h2>
                  <p className="mt-2 text-sm font-semibold text-[#66746f]">{formatDateTime(showing.scheduled_starts_at, showing.timezone)} · {showing.tour_type.replaceAll('_', ' ')}</p>
                </div>
                <span className="rounded-full bg-[#f6f1e8] px-4 py-2 text-sm font-bold text-[var(--brand-primary)]">{showing.agent?.name ?? 'Unassigned'}</span>
              </div>
              {showing.location && <p className="mt-4 rounded-2xl bg-[#f6f1e8] p-3 text-sm font-semibold text-[#304942]">{showing.location}</p>}
              {showing.consumer_notes && <p className="mt-3 text-sm leading-6 text-[#66746f]">Customer notes: {showing.consumer_notes}</p>}
            </Link>
          ))}
          {showings.length === 0 && !isLoading && <StateCard>No showing appointments scheduled yet.</StateCard>}
        </div>
        {data?.pagination && data.pagination.total_pages > 1 && (
          <div className="mt-5 rounded-[1.5rem] bg-white p-4 shadow-sm">
            <PaginationControls pagination={data.pagination} onPageChange={selectPage} />
          </div>
        )}
      </section>
    </AdminShell>
  )
}

export function ShowingDetailPage() {
  const { id = '' } = useParams()
  const { userId } = useAuthContext()
  const [searchParams] = useSearchParams()
  const returnPath = safeReturnPath(searchParams.get('return_to'), '/admin/showings')
  const returnLabel = returnPath === '/admin' ? 'Back to dashboard' : returnPath.startsWith('/admin/leads/') ? 'Back to lead' : 'Back to showing schedule'
  const { data, isLoading, error } = useQuery({
    queryKey: ['showing-appointment', userId, id],
    queryFn: () => fetchShowingAppointment(id),
    enabled: Boolean(id),
    retry: (attempts, showingError) => !(showingError instanceof ApiFetchError && showingError.status === 404) && attempts < 2,
  })

  if (isLoading) return <AdminShell><section className="mx-auto max-w-7xl px-4 py-10 sm:px-5"><StateCard>Loading showing...</StateCard></section></AdminShell>

  if (error || !data?.showing_appointment) {
    const notFound = error instanceof ApiFetchError && error.status === 404
    return (
      <AdminShell>
        <section className="mx-auto max-w-7xl px-4 py-10 sm:px-5">
          <Link to={returnPath} className="mb-6 inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-5 text-sm font-bold text-[#304942] shadow-sm"><ArrowLeft size={16} /> {returnLabel}</Link>
          <StateCard tone="error">{notFound ? 'This showing is not available in your staff workspace.' : displayErrorMessage(error, 'Unable to load this showing.')}</StateCard>
        </section>
      </AdminShell>
    )
  }

  const showing = data.showing_appointment
  const showingPath = routes.adminShowing(showing.id, returnPath)
  const leadPath = routes.adminLead(showing.lead_id, showingPath)
  const listingPath = showing.listing ? routes.listing(showing.listing.id, showingPath) : null

  return (
    <AdminShell>
      <section className="mx-auto max-w-7xl px-4 pb-12 pt-6 sm:px-5">
        <Link to={returnPath} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-5 text-sm font-bold text-[#304942] shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"><ArrowLeft size={16} /> {returnLabel}</Link>

        <header className="relative mt-5 overflow-hidden rounded-[2.25rem] bg-[var(--brand-primary)] p-6 text-white shadow-2xl shadow-[var(--brand-primary)]/20 md:p-9">
          <div className="absolute -right-16 -top-20 h-64 w-64 rounded-full bg-[#f5c16c]/15 blur-3xl" />
          <div className="relative flex flex-col gap-7 md:flex-row md:items-end md:justify-between">
            <div className="max-w-3xl">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/58">Showing #{showing.id}</p>
              <h1 className="mt-4 text-3xl font-semibold leading-tight tracking-[-0.05em] md:text-5xl">{showing.listing?.title ?? `Appointment for ${showing.lead?.name ?? 'customer'}`}</h1>
              <p className="mt-4 text-base leading-7 text-white/72">{formatDateTime(showing.scheduled_starts_at, showing.timezone)}{showing.scheduled_ends_at ? ` to ${formatDateTime(showing.scheduled_ends_at, showing.timezone)}` : ''}</p>
            </div>
            <span className="w-fit rounded-2xl bg-white/10 px-5 py-4 text-lg font-semibold capitalize backdrop-blur-sm">{showing.status.replaceAll('_', ' ')}</span>
          </div>
        </header>

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="grid gap-6">
            <section className="rounded-[2rem] bg-white p-6 shadow-sm md:p-7">
              <div className="flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-2xl bg-[#e9f5ef] text-[#0f705e]"><Clock3 size={21} /></div><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-[#7b8a84]">Appointment record</p><h2 className="mt-1 text-2xl font-semibold tracking-[-0.04em]">Schedule and coordination</h2></div></div>
              <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <LeadMeta icon={<Clock3 size={16} />} label="Starts" value={formatDateTime(showing.scheduled_starts_at, showing.timezone)} />
                <LeadMeta icon={<Clock3 size={16} />} label="Ends" value={showing.scheduled_ends_at ? formatDateTime(showing.scheduled_ends_at, showing.timezone) : 'Not recorded'} />
                <LeadMeta icon={<MapPin size={16} />} label="Tour" value={`${showing.tour_type.replaceAll('_', ' ')} · ${showing.timezone}`} />
              </div>
              {showing.location && <p className="mt-4 flex items-start gap-2 rounded-2xl bg-[#f6f1e8] p-4 text-sm font-semibold text-[#304942]"><MapPin className="mt-0.5 shrink-0 text-[#0f705e]" size={16} /> {showing.location}</p>}
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-[#e3e9e5] p-4"><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#0f705e]">Customer-visible notes</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#53645f]">{showing.consumer_notes || 'No customer note recorded.'}</p></div>
                <div className="rounded-2xl border border-[#e3e9e5] p-4"><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#7b8a84]">Internal staff notes</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#53645f]">{showing.internal_notes || 'No internal note recorded.'}</p></div>
              </div>
            </section>

            {showing.listing && listingPath && (
              <article className="overflow-hidden rounded-[2rem] bg-white shadow-sm md:grid md:grid-cols-[240px_1fr]">
                <Link to={listingPath} className="group block overflow-hidden"><img src={showing.listing.primary_photo_url || FALLBACK_LISTING_IMAGE} alt="" className="h-56 w-full object-cover transition duration-700 group-hover:scale-105 md:h-full" /></Link>
                <div className="p-6"><p className="text-xs font-bold uppercase tracking-[0.18em] text-[#0f705e]">Related listing</p><h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">{showing.listing.title}</h2>{showing.listing.address && <p className="mt-2 text-sm font-semibold text-[#66746f]">{showing.listing.address}{showing.listing.village ? ` · ${showing.listing.village}` : ''}</p>}<Link to={listingPath} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-full border border-[#d7ded9] px-5 text-sm font-bold text-[var(--brand-primary)]">Open listing <ChevronRight size={16} /></Link></div>
              </article>
            )}
          </div>

          <aside className="grid content-start gap-5 lg:sticky lg:top-6">
            <section className="rounded-[2rem] bg-white p-6 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#7b8a84]">Connected customer</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">{showing.lead?.name ?? `Lead #${showing.lead_id}`}</h2>
              <div className="mt-4 grid gap-2 text-sm text-[#53645f]">
                {showing.lead?.email && <p className="flex items-center gap-2"><Mail size={15} /> {showing.lead.email}</p>}
                {showing.lead?.phone && <p className="flex items-center gap-2"><Phone size={15} /> {showing.lead.phone}</p>}
                <p className="capitalize">{leadTypeLabel(showing.lead?.lead_type)} · {showing.lead?.status?.replaceAll('_', ' ') || 'Open'}</p>
              </div>
              <Link to={leadPath} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-full bg-[var(--brand-primary)] px-5 text-sm font-bold text-white">Open lead workspace <ChevronRight size={16} /></Link>
            </section>

            <section className="rounded-[2rem] bg-[#101f1c] p-6 text-white shadow-xl shadow-[var(--brand-primary)]/15">
              <UsersRound className="text-[#f5c16c]" size={24} />
              <h2 className="mt-4 text-xl font-semibold">Coordination team</h2>
              <div className="mt-4 grid gap-3 text-sm leading-6 text-white/70">
                <p><span className="block text-xs font-bold uppercase tracking-[0.14em] text-white/42">Assigned agent</span>{showing.agent?.name ?? 'Unassigned'}</p>
                <p><span className="block text-xs font-bold uppercase tracking-[0.14em] text-white/42">Brokerage</span>{showing.brokerage?.name ?? 'Not recorded'}</p>
                <p><span className="block text-xs font-bold uppercase tracking-[0.14em] text-white/42">Created by</span>{showing.created_by?.full_name ?? 'Not recorded'}</p>
              </div>
            </section>
          </aside>
        </div>
      </section>
    </AdminShell>
  )
}

function AdminUsersPage() {
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['admin-users'], queryFn: fetchAdminUsers })
  const [filter, setFilter] = useState<'staff' | 'consumers' | 'all'>('staff')
  const [inviteFormVersion, setInviteFormVersion] = useState(0)
  const mutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Record<string, unknown> }) => updateAdminUser(id, payload),
    onSuccess: () => refetch(),
  })
  const createMutation = useMutation({
    mutationFn: createAdminUser,
    onSuccess: () => {
      setInviteFormVersion((version) => version + 1)
      refetch()
    },
  })
  const users = data?.users ?? []
  const brokerages = data?.brokerages ?? []
  const agents = data?.agents ?? []
  const staffUsers = users.filter((user) => user.role !== 'consumer')
  const consumerUsers = users.filter((user) => user.role === 'consumer')
  const visibleUsers = filter === 'staff' ? staffUsers : filter === 'consumers' ? consumerUsers : users
  const filterTabs = [
    { value: 'staff', label: 'Admins & agents', count: staffUsers.length },
    { value: 'consumers', label: 'Consumers', count: consumerUsers.length },
    { value: 'all', label: 'All users', count: users.length },
  ] as const

  return (
    <AdminShell kicker="Users" title="Team access">
      <section className="mx-auto max-w-7xl px-4 pb-10 sm:px-5">
        {isLoading && <StateCard>Loading users...</StateCard>}
        {isError && <StateCard tone="error">Unable to load users. Platform admin access is required.</StateCard>}
        {mutation.isError && <StateCard tone="error">{displayErrorMessage(mutation.error, 'Unable to update user.')}</StateCard>}
        {createMutation.isError && <StateCard tone="error">{displayErrorMessage(createMutation.error, 'Unable to create user.')}</StateCard>}
        <InviteUserForm key={inviteFormVersion} brokerages={brokerages} saving={createMutation.isPending} onCreate={(payload) => createMutation.mutate(payload)} />
        <RoleMatrix />
        <div className="mb-5 mt-5 overflow-x-auto rounded-[1.25rem] bg-white p-1.5 shadow-sm sm:rounded-[1.5rem] sm:p-2">
          <div className="flex min-w-max items-center gap-1.5 sm:min-w-0 sm:flex-wrap sm:gap-2">
            {filterTabs.map((tab) => (
              <button
                key={tab.value}
                type="button"
                onClick={() => setFilter(tab.value)}
                className={`inline-flex min-h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-3 text-xs font-bold transition sm:min-h-11 sm:px-4 sm:text-sm ${filter === tab.value ? 'bg-[var(--brand-primary)] text-white' : 'text-[#53645f] hover:bg-[#f6f1e8] hover:text-[var(--brand-primary)]'}`}
              >
                <span>{tab.label}</span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] sm:text-xs ${filter === tab.value ? 'bg-white/15 text-white' : 'bg-[#f6f1e8] text-[#66746f]'}`}>{tab.count}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="grid gap-4">
          {visibleUsers.map((user) => (
            <UserRoleCard key={user.id} user={user} brokerages={brokerages} agents={agents} onSave={(payload) => mutation.mutate({ id: user.id, payload })} saving={mutation.isPending} />
          ))}
          {visibleUsers.length === 0 && !isLoading && <StateCard>No users in this view yet.</StateCard>}
        </div>
      </section>
    </AdminShell>
  )
}

function RoleMatrix() {
  const [expanded, setExpanded] = useState(false)
  const roles = [
    {
      role: 'Consumer',
      access: 'Public browsing, saved homes, profile, own request history.',
      notes: 'No admin access.',
    },
    {
      role: 'Agent',
      access: 'Assigned leads/showings, scoped CRM notes and tasks.',
      notes: 'Requires brokerage; creates assignable agent profile.',
    },
    {
      role: 'Brokerage admin',
      access: 'Brokerage leads, showings, users, agents, audit history.',
      notes: 'For office managers/brokers.',
    },
    {
      role: 'Platform admin',
      access: 'All brokerages, global audit, platform user lifecycle.',
      notes: 'Use only for Hafa Homes operators.',
    },
  ]

  return (
    <section className="mt-5 rounded-[1.75rem] bg-white p-4 shadow-sm">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full flex-wrap items-center justify-between gap-3 text-left"
        aria-expanded={expanded}
      >
        <span>
          <span className="text-xs font-bold uppercase tracking-[0.22em] text-[#0f705e]">Role matrix</span>
          <span className="mt-1 block text-xl font-semibold tracking-[-0.04em] text-[#17211f]">Choose the smallest role that gets the job done.</span>
        </span>
        <span className="rounded-full border border-[#d7ded9] px-4 py-2 text-sm font-bold text-[var(--brand-primary)]">{expanded ? 'Hide' : 'Show roles'}</span>
      </button>
      {expanded && (
        <div className="mt-4 grid gap-2 xl:grid-cols-4">
          {roles.map((item) => (
            <article key={item.role} className="rounded-2xl border border-[#dce5df] bg-[#fbfaf7] p-3">
              <h3 className="text-base font-bold tracking-[-0.03em] text-[#17211f]">{item.role}</h3>
              <p className="mt-2 text-sm leading-5 text-[#53645f]">{item.access}</p>
              <p className="mt-3 rounded-xl bg-[#e9f5ef] px-3 py-2 text-xs font-semibold leading-5 text-[var(--brand-primary)]">{item.notes}</p>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

function InviteUserForm({ brokerages, onCreate, saving }: { brokerages: Brokerage[]; onCreate: (payload: Record<string, unknown>) => void; saving: boolean }) {
  const [role, setRole] = useState('agent')

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const brokerageId = String(form.get('brokerage_id') || '')
    const selectedRole = String(form.get('role') || role)
    const payload: Record<string, unknown> = {
      email: String(form.get('email') || '').trim(),
      first_name: String(form.get('first_name') || '').trim(),
      last_name: String(form.get('last_name') || '').trim(),
      phone: String(form.get('phone') || '').trim(),
      preferred_contact_method: String(form.get('preferred_contact_method') || 'email'),
      role: selectedRole,
      brokerage_membership: brokerageId ? {
        brokerage_id: Number(brokerageId),
        role: selectedRole === 'brokerage_admin' ? 'brokerage_admin' : 'agent',
        status: 'invited',
      } : undefined,
      agent_profile: selectedRole === 'agent' ? {
        create: true,
        brokerage_id: brokerageId ? Number(brokerageId) : undefined,
      } : undefined,
    }
    onCreate(payload)
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-[2rem] bg-[var(--brand-primary)] p-5 text-white shadow-xl shadow-[var(--brand-primary)]/15">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#bdebdc]">Invite-only access</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">Whitelist a user before they sign in.</h2>
          <p className="mt-2 text-sm leading-6 text-white/70">Creating a staff record here lets that email accept a Clerk invite and inherit the correct Hafa Homes role. Agent users also get an assignable agent profile automatically.</p>
        </div>
        <button disabled={saving} className="rounded-full bg-white px-5 py-3 text-sm font-bold text-[var(--brand-primary)] disabled:opacity-60">{saving ? 'Creating...' : 'Create invite'}</button>
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <label className="grid gap-2 text-sm font-semibold text-white/86">
          Email
          <input name="email" type="email" required className="min-h-12 rounded-2xl border border-white/10 bg-white/10 px-4 text-white placeholder:text-white/45 outline-none focus:border-[#bdebdc]" />
        </label>
        <label className="grid gap-2 text-sm font-semibold text-white/86">
          First name
          <input name="first_name" className="min-h-12 rounded-2xl border border-white/10 bg-white/10 px-4 text-white placeholder:text-white/45 outline-none focus:border-[#bdebdc]" />
        </label>
        <label className="grid gap-2 text-sm font-semibold text-white/86">
          Last name
          <input name="last_name" className="min-h-12 rounded-2xl border border-white/10 bg-white/10 px-4 text-white placeholder:text-white/45 outline-none focus:border-[#bdebdc]" />
        </label>
        <label className="grid gap-2 text-sm font-semibold text-white/86">
          Phone
          <input name="phone" inputMode="tel" className="min-h-12 rounded-2xl border border-white/10 bg-white/10 px-4 text-white placeholder:text-white/45 outline-none focus:border-[#bdebdc]" />
        </label>
        <label className="grid gap-2 text-sm font-semibold text-white/86">
          Product role
          <select name="role" value={role} onChange={(event) => setRole(event.target.value)} className="min-h-12 rounded-2xl border border-white/10 bg-[#174c43] px-4 text-white outline-none focus:border-[#bdebdc]">
            <option value="agent">Agent</option>
            <option value="brokerage_admin">Brokerage admin</option>
            <option value="platform_admin">Platform admin</option>
            <option value="consumer">Consumer</option>
          </select>
        </label>
        <label className="grid gap-2 text-sm font-semibold text-white/86">
          Brokerage
          <select name="brokerage_id" className="min-h-12 rounded-2xl border border-white/10 bg-[#174c43] px-4 text-white outline-none focus:border-[#bdebdc]">
            <option value="">No brokerage</option>
            {brokerages.map((brokerage) => <option key={brokerage.id} value={brokerage.id}>{brokerage.name}</option>)}
          </select>
        </label>
        <label className="grid gap-2 text-sm font-semibold text-white/86">
          Preferred contact
          <select name="preferred_contact_method" defaultValue="email" className="min-h-12 rounded-2xl border border-white/10 bg-[#174c43] px-4 text-white outline-none focus:border-[#bdebdc]">
            {preferredContactOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <div className="self-end rounded-2xl border border-white/10 bg-white/8 px-4 py-3 text-sm leading-6 text-white/76">
          <strong className="block text-white">Agent profile</strong>
          Agent role creates one automatically so the user can be assigned leads and showings.
        </div>
      </div>
    </form>
  )
}

function UserRoleCard({ user, brokerages, agents, onSave, saving }: { user: AdminUser; brokerages: Brokerage[]; agents: Agent[]; onSave: (payload: Record<string, unknown>) => void; saving: boolean }) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const brokerageId = String(form.get('brokerage_id') || '')
    const agentId = String(form.get('agent_id') || '')
    const payload: Record<string, unknown> = {
      first_name: String(form.get('first_name') || '').trim(),
      last_name: String(form.get('last_name') || '').trim(),
      phone: String(form.get('phone') || '').trim(),
      preferred_contact_method: String(form.get('preferred_contact_method') || 'email'),
      role: String(form.get('role') || user.role),
      archived: form.get('archived') === 'on',
      brokerage_membership: brokerageId ? {
        brokerage_id: Number(brokerageId),
        role: String(form.get('membership_role') || 'agent'),
        status: String(form.get('membership_status') || 'active'),
      } : undefined,
      agent_id: agentId ? Number(agentId) : null,
    }
    onSave(payload)
  }

  const activeMembership = user.brokerages?.[0]
  const linkedAgent = user.agent_profiles?.[0]

  return (
    <form onSubmit={handleSubmit} className="rounded-[1.75rem] bg-white p-4 shadow-sm sm:rounded-[2rem] sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#0f705e]">{user.role.replaceAll('_', ' ')} · {user.archived_at ? 'Archived' : user.invitation_status || 'active'}</p>
          <h2 className="mt-2 text-xl font-semibold tracking-[-0.04em] sm:text-2xl">{user.full_name || user.email}</h2>
          <p className="mt-1 text-sm font-semibold text-[#66746f]">{user.email}{user.phone ? ` · ${user.phone}` : ''}</p>
        </div>
        <button disabled={saving} className="w-full rounded-full bg-[var(--brand-primary)] px-5 py-3 text-sm font-bold text-white disabled:opacity-60 sm:w-auto">{saving ? 'Saving...' : 'Save access'}</button>
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <label className="grid gap-2 text-sm font-semibold text-[#304942]">
          First name
          <input name="first_name" defaultValue={user.first_name || ''} className="min-h-12 w-full min-w-0 rounded-2xl border border-[#dce5df] px-4" />
        </label>
        <label className="grid gap-2 text-sm font-semibold text-[#304942]">
          Last name
          <input name="last_name" defaultValue={user.last_name || ''} className="min-h-12 w-full min-w-0 rounded-2xl border border-[#dce5df] px-4" />
        </label>
        <label className="grid gap-2 text-sm font-semibold text-[#304942]">
          Phone
          <input name="phone" defaultValue={user.phone || ''} inputMode="tel" className="min-h-12 w-full min-w-0 rounded-2xl border border-[#dce5df] px-4" />
        </label>
        <label className="grid gap-2 text-sm font-semibold text-[#304942]">
          Preferred contact
          <select name="preferred_contact_method" defaultValue={user.preferred_contact_method || 'email'} className="min-h-12 w-full min-w-0 rounded-2xl border border-[#dce5df] px-4">
            {preferredContactOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label className="grid gap-2 text-sm font-semibold text-[#304942]">
          Product role
          <select name="role" defaultValue={user.role} className="min-h-12 w-full min-w-0 rounded-2xl border border-[#dce5df] px-4">
            <option value="consumer">Consumer</option>
            <option value="agent">Agent</option>
            <option value="brokerage_admin">Brokerage admin</option>
            <option value="platform_admin">Platform admin</option>
          </select>
        </label>
        <label className="grid gap-2 text-sm font-semibold text-[#304942]">
          Brokerage
          <select name="brokerage_id" defaultValue={activeMembership?.brokerage?.id ?? ''} className="min-h-12 w-full min-w-0 rounded-2xl border border-[#dce5df] px-4">
            <option value="">No brokerage membership</option>
            {brokerages.map((brokerage) => <option key={brokerage.id} value={brokerage.id}>{brokerage.name}</option>)}
          </select>
        </label>
        <label className="grid gap-2 text-sm font-semibold text-[#304942]">
          Membership role
          <select name="membership_role" defaultValue={activeMembership?.role ?? 'agent'} className="min-h-12 w-full min-w-0 rounded-2xl border border-[#dce5df] px-4">
            <option value="agent">Agent</option>
            <option value="brokerage_admin">Brokerage admin</option>
          </select>
        </label>
        <label className="grid gap-2 text-sm font-semibold text-[#304942]">
          Membership status
          <select name="membership_status" defaultValue={activeMembership?.status ?? 'active'} className="min-h-12 w-full min-w-0 rounded-2xl border border-[#dce5df] px-4">
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="invited">Invited</option>
            <option value="revoked">Revoked</option>
          </select>
        </label>
        <label className="grid gap-2 text-sm font-semibold text-[#304942]">
          Assignable agent profile
          <span className="text-xs font-medium leading-5 text-[#66746f]">Only needed when this user should be assigned leads/showings.</span>
          <select name="agent_id" defaultValue={linkedAgent?.id ?? ''} className="min-h-12 w-full min-w-0 rounded-2xl border border-[#dce5df] px-4">
            <option value="">No linked agent</option>
            {agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name} · {agent.brokerage?.name}</option>)}
          </select>
        </label>
        <label className="flex min-h-12 items-center gap-3 self-end rounded-2xl border border-[#dce5df] px-4 text-sm font-semibold text-[#304942]">
          <input name="archived" type="checkbox" defaultChecked={Boolean(user.archived_at)} className="h-4 w-4 rounded border-[#dce5df]" />
          Archive account
        </label>
      </div>
    </form>
  )
}

function AdminAuditPage() {
  const [page, setPage] = useState(1)
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['audit-events', page], queryFn: () => fetchAuditEvents(page), placeholderData: keepPreviousData })
  const events = data?.audit_events ?? []

  return (
    <AdminShell kicker="Audit history" title="Platform audit log" description="A global trail for profile, admin, lead, notification, and showing changes.">
      <section className="mx-auto max-w-7xl px-4 pb-10 sm:px-5">
        {isLoading && <StateCard>Loading audit history...</StateCard>}
        {isError && <StateCard tone="error">Unable to load audit history.</StateCard>}
        <div className="mb-4 flex justify-end">
          <button type="button" onClick={() => refetch()} className="rounded-full border border-[#d7ded9] bg-white px-4 py-2 text-sm font-bold text-[var(--brand-primary)]">Refresh</button>
        </div>
        <div className="overflow-hidden rounded-[2rem] bg-white shadow-sm">
          {events.map((event) => (
            <article key={event.id} className="border-b border-[#edf0ec] p-5 last:border-b-0">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#0f705e]">{event.action.replaceAll('_', ' ')}</p>
                  <h2 className="mt-2 text-xl font-semibold tracking-[-0.04em]">{event.target_label || `${event.target_type || 'Record'} #${event.target_id || event.id}`}</h2>
                  <p className="mt-1 text-sm font-semibold text-[#66746f]">
                    {event.actor?.full_name || event.actor_email || 'System'} · {formatDateTime(event.created_at)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 text-xs font-bold text-[#53645f]">
                  {event.lead_id && <Link to={`/admin/leads/${event.lead_id}`} className="rounded-full bg-[#e9f5ef] px-3 py-2 text-[var(--brand-primary)]">Lead #{event.lead_id}</Link>}
                  {event.target_type && <span className="rounded-full bg-[#f6f1e8] px-3 py-2">{event.target_type}</span>}
                </div>
              </div>
              {event.changes && Object.keys(event.changes).length > 0 && (
                <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {Object.entries(event.changes).map(([field, change]) => (
                    <div key={field} className="rounded-2xl bg-[#f6f1e8] p-3 text-xs">
                      <p className="font-bold uppercase tracking-[0.16em] text-[#7b8a84]">{field.replaceAll('_', ' ')}</p>
                      <p className="mt-1 font-semibold text-[#304942]">{String(change.from ?? 'blank')} → {String(change.to ?? 'blank')}</p>
                    </div>
                  ))}
                </div>
              )}
            </article>
          ))}
          {events.length === 0 && !isLoading && <div className="p-5"><StateCard>No audit events yet.</StateCard></div>}
        </div>
        {data?.pagination && data.pagination.total_pages > 1 && (
          <div className="mt-5 rounded-[1.5rem] bg-white p-4 shadow-sm">
            <PaginationControls pagination={data.pagination} onPageChange={setPage} />
          </div>
        )}
      </section>
    </AdminShell>
  )
}

function LeadStatusSelect({ value, onChange, disabled }: { value: LeadStatus; onChange: (value: LeadStatus) => void; disabled?: boolean }) {
  return (
    <label className="grid w-full gap-2 text-xs font-bold uppercase tracking-[0.16em] text-[#7b8a84] sm:w-auto">
      Status
      <select value={value} onChange={(event) => onChange(event.target.value as LeadStatus)} disabled={disabled} className="min-h-11 w-full rounded-full border border-[#dce5df] bg-white px-4 text-sm font-bold normal-case tracking-normal text-[var(--brand-primary)] disabled:opacity-60 sm:min-w-[220px]">
        {leadStatuses.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
      </select>
    </label>
  )
}

function LeadMeta({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div className="rounded-2xl bg-[#f6f1e8] p-4"><div className="flex items-center gap-2 text-[#0f705e]">{icon}<p className="text-xs font-bold uppercase tracking-[0.16em]">{label}</p></div><p className="mt-2 text-sm font-semibold text-[#304942]">{value}</p></div>
}

function MobileMenuDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const links = [
    ['Search', '/'],
    ['Villages', '/villages'],
    ['Agents', '/agents'],
    ['Military relocation', '/military'],
    ['Saved homes', '/saved'],
    ['My requests', '/account/requests'],
    ['Account', '/account'],
  ]

  return (
    <div className={`fixed inset-0 z-[90] md:hidden ${open ? 'pointer-events-auto' : 'pointer-events-none'}`}>
      <button
        aria-label="Close menu"
        onClick={onClose}
        className={`absolute inset-0 bg-black/45 backdrop-blur-sm transition-opacity duration-300 ease-out ${open ? 'opacity-100' : 'opacity-0'}`}
      />
      <div className={`safe-top absolute bottom-0 right-0 top-0 w-[84vw] max-w-sm bg-[var(--brand-primary)] p-5 text-white shadow-2xl transition-transform duration-300 ease-out ${open ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="flex items-center justify-between gap-4">
          <Brand light />
          <button onClick={onClose} className="grid h-11 w-11 place-items-center rounded-full bg-white/10 hover:bg-white/15 active:scale-95"><X size={20} /></button>
        </div>
        <div className="mt-8 grid gap-3">
          {links.map(([label, href], index) => (
            <Link
              key={href}
              to={href}
              onClick={onClose}
              style={{ transitionDelay: open ? `${80 + index * 25}ms` : '0ms' }}
              className={`rounded-2xl bg-white/10 px-4 py-4 text-lg font-bold text-white/90 hover:translate-x-1 hover:bg-white/15 ${open ? 'translate-x-0 opacity-100' : 'translate-x-4 opacity-0'}`}
            >
              {label}
            </Link>
          ))}
        </div>
        <div className={`absolute bottom-6 left-5 right-5 rounded-3xl bg-white/10 p-4 text-sm leading-6 text-white/72 transition-all delay-200 duration-300 ${open ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'}`}>
          Hafa Homes helps buyers and renters search Guam by village, commute, budget, and island-ready features.
        </div>
      </div>
    </div>
  )
}

function QualificationFields({ compact = false, defaultBudgetMax, searchProfile }: { compact?: boolean; defaultBudgetMax?: string; searchProfile?: SearchProfile | null }) {
  return (
    <div className="min-w-0 rounded-[1.5rem] border border-[#dce5df] bg-[#fbfaf6] p-4 md:col-span-2">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#0f705e]">Buyer readiness</p>
      <p className="mt-2 text-sm leading-6 text-[#66746f]">A few optional details help the right agent follow up with useful matches instead of a cold call.</p>
      <div className="mt-4 grid min-w-0 gap-3 md:grid-cols-2">
        <label className="grid min-w-0 gap-2 text-sm font-semibold text-[#304942]">
          Prequalified?
          <select name="prequalified_status" defaultValue={profileDefault(searchProfile, 'prequalified_status')} className="min-h-12 w-full min-w-0 rounded-2xl border border-[#dce5df] bg-white px-4">
            {prequalifiedOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label className="grid min-w-0 gap-2 text-sm font-semibold text-[#304942]">
          Timeline
          <select name="purchase_timeline" defaultValue={profileDefault(searchProfile, 'purchase_timeline')} className="min-h-12 w-full min-w-0 rounded-2xl border border-[#dce5df] bg-white px-4">
            {purchaseTimelineOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <Input name="lender_name" label="Lender / bank optional" defaultValue={profileDefault(searchProfile, 'lender_name')} placeholder="Bank of Guam, Coast360..." />
        <label className="grid min-w-0 gap-2 text-sm font-semibold text-[#304942]">
          Buyer type
          <select name="buyer_status" defaultValue={profileDefault(searchProfile, 'buyer_status')} className="min-h-12 w-full min-w-0 rounded-2xl border border-[#dce5df] bg-white px-4">
            {buyerStatusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <Input name="budget_min" label="Budget min" type="number" min="0" step="any" defaultValue={profileDefault(searchProfile, 'budget_min')} placeholder="450000" />
        <Input name="budget_max" label="Budget max" type="number" min="0" step="any" defaultValue={profileDefault(searchProfile, 'budget_max', defaultBudgetMax || '')} placeholder="650000" />
        {!compact && <Input name="desired_villages" label="Desired villages" defaultValue={profileDefault(searchProfile, 'desired_villages')} placeholder="Dededo, Yigo, Tamuning" />}
        {!compact && <Input name="desired_beds" label="Desired beds" type="number" min="0" step="1" defaultValue={profileDefault(searchProfile, 'desired_beds')} placeholder="3" />}
        {!compact && <Input name="desired_baths" label="Desired baths" type="number" min="0" step="0.5" defaultValue={profileDefault(searchProfile, 'desired_baths')} placeholder="2" />}
        <label className="grid min-w-0 gap-2 text-sm font-semibold text-[#304942]">
          Already working with an agent?
          <select name="already_working_with_agent" defaultValue={profileDefault(searchProfile, 'already_working_with_agent')} className="min-h-12 w-full min-w-0 rounded-2xl border border-[#dce5df] bg-white px-4">
            {agentRelationshipOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
      </div>
      {!compact && (
        <label className="mt-3 grid gap-2 text-sm font-semibold text-[#304942]">
          Anything else the agent should know?
          <textarea name="qualification_notes" rows={3} defaultValue={profileDefault(searchProfile, 'notes')} className="rounded-2xl border border-[#dce5df] bg-white px-4 py-3" placeholder="Relocating next month, needs pet-friendly, prefers central Guam..." />
        </label>
      )}
    </div>
  )
}

function PriceTrackerModal({ listing, open, onClose }: { listing: Listing; open: boolean; onClose: () => void }) {
  const mutation = useMutation({ mutationFn: createLead })
  const submittingRef = useRef(false)
  const [submitting, setSubmitting] = useState(false)
  const { isClerkEnabled, isSignedIn, userId } = useAuthContext()
  const canSelectAgent = isClerkEnabled && isSignedIn
  const { data: meData } = useQuery({
    queryKey: ['me', userId, 'price-tracker-prefill'],
    queryFn: fetchMe,
    enabled: open && isClerkEnabled && isSignedIn && Boolean(userId),
    retry: false,
  })
  const { data: searchProfileData } = useQuery({
    queryKey: ['me', userId, 'search-profile', 'price-tracker-prefill'],
    queryFn: fetchSearchProfile,
    enabled: open && isClerkEnabled && isSignedIn && Boolean(userId),
    retry: false,
  })
  const { data: agentsData } = useQuery({
    queryKey: ['agents', 'routing', 'price-tracker'],
    queryFn: () => fetchAgents(),
    enabled: open && canSelectAgent,
  })
  const profile = meData?.user
  const searchProfile = searchProfileData?.search_profile
  const wasOpenRef = useRef(false)

  useEffect(() => {
    if (open) {
      wasOpenRef.current = true
      return
    }

    if (wasOpenRef.current && !mutation.isSuccess) {
      recordLeadIntentEvent('lead_form_abandoned', { listing_id: listing.id, source: 'web', metadata: { surface: 'price_tracker', listing_kind: listing.listing_kind } })
    }
    wasOpenRef.current = false
  }, [listing.id, listing.listing_kind, mutation.isSuccess, open])

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('hafaHomes:conversionModalState', { detail: { open } }))
    return () => {
      if (open) window.dispatchEvent(new CustomEvent('hafaHomes:conversionModalState', { detail: { open: false } }))
    }
  }, [open])

  if (!open) return null

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submittingRef.current || mutation.isPending) return

    submittingRef.current = true
    setSubmitting(true)

    try {
      const form = new FormData(event.currentTarget)
      const selectedAgentId = canSelectAgent ? storedSelectedAgentId() : null
      let candidateAgents = agentsData?.agents

      if (selectedAgentId && !candidateAgents) {
        try {
          candidateAgents = (await fetchAgents()).agents
        } catch (agentError) {
          console.warn('Unable to resolve preferred agent before price tracker submit', agentError)
        }
      }

      const selectedAgent = candidateAgents?.find((agent) => agent.id === selectedAgentId)
      captureAnalyticsEvent('lead_form_submitted', { listing_id: listing.id, lead_type: 'price_tracker' })
      await mutation.mutateAsync({
        listing_id: listing.id,
        lead_type: 'price_tracker',
        name: String(form.get('name') || 'Price watch user'),
        email: String(form.get('email') || ''),
        phone: String(form.get('phone') || ''),
        preferred_contact_method: 'email',
        target_price: String(form.get('target_price') || ''),
        source_campaign: currentUtmCampaign(),
        source_url: window.location.href,
        requested_agent_id: selectedAgent?.id,
        prequalified_status: String(form.get('prequalified_status') || ''),
        lender_name: String(form.get('lender_name') || ''),
        purchase_timeline: String(form.get('purchase_timeline') || ''),
        budget_min: String(form.get('budget_min') || ''),
        budget_max: String(form.get('budget_max') || ''),
        buyer_status: String(form.get('buyer_status') || ''),
        already_working_with_agent: String(form.get('already_working_with_agent') || ''),
        intent_session_token: currentLeadIntentSessionToken() || undefined,
        message: `Target price: ${String(form.get('target_price') || '')}`,
      })
    } catch {
      // React Query keeps the mutation error state for the inline error message.
    } finally {
      submittingRef.current = false
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[75] grid place-items-end bg-black/50 p-2 backdrop-blur-sm md:place-items-center md:p-5">
      <div role="dialog" aria-modal="true" aria-label="Price watch request" className="safe-bottom max-h-[calc(100svh-1rem)] w-full max-w-4xl overflow-y-auto overscroll-contain rounded-[1.75rem] bg-white/95 p-4 shadow-2xl md:max-h-[calc(100vh-2rem)] md:rounded-[2rem] md:p-8">
        {mutation.isSuccess ? (
          <div className="mx-auto max-w-lg py-8 text-center">
            <CheckCircle2 className="mx-auto text-[#0f705e]" size={44} />
            <h2 className="mt-4 text-3xl font-semibold tracking-[-0.05em]">Price watch request sent</h2>
            <p className="mt-3 text-sm leading-6 text-[#66746f]">The brokerage team has your target price and can follow up when price activity matters.</p>
            <button onClick={onClose} className="mt-6 w-full rounded-2xl bg-[var(--brand-primary)] px-4 py-3 text-sm font-bold text-white">Close</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#0f705e]">Price watch request</p>
                <h2 className="mt-2 text-3xl font-semibold tracking-[-0.05em] md:text-4xl">Set your target price</h2>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-[#66746f]">This is saved as a price watch lead for the brokerage team. Automated price-change notifications are a future enhancement.</p>
              </div>
              <button type="button" onClick={onClose} className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-[#d7ded9]"><X size={20} /></button>
            </div>
            <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)]">
              <div className="grid gap-3 md:grid-cols-2">
                <Input name="target_price" label="Target price" inputMode="numeric" placeholder="450000" required />
                <Input name="email" label="Email" type="email" defaultValue={profile?.email || ''} required />
                <Input name="name" label="Name" defaultValue={profile?.full_name || 'Hafa Homes user'} />
                <Input name="phone" label="Phone optional" defaultValue={searchProfile?.phone || profile?.phone || '+1671'} inputMode="tel" />
                <details className="rounded-[1.5rem] border border-[#dce5df] bg-[#fbfaf6] md:col-span-2">
                  <summary className="cursor-pointer list-none px-4 py-4 text-sm font-bold text-[var(--brand-primary)] marker:content-none">
                    <span className="flex items-center justify-between gap-4">
                      Tell the team more <span className="text-xs font-semibold text-[#66746f]">Optional readiness details</span>
                    </span>
                  </summary>
                  <div className="border-t border-[#dce5df] p-3">
                    <QualificationFields compact searchProfile={searchProfile} />
                  </div>
                </details>
              </div>
              <aside className="rounded-[1.5rem] bg-[#f6f1e8] p-5">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-[#0f705e]">Listing context</p>
                <h3 className="mt-3 text-xl font-semibold tracking-[-0.04em] text-[#17211f]">{listing.title}</h3>
                <dl className="mt-5 grid gap-3 text-sm">
                  <div className="rounded-2xl bg-white/70 p-4"><dt className="text-xs font-bold uppercase tracking-[0.16em] text-[#7b8a84]">Current price</dt><dd className="mt-1 text-lg font-black text-[#17211f]">{currency(listing.price, listing.listing_kind)}</dd></div>
                  <div className="rounded-2xl bg-white/70 p-4"><dt className="text-xs font-bold uppercase tracking-[0.16em] text-[#7b8a84]">Property</dt><dd className="mt-1 font-semibold text-[#304942]">{listing.village.name} · {listing.property_type}</dd></div>
                </dl>
                <p className="mt-4 text-sm leading-6 text-[#66746f]">Admins can filter these separately from showing requests in the lead inbox.</p>
              </aside>
            </div>
            {mutation.isError && <p className="mt-3 text-sm font-semibold text-red-700">Unable to send price watch request right now.</p>}
            <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_180px]">
              <button disabled={submitting || mutation.isPending} className="rounded-2xl bg-[var(--brand-primary)] px-4 py-3 text-sm font-bold text-white disabled:opacity-60">{submitting || mutation.isPending ? 'Sending...' : 'Send request'}</button>
              <button type="button" onClick={onClose} className="rounded-2xl bg-[#edf0ec] px-4 py-3 text-sm font-bold text-[#17211f]">Cancel</button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

function LeadModal({ listing, open, onClose }: { listing: Listing; open: boolean; onClose: () => void }) {
  const mutation = useMutation({ mutationFn: createLead })
  const { isClerkEnabled, isSignedIn, userId } = useAuthContext()
  const canSelectAgent = isClerkEnabled && isSignedIn
  const { data: meData } = useQuery({
    queryKey: ['me', userId, 'lead-prefill'],
    queryFn: fetchMe,
    enabled: open && isClerkEnabled && isSignedIn && Boolean(userId),
    retry: false,
  })
  const { data: searchProfileData } = useQuery({
    queryKey: ['me', userId, 'search-profile', 'lead-prefill'],
    queryFn: fetchSearchProfile,
    enabled: open && isClerkEnabled && isSignedIn && Boolean(userId),
    retry: false,
  })
  const { data: agentsData } = useQuery({
    queryKey: ['agents', 'routing', 'lead-modal'],
    queryFn: () => fetchAgents(),
    enabled: open && canSelectAgent,
  })
  const profile = meData?.user
  const searchProfile = searchProfileData?.search_profile
  const routingAgents = canSelectAgent ? agentsData?.agents ?? [] : []
  const defaultAgentId = (() => {
    if (!canSelectAgent) return null

    const stored = storedSelectedAgentId()
    const storedAgent = routingAgents.find((agent) => agent.id === stored)
    return storedAgent?.id ?? null
  })()
  const [agentSelectionOverride, setAgentSelectionOverride] = useState<{ listingId: number; agentId: number | null } | null>(null)
  const effectiveSelectedAgentId = agentSelectionOverride?.listingId === listing.id ? agentSelectionOverride.agentId : defaultAgentId
  const selectedModalAgent = routingAgents.find((agent) => agent.id === effectiveSelectedAgentId) ?? null
  const wasOpenRef = useRef(false)

  useEffect(() => {
    if (open) {
      wasOpenRef.current = true
      return
    }

    if (wasOpenRef.current && !mutation.isSuccess) {
      recordLeadIntentEvent('lead_form_abandoned', { listing_id: listing.id, source: 'web', metadata: { surface: 'showing_request', listing_kind: listing.listing_kind } })
    }
    wasOpenRef.current = false
  }, [listing.id, listing.listing_kind, mutation.isSuccess, open])

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('hafaHomes:conversionModalState', { detail: { open } }))
    return () => {
      if (open) window.dispatchEvent(new CustomEvent('hafaHomes:conversionModalState', { detail: { open: false } }))
    }
  }, [open])

  if (!open) return null

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const requestedAgentId = canSelectAgent && form.get('requested_agent_id') ? Number(form.get('requested_agent_id')) : undefined
    captureAnalyticsEvent('lead_form_submitted', { listing_id: listing.id, lead_type: 'showing_request' })
    mutation.mutate({
      listing_id: listing.id,
      lead_type: 'showing_request',
      name: String(form.get('name') || ''),
      email: String(form.get('email') || ''),
      phone: String(form.get('phone') || ''),
      preferred_contact_method: String(form.get('preferred_contact_method') || 'phone'),
      preferred_time: String(form.get('preferred_time') || 'morning'),
      preferred_tour_date: String(form.get('preferred_tour_date') || ''),
      tour_type: String(form.get('tour_type') || 'in_person'),
      source_campaign: currentUtmCampaign(),
      source_url: window.location.href,
      message: String(form.get('message') || ''),
      requested_agent_id: requestedAgentId,
      prequalified_status: String(form.get('prequalified_status') || ''),
      lender_name: String(form.get('lender_name') || ''),
      purchase_timeline: String(form.get('purchase_timeline') || ''),
      budget_min: String(form.get('budget_min') || ''),
      budget_max: String(form.get('budget_max') || ''),
      desired_villages: String(form.get('desired_villages') || ''),
      desired_beds: String(form.get('desired_beds') || ''),
      desired_baths: String(form.get('desired_baths') || ''),
      buyer_status: String(form.get('buyer_status') || ''),
      already_working_with_agent: String(form.get('already_working_with_agent') || ''),
      qualification_notes: String(form.get('qualification_notes') || ''),
      intent_session_token: currentLeadIntentSessionToken() || undefined,
    })
  }

  function handleAgentChange(value: string) {
    if (!canSelectAgent) return

    const nextAgentId = value ? Number(value) : null
    setAgentSelectionOverride({ listingId: listing.id, agentId: nextAgentId })

    if (nextAgentId) {
      storeSelectedAgentId(nextAgentId)
      captureAnalyticsEvent('agent_selected', { agent_id: nextAgentId, listing_id: listing.id, source: 'lead_modal' })
      recordLeadIntentEvent('agent_selected', { agent_id: nextAgentId, listing_id: listing.id, source: 'web', metadata: { surface: 'lead_modal' } })
    } else {
      captureAnalyticsEvent('agent_preference_skipped', { listing_id: listing.id, source: 'lead_modal' })
    }
  }

  return (
    <div className="fixed inset-0 z-[70] grid place-items-end bg-black/45 p-2 backdrop-blur-sm md:place-items-center md:p-4">
      <div role="dialog" aria-modal="true" aria-label="Showing request" className="safe-bottom max-h-[calc(100svh-1rem)] w-full max-w-4xl overflow-y-auto overscroll-contain rounded-[1.5rem] bg-white p-4 shadow-2xl md:max-h-[calc(100vh-2rem)] md:rounded-[2rem] md:p-8">
        {mutation.isSuccess ? (
          <div className="py-8 text-center">
            <CheckCircle2 className="mx-auto text-[#0f705e]" size={44} />
            <h2 className="mt-4 text-3xl font-semibold tracking-[-0.05em]">Inquiry captured</h2>
            <p className="mt-3 text-sm leading-6 text-[#66746f]">Your request has been received. The Hafa Homes team can follow up with next steps.</p>
            <button onClick={onClose} className="mt-6 w-full rounded-2xl bg-[var(--brand-primary)] px-4 py-3 text-sm font-bold text-white">Close</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="pb-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#0f705e] md:text-sm">Showing request</p>
                <h2 className="mt-1 text-2xl font-semibold tracking-[-0.05em] md:mt-2 md:text-3xl">Request a showing</h2>
              </div>
              <button type="button" onClick={onClose} className="rounded-full border border-[#d7ded9] px-3 py-2 text-sm font-bold">Close</button>
            </div>
            <div className="mt-4 rounded-3xl bg-[#f6f1e8] p-4 md:mt-5">
              <div className="flex items-center gap-4">
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[var(--brand-primary)] text-sm font-black text-[#f5c16c] md:h-16 md:w-16 md:text-base">
                  {selectedModalAgent ? agentInitials(selectedModalAgent) : 'HH'}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#0f705e]">Preferred agent</p>
                  <p className="text-base font-bold text-[#17211f] md:text-lg">{selectedModalAgent?.name || 'Brokerage team'}</p>
                  <p className="text-xs font-semibold text-[#66746f] md:text-sm">{selectedModalAgent?.brokerage?.name || 'No agent preference selected'}</p>
                  <p className="mt-1 text-xs font-semibold text-[#66746f] md:text-sm">Listed by {listing.agent_name || 'Listing agent'} · {listing.brokerage_name || 'Listing brokerage'}</p>
                  <p className="text-xs font-semibold text-[#66746f] md:text-sm">{listing.address}</p>
                </div>
              </div>
              {canSelectAgent && routingAgents.length > 0 ? (
                <label className="mt-4 grid gap-2 text-sm font-semibold text-[#304942]">
                  Preferred agent
                  <select name="requested_agent_id" value={effectiveSelectedAgentId ?? ''} onChange={(event) => handleAgentChange(event.target.value)} className="min-h-12 rounded-2xl border border-[#dce5df] bg-white px-4">
                    <option value="">Brokerage team / no preference for this request</option>
                    {routingAgents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
                  </select>
                </label>
              ) : isClerkEnabled && !isSignedIn ? (
                <div className="mt-4 rounded-2xl bg-white p-4 text-sm font-semibold leading-6 text-[#53645f]">
                  Sign in to choose a preferred agent. You can still send this showing request to the brokerage team without an account.
                </div>
              ) : null}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 md:mt-5">
              <label className="cursor-pointer">
                <input type="radio" name="tour_type" value="in_person" defaultChecked className="peer sr-only" />
                <span className="block rounded-2xl border border-[#d7ded9] px-4 py-3 text-center text-sm font-bold text-[#304942] peer-checked:border-[var(--brand-accent)] peer-checked:text-[var(--brand-accent)]">In Person</span>
              </label>
              <label className="cursor-pointer">
                <input type="radio" name="tour_type" value="virtual" className="peer sr-only" />
                <span className="block rounded-2xl border border-[#d7ded9] px-4 py-3 text-center text-sm font-bold text-[#304942] peer-checked:border-[var(--brand-accent)] peer-checked:text-[var(--brand-accent)]">Virtual</span>
              </label>
            </div>
            <div className="mt-4 grid grid-cols-4 gap-2 text-center text-xs font-bold text-[#53645f] md:mt-5">
              {tourDateOptions().map((day, index) => (
                <label key={day.value} className="cursor-pointer">
                  <input type="radio" name="preferred_tour_date" value={day.value} defaultChecked={index === 0} className="peer sr-only" />
                  <span className="block rounded-2xl border border-[#d7ded9] px-2 py-3 peer-checked:border-[var(--brand-accent)] peer-checked:text-[var(--brand-accent)]">{day.label}</span>
                </label>
              ))}
            </div>
            <div className="mt-4 grid gap-3 md:mt-5 md:grid-cols-2">
              <Input name="name" label="Name" defaultValue={profile?.full_name || ''} required />
              <Input name="email" label="Email" type="email" defaultValue={profile?.email || ''} required />
              <Input name="phone" label="Phone" defaultValue={searchProfile?.phone || profile?.phone || '+1671'} inputMode="tel" />
              <label className="grid gap-2 text-sm font-semibold text-[#304942]">
                Preferred contact
                <select name="preferred_contact_method" defaultValue={searchProfile?.preferred_contact_method || profile?.preferred_contact_method || 'phone'} className="min-h-12 rounded-2xl border border-[#dce5df] px-4">
                  {preferredContactOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              <label className="grid gap-2 text-sm font-semibold text-[#304942]">
                Select time
                <select name="preferred_time" defaultValue="flexible" className="min-h-12 rounded-2xl border border-[#dce5df] px-4">
                  {preferredTimeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              <details className="rounded-[1.5rem] border border-[#dce5df] bg-[#fbfaf6] md:col-span-2">
                <summary className="cursor-pointer list-none px-4 py-4 text-sm font-bold text-[var(--brand-primary)] marker:content-none">
                  <span className="flex items-center justify-between gap-4">
                    Tell the agent more <span className="text-xs font-semibold text-[#66746f]">Optional search and readiness details</span>
                  </span>
                </summary>
                <div className="border-t border-[#dce5df] p-3">
                  <QualificationFields defaultBudgetMax={String(Math.round(listing.price))} searchProfile={searchProfile} />
                </div>
              </details>
              <label className="grid gap-2 text-sm font-semibold text-[#304942] md:col-span-2">
                Message
                <textarea name="message" rows={4} className="rounded-2xl border border-[#dce5df] px-4 py-3" defaultValue={`I'm interested in ${listing.title}.`} />
              </label>
            </div>
            {mutation.isError && <p className="mt-3 text-sm font-semibold text-red-700">Unable to submit right now.</p>}
            <button disabled={mutation.isPending} className="mt-5 w-full rounded-2xl bg-[var(--brand-primary)] px-4 py-3 text-sm font-bold text-white disabled:opacity-60">
              {mutation.isPending ? 'Submitting...' : 'Send showing request'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

function Shell({ children, compact = false, mobileBottomPadding = true }: { children: React.ReactNode; compact?: boolean; mobileBottomPadding?: boolean }) {
  return (
    <main className={`min-h-screen bg-[#f6f1e8] text-[#17211f] md:pb-0 ${mobileBottomPadding ? 'pb-20' : 'pb-0'}`}>
      {compact && <div className="bg-[var(--brand-primary)] px-5 py-5 text-white"><div className="mx-auto max-w-7xl"><TopNav /></div></div>}
      {children}
      <MobileNav />
    </main>
  )
}

function TopNav() {
  const { isClerkEnabled, isSignedIn, userId } = useAuthContext()
  const { data: meData } = useQuery({
    queryKey: ['me', userId, 'public-nav'],
    queryFn: fetchMe,
    enabled: isClerkEnabled && isSignedIn && Boolean(userId),
    retry: false,
  })
  const showAdminLink = Boolean(meData?.user?.is_staff)

  return (
    <nav className="flex items-center justify-between">
      <Brand light />
      <div className="hidden items-center gap-5 text-sm font-semibold text-white/82 md:flex">
        <Link to="/villages">Villages</Link>
        <Link to="/agents">Agents</Link>
        <Link to="/military">Military</Link>
        <Link to="/saved">Saved</Link>
        <Link to="/account/requests">Requests</Link>
        <Link to="/account">Account</Link>
        {showAdminLink && <Link to="/admin" className="rounded-full bg-white/12 px-4 py-2 text-white">Admin</Link>}
        {isClerkEnabled && (
          <>
            <SignedOut>
              <SignInButton mode="modal"><button className="rounded-full border border-white/25 px-4 py-2 text-white">Sign in</button></SignInButton>
            </SignedOut>
            <SignedIn><UserButton /></SignedIn>
          </>
        )}
      </div>
      <button className="rounded-full border border-white/25 p-2 md:hidden"><Menu size={18} /></button>
    </nav>
  )
}

function MobileNav() {
  return (
    <nav data-mobile-nav className="safe-bottom fixed inset-x-0 bottom-0 z-50 border-t border-black/10 bg-white/90 px-4 pt-3 backdrop-blur md:hidden">
      <div className="mx-auto grid max-w-md grid-cols-5 text-center text-xs font-semibold text-[#53645f]">
        <Link to="/" className="flex flex-col items-center gap-1"><Home size={19} /> Search</Link>
        <Link to="/villages" className="flex flex-col items-center gap-1"><Map size={19} /> Villages</Link>
        <Link to="/agents" className="flex flex-col items-center gap-1"><UsersRound size={19} /> Agents</Link>
        <Link to="/military" className="flex flex-col items-center gap-1"><ShieldCheck size={19} /> Military</Link>
        <Link to="/saved" className="flex flex-col items-center gap-1"><Heart size={19} /> Saved</Link>
      </div>
    </nav>
  )
}

function SectionHeading({ kicker, title, action }: { kicker: string; title: string; action?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#7b8a84]">{kicker}</p>
        <h2 className="text-3xl font-semibold tracking-[-0.04em]">{title}</h2>
      </div>
      {action}
    </div>
  )
}

function ContentHeader({ kicker, title, description }: { kicker: string; title: string; description: string }) {
  return (
    <section className="mx-auto max-w-7xl px-5 py-10">
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#0f705e]">{kicker}</p>
      <h1 className="mt-3 max-w-4xl text-5xl font-semibold leading-none tracking-[-0.06em] md:text-7xl">{title}</h1>
      <p className="mt-5 max-w-2xl text-base leading-8 text-[#66746f]">{description}</p>
    </section>
  )
}

function SearchAside({ listings }: { listings: Listing[] }) {
  return (
    <aside className="space-y-4">
      <div className="rounded-[2rem] bg-[#173f38] p-6 text-white shadow-xl shadow-[#173f38]/15">
        <Waves className="text-[#bdebdc]" />
        <h2 className="mt-5 text-3xl font-semibold tracking-[-0.05em]">Search Guam by how people actually live here.</h2>
        <p className="mt-3 text-sm leading-6 text-white/75">Compare villages, base commute, furnished rentals, ocean views, and island-ready features in one focused search.</p>
      </div>
      <div className="rounded-[2rem] border border-black/5 bg-white p-5">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#7b8a84]">Market pulse</p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <MiniStat label="Shown" value={listings.length.toString()} />
          <MiniStat label="Villages" value="Guam" />
          <MiniStat label="Saved" value="On" />
          <MiniStat label="Tours" value="Ready" />
        </div>
      </div>
    </aside>
  )
}

function PropertyStats({ listing, large = false }: { listing: Listing; large?: boolean }) {
  const className = large ? 'mt-6 grid grid-cols-3 gap-3 text-sm font-semibold text-[#324640]' : 'mt-4 flex flex-wrap gap-4 text-sm font-semibold text-[#324640]'
  return (
    <div className={className}>
      <span className="inline-flex items-center gap-1"><BedDouble size={16} /> {listing.beds} beds</span>
      <span className="inline-flex items-center gap-1"><Bath size={16} /> {listing.baths} baths</span>
      <span className="inline-flex items-center gap-1"><Ruler size={16} /> {listing.square_feet?.toLocaleString()} sqft</span>
    </div>
  )
}

function FeaturePills({ features }: { features: Feature[] }) {
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {features.map((feature) => (
        <span key={feature.id} className="rounded-full bg-[#f6f1e8] px-3 py-1 text-xs font-semibold text-[#6b6254]">{feature.name}</span>
      ))}
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between gap-4 border-t border-[#edf0ec] pt-3"><dt className="text-[#7b8a84]">{label}</dt><dd className="font-semibold text-[#304942]">{value}</dd></div>
}

function StateCard({ children, tone = 'default' }: { children: React.ReactNode; tone?: 'default' | 'error' }) {
  return <p className={`rounded-2xl bg-white p-5 text-sm font-semibold ${tone === 'error' ? 'text-red-700' : 'text-[#53645f]'}`}>{children}</p>
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl bg-[#f6f1e8] p-4"><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#7b8a84]">{label}</p><p className="mt-1 text-xl font-bold tracking-[-0.04em]">{value}</p></div>
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="rounded-2xl bg-white/10 p-4"><p className="text-xs font-bold uppercase tracking-[0.16em] text-white/50">{label}</p><p className="mt-1 text-3xl font-bold tracking-[-0.05em]">{value}</p></div>
}

function Input({ label, labelClassName = '', className = '', ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string; labelClassName?: string }) {
  return <label className={`grid min-w-0 gap-2 text-sm font-semibold text-[#304942] ${labelClassName}`}>{label}<input {...props} className={`min-h-12 w-full min-w-0 rounded-2xl border border-[#dce5df] px-4 ${className}`} /></label>
}

export default App
