import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { SignedIn, SignedOut, SignInButton, UserButton } from '@clerk/clerk-react'
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
import { useMutation, useQuery } from '@tanstack/react-query'
import { authHeaders } from './lib/api'
import { useAuthContext } from './contexts/AuthContext'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'
const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN
const FALLBACK_LISTING_IMAGE = 'https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?auto=format&fit=crop&w=1400&q=80'

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

type Brokerage = {
  id: number
  name: string
  slug: string
  status?: string
  phone?: string
  website_url?: string
  app_display_name?: string
  compliance_disclaimer?: string
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
type AgentsResponse = { agents: Agent[] }
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
  listing?: { id: number; title: string; address?: string; price?: number; listing_kind?: 'sale' | 'rent'; village?: string; primary_photo_url?: string } | null
  brokerage?: Brokerage | null
  agent?: Agent | null
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
  showing_appointments?: ShowingAppointment[]
  notification_deliveries?: NotificationDelivery[]
  lead_notes?: LeadNote[]
  lead_tasks?: LeadTask[]
  lead_activities?: LeadActivity[]
  crm_summary?: CrmSummary
  listing?: { id: number; title: string; address?: string; price: number; listing_kind: 'sale' | 'rent'; property_type?: string; village: string; primary_photo_url?: string; brokerage?: Brokerage | null; agent?: Agent | null } | null
  brokerage?: Brokerage | null
  requested_agent?: Agent | null
  assigned_agent?: Agent | null
}

type LeadsResponse = { leads: Lead[]; assignable_agents: Agent[] }
type LeadResponse = { lead: Lead; assignable_agents: Agent[] }
type PaginationMeta = { page: number; per_page: number; total_count: number; total_pages: number }
type LeadNotesPageResponse = { lead_notes: LeadNote[]; pagination: PaginationMeta }
type LeadTasksPageResponse = { lead_tasks: LeadTask[]; pagination: PaginationMeta }
type LeadActivitiesPageResponse = { lead_activities: LeadActivity[]; pagination: PaginationMeta }
type MyLeadsResponse = { leads: Lead[] }
type ShowingAppointmentsResponse = { showing_appointments: ShowingAppointment[] }
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
type AuditEventsResponse = { audit_events: AuditEvent[] }
type SavedListingsResponse = { listing_ids: number[]; listings: Listing[] }
type SaveListingResponse = { listing: Listing; listing_id: number; saved: boolean }

type MeResponse = { user: CurrentUser }

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

function agentInitials(agent: Agent) {
  return agent.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('') || 'HH'
}

function listingBrokerageId(listing: Listing) {
  return listing.brokerage?.id ?? listing.agent?.brokerage_id ?? null
}

function agentBrokerageMatchesListing(agent: Agent, listing: Listing) {
  const brokerageId = listingBrokerageId(listing)
  return Boolean(brokerageId && agent.brokerage_id === brokerageId)
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
  const response = await fetch(`${API_URL}/api/v1/listings${query ? `?${query}` : ''}`)
  if (!response.ok) throw new Error('Unable to load listings')
  return response.json()
}

async function fetchListing(id: string): Promise<ListingResponse> {
  const response = await fetch(`${API_URL}/api/v1/listings/${id}`)
  if (!response.ok) throw new Error('Unable to load listing')
  return response.json()
}

async function fetchVillages(): Promise<VillagesResponse> {
  const response = await fetch(`${API_URL}/api/v1/villages`)
  if (!response.ok) throw new Error('Unable to load villages')
  return response.json()
}

async function fetchAgents(brokerageId?: number): Promise<AgentsResponse> {
  const query = brokerageId ? `?brokerage_id=${brokerageId}` : ''
  const response = await fetch(`${API_URL}/api/v1/agents${query}`)
  if (!response.ok) throw new Error('Unable to load agents')
  return response.json()
}

async function fetchMe(): Promise<MeResponse> {
  const response = await fetch(`${API_URL}/api/v1/me`, { headers: await authHeaders() })
  if (!response.ok) {
    throw new ApiFetchError('Unable to load current user', response.status)
  }
  return response.json()
}

async function updateMe(payload: Partial<Pick<CurrentUser, 'first_name' | 'last_name' | 'phone' | 'preferred_contact_method'>>): Promise<MeResponse> {
  const response = await fetch(`${API_URL}/api/v1/me`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify({ user: payload }),
  })
  if (!response.ok) throw new ApiFetchError(await apiErrorMessage(response, 'Unable to update profile'), response.status)
  return response.json()
}

async function deleteCurrentAccount(): Promise<{ deleted: boolean }> {
  const response = await fetch(`${API_URL}/api/v1/me`, { method: 'DELETE', headers: await authHeaders() })
  if (!response.ok) throw new ApiFetchError(await apiErrorMessage(response, 'Unable to delete account'), response.status)
  return response.json()
}

async function fetchSyncRuns(): Promise<SyncRunsResponse> {
  const response = await fetch(`${API_URL}/api/v1/data_sync_runs`, { headers: await authHeaders() })
  if (!response.ok) throw new Error('Unable to load sync runs')
  return response.json()
}

async function fetchLeads(params: { assigned_agent_id?: string } = {}): Promise<LeadsResponse> {
  const query = buildQuery(params)
  const response = await fetch(`${API_URL}/api/v1/leads${query ? `?${query}` : ''}`, { headers: await authHeaders() })
  if (!response.ok) throw new Error('Unable to load leads')
  return response.json()
}

async function fetchLead(id: string): Promise<LeadResponse> {
  const response = await fetch(`${API_URL}/api/v1/leads/${id}`, { headers: await authHeaders() })
  if (!response.ok) throw new Error('Unable to load lead')
  return response.json()
}

async function fetchMyLeads(): Promise<MyLeadsResponse> {
  const response = await fetch(`${API_URL}/api/v1/me/leads`, { headers: await authHeaders() })
  if (!response.ok) throw new ApiFetchError(await apiErrorMessage(response, 'Unable to load your requests'), response.status)
  return response.json()
}

async function fetchAdminDashboard(): Promise<AdminDashboardResponse> {
  const response = await fetch(`${API_URL}/api/v1/admin/dashboard`, { headers: await authHeaders() })
  if (!response.ok) throw new Error('Unable to load admin dashboard')
  return response.json()
}

async function fetchShowingAppointments(): Promise<ShowingAppointmentsResponse> {
  const response = await fetch(`${API_URL}/api/v1/showing_appointments`, { headers: await authHeaders() })
  if (!response.ok) throw new Error('Unable to load showing schedule')
  return response.json()
}

async function fetchAdminUsers(): Promise<AdminUsersResponse> {
  const response = await fetch(`${API_URL}/api/v1/admin/users`, { headers: await authHeaders() })
  if (!response.ok) throw new ApiFetchError(await apiErrorMessage(response, 'Unable to load users'), response.status)
  return response.json()
}

async function fetchAuditEvents(): Promise<AuditEventsResponse> {
  const response = await fetch(`${API_URL}/api/v1/admin/audit_events`, { headers: await authHeaders() })
  if (!response.ok) throw new ApiFetchError(await apiErrorMessage(response, 'Unable to load audit history'), response.status)
  return response.json()
}

async function createAdminUser(payload: Record<string, unknown>): Promise<{ user: AdminUser }> {
  const response = await fetch(`${API_URL}/api/v1/admin/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify({ user: payload }),
  })
  if (!response.ok) throw new ApiFetchError(await apiErrorMessage(response, 'Unable to create user'), response.status)
  return response.json()
}

async function updateLead(id: number, payload: LeadUpdatePayload): Promise<LeadResponse> {
  const response = await fetch(`${API_URL}/api/v1/leads/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify({ lead: payload }),
  })
  if (!response.ok) throw new ApiFetchError(await apiErrorMessage(response, 'Unable to update lead'), response.status)
  return response.json()
}

async function createLeadNote(id: number, payload: { body: string }): Promise<{ lead_note: LeadNote; lead: Lead }> {
  const response = await fetch(`${API_URL}/api/v1/leads/${id}/notes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify({ lead_note: payload }),
  })
  if (!response.ok) throw new ApiFetchError(await apiErrorMessage(response, 'Unable to add note'), response.status)
  return response.json()
}

async function updateLeadNote(id: number, payload: Partial<Pick<LeadNote, 'body'>> & { archived?: boolean }): Promise<{ lead_note: LeadNote; lead: Lead }> {
  const response = await fetch(`${API_URL}/api/v1/lead_notes/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify({ lead_note: payload }),
  })
  if (!response.ok) throw new ApiFetchError(await apiErrorMessage(response, 'Unable to update note'), response.status)
  return response.json()
}

async function fetchLeadNotesPage(leadId: number, page: number, perPage = 10): Promise<LeadNotesPageResponse> {
  const response = await fetch(`${API_URL}/api/v1/leads/${leadId}/notes?page=${page}&per_page=${perPage}`, { headers: await authHeaders() })
  if (!response.ok) throw new ApiFetchError(await apiErrorMessage(response, 'Unable to load notes'), response.status)
  return response.json()
}

async function fetchLeadTasksPage(leadId: number, status: 'open' | 'completed' | 'archived', page: number, perPage = 10): Promise<LeadTasksPageResponse> {
  const response = await fetch(`${API_URL}/api/v1/leads/${leadId}/tasks?status=${status}&page=${page}&per_page=${perPage}`, { headers: await authHeaders() })
  if (!response.ok) throw new ApiFetchError(await apiErrorMessage(response, 'Unable to load tasks'), response.status)
  return response.json()
}

async function fetchLeadActivitiesPage(leadId: number, page: number, perPage = 10): Promise<LeadActivitiesPageResponse> {
  const response = await fetch(`${API_URL}/api/v1/leads/${leadId}/activities?page=${page}&per_page=${perPage}`, { headers: await authHeaders() })
  if (!response.ok) throw new ApiFetchError(await apiErrorMessage(response, 'Unable to load activity'), response.status)
  return response.json()
}

async function createLeadTask(id: number, payload: { title: string; notes?: string; due_at?: string }): Promise<{ lead_task: LeadTask; lead: Lead }> {
  const response = await fetch(`${API_URL}/api/v1/leads/${id}/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify({ lead_task: payload }),
  })
  if (!response.ok) throw new ApiFetchError(await apiErrorMessage(response, 'Unable to add task'), response.status)
  return response.json()
}

async function updateLeadTask(id: number, payload: Partial<Pick<LeadTask, 'title' | 'notes' | 'status' | 'due_at'>>): Promise<{ lead_task: LeadTask; lead: Lead }> {
  const response = await fetch(`${API_URL}/api/v1/lead_tasks/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify({ lead_task: payload }),
  })
  if (!response.ok) throw new ApiFetchError(await apiErrorMessage(response, 'Unable to update task'), response.status)
  return response.json()
}

async function sendLeadNotification(id: number, payload: { channel: 'email' | 'sms'; recipient_role: 'consumer' | 'agent'; event_name?: string; subject?: string; title?: string; body?: string }): Promise<{ notification_delivery: NotificationDelivery }> {
  const response = await fetch(`${API_URL}/api/v1/leads/${id}/notifications`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify({ notification: payload }),
  })
  if (!response.ok) throw new ApiFetchError(await apiErrorMessage(response, 'Unable to queue notification'), response.status)
  return response.json()
}

async function createShowingAppointment(payload: Partial<ShowingAppointment> & { lead_id: number }): Promise<{ showing_appointment: ShowingAppointment; lead: Lead }> {
  const response = await fetch(`${API_URL}/api/v1/showing_appointments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify({ showing_appointment: payload }),
  })
  if (!response.ok) throw new ApiFetchError(await apiErrorMessage(response, 'Unable to schedule showing'), response.status)
  return response.json()
}

async function updateShowingAppointment(id: number, payload: Partial<ShowingAppointment>): Promise<{ showing_appointment: ShowingAppointment; lead: Lead }> {
  const response = await fetch(`${API_URL}/api/v1/showing_appointments/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify({ showing_appointment: payload }),
  })
  if (!response.ok) throw new ApiFetchError(await apiErrorMessage(response, 'Unable to update showing'), response.status)
  return response.json()
}

async function updateAdminUser(id: number, payload: Record<string, unknown>): Promise<{ user: AdminUser }> {
  const response = await fetch(`${API_URL}/api/v1/admin/users/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify({ user: payload }),
  })
  if (!response.ok) throw new ApiFetchError(await apiErrorMessage(response, 'Unable to update user'), response.status)
  return response.json()
}

async function fetchSavedListings(): Promise<SavedListingsResponse> {
  const response = await fetch(`${API_URL}/api/v1/me/saved_listings`, { headers: await authHeaders() })
  if (!response.ok) throw new ApiFetchError(await apiErrorMessage(response, 'Unable to load saved homes'), response.status)
  return response.json()
}

async function saveListingForUser(listingId: number): Promise<SaveListingResponse> {
  const response = await fetch(`${API_URL}/api/v1/listings/${listingId}/save`, { method: 'POST', headers: await authHeaders() })
  if (!response.ok) throw new ApiFetchError(await apiErrorMessage(response, 'Unable to save home'), response.status)
  return response.json()
}

async function removeSavedListingForUser(listingId: number): Promise<{ listing_id: number; saved: boolean }> {
  const response = await fetch(`${API_URL}/api/v1/listings/${listingId}/save`, { method: 'DELETE', headers: await authHeaders() })
  if (!response.ok) throw new ApiFetchError(await apiErrorMessage(response, 'Unable to remove saved home'), response.status)
  return response.json()
}

async function saveSearch(payload: { name: string; email: string; alert_frequency: string; filters: Record<string, string> }) {
  const response = await fetch(`${API_URL}/api/v1/saved_searches`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ saved_search: payload }),
  })
  if (!response.ok) throw new Error('Unable to save search')
  return response.json()
}

async function createLead(payload: LeadPayload) {
  const response = await fetch(`${API_URL}/api/v1/leads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify({ lead: payload }),
  })
  if (!response.ok) throw new ApiFetchError(await apiErrorMessage(response, 'Unable to submit lead'), response.status)
  return response.json()
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

function formatDateTime(value?: string) {
  if (!value) return 'Not recorded'
  return new Date(value).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function currency(value: number, kind: string) {
  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value)

  return kind === 'rent' ? `${formatted}/mo` : formatted
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
              <button className="mt-6 rounded-full bg-[#0f3d35] px-6 py-3 text-sm font-bold text-white shadow-lg shadow-[#0f3d35]/20">Sign in</button>
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
              <button type="button" onClick={() => refetch()} disabled={isFetching} className="rounded-full bg-[#0f3d35] px-6 py-3 text-sm font-bold text-white shadow-lg shadow-[#0f3d35]/20 disabled:opacity-60">
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
  return (
    <>
      <PostHogPageView />
      <Routes>
        <Route path="/" element={<SearchPage />} />
        <Route path="/listings/:id" element={<ListingDetailPage />} />
        <Route path="/villages" element={<VillagesPage />} />
        <Route path="/villages/:slug" element={<VillageDetailPage />} />
        <Route path="/agents" element={<AgentsPage />} />
        <Route path="/military" element={<MilitaryPage />} />
        <Route path="/saved" element={<SavedPage />} />
        <Route path="/account" element={<AccountPage />} />
        <Route path="/account/requests" element={<RequestsPage />} />
        <Route path="/requests" element={<RequestsPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/open" element={<OpenInAppPage />} />
        <Route path="/admin" element={<RequireStaff><AdminDashboardPage /></RequireStaff>} />
        <Route path="/admin/sync" element={<RequireStaff><SyncPage /></RequireStaff>} />
        <Route path="/admin/leads" element={<RequireStaff><LeadsPage /></RequireStaff>} />
        <Route path="/admin/leads/:id" element={<RequireStaff><LeadDetailPage /></RequireStaff>} />
        <Route path="/admin/showings" element={<RequireStaff><AdminShowingsPage /></RequireStaff>} />
        <Route path="/admin/users" element={<RequireStaff><AdminUsersPage /></RequireStaff>} />
        <Route path="/admin/audit" element={<RequireStaff><AdminAuditPage /></RequireStaff>} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </>
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
          <Link to={target} className="mt-6 inline-flex rounded-full bg-[#0f3d35] px-6 py-3 text-sm font-bold text-white">Continue on web</Link>
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
            <Link to="/" className="rounded-full bg-[#0f3d35] px-5 py-3 text-sm font-bold text-white">Search homes</Link>
            <Link to="/account/requests" className="rounded-full border border-[#d7ded9] px-5 py-3 text-sm font-bold text-[#0f3d35]">My requests</Link>
          </div>
        </div>
      </section>
    </Shell>
  )
}

function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [showFilters, setShowFilters] = useState(false)
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list')
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

  const { data, isLoading, isError } = useQuery({
    queryKey: ['listings', kind, village, propertyType, features, beds, maxPrice],
    queryFn: () => fetchListings({ kind, village, property_type: propertyType, features, beds, max_price: maxPrice }),
  })
  const { data: villagesData } = useQuery({ queryKey: ['villages'], queryFn: fetchVillages })

  const listings = data?.listings ?? []
  const featureList = features ? features.split(',').filter(Boolean) : []

  useEffect(() => {
    if (window.matchMedia('(max-width: 767px)').matches) {
      setViewMode('map')
    }
  }, [])

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
  }

  function toggleFeature(slug: string) {
    const nextFeatures = featureList.includes(slug)
      ? featureList.filter((item) => item !== slug)
      : [...featureList, slug]
    setParam('features', nextFeatures.join(','))
  }

  function clearMobileFilters() {
    const next = new URLSearchParams(searchParams)
    ;['village', 'property_type', 'beds', 'max_price', 'features'].forEach((key) => next.delete(key))
    setSearchParams(next)
    captureAnalyticsEvent('search_filter_cleared', { listing_kind: kind, surface: 'mobile_filter_sheet' })
  }

  return (
    <Shell mobileBottomPadding={viewMode !== 'map'}>
      <div ref={mobileHeaderRef}>
        <MobileAppSearchHeader
          kind={kind}
          viewMode={viewMode}
          listingsCount={listings.length}
          onKindChange={(value) => setParam('kind', value)}
          onViewModeChange={(value) => {
            setViewMode(value)
            captureAnalyticsEvent('search_view_changed', { view_mode: value, surface: 'mobile_header' })
          }}
          onFilterClick={() => setShowFilters(true)}
          onMenuClick={() => setMobileMenuOpen(true)}
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
        <div className="rounded-[2rem] border border-black/5 bg-white p-4 shadow-2xl shadow-[#0f3d35]/10">
          <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto] lg:items-center">
            <div className="flex items-center gap-3 rounded-2xl border border-[#dce5df] px-4 py-3 text-[#50625e]">
              <Search size={18} />
              <span className="text-sm">Search village, address, base, or feature</span>
            </div>
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
                    active ? 'bg-[#0f3d35] text-white' : 'bg-[#f6f1e8] text-[#53645f] hover:bg-[#e8ded0]'
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
                  <button onClick={() => setSaveSearchOpen(true)} className="inline-flex items-center gap-2 rounded-full border border-[#d7ded9] bg-white px-4 py-2 text-sm font-semibold"><Bell size={16} /> Save search</button>
                  <button onClick={() => {
                    const nextViewMode = viewMode === 'list' ? 'map' : 'list'
                    setViewMode(nextViewMode)
                    captureAnalyticsEvent('search_view_changed', { view_mode: nextViewMode, surface: 'desktop_toolbar' })
                  }} className="inline-flex items-center gap-2 rounded-full border border-[#d7ded9] bg-white px-4 py-2 text-sm font-semibold"><Map size={16} /> {viewMode === 'list' ? 'Map view' : 'List view'}</button>
                  <Link to="/account/requests" className="inline-flex items-center gap-2 rounded-full border border-[#d7ded9] bg-white px-4 py-2 text-sm font-semibold"><MessageSquare size={16} /> My requests</Link>
                </div>
              }
            />
          </div>

          {isLoading && <StateCard>Loading listings...</StateCard>}
          {isError && <StateCard tone="error">We could not load listings right now. Please try again shortly.</StateCard>}
          {!isLoading && listings.length === 0 && <StateCard>No listings match those filters yet.</StateCard>}

          {viewMode === 'map' ? (
            fullMapOpen ? (
              <div style={mobileMapHeight ? { height: mobileMapHeight } : undefined} className="h-[calc(100svh-330px)] rounded-none border border-black/5 bg-[#dbe8df] md:h-auto md:min-h-[760px] md:rounded-[2rem]" />
            ) : (
              <MapPanel listings={listings} onExpand={() => setFullMapOpen(true)} mobileMapHeight={mobileMapHeight} />
            )
          ) : (
            <div className="grid gap-4">
              {listings.map((listing) => <ListingCard key={listing.id} listing={listing} />)}
            </div>
          )}

          {viewMode === 'list' && (
            <button onClick={() => setSaveSearchOpen(true)} className="mt-5 w-full rounded-2xl bg-[#0f3d35] px-4 py-3 text-sm font-bold text-white md:hidden">Save this search</button>
          )}
        </div>

        {viewMode === 'list' && <SearchAside listings={listings} />}
      </section>
      <SaveSearchModal
        open={saveSearchOpen}
        onClose={() => setSaveSearchOpen(false)}
        filters={{ kind, village, property_type: propertyType, features, beds, max_price: maxPrice }}
      />
      <FullMapModal open={fullMapOpen} onClose={() => setFullMapOpen(false)} listings={listings} />
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
}: {
  kind: 'sale' | 'rent'
  viewMode: 'list' | 'map'
  listingsCount: number
  onKindChange: (value: 'sale' | 'rent') => void
  onViewModeChange: (value: 'list' | 'map') => void
  onFilterClick: () => void
  onMenuClick: () => void
}) {
  return (
    <header className="safe-top sticky top-0 z-40 border-b border-white/10 bg-[#0f3d35] text-white shadow-xl shadow-[#0f3d35]/20 md:hidden">
      <div className="px-4 pb-2 pt-2">
        <div className="flex items-center justify-between gap-3">
          <Brand light />
          <button onClick={onMenuClick} className="grid h-11 w-11 place-items-center rounded-full border border-white/20 text-white/86">
            <Menu size={22} />
          </button>
        </div>
        <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
          <div className="flex min-h-11 items-center gap-2 rounded-2xl bg-white px-3 text-[#53645f]">
            <Search size={17} />
            <span className="text-sm font-semibold">Address, village, or listing ID</span>
          </div>
          <button className="rounded-2xl bg-[#e99f3e] px-4 text-sm font-bold text-[#25170b]">Save</button>
        </div>
        <div className="mt-2 grid grid-cols-3 gap-2 text-sm font-bold">
          <button onClick={onFilterClick} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-2xl bg-white/10 text-white/86"><SlidersHorizontal size={17} /> Filter</button>
          <button onClick={() => onViewModeChange('map')} className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-2xl ${viewMode === 'map' ? 'bg-white text-[#0f3d35]' : 'bg-white/10 text-white/86'}`}><Map size={17} /> Map</button>
          <button onClick={() => onViewModeChange('list')} className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-2xl ${viewMode === 'list' ? 'bg-white text-[#0f3d35]' : 'bg-white/10 text-white/86'}`}><Menu size={17} /> List</button>
        </div>
        <div className="mt-2 flex items-center justify-between gap-3 rounded-2xl bg-white/10 p-1 text-sm font-bold">
          {(['sale', 'rent'] as const).map((option) => (
            <button
              key={option}
              onClick={() => onKindChange(option)}
              className={`min-h-9 flex-1 rounded-xl capitalize ${kind === option ? 'bg-white text-[#0f3d35]' : 'text-white/75'}`}
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
                  className={`rounded-full px-3 py-2 text-xs font-semibold ${active ? 'bg-[#0f3d35] text-white' : 'bg-[#f6f1e8] text-[#53645f]'}`}
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
          <button type="button" onClick={onClose} className="rounded-2xl bg-[#0f3d35] px-4 py-3 text-sm font-bold text-white">
            Show results
          </button>
        </div>
      </div>
    </div>
  )
}

function HeroHeader({ kind, onKindChange }: { kind: 'sale' | 'rent'; onKindChange: (value: 'sale' | 'rent') => void }) {
  return (
    <section className="relative overflow-hidden bg-[#0f3d35] px-5 pb-12 pt-5 text-white md:pb-14 md:pt-6">
      <div className="absolute inset-0 opacity-30 [background:radial-gradient(circle_at_20%_20%,#79d0b2,transparent_28%),radial-gradient(circle_at_85%_10%,#f5c16c,transparent_24%),linear-gradient(135deg,#0f3d35,#071b18)]" />
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
          </div>
          <div className="rounded-[2rem] border border-white/15 bg-white/10 p-4 backdrop-blur">
            <div className="flex rounded-full bg-black/20 p-1">
              {(['sale', 'rent'] as const).map((option) => (
                <button
                  key={option}
                  onClick={() => onKindChange(option)}
                  className={`flex-1 rounded-full px-5 py-3 text-sm font-semibold capitalize transition ${kind === option ? 'bg-white text-[#0f3d35] shadow' : 'text-white/80'}`}
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

function ListingCard({ listing }: { listing: Listing }) {
  const { isClerkEnabled, isSignedIn, userId } = useAuthContext()
  const { data: savedData, refetch: refetchSaved } = useQuery({ queryKey: ['saved-listings', userId], queryFn: fetchSavedListings, enabled: isClerkEnabled && isSignedIn })
  const [optimisticSaved, setOptimisticSaved] = useState(false)
  const isSaved = savedData?.listing_ids?.includes(listing.id) ?? optimisticSaved
  const saveMutation = useMutation({
    mutationFn: () => isSaved ? removeSavedListingForUser(listing.id) : saveListingForUser(listing.id),
    onMutate: () => setOptimisticSaved((current) => !current),
    onSuccess: () => refetchSaved(),
    onError: () => setOptimisticSaved((current) => !current),
  })

  const heartButton = (
    <button
      onClick={isSignedIn ? () => {
        const nextSaved = !isSaved
        captureAnalyticsEvent('listing_saved_toggled', { listing_id: listing.id, saved: nextSaved, source: 'listing_card' })
        saveMutation.mutate()
      } : undefined}
      className={`rounded-full border p-2 ${isSaved ? 'border-[#0f3d35] bg-[#e9f5ef] text-[#0f3d35]' : 'border-[#d7ded9] text-[#53645f]'}`}
      aria-label={isSaved ? 'Saved listing' : 'Save listing'}
    >
      <Heart size={17} fill={isSaved ? '#0f3d35' : 'none'} />
    </button>
  )

  return (
    <article className="group overflow-hidden rounded-[1.7rem] border border-black/5 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-xl hover:shadow-[#0f3d35]/10 md:grid md:grid-cols-[240px_1fr]">
      <Link to={`/listings/${listing.id}`} onClick={() => captureAnalyticsEvent('listing_opened', { listing_id: listing.id, source: 'listing_image' })} className="block overflow-hidden">
        <img src={listing.primary_photo_url} onError={(event) => { event.currentTarget.onerror = null; event.currentTarget.src = FALLBACK_LISTING_IMAGE }} alt="" className="h-56 w-full object-cover transition duration-500 group-hover:scale-105 md:h-full" />
      </Link>
      <div className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-2xl font-bold tracking-[-0.04em]">{currency(listing.price, listing.listing_kind)}</p>
            <Link to={`/listings/${listing.id}`} onClick={() => captureAnalyticsEvent('listing_opened', { listing_id: listing.id, source: 'listing_title' })} className="mt-1 block text-lg font-semibold transition hover:text-[#0f705e]">{listing.title}</Link>
            <p className="mt-1 flex items-center gap-1 text-sm text-[#66746f]"><MapPin size={14} /> {listing.village.name} · {listing.address}</p>
          </div>
          <span className="rounded-full bg-[#e9f5ef] px-3 py-1 text-xs font-bold uppercase tracking-wide text-[#0f705e]">{listing.listing_kind}</span>
        </div>
        <PropertyStats listing={listing} />
        <FeaturePills features={listing.features.slice(0, 4)} />
        <div className="mt-5 flex items-center justify-between">
          <Link to={`/listings/${listing.id}`} onClick={() => captureAnalyticsEvent('listing_opened', { listing_id: listing.id, source: 'listing_card' })} className="inline-flex items-center gap-2 text-sm font-bold text-[#0f3d35]">View details <ChevronRight size={16} /></Link>
          {isSignedIn ? heartButton : <SignInButton mode="modal">{heartButton}</SignInButton>}
        </div>
      </div>
    </article>
  )
}

function ListingDetailPage() {
  const { id = '' } = useParams()
  const [detailParams] = useSearchParams()
  const fromAdmin = detailParams.get('from') === 'admin'
  const adminLeadId = detailParams.get('lead_id')
  const adminBackPath = adminLeadId ? `/admin/leads/${adminLeadId}` : '/admin/leads'
  const [leadOpen, setLeadOpen] = useState(false)
  const [priceTrackerOpen, setPriceTrackerOpen] = useState(false)
  const { isClerkEnabled, isSignedIn, userId } = useAuthContext()
  const [localSaved, setLocalSaved] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [photoIndex, setPhotoIndex] = useState(0)
  const { data, isLoading, isError } = useQuery({ queryKey: ['listing', id], queryFn: () => fetchListing(id), enabled: Boolean(id) })
  const { data: savedData, refetch: refetchSaved } = useQuery({ queryKey: ['saved-listings', userId], queryFn: fetchSavedListings, enabled: isClerkEnabled && isSignedIn })
  const listing = data?.listing
  const saved = listing ? (savedData?.listing_ids?.includes(listing.id) ?? localSaved) : false
  const saveMutation = useMutation({
    mutationFn: () => listing && saved ? removeSavedListingForUser(listing.id) : listing ? saveListingForUser(listing.id) : Promise.reject(new Error('No listing loaded')),
    onMutate: () => setLocalSaved((current) => !current),
    onSuccess: () => refetchSaved(),
    onError: () => setLocalSaved((current) => !current),
  })
  const photos = listing?.photos?.length ? listing.photos : listing ? [{ id: 0, url: listing.primary_photo_url, position: 1, alt_text: listing.title }] : []

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
          <div className="mobile-detail-header sticky top-0 z-40 border-b border-white/10 bg-[#0f3d35] px-4 pb-4 text-white shadow-xl shadow-[#0f3d35]/15 md:hidden">
            <div className="flex items-center justify-between gap-3">
              <Link to="/" className="inline-flex min-h-12 items-center gap-2 rounded-full bg-white/10 px-4 text-sm font-bold hover:bg-white/15 active:scale-[0.98]"><ArrowLeft size={18} /> Search</Link>
              <div className="flex items-center gap-2">
                <button onClick={() => {
                  setLeadOpen(true)
                  captureAnalyticsEvent('lead_modal_opened', { listing_id: listing.id, source: 'mobile_header' })
                }} className="min-h-12 rounded-2xl bg-[#e99f3e] px-5 text-sm font-bold text-[#25170b] hover:bg-[#f2ad4e] active:scale-[0.98]">Request</button>
                <button onClick={() => setMenuOpen(true)} className="grid h-12 w-12 place-items-center rounded-full bg-white/10 hover:bg-white/15 active:scale-[0.98]"><Menu size={20} /></button>
              </div>
            </div>
          </div>

          <div className="hidden bg-[#0f3d35] px-5 py-5 text-white md:block"><div className="mx-auto max-w-7xl"><TopNav /></div></div>
          {fromAdmin && (
            <div className="border-b border-[#eadfce] bg-[#fff8ea] px-5 py-3">
              <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 text-sm font-bold text-[#304942]">
                <span>You are viewing this public listing from the admin CRM.</span>
                <Link to={adminBackPath} className="inline-flex items-center gap-2 rounded-full bg-[#0f3d35] px-4 py-2 text-white"><ArrowLeft size={16} /> Back to lead</Link>
              </div>
            </div>
          )}

          <section className="mx-auto max-w-7xl md:px-5 md:py-6">
            <Link to={fromAdmin ? adminBackPath : '/'} className="mb-6 hidden items-center gap-2 text-sm font-bold text-[#0f705e] md:inline-flex"><ArrowLeft size={16} /> {fromAdmin ? 'Back to lead' : 'Back to search'}</Link>
            <div className="grid gap-6 lg:grid-cols-[1fr_390px]">
              <div>
                <div className="relative mx-4 mt-5 overflow-hidden rounded-[2rem] bg-[#0f3d35] shadow-xl shadow-[#0f3d35]/10 md:mx-0 md:mt-0">
                  <img
                    src={photos[photoIndex]?.url || listing.primary_photo_url}
                    onError={(event) => { event.currentTarget.onerror = null; event.currentTarget.src = FALLBACK_LISTING_IMAGE }}
                    alt=""
                    className="h-[40svh] min-h-[300px] w-full object-cover md:h-[560px]"
                  />
                  {photos.length > 1 && (
                    <>
                      <button onClick={() => setPhotoIndex((photoIndex - 1 + photos.length) % photos.length)} className="absolute left-3 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-[#0f3d35] shadow-lg hover:bg-white active:scale-95"><ChevronLeft size={22} /></button>
                      <button onClick={() => setPhotoIndex((photoIndex + 1) % photos.length)} className="absolute right-3 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-[#0f3d35] shadow-lg hover:bg-white active:scale-95"><ChevronRightIcon size={22} /></button>
                    </>
                  )}
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-[#0f3d35]/70 to-transparent p-4 text-center text-sm font-bold text-white">
                    {photos.length > 1 ? `${photoIndex + 1} of ${photos.length}` : '1 photo'}
                  </div>
                </div>

                <div className="relative z-10 mx-4 mt-5 rounded-[2rem] bg-white p-5 shadow-xl shadow-[#0f3d35]/10 md:mx-0 md:mt-6 md:p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-4xl font-semibold tracking-[-0.06em] md:text-5xl">{currency(listing.price, listing.listing_kind)}</p>
                      <h1 className="mt-2 text-xl font-semibold leading-snug tracking-[-0.03em] md:text-4xl">{listing.address}</h1>
                      <p className="mt-1 text-sm font-semibold text-[#66746f]">{listing.village.name} · {listing.property_type}</p>
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
                  <FeaturePills features={listing.features} />
                  {listing.listing_kind === 'sale' && <WebMortgageCalculator listing={listing} />}
                  <LocalIntelPanel listing={listing} />
                  {listing.brokerage?.compliance_disclaimer && <p className="mt-6 rounded-2xl bg-[#f6f1e8] p-4 text-xs font-semibold leading-6 text-[#66746f]">{listing.brokerage.compliance_disclaimer}</p>}
                </div>
              </div>

              <aside className="hidden lg:sticky lg:top-6 lg:block lg:self-start">
                <div className="rounded-[2rem] border border-black/5 bg-white p-6 shadow-xl shadow-[#0f3d35]/10">
                  <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#7b8a84]">Request info</p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">Ask about this property</h2>
                  <p className="mt-3 text-sm leading-6 text-[#66746f]">Schedule a tour, track price changes, or save this listing for later.</p>
                  <button onClick={() => {
                    setLeadOpen(true)
                    captureAnalyticsEvent('lead_modal_opened', { listing_id: listing.id, source: 'desktop_aside' })
                  }} className="mt-5 w-full rounded-2xl bg-[#0f3d35] px-4 py-3 text-sm font-bold text-white">Request a showing</button>
                  <button onClick={() => {
                    setPriceTrackerOpen(true)
                    captureAnalyticsEvent('price_tracker_opened', { listing_id: listing.id, source: 'desktop_aside' })
                  }} className="mt-3 w-full rounded-2xl border border-[#d7ded9] px-4 py-3 text-sm font-bold text-[#0f3d35]">Add price alert</button>
                  {isSignedIn ? (
                    <button onClick={() => saveMutation.mutate()} className="mt-3 w-full rounded-2xl border border-[#d7ded9] px-4 py-3 text-sm font-bold text-[#0f3d35]">{saved ? 'Remove saved home' : 'Save home'}</button>
                  ) : (
                    <SignInButton mode="modal"><button className="mt-3 w-full rounded-2xl border border-[#d7ded9] px-4 py-3 text-sm font-bold text-[#0f3d35]">Sign in to save</button></SignInButton>
                  )}
                  <dl className="mt-6 space-y-3 text-sm">
                    <InfoRow label="Listing ID" value={listing.external_id || `HH-${listing.id}`} />
                    <InfoRow label="Agent" value={listing.agent_name || 'Hafa Homes Team'} />
                    <InfoRow label="Brokerage" value={listing.brokerage_name || 'Hafa Homes'} />
                  </dl>
                </div>
              </aside>
            </div>
          </section>

          <nav className="safe-bottom fixed inset-x-0 bottom-0 z-50 mx-4 mb-3 grid grid-cols-3 rounded-[1.5rem] border border-black/5 bg-white/95 px-3 pt-3 text-center text-xs font-bold text-[#0f3d35] shadow-2xl shadow-[#0f3d35]/15 backdrop-blur md:hidden">
            <button onClick={shareListing} className="flex min-h-16 flex-col items-center justify-center gap-1"><Share2 size={23} /> Share</button>
            <button onClick={() => {
              setPriceTrackerOpen(true)
              captureAnalyticsEvent('price_tracker_opened', { listing_id: listing.id, source: 'mobile_action_bar' })
            }} className="flex min-h-16 flex-col items-center justify-center gap-1"><TrendingUp size={23} /> Price alert</button>
            {isSignedIn ? (
              <button onClick={() => {
                captureAnalyticsEvent('listing_saved_toggled', { listing_id: listing.id, saved: !saved })
                saveMutation.mutate()
              }} className="flex min-h-16 flex-col items-center justify-center gap-1"><Heart size={25} fill={saved ? '#0f3d35' : 'none'} /> {saved ? 'Saved' : 'Save'}</button>
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

function DetailStat({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <div className="rounded-2xl bg-[#f6f1e8] p-3 ring-1 ring-[#eadfce] md:p-3">
      <div className="mx-auto grid h-9 w-9 place-items-center text-[#0f3d35] [&_svg]:h-7 [&_svg]:w-7">{icon}</div>
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
  const intel = listing.village.local_intel
  if (!intel || Object.keys(intel).length === 0) return null

  return (
    <div className="mt-6 rounded-[1.75rem] border border-[#cfe4da] bg-[#e9f5ef] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#0f705e]">Local intel</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-[-0.05em]">Around {listing.village.name}</h2>
        </div>
        {listing.village.region && <span className="rounded-full bg-white px-4 py-2 text-xs font-bold uppercase tracking-[0.12em] text-[#0f3d35]">{listing.village.region}</span>}
      </div>
      {intel.summary && <p className="mt-4 text-base font-semibold leading-7 text-[#53645f]">{intel.summary}</p>}
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
          <Link key={village.id} to={`/villages/${village.slug}`} className="group rounded-[2rem] bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-xl hover:shadow-[#0f3d35]/10">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#0f705e]">{village.region}</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.05em]">{village.name}</h2>
            <p className="mt-3 line-clamp-3 text-sm leading-6 text-[#66746f]">{village.description}</p>
            <p className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-[#0f3d35]">Explore listings <ChevronRight size={16} /></p>
          </Link>
        ))}
      </section>
    </Shell>
  )
}

function AgentsPage() {
  const { data, isLoading, isError } = useQuery({ queryKey: ['agents'], queryFn: () => fetchAgents() })
  const [selectedAgentId, setSelectedAgentId] = useState<number | null>(() => storedSelectedAgentId())
  const agents = data?.agents ?? []

  function selectAgent(agent: Agent) {
    setSelectedAgentId(agent.id)
    storeSelectedAgentId(agent.id)
    captureAnalyticsEvent('agent_selected', { agent_id: agent.id, brokerage_id: agent.brokerage_id, source: 'agents_page' })
  }

  function clearSelectedAgent() {
    setSelectedAgentId(null)
    storeSelectedAgentId(null)
    captureAnalyticsEvent('agent_selection_cleared', { source: 'agents_page' })
  }

  return (
    <Shell compact>
      <ContentHeader
        kicker="Agent network"
        title="Choose who you want to work with."
        description="Browse active brokerage agents, pick a preferred contact, and Hafa Homes will route future showing requests to that agent when the listing belongs to their brokerage."
      />
      <section className="mx-auto max-w-7xl px-5 pb-10">
        <div className="mb-5 rounded-[2rem] bg-[#0f3d35] p-5 text-white shadow-xl shadow-[#0f3d35]/10 md:p-6">
          <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-center">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#bdebdc]">Lead routing</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-[-0.05em] md:text-3xl">Your selected agent follows you into showing requests.</h2>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-white/72">Listing attribution stays intact for MLS/brokerage compliance, while the customer-selected agent can own the follow-up in the CRM.</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row md:flex-col lg:flex-row">
              {selectedAgentId && <button type="button" onClick={clearSelectedAgent} className="inline-flex min-h-12 items-center justify-center rounded-full border border-white/25 px-5 text-sm font-bold text-white">Clear preference</button>}
              <Link to="/" className="inline-flex min-h-12 items-center justify-center rounded-full bg-white px-5 text-sm font-bold text-[#0f3d35]">Search listings</Link>
            </div>
          </div>
        </div>

        {isLoading && <StateCard>Loading agents...</StateCard>}
        {isError && <StateCard tone="error">Unable to load agents right now.</StateCard>}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {agents.map((agent) => {
            const selected = selectedAgentId === agent.id
            return (
              <article key={agent.id} className={`rounded-[2rem] bg-white p-5 shadow-sm ring-1 transition hover:-translate-y-0.5 hover:shadow-xl hover:shadow-[#0f3d35]/10 ${selected ? 'ring-[#0f705e]' : 'ring-black/5'}`}>
                <div className="flex items-start gap-4">
                  <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-2xl bg-[#0f3d35] text-lg font-black text-[#f5c16c]">
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
                <button
                  type="button"
                  onClick={() => selectAgent(agent)}
                  className={`mt-5 w-full rounded-2xl px-4 py-3 text-sm font-bold transition ${selected ? 'bg-[#e9f5ef] text-[#0f705e]' : 'bg-[#0f3d35] text-white hover:bg-[#174c43]'}`}
                >
                  {selected ? 'Selected for future requests' : `Work with ${agent.name.split(' ')[0]}`}
                </button>
              </article>
            )
          })}
        </div>
        {agents.length === 0 && !isLoading && <StateCard>No active agents are published yet.</StateCard>}
      </section>
    </Shell>
  )
}

function VillageDetailPage() {
  const { slug = '' } = useParams()
  const { data: villagesData } = useQuery({ queryKey: ['villages'], queryFn: fetchVillages })
  const { data: listingsData } = useQuery({ queryKey: ['listings', slug], queryFn: () => fetchListings({ village: slug }) })
  const village = villagesData?.villages.find((item) => item.slug === slug)
  return (
    <Shell compact>
      <ContentHeader kicker={village?.region || 'Village'} title={village?.name || 'Guam village'} description={village?.description || 'Village detail and matching listings.'} />
      <section className="mx-auto grid max-w-7xl gap-4 px-5 pb-10 lg:grid-cols-[1fr_360px]">
        <div className="grid gap-4">
          {listingsData?.listings.map((listing) => <ListingCard key={listing.id} listing={listing} />)}
        </div>
        <div className="rounded-[2rem] bg-[#173f38] p-6 text-white lg:self-start">
          <Compass className="text-[#bdebdc]" />
          <h2 className="mt-4 text-2xl font-semibold tracking-[-0.04em]">Market snapshot placeholder</h2>
          <p className="mt-3 text-sm leading-6 text-white/75">Explore price trends, rental activity, commute notes, and nearby listings for this village.</p>
        </div>
      </section>
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
          <Link key={slug} to={`/?kind=rent&features=${slug}`} className="rounded-[2rem] bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-xl hover:shadow-[#0f3d35]/10">
            <ShieldCheck className="text-[#0f705e]" />
            <h2 className="mt-5 text-3xl font-semibold tracking-[-0.05em]">{title}</h2>
            <p className="mt-3 text-sm leading-6 text-[#66746f]">{description}</p>
            <p className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-[#0f3d35]">Search rentals <ChevronRight size={16} /></p>
          </Link>
        ))}
      </section>
    </Shell>
  )
}

function SavedPage() {
  const { isClerkEnabled, isSignedIn, isLoading, userId } = useAuthContext()
  const { data, isLoading: savesLoading, refetch } = useQuery({ queryKey: ['saved-listings', userId], queryFn: fetchSavedListings, enabled: isClerkEnabled && isSignedIn })
  const removeMutation = useMutation({ mutationFn: removeSavedListingForUser, onSuccess: () => refetch() })

  if (isLoading) return <Shell compact><StateCard>Checking account...</StateCard></Shell>

  if (!isSignedIn) {
    return (
      <Shell compact>
        <ContentHeader kicker="Saved homes" title="Sign in to see your saved Guam homes." description="Favorites sync across web and mobile once they are tied to your Hafa Homes account." />
        <section className="mx-auto max-w-3xl px-5 pb-10"><div className="rounded-[2rem] bg-white p-8 text-center shadow-sm"><SignInButton mode="modal"><button className="rounded-full bg-[#0f3d35] px-6 py-3 text-sm font-bold text-white">Sign in or create account</button></SignInButton></div></section>
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
              <Link to={`/listings/${listing.id}`}><img src={listing.primary_photo_url || FALLBACK_LISTING_IMAGE} alt="" className="h-52 w-full object-cover md:h-full" /></Link>
              <div className="p-5">
                <p className="text-2xl font-bold tracking-[-0.04em]">{currency(listing.price, listing.listing_kind)}</p>
                <Link to={`/listings/${listing.id}`} className="mt-1 block text-xl font-semibold tracking-[-0.04em] text-[#17211f] hover:text-[#0f705e]">{listing.title}</Link>
                <p className="mt-2 text-sm font-semibold text-[#66746f]">{listing.village.name} · {listing.address}</p>
                <div className="mt-5 flex flex-wrap gap-3">
                  <Link to={`/listings/${listing.id}`} className="rounded-full bg-[#0f3d35] px-4 py-2 text-sm font-bold text-white">View details</Link>
                  <button onClick={() => removeMutation.mutate(listing.id)} className="rounded-full border border-[#d7ded9] px-4 py-2 text-sm font-bold text-[#0f3d35]">Remove</button>
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
  const profileMutation = useMutation({ mutationFn: updateMe, onSuccess: () => refetch() })
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
        <section className="mx-auto max-w-3xl px-5 pb-10"><div className="rounded-[2rem] bg-white p-8 text-center shadow-sm"><SignInButton mode="modal"><button className="rounded-full bg-[#0f3d35] px-6 py-3 text-sm font-bold text-white">Sign in or create account</button></SignInButton></div></section>
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
            <button type="submit" disabled={profileMutation.isPending} className="rounded-full bg-[#0f3d35] px-5 py-3 text-sm font-bold text-white disabled:opacity-60">{profileMutation.isPending ? 'Saving...' : 'Save profile'}</button>
            <Link to="/saved" className="rounded-full border border-[#d7ded9] px-5 py-3 text-sm font-bold text-[#0f3d35]">Saved homes</Link>
            <Link to="/account/requests" className="rounded-full border border-[#d7ded9] px-5 py-3 text-sm font-bold text-[#0f3d35]">Request history</Link>
            <button
              type="button"
              onClick={async () => {
                try {
                  await signOut?.()
                } finally {
                  navigate('/', { replace: true })
                }
              }}
              className="rounded-full border border-[#d7ded9] px-5 py-3 text-sm font-bold text-[#0f3d35]"
            >
              Sign out
            </button>
          </div>
        </form>

        <div className="rounded-[2rem] border border-red-200 bg-[#fff8f6] p-6 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-red-700">Delete account</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-[#491d1d]">Permanently remove your account.</h2>
          <p className="mt-3 text-sm leading-6 text-[#7c4a43]">This deletes your Clerk/Hafa Homes account and synced saved homes. Showing/contact requests are preserved for brokerage follow-up, but they will no longer be linked to your account.</p>

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
                <button type="button" onClick={() => { setDeletePanelOpen(false); setConfirmation('') }} className="rounded-full border border-[#d7ded9] px-5 py-3 text-sm font-bold text-[#0f3d35]">Cancel</button>
              </div>
            </div>
          )}
        </div>
      </section>
    </Shell>
  )
}

function RequestsPage() {
  const { isClerkEnabled, isSignedIn, isLoading, userId } = useAuthContext()
  const { data, isLoading: requestsLoading, isError } = useQuery({ queryKey: ['my-leads', userId], queryFn: fetchMyLeads, enabled: isClerkEnabled && isSignedIn })

  if (isLoading) return <Shell compact><StateCard>Checking account...</StateCard></Shell>

  if (!isSignedIn) {
    return (
      <Shell compact>
        <ContentHeader kicker="My requests" title="Sign in to view your showing requests." description="Signed-in requests can show status, assigned agent, and scheduled appointment details." />
        <section className="mx-auto max-w-3xl px-5 pb-10"><div className="rounded-[2rem] bg-white p-8 text-center shadow-sm"><SignInButton mode="modal"><button className="rounded-full bg-[#0f3d35] px-6 py-3 text-sm font-bold text-white">Sign in or create account</button></SignInButton></div></section>
      </Shell>
    )
  }

  const requests = data?.leads ?? []

  return (
    <Shell compact>
      <ContentHeader kicker="My requests" title="Your showing requests and price alerts." description="Track what you submitted, who is assigned, and when confirmed showings are scheduled." />
      <section className="mx-auto max-w-6xl px-5 pb-10">
        {requestsLoading && <StateCard>Loading requests...</StateCard>}
        {isError && <StateCard tone="error">Unable to load your requests.</StateCard>}
        <div className="grid gap-4">
          {requests.map((lead) => <ConsumerRequestCard key={lead.id} lead={lead} />)}
        </div>
        {requests.length === 0 && !requestsLoading && <StateCard>No requests yet. Request a showing or save a price alert from any listing.</StateCard>}
      </section>
    </Shell>
  )
}

function ConsumerRequestCard({ lead }: { lead: Lead }) {
  const showing = lead.latest_showing_appointment
  return (
    <article className="overflow-hidden rounded-[2rem] bg-white shadow-sm md:grid md:grid-cols-[240px_1fr]">
      {lead.listing?.primary_photo_url && <Link to={`/listings/${lead.listing.id}`}><img src={lead.listing.primary_photo_url} alt="" className="h-56 w-full object-cover md:h-full" /></Link>}
      <div className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#0f705e]">{lead.lead_type.replaceAll('_', ' ')}</p>
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
        {showing && (
          <div className="mt-4 rounded-2xl bg-[#f6f1e8] p-4">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#0f705e]">Showing appointment</p>
            <p className="mt-2 text-sm font-semibold text-[#304942]">{formatDateTime(showing.scheduled_starts_at)} · {showing.status.replaceAll('_', ' ')} · {showing.tour_type.replaceAll('_', ' ')}</p>
            {showing.location && <p className="mt-2 text-sm text-[#66746f]">{showing.location}</p>}
            {showing.consumer_notes && <p className="mt-2 text-sm text-[#66746f]">{showing.consumer_notes}</p>}
          </div>
        )}
      </div>
    </article>
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
          <p><strong className="text-[#17211f]">Information we collect.</strong> Hafa Homes may collect contact details you submit through showing requests, price alerts, saved searches, or similar forms, plus basic app usage information used to improve the product.</p>
          <p><strong className="text-[#17211f]">How we use it.</strong> We use submitted information to respond to inquiries, coordinate real estate follow-up, improve listing search, troubleshoot the app, and understand aggregate product usage.</p>
          <p><strong className="text-[#17211f]">Saved listings.</strong> Signed-in saved homes are stored with your Hafa Homes account so they can sync across web and mobile. The native app may also cache listing details locally on your device for performance.</p>
          <p><strong className="text-[#17211f]">Account deletion.</strong> Signed-in users can delete their account from the Account screen in the web app or the More screen in the mobile app. Deleting an account removes synced saved homes and disconnects account links from request history while preserving submitted showing/contact requests for brokerage follow-up.</p>
          <p><strong className="text-[#17211f]">Third-party services.</strong> The app may use services such as Clerk for authentication, Mapbox for maps, hosting providers for the API/web app, and analytics or monitoring tools when enabled.</p>
          <p><strong className="text-[#17211f]">Contact.</strong> For privacy questions or data requests, email <a className="font-bold text-[#0f705e]" href="mailto:hello@hafahomes.com">hello@hafahomes.com</a>.</p>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#7b8a84]">Last updated May 25, 2026</p>
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
        <div className="rounded-[2rem] bg-[#101f1c] p-6 text-white shadow-2xl shadow-[#0f3d35]/20">
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


function MapPanel({ listings, onExpand, immersive = false, mobileMapHeight }: { listings: Listing[]; onExpand?: () => void; immersive?: boolean; mobileMapHeight?: number }) {
  const points = listings.filter((listing) => listing.latitude && listing.longitude)
  const mapHeight = immersive ? 'h-[100svh]' : 'h-[calc(100svh-330px)] md:h-auto md:min-h-[760px]'
  const mapStyle = !immersive && mobileMapHeight ? { height: mobileMapHeight } : undefined

  if (!MAPBOX_TOKEN) {
    return <FallbackMapPanel listings={listings} onExpand={onExpand} immersive={immersive} mapStyle={mapStyle} />
  }

  return (
    <div className={`hafa-map-panel ${!immersive ? 'hafa-map-panel--standard' : ''} relative overflow-hidden border border-black/5 bg-[#dbe8df] shadow-sm ${immersive ? 'h-[100svh] rounded-none' : 'rounded-none md:rounded-[2rem]'}`}>
      <RealMap listings={points} immersive={immersive} className={mapHeight} style={mapStyle} />
      <MapOverlayHeader listingsCount={points.length} onExpand={onExpand} realMap />
      {!immersive && (
        <div className="absolute bottom-5 left-5 z-10 hidden max-w-md rounded-3xl bg-white/92 p-4 text-sm leading-6 text-[#53645f] shadow-xl shadow-[#0f3d35]/10 backdrop-blur md:block">
          Tap a price marker to open the listing details. Use full map for the best search experience.
        </div>
      )}
    </div>
  )
}

function RealMap({ listings, className, immersive, style }: { listings: Listing[]; className: string; immersive: boolean; style?: React.CSSProperties }) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<any>(null)
  const mapboxRef = useRef<any>(null)
  const markersRef = useRef<any[]>([])
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

    listings.forEach((listing) => {
      if (!listing.latitude || !listing.longitude) return

      const markerElement = document.createElement('button')
      markerElement.type = 'button'
      markerElement.className = 'hafa-map-marker'
      markerElement.textContent = currency(listing.price, listing.listing_kind).replace('/mo', '')
      markerElement.setAttribute('aria-label', `Open ${listing.title}`)
      markerElement.addEventListener('click', () => {
        captureAnalyticsEvent('map_marker_clicked', { listing_id: listing.id, listing_kind: listing.listing_kind })
        navigate(`/listings/${listing.id}`)
      })

      const marker = new mapbox.Marker({ element: markerElement, anchor: 'center' })
        .setLngLat([listing.longitude, listing.latitude])
        .addTo(map)

      markersRef.current.push(marker)
      bounds.extend([listing.longitude, listing.latitude])
    })

    if (!bounds.isEmpty()) {
      map.fitBounds(bounds, {
        padding: immersive ? 96 : { top: 130, right: 70, bottom: 120, left: 70 },
        maxZoom: 12.2,
        duration: 650,
      })
    }
  }, [listings, immersive, navigate, mapReady])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const timeout = window.setTimeout(() => map.resize(), 120)
    return () => window.clearTimeout(timeout)
  }, [immersive, style?.height])

  if (mapError) {
    return (
      <div className={`grid w-full place-items-center bg-[#dbe8df] px-6 text-center ${className}`}>
        <div className="rounded-3xl bg-white/90 p-5 shadow-xl shadow-[#0f3d35]/10">
          <p className="text-sm font-bold text-[#0f3d35]">Map temporarily unavailable</p>
          <p className="mt-2 max-w-xs text-sm leading-6 text-[#53645f]">Listings are still available in list view while the map finishes loading.</p>
        </div>
      </div>
    )
  }

  return <div ref={containerRef} style={style} className={`w-full ${className}`} />
}

function MapOverlayHeader({ listingsCount, onExpand, realMap = false }: { listingsCount: number; onExpand?: () => void; realMap?: boolean }) {
  return (
    <div className="absolute left-3 right-3 top-3 z-20 flex items-center justify-between gap-2 rounded-2xl bg-white/90 p-2 shadow-lg shadow-[#0f3d35]/10 backdrop-blur md:left-5 md:right-5 md:top-5 md:rounded-3xl md:p-4">
      <div className="min-w-0">
        <p className="hidden text-xs font-bold uppercase tracking-[0.2em] text-[#0f705e] md:block">{realMap ? 'Interactive map' : 'Map concept'}</p>
        <h3 className="truncate text-sm font-extrabold tracking-[-0.03em] text-[#17211f] md:mt-1 md:text-xl">Map</h3>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="rounded-full bg-[#edf4ef] px-3 py-2 text-xs font-bold text-[#0f3d35] md:hidden">{listingsCount} listings</span>
        <span className="hidden rounded-full bg-[#0f3d35] px-3 py-1 text-xs font-bold text-white md:inline-flex">{listingsCount} pins</span>
        {onExpand && (
          <button onClick={onExpand} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-[#d7ded9] bg-white px-3 text-xs font-bold text-[#0f3d35] md:min-h-0 md:rounded-full md:py-2">
            <Maximize2 size={14} /> <span className="hidden sm:inline">Open full map</span><span className="sm:hidden">Full</span>
          </button>
        )}
      </div>
    </div>
  )
}

function FallbackMapPanel({ listings, onExpand, immersive = false, mapStyle }: { listings: Listing[]; onExpand?: () => void; immersive?: boolean; mapStyle?: React.CSSProperties }) {
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
              to={`/listings/${listing.id}`}
              style={{ left: `${left}%`, top: `${top}%` }}
              className="absolute z-20 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#0f3d35] px-3 py-2 text-xs font-bold text-white shadow-xl shadow-[#0f3d35]/30 transition hover:scale-105 md:px-4 md:text-sm"
            >
              {currency(listing.price, listing.listing_kind).replace('/mo', '')}
            </Link>
          )
        })}
        {!immersive && (
          <div className="absolute bottom-5 left-5 z-10 hidden max-w-md rounded-3xl bg-white/92 p-4 text-sm leading-6 text-[#53645f] backdrop-blur md:block">
            Add <code className="rounded bg-[#edf4ef] px-1 font-bold text-[#0f3d35]">VITE_MAPBOX_TOKEN</code> to enable the real interactive Mapbox map.
          </div>
        )}
      </div>
    </div>
  )
}

function FullMapModal({ open, onClose, listings }: { open: boolean; onClose: () => void; listings: Listing[] }) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-[80] bg-[#f6f1e8]">
      <div className="absolute left-3 right-3 top-3 z-30 flex items-center justify-between rounded-3xl bg-white/90 p-3 shadow-xl shadow-[#0f3d35]/10 backdrop-blur md:left-6 md:right-6 md:top-6">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#0f705e] md:text-xs">Full map search</p>
          <h2 className="text-lg font-semibold tracking-[-0.04em] md:text-2xl">Explore Guam listings</h2>
        </div>
        <button onClick={onClose} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#0f3d35] px-4 text-sm font-bold text-white">
          <X size={16} /> Close
        </button>
      </div>
      <MapPanel listings={listings} immersive />
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
            <button onClick={onClose} className="mt-6 w-full rounded-2xl bg-[#0f3d35] px-4 py-3 text-sm font-bold text-white">Close</button>
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
            <button disabled={mutation.isPending} className="mt-5 w-full rounded-2xl bg-[#0f3d35] px-4 py-3 text-sm font-bold text-white disabled:opacity-60">
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
        className={`group relative flex min-h-12 items-center rounded-2xl text-sm font-bold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#bdebdc] ${sidebarCollapsed ? 'justify-center px-2' : 'gap-3 px-4'} ${active ? 'bg-white text-[#0f3d35] shadow-xl shadow-black/10' : 'text-white/72 hover:bg-white/10 hover:text-white'}`}
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
    <aside className={`fixed inset-y-0 left-0 z-[80] flex flex-col border-r border-white/10 bg-[#0f3d35] px-4 py-5 text-white shadow-2xl shadow-black/20 transition-all duration-200 lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 lg:shadow-none ${collapsed ? 'lg:w-[88px]' : 'lg:w-72'} ${mobileOpen ? 'translate-x-0' : '-translate-x-full'} w-72`}>
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
                <button onClick={() => setMobileOpen(true)} className="grid h-11 w-11 place-items-center rounded-full border border-[#d7ded9] bg-white text-[#0f3d35] lg:hidden" aria-label="Open admin navigation"><Menu size={18} /></button>
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
  const classes = tone === 'dark' ? 'bg-[#0f3d35] text-white' : tone === 'warn' ? 'bg-[#fff5d9] text-[#6b4508]' : 'bg-white text-[#17211f]'
  return <div className={`rounded-[1.25rem] p-3 shadow-sm sm:rounded-[1.5rem] sm:p-5 ${classes}`}><p className="text-[10px] font-bold uppercase tracking-[0.14em] opacity-60 sm:text-xs sm:tracking-[0.18em]">{label}</p><p className="mt-2 text-2xl font-semibold tracking-[-0.06em] sm:mt-3 sm:text-4xl">{value}</p></div>
}

function AdminPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="rounded-[1.75rem] bg-white p-4 shadow-sm sm:rounded-[2rem] sm:p-5"><h2 className="text-xl font-semibold tracking-[-0.04em] sm:text-2xl">{title}</h2><div className="mt-4">{children}</div></div>
}

function LeadCompactRow({ lead }: { lead: Lead }) {
  return (
    <Link to={`/admin/leads/${lead.id}`} className="block rounded-2xl bg-[#f6f1e8] p-4 transition hover:bg-[#efe6d7]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-[#17211f]">{lead.name}</p>
          <p className="mt-1 text-xs font-semibold text-[#66746f]">{lead.listing?.title ?? lead.lead_type.replaceAll('_', ' ')}</p>
        </div>
        <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-[#0f705e]">{lead.status.replaceAll('_', ' ')}</span>
      </div>
    </Link>
  )
}

function ShowingCompactRow({ showing }: { showing: ShowingAppointment }) {
  return (
    <Link to={`/admin/leads/${showing.lead_id}`} className="block rounded-2xl bg-[#f6f1e8] p-4 transition hover:bg-[#efe6d7]">
      <p className="text-sm font-bold text-[#17211f]">{showing.listing?.title ?? 'Showing appointment'}</p>
      <p className="mt-1 text-xs font-semibold text-[#66746f]">{formatDateTime(showing.scheduled_starts_at)} · {showing.agent?.name ?? 'Unassigned agent'}</p>
    </Link>
  )
}

function LeadsPage() {
  const [agentFilter, setAgentFilter] = useState('')
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['leads', agentFilter], queryFn: () => fetchLeads({ assigned_agent_id: agentFilter || undefined }) })
  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: LeadStatus }) => updateLead(id, { status }),
    onSuccess: () => refetch(),
  })
  const leads = data?.leads ?? []
  const assignableAgents = data?.assignable_agents ?? []
  const openLeads = leads.filter((lead) => ['new', 'contacted', 'showing_scheduled', 'nurturing'].includes(lead.status)).length
  const newLeads = leads.filter((lead) => lead.status === 'new').length
  const scheduledLeads = leads.filter((lead) => lead.status === 'showing_scheduled').length

  return (
    <AdminShell kicker="Leads" title="Lead inbox">
      <section className="mx-auto max-w-7xl px-4 pb-10 sm:px-5">
        <div className="mb-5 grid gap-3 md:grid-cols-3">
          <div className="rounded-[1.75rem] bg-[#0f3d35] p-5 text-white"><p className="text-xs font-bold uppercase tracking-[0.18em] text-white/55">Open leads</p><p className="mt-2 text-4xl font-semibold tracking-[-0.06em]">{openLeads}</p></div>
          <div className="rounded-[1.75rem] bg-white p-5"><p className="text-xs font-bold uppercase tracking-[0.18em] text-[#7b8a84]">New</p><p className="mt-2 text-4xl font-semibold tracking-[-0.06em]">{newLeads}</p></div>
          <div className="rounded-[1.75rem] bg-white p-5"><p className="text-xs font-bold uppercase tracking-[0.18em] text-[#7b8a84]">Showings</p><p className="mt-2 text-4xl font-semibold tracking-[-0.06em]">{scheduledLeads}</p></div>
        </div>
        <div className="mb-5 rounded-[1.75rem] bg-white p-4 shadow-sm sm:p-5">
          <label className="grid gap-2 text-sm font-semibold text-[#304942] md:max-w-md">
            Filter by assigned agent
            <select value={agentFilter} onChange={(event) => setAgentFilter(event.target.value)} className="min-h-12 rounded-2xl border border-[#dce5df] bg-white px-4">
              <option value="">All assigned agents</option>
              <option value="unassigned">Unassigned leads</option>
              {assignableAgents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name} · {agent.brokerage?.name}</option>)}
            </select>
          </label>
        </div>
        {isLoading && <StateCard>Loading leads...</StateCard>}
        {isError && <StateCard tone="error">Unable to load leads.</StateCard>}
        {statusMutation.isError && <StateCard tone="error">{displayErrorMessage(statusMutation.error, 'Unable to update lead right now.')}</StateCard>}
        <div className="grid gap-4">
          {leads.map((lead) => (
            <article key={lead.id} className="rounded-[1.75rem] bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-xl hover:shadow-[#0f3d35]/10 sm:rounded-[2rem] sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#0f705e]">{lead.lead_type.replaceAll('_', ' ')}</p>
                  <Link to={`/admin/leads/${lead.id}`} className="mt-2 block text-2xl font-semibold tracking-[-0.04em] hover:text-[#0f705e]">{lead.name}</Link>
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
                <LeadMeta icon={<UserRound size={16} />} label="Requested agent" value={lead.requested_agent?.name ?? lead.listing?.agent?.name ?? 'Brokerage team'} />
                <LeadMeta icon={<ClipboardList size={16} />} label="Assigned agent" value={lead.assigned_agent?.name ?? 'Needs assignment'} />
              </div>
              {lead.listing && <p className="mt-4 rounded-2xl bg-[#f6f1e8] p-3 text-sm font-semibold text-[#304942]">Interested in {lead.listing.title} · {lead.listing.village} · {currency(lead.listing.price, lead.listing.listing_kind)}</p>}
              {lead.message && <p className="mt-4 line-clamp-2 text-sm leading-6 text-[#66746f]">{lead.message}</p>}
              <div className="mt-4 flex justify-end"><Link to={`/admin/leads/${lead.id}`} className="inline-flex items-center gap-2 rounded-full bg-[#0f3d35] px-4 py-2 text-sm font-bold text-white">Open lead <ChevronRight size={16} /></Link></div>
            </article>
          ))}
          {leads.length === 0 && !isLoading && <StateCard>No leads yet. New tour requests and price alerts will appear here.</StateCard>}
        </div>
      </section>
    </AdminShell>
  )
}

function LeadDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['lead', id], queryFn: () => fetchLead(id || ''), enabled: Boolean(id) })
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
        <button onClick={() => navigate('/admin/leads')} className="mb-6 inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-5 text-sm font-bold text-[#304942]"><ArrowLeft size={16} /> Back to leads</button>
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
                  </div>
                  <LeadStatusSelect value={lead.status} onChange={(status) => mutation.mutate({ status })} disabled={mutation.isPending} />
                </div>

                <LeadEditForm lead={lead} mutation={mutation} />
              </article>

              <LeadCrmPanel lead={lead} noteMutation={noteMutation} noteUpdateMutation={noteUpdateMutation} taskMutation={taskMutation} taskUpdateMutation={taskUpdateMutation} />
            </div>

            <aside className="space-y-5">
              <div className="rounded-[1.75rem] bg-[#0f3d35] p-4 text-white shadow-xl shadow-[#0f3d35]/15 sm:rounded-[2rem] sm:p-6">
                <Building2 className="text-[#bdebdc]" />
                <p className="mt-5 text-xs font-bold uppercase tracking-[0.2em] text-white/55">Brokerage routing</p>
                <h2 className="mt-2 text-2xl font-semibold tracking-[-0.05em] sm:text-3xl">{lead.brokerage?.name ?? 'Unassigned brokerage'}</h2>
                <p className="mt-3 text-sm leading-6 text-white/70">Requested agent: {lead.requested_agent?.name ?? lead.listing?.agent?.name ?? 'Brokerage team'}</p>
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
                  <Link to={`/listings/${lead.listing.id}?from=admin&lead_id=${lead.id}`} className="mt-5 inline-flex items-center gap-2 rounded-full bg-[#f6f1e8] px-4 py-2 text-sm font-bold text-[#304942]">View public listing <ChevronRight size={16} /></Link>
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
        <button disabled={mutation.isPending} className="min-h-11 w-full rounded-full bg-[#0f3d35] px-5 text-sm font-bold text-white disabled:opacity-60 sm:w-auto">
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
            {!['showing_request', 'price_tracker', 'general_inquiry'].includes(lead.lead_type) && <option value={lead.lead_type}>{lead.lead_type.replaceAll('_', ' ')}</option>}
            <option value="showing_request">Showing request</option>
            <option value="price_tracker">Price tracker</option>
            <option value="general_inquiry">General inquiry</option>
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
          Lead quality
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
      </div>

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
  const initialNotes = (lead.lead_notes ?? []).filter((note) => !note.archived_at)
  const initialTasks = (lead.lead_tasks ?? []).filter((task) => task.status !== 'cancelled')
  const initialActivities = lead.lead_activities ?? []
  const initialOpenTasks = initialTasks.filter((task) => task.status === 'open')
  const initialCompletedTasks = initialTasks.filter((task) => task.status === 'completed')
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
  }, [lead.id, lead.updated_at, lead.lead_notes, lead.lead_tasks, lead.lead_activities])

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
        <div className={`mt-5 rounded-[1.25rem] p-4 ${nextTask.overdue ? 'bg-[#fff5d9] text-[#6b4508]' : 'bg-[#e9f5ef] text-[#0f3d35]'}`}>
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
              <button disabled={taskMutation.isPending} className="min-h-11 rounded-2xl bg-[#0f3d35] px-4 text-sm font-bold text-white disabled:opacity-60">
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
            <button disabled={noteMutation.isPending} className="mt-3 min-h-11 w-full rounded-2xl border border-[#dce5df] px-4 text-sm font-bold text-[#0f3d35] disabled:opacity-60">
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
        {hasMore && <button type="button" disabled={loading} onClick={onMore} className="rounded-full border border-[#dce5df] bg-white px-3 py-1.5 font-bold text-[#0f3d35] disabled:opacity-60">{loading ? 'Loading...' : 'Show more'}</button>}
        {isExpanded && <button type="button" onClick={onReset} className="rounded-full border border-[#dce5df] bg-white px-3 py-1.5 font-bold text-[#0f3d35]">Show latest only</button>}
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
          <button type="button" onClick={() => { setDraft(note.body); setEditing(false) }} className="rounded-full border border-[#dce5df] bg-white px-3 py-1.5 text-xs font-bold text-[#0f3d35]">Cancel</button>
          <button disabled={mutation.isPending} className="rounded-full bg-[#0f3d35] px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60">Save note</button>
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
          <button type="button" onClick={() => setEditing(true)} className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-[#0f3d35]">Edit</button>
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
          <button type="button" onClick={() => setEditing(false)} className="rounded-full border border-[#dce5df] bg-white px-3 py-1.5 text-xs font-bold text-[#0f3d35]">Cancel</button>
          <button disabled={mutation.isPending} className="rounded-full bg-[#0f3d35] px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60">Save task</button>
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
            <button type="button" disabled={mutation.isPending} onClick={() => mutation.mutate({ taskId: task.id, payload: { status: 'open' } })} className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-[#0f3d35] disabled:opacity-60">
              Reopen
            </button>
          ) : (
            <button type="button" disabled={mutation.isPending} onClick={() => mutation.mutate({ taskId: task.id, payload: { status: 'completed' } })} className="rounded-full bg-[#0f3d35] px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60">
              Done
            </button>
          )}
          <button type="button" onClick={() => setEditing(true)} className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-[#0f3d35]">Edit</button>
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
          <button type="button" onClick={() => setExpanded((value) => !value)} className="rounded-full border border-[#dce5df] bg-white px-3 py-1.5 text-xs font-bold text-[#0f3d35]">
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
        <button disabled={mutation.isPending || selectedModeUnavailable} className="min-h-12 rounded-2xl bg-[#0f3d35] px-4 text-sm font-bold text-white disabled:opacity-50">
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
              <button type="button" onClick={() => setVisibleDeliveryCount((count) => Math.min(count + 3, deliveries.length))} className="min-h-9 rounded-full border border-[#dce5df] px-3 text-xs font-bold text-[#0f3d35]">
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

function datetimeLocalValue(value?: string) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const offset = date.getTimezoneOffset()
  const local = new Date(date.getTime() - offset * 60 * 1000)
  return local.toISOString().slice(0, 16)
}

function ShowingScheduler({ lead, assignableAgents, mutation }: { lead: Lead; assignableAgents: Agent[]; mutation: ShowingMutation }) {
  const showing = lead.latest_showing_appointment ?? lead.showing_appointments?.[0] ?? null

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const payload: Partial<ShowingAppointment> & { lead_id: number; id?: number } = {
      lead_id: lead.id,
      id: showing?.id,
      agent_id: form.get('agent_id') ? Number(form.get('agent_id')) : null,
      scheduled_starts_at: String(form.get('scheduled_starts_at') || ''),
      scheduled_ends_at: String(form.get('scheduled_ends_at') || ''),
      timezone: String(form.get('timezone') || 'Pacific/Guam'),
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
        <p className="mt-2 rounded-2xl bg-[#e9f5ef] p-3 text-sm font-semibold text-[#0f3d35]">
          Current: {formatDateTime(showing.scheduled_starts_at)} · {showing.status.replaceAll('_', ' ')} · {showing.agent?.name ?? 'Unassigned agent'}
        </p>
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
          <Input name="scheduled_starts_at" label="Starts" type="datetime-local" defaultValue={datetimeLocalValue(showing?.scheduled_starts_at)} required />
          <Input name="scheduled_ends_at" label="Ends" type="datetime-local" defaultValue={datetimeLocalValue(showing?.scheduled_ends_at)} />
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
        <input type="hidden" name="timezone" value="Pacific/Guam" />
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
        <button disabled={mutation.isPending} className="rounded-2xl bg-[#0f3d35] px-4 py-3 text-sm font-bold text-white disabled:opacity-60">
          {mutation.isPending ? 'Saving...' : showing ? 'Update showing' : 'Schedule showing'}
        </button>
      </form>
    </div>
  )
}

function AdminShowingsPage() {
  const { data, isLoading, isError } = useQuery({ queryKey: ['showing-appointments'], queryFn: fetchShowingAppointments })
  const showings = data?.showing_appointments ?? []

  return (
    <AdminShell kicker="Showings" title="Showing schedule">
      <section className="mx-auto max-w-7xl px-4 pb-10 sm:px-5">
        {isLoading && <StateCard>Loading showings...</StateCard>}
        {isError && <StateCard tone="error">Unable to load showings.</StateCard>}
        <div className="grid gap-4">
          {showings.map((showing) => (
            <Link key={showing.id} to={`/admin/leads/${showing.lead_id}`} className="rounded-[1.75rem] bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-xl hover:shadow-[#0f3d35]/10 sm:rounded-[2rem] sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#0f705e]">{showing.status.replaceAll('_', ' ')}</p>
                  <h2 className="mt-2 text-xl font-semibold tracking-[-0.04em] sm:text-2xl">{showing.listing?.title ?? 'Showing appointment'}</h2>
                  <p className="mt-2 text-sm font-semibold text-[#66746f]">{formatDateTime(showing.scheduled_starts_at)} · {showing.tour_type.replaceAll('_', ' ')}</p>
                </div>
                <span className="rounded-full bg-[#f6f1e8] px-4 py-2 text-sm font-bold text-[#0f3d35]">{showing.agent?.name ?? 'Unassigned'}</span>
              </div>
              {showing.location && <p className="mt-4 rounded-2xl bg-[#f6f1e8] p-3 text-sm font-semibold text-[#304942]">{showing.location}</p>}
              {showing.consumer_notes && <p className="mt-3 text-sm leading-6 text-[#66746f]">Customer notes: {showing.consumer_notes}</p>}
            </Link>
          ))}
          {showings.length === 0 && !isLoading && <StateCard>No showing appointments scheduled yet.</StateCard>}
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
                className={`inline-flex min-h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-3 text-xs font-bold transition sm:min-h-11 sm:px-4 sm:text-sm ${filter === tab.value ? 'bg-[#0f3d35] text-white' : 'text-[#53645f] hover:bg-[#f6f1e8] hover:text-[#0f3d35]'}`}
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
        <span className="rounded-full border border-[#d7ded9] px-4 py-2 text-sm font-bold text-[#0f3d35]">{expanded ? 'Hide' : 'Show roles'}</span>
      </button>
      {expanded && (
        <div className="mt-4 grid gap-2 xl:grid-cols-4">
          {roles.map((item) => (
            <article key={item.role} className="rounded-2xl border border-[#dce5df] bg-[#fbfaf7] p-3">
              <h3 className="text-base font-bold tracking-[-0.03em] text-[#17211f]">{item.role}</h3>
              <p className="mt-2 text-sm leading-5 text-[#53645f]">{item.access}</p>
              <p className="mt-3 rounded-xl bg-[#e9f5ef] px-3 py-2 text-xs font-semibold leading-5 text-[#0f3d35]">{item.notes}</p>
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
    <form onSubmit={handleSubmit} className="rounded-[2rem] bg-[#0f3d35] p-5 text-white shadow-xl shadow-[#0f3d35]/15">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#bdebdc]">Invite-only access</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">Whitelist a user before they sign in.</h2>
          <p className="mt-2 text-sm leading-6 text-white/70">Creating a staff record here lets that email accept a Clerk invite and inherit the correct Hafa Homes role. Agent users also get an assignable agent profile automatically.</p>
        </div>
        <button disabled={saving} className="rounded-full bg-white px-5 py-3 text-sm font-bold text-[#0f3d35] disabled:opacity-60">{saving ? 'Creating...' : 'Create invite'}</button>
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
        <button disabled={saving} className="w-full rounded-full bg-[#0f3d35] px-5 py-3 text-sm font-bold text-white disabled:opacity-60 sm:w-auto">{saving ? 'Saving...' : 'Save access'}</button>
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
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['audit-events'], queryFn: fetchAuditEvents })
  const events = data?.audit_events ?? []

  return (
    <AdminShell kicker="Audit history" title="Platform audit log" description="A global trail for profile, admin, lead, notification, and showing changes.">
      <section className="mx-auto max-w-7xl px-4 pb-10 sm:px-5">
        {isLoading && <StateCard>Loading audit history...</StateCard>}
        {isError && <StateCard tone="error">Unable to load audit history.</StateCard>}
        <div className="mb-4 flex justify-end">
          <button type="button" onClick={() => refetch()} className="rounded-full border border-[#d7ded9] bg-white px-4 py-2 text-sm font-bold text-[#0f3d35]">Refresh</button>
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
                  {event.lead_id && <Link to={`/admin/leads/${event.lead_id}`} className="rounded-full bg-[#e9f5ef] px-3 py-2 text-[#0f3d35]">Lead #{event.lead_id}</Link>}
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
      </section>
    </AdminShell>
  )
}

function LeadStatusSelect({ value, onChange, disabled }: { value: LeadStatus; onChange: (value: LeadStatus) => void; disabled?: boolean }) {
  return (
    <label className="grid w-full gap-2 text-xs font-bold uppercase tracking-[0.16em] text-[#7b8a84] sm:w-auto">
      Status
      <select value={value} onChange={(event) => onChange(event.target.value as LeadStatus)} disabled={disabled} className="min-h-11 w-full rounded-full border border-[#dce5df] bg-white px-4 text-sm font-bold normal-case tracking-normal text-[#0f3d35] disabled:opacity-60 sm:min-w-[220px]">
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
      <div className={`safe-top absolute bottom-0 right-0 top-0 w-[84vw] max-w-sm bg-[#0f3d35] p-5 text-white shadow-2xl transition-transform duration-300 ease-out ${open ? 'translate-x-0' : 'translate-x-full'}`}>
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

function PriceTrackerModal({ listing, open, onClose }: { listing: Listing; open: boolean; onClose: () => void }) {
  const mutation = useMutation({ mutationFn: createLead })
  const { isClerkEnabled, isSignedIn, userId } = useAuthContext()
  const { data: meData } = useQuery({
    queryKey: ['me', userId, 'price-tracker-prefill'],
    queryFn: fetchMe,
    enabled: open && isClerkEnabled && isSignedIn && Boolean(userId),
    retry: false,
  })
  const brokerageId = listingBrokerageId(listing)
  const { data: agentsData } = useQuery({
    queryKey: ['agents', brokerageId, 'price-tracker'],
    queryFn: () => fetchAgents(brokerageId ?? undefined),
    enabled: open && Boolean(brokerageId),
  })
  const profile = meData?.user
  if (!open) return null

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const selectedAgentId = storedSelectedAgentId()
    let candidateAgents = agentsData?.agents

    if (selectedAgentId && !candidateAgents && brokerageId) {
      try {
        candidateAgents = (await fetchAgents(brokerageId)).agents
      } catch (agentError) {
        console.warn('Unable to resolve preferred agent before price tracker submit', agentError)
      }
    }

    const selectedAgent = candidateAgents?.find((agent) => agent.id === selectedAgentId && agentBrokerageMatchesListing(agent, listing))
    captureAnalyticsEvent('lead_form_submitted', { listing_id: listing.id, lead_type: 'price_tracker' })
    mutation.mutate({
      listing_id: listing.id,
      lead_type: 'price_tracker',
      name: String(form.get('name') || 'Price tracker user'),
      email: String(form.get('email') || ''),
      phone: String(form.get('phone') || ''),
      preferred_contact_method: 'email',
      target_price: String(form.get('target_price') || ''),
      source_campaign: currentUtmCampaign(),
      source_url: window.location.href,
      requested_agent_id: selectedAgent?.id,
      message: `Target price: ${String(form.get('target_price') || '')}`, 
    })
  }

  return (
    <div className="fixed inset-0 z-[75] grid place-items-center bg-black/50 p-5 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-[2rem] bg-white/95 p-6 shadow-2xl">
        {mutation.isSuccess ? (
          <div className="py-8 text-center">
            <CheckCircle2 className="mx-auto text-[#0f705e]" size={44} />
            <h2 className="mt-4 text-3xl font-semibold tracking-[-0.05em]">Price tracker saved</h2>
            <p className="mt-3 text-sm leading-6 text-[#66746f]">Your price alert is saved. We will watch this listing for changes.</p>
            <button onClick={onClose} className="mt-6 w-full rounded-2xl bg-[#0f3d35] px-4 py-3 text-sm font-bold text-white">Close</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#0f705e]">Price Watch</p>
                <h2 className="mt-2 text-3xl font-semibold tracking-[-0.05em]">Set your target price</h2>
              </div>
              <button type="button" onClick={onClose} className="grid h-11 w-11 place-items-center rounded-full border border-[#d7ded9]"><X size={20} /></button>
            </div>
            <p className="mt-3 text-sm leading-6 text-[#66746f]">Current price: <strong>{currency(listing.price, listing.listing_kind)}</strong></p>
            <div className="mt-5 grid gap-3">
              <Input name="target_price" label="Target price" inputMode="numeric" placeholder="450000" required />
              <Input name="email" label="Email for alerts" type="email" defaultValue={profile?.email || ''} required />
              <Input name="name" label="Name" defaultValue={profile?.full_name || 'Hafa Homes user'} />
              <Input name="phone" label="Phone optional" defaultValue={profile?.phone || '+1671'} inputMode="tel" />
            </div>
            {mutation.isError && <p className="mt-3 text-sm font-semibold text-red-700">Unable to save tracker right now.</p>}
            <div className="mt-5 grid grid-cols-2 gap-3">
              <button disabled={mutation.isPending} className="rounded-2xl bg-[#0f3d35] px-4 py-3 text-sm font-bold text-white disabled:opacity-60">{mutation.isPending ? 'Saving...' : 'Add'}</button>
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
  const { data: meData } = useQuery({
    queryKey: ['me', userId, 'lead-prefill'],
    queryFn: fetchMe,
    enabled: open && isClerkEnabled && isSignedIn && Boolean(userId),
    retry: false,
  })
  const brokerageId = listingBrokerageId(listing)
  const { data: agentsData } = useQuery({
    queryKey: ['agents', brokerageId, 'lead-modal'],
    queryFn: () => fetchAgents(brokerageId ?? undefined),
    enabled: open && Boolean(brokerageId),
  })
  const profile = meData?.user
  const agents = agentsData?.agents ?? []
  const listingAgents = agents.length > 0 ? agents : listing.agent && listing.agent.status === 'active' && agentBrokerageMatchesListing(listing.agent, listing) ? [listing.agent] : []
  const defaultAgentId = (() => {
    const stored = storedSelectedAgentId()
    const storedAgent = listingAgents.find((agent) => agent.id === stored && agentBrokerageMatchesListing(agent, listing))
    return storedAgent?.id ?? null
  })()
  const [agentSelectionOverride, setAgentSelectionOverride] = useState<{ listingId: number; agentId: number | null } | null>(null)
  const effectiveSelectedAgentId = agentSelectionOverride?.listingId === listing.id ? agentSelectionOverride.agentId : defaultAgentId
  const selectedModalAgent = listingAgents.find((agent) => agent.id === effectiveSelectedAgentId) ?? null

  if (!open) return null

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
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
      requested_agent_id: form.get('requested_agent_id') ? Number(form.get('requested_agent_id')) : undefined,
    })
  }

  function handleAgentChange(value: string) {
    const nextAgentId = value ? Number(value) : null
    setAgentSelectionOverride({ listingId: listing.id, agentId: nextAgentId })

    if (nextAgentId) {
      storeSelectedAgentId(nextAgentId)
      captureAnalyticsEvent('agent_selected', { agent_id: nextAgentId, listing_id: listing.id, source: 'lead_modal' })
    } else {
      captureAnalyticsEvent('agent_preference_skipped', { listing_id: listing.id, source: 'lead_modal' })
    }
  }

  return (
    <div className="fixed inset-0 z-[70] grid place-items-end bg-black/45 p-2 backdrop-blur-sm md:place-items-center md:p-3">
      <div className="safe-bottom max-h-[calc(100svh-1rem)] w-full max-w-lg overflow-y-auto overscroll-contain rounded-[1.5rem] bg-white p-4 shadow-2xl md:max-h-[calc(100vh-2rem)] md:rounded-[2rem] md:p-6">
        {mutation.isSuccess ? (
          <div className="py-8 text-center">
            <CheckCircle2 className="mx-auto text-[#0f705e]" size={44} />
            <h2 className="mt-4 text-3xl font-semibold tracking-[-0.05em]">Inquiry captured</h2>
            <p className="mt-3 text-sm leading-6 text-[#66746f]">Your request has been received. The Hafa Homes team can follow up with next steps.</p>
            <button onClick={onClose} className="mt-6 w-full rounded-2xl bg-[#0f3d35] px-4 py-3 text-sm font-bold text-white">Close</button>
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
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#0f3d35] text-sm font-black text-[#f5c16c] md:h-16 md:w-16 md:text-base">
                  {selectedModalAgent ? agentInitials(selectedModalAgent) : 'HH'}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-base font-bold text-[#17211f] md:text-lg">{selectedModalAgent?.name || 'Brokerage team'}</p>
                  <p className="text-xs font-semibold text-[#66746f] md:text-sm">{selectedModalAgent?.brokerage?.name || listing.brokerage_name || 'No agent preference selected'}</p>
                  <p className="text-xs font-semibold text-[#66746f] md:text-sm">{listing.address}</p>
                </div>
              </div>
              {listingAgents.length > 0 && (
                <label className="mt-4 grid gap-2 text-sm font-semibold text-[#304942]">
                  Preferred agent
                  <select name="requested_agent_id" value={effectiveSelectedAgentId ?? ''} onChange={(event) => handleAgentChange(event.target.value)} className="min-h-12 rounded-2xl border border-[#dce5df] bg-white px-4">
                    <option value="">Brokerage team / no preference for this request</option>
                    {listingAgents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
                  </select>
                </label>
              )}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 md:mt-5">
              <label className="cursor-pointer">
                <input type="radio" name="tour_type" value="in_person" defaultChecked className="peer sr-only" />
                <span className="block rounded-2xl border border-[#d7ded9] px-4 py-3 text-center text-sm font-bold text-[#304942] peer-checked:border-[#17a9df] peer-checked:text-[#17a9df]">In Person</span>
              </label>
              <label className="cursor-pointer">
                <input type="radio" name="tour_type" value="virtual" className="peer sr-only" />
                <span className="block rounded-2xl border border-[#d7ded9] px-4 py-3 text-center text-sm font-bold text-[#304942] peer-checked:border-[#17a9df] peer-checked:text-[#17a9df]">Virtual</span>
              </label>
            </div>
            <div className="mt-4 grid grid-cols-4 gap-2 text-center text-xs font-bold text-[#53645f] md:mt-5">
              {tourDateOptions().map((day, index) => (
                <label key={day.value} className="cursor-pointer">
                  <input type="radio" name="preferred_tour_date" value={day.value} defaultChecked={index === 0} className="peer sr-only" />
                  <span className="block rounded-2xl border border-[#d7ded9] px-2 py-3 peer-checked:border-[#17a9df] peer-checked:text-[#17a9df]">{day.label}</span>
                </label>
              ))}
            </div>
            <div className="mt-4 grid gap-3 md:mt-5">
              <Input name="name" label="Name" defaultValue={profile?.full_name || ''} required />
              <Input name="email" label="Email" type="email" defaultValue={profile?.email || ''} required />
              <Input name="phone" label="Phone" defaultValue={profile?.phone || '+1671'} inputMode="tel" />
              <label className="grid gap-2 text-sm font-semibold text-[#304942]">
                Preferred contact
                <select name="preferred_contact_method" defaultValue={profile?.preferred_contact_method || 'phone'} className="min-h-12 rounded-2xl border border-[#dce5df] px-4">
                  {preferredContactOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              <label className="grid gap-2 text-sm font-semibold text-[#304942]">
                Select time
                <select name="preferred_time" defaultValue="flexible" className="min-h-12 rounded-2xl border border-[#dce5df] px-4">
                  {preferredTimeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              <label className="grid gap-2 text-sm font-semibold text-[#304942]">
                Message
                <textarea name="message" rows={4} className="rounded-2xl border border-[#dce5df] px-4 py-3" defaultValue={`I'm interested in ${listing.title}.`} />
              </label>
            </div>
            {mutation.isError && <p className="mt-3 text-sm font-semibold text-red-700">Unable to submit right now.</p>}
            <button disabled={mutation.isPending} className="mt-5 w-full rounded-2xl bg-[#0f3d35] px-4 py-3 text-sm font-bold text-white disabled:opacity-60">
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
      {compact && <div className="bg-[#0f3d35] px-5 py-5 text-white"><div className="mx-auto max-w-7xl"><TopNav /></div></div>}
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

function Input({ label, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return <label className="grid min-w-0 gap-2 text-sm font-semibold text-[#304942]">{label}<input {...props} className="min-h-12 w-full min-w-0 rounded-2xl border border-[#dce5df] px-4" /></label>
}

export default App
