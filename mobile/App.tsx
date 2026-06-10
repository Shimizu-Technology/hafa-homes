import AsyncStorage from '@react-native-async-storage/async-storage'
import { ClerkLoaded, ClerkProvider, useAuth, useSignIn, useSignInWithApple, useSignUp, useSSO, useUser } from '@clerk/clerk-expo'
import { tokenCache } from '@clerk/clerk-expo/token-cache'
import * as Linking from 'expo-linking'
import { StatusBar } from 'expo-status-bar'
import * as WebBrowser from 'expo-web-browser'
import { WebView } from 'react-native-webview'
import { useEffect, useMemo, useState } from 'react'
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

type TabKey = 'search' | 'map' | 'saved' | 'requests' | 'more'
type ListingKind = 'sale' | 'rent'

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
  village: Village
  features: Feature[]
  photos?: ListingPhoto[]
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
  listing?: { id: number; title: string; address?: string; village?: string; primary_photo_url?: string; price?: number; listing_kind?: ListingKind } | null
  assigned_agent?: { id: number; name: string; phone?: string; email?: string } | null
  brokerage?: { id: number; name: string; phone?: string } | null
  latest_showing_appointment?: ShowingAppointment | null
}

type GetAuthToken = (options?: { template?: string }) => Promise<string | null>

type AppAuth = {
  clerkEnabled: boolean
  isSignedIn: boolean
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
const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN
const CLERK_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY
const CLERK_JWT_TEMPLATE = process.env.EXPO_PUBLIC_CLERK_JWT_TEMPLATE
const FALLBACK_IMAGE = 'https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?auto=format&fit=crop&w=1200&q=80'
const LEGACY_SAVED_LISTING_IDS_KEY = 'hafaHomes:savedListingIds'
const LEGACY_SAVED_LISTINGS_KEY = 'hafaHomes:savedListings'

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

async function fetchListings(kind: ListingKind): Promise<Listing[]> {
  const response = await fetch(`${API_URL}/api/v1/listings?kind=${kind}`)
  if (!response.ok) throw new Error('Unable to load listings')
  const json = await response.json()
  return json.listings ?? []
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

async function fetchListing(listingId: number): Promise<Listing> {
  const response = await fetch(`${API_URL}/api/v1/listings/${listingId}`)
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

async function fetchSavedListings(getToken: GetAuthToken): Promise<{ listing_ids: number[]; listings: Listing[] }> {
  const response = await fetch(`${API_URL}/api/v1/me/saved_listings`, {
    headers: await authHeaders(getToken),
  })
  if (!response.ok) throw new Error('Unable to load saved homes')
  return response.json()
}

async function saveListingForUser(listingId: number, getToken: GetAuthToken): Promise<{ listing: Listing; listing_id: number; saved: boolean }> {
  const response = await fetch(`${API_URL}/api/v1/listings/${listingId}/save`, {
    method: 'POST',
    headers: await authHeaders(getToken),
  })
  if (!response.ok) throw new ApiRequestError(await apiErrorMessage(response, 'Unable to save home'), response.status)
  return response.json()
}

async function removeSavedListingForUser(listingId: number, getToken: GetAuthToken): Promise<{ listing_id: number; saved: boolean }> {
  const response = await fetch(`${API_URL}/api/v1/listings/${listingId}/save`, {
    method: 'DELETE',
    headers: await authHeaders(getToken),
  })
  if (!response.ok) throw new ApiRequestError(await apiErrorMessage(response, 'Unable to remove saved home'), response.status)
  return response.json()
}

async function createLead(payload: {
  listing_id: number
  lead_type: 'showing_request' | 'price_tracker'
  name: string
  email: string
  phone: string
  preferred_contact_method: string
  preferred_time?: string
  preferred_tour_date?: string
  tour_type?: string
  target_price?: string
  message: string
}, getToken?: GetAuthToken) {
  const response = await fetch(`${API_URL}/api/v1/leads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders(getToken)) },
    body: JSON.stringify({ lead: payload }),
  })

  if (!response.ok) throw new ApiRequestError(await apiErrorMessage(response, 'Unable to send request'), response.status)
  return response.json()
}

async function fetchMyLeads(getToken: GetAuthToken): Promise<{ leads: ConsumerLead[] }> {
  const response = await fetch(`${API_URL}/api/v1/me/leads`, {
    headers: await authHeaders(getToken),
  })
  if (!response.ok) throw new ApiRequestError(await apiErrorMessage(response, 'Unable to load your requests'), response.status)
  return response.json()
}

async function deleteAccount(getToken: GetAuthToken): Promise<{ deleted: boolean }> {
  const response = await fetch(`${API_URL}/api/v1/me`, {
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
    userName,
    userEmail,
    userInitial,
    getToken,
    signOut: () => signOut(),
  }), [getToken, isSignedIn, signOut, userEmail, userInitial, userName])

  return <AppContent auth={auth} />
}

function AppContent({ auth }: { auth: AppAuth }) {
  const [activeTab, setActiveTab] = useState<TabKey>('map')
  const [kind, setKind] = useState<ListingKind>('sale')
  const [searchQuery, setSearchQuery] = useState('')
  const [listings, setListings] = useState<Listing[]>([])
  const [listingCache, setListingCache] = useState<Record<number, Listing>>({})
  const [selectedListing, setSelectedListing] = useState<Listing | null>(null)
  const [savedListingIds, setSavedListingIds] = useState<number[]>([])
  const [savedListingsLoading, setSavedListingsLoading] = useState(false)
  const [pendingSaveListingId, setPendingSaveListingId] = useState<number | null>(null)
  const [legacySaveMigrationAttempted, setLegacySaveMigrationAttempted] = useState(false)
  const [authPrompt, setAuthPrompt] = useState<AuthPrompt | null>(null)
  const [fullMapOpen, setFullMapOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (activeTab !== 'map' && fullMapOpen) setFullMapOpen(false)
  }, [activeTab, fullMapOpen])

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

  if (selectedListing) {
    return (
      <ListingDetailScreen
        listing={selectedListing}
        saved={savedListingIds.includes(selectedListing.id)}
        auth={auth}
        onBack={() => setSelectedListing(null)}
        onOpenAuth={openAuthPrompt}
        onToggleSaved={() => toggleSaved(selectedListing.id)}
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
          <HeaderAuthButton auth={auth} onOpenAccount={() => setActiveTab('more')} onOpenAuth={() => openAuthPrompt()} />
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
            <Pressable key={option} onPress={() => setKind(option)} style={[styles.segmentButton, kind === option && styles.segmentButtonActive]}>
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
              : <SearchScreen listings={filteredListings} savedIds={savedListingIds} onOpen={setSelectedListing} onToggleSaved={toggleSaved} />
        )}
        {activeTab === 'map' && (
          loading
            ? <CenteredState label="Loading Guam listings..." loading />
            : error
              ? <CenteredState label={error} />
              : <MapScreen
                listings={filteredListings}
                savedIds={savedListingIds}
                onOpen={setSelectedListing}
                onToggleSaved={toggleSaved}
                fullMap={fullMapOpen}
                onToggleFullMap={() => setFullMapOpen((current) => !current)}
              />
        )}
        {activeTab === 'saved' && (
          !auth.isSignedIn
            ? <SavedSignInScreen clerkEnabled={auth.clerkEnabled} onOpenAuth={() => openAuthPrompt({ title: 'Sign in to view saved homes', copy: 'Saved homes are tied to your Hafa Homes account so they stay with you across devices.' })} />
            : savedListingsLoading
              ? <CenteredState label="Loading saved homes..." loading />
              : <SavedScreen listings={savedListings} onOpen={setSelectedListing} onToggleSaved={toggleSaved} />
        )}
        {activeTab === 'requests' && (
          !auth.isSignedIn
            ? <RequestsSignInScreen clerkEnabled={auth.clerkEnabled} onOpenAuth={() => openAuthPrompt({ title: 'Sign in to view your requests', copy: 'Signed-in showing requests and price alerts can show status, agent, and scheduled appointment details.' })} />
            : <RequestsScreen auth={auth} />
        )}
        {activeTab === 'more' && <MoreScreen auth={auth} onOpenAuth={openAuthPrompt} />}
      </View>

      {!(activeTab === 'map' && fullMapOpen) && <View style={styles.tabBar}>
        {tabs.map((tab) => (
          <Pressable key={tab.key} onPress={() => setActiveTab(tab.key)} style={[styles.tabButton, activeTab === tab.key && styles.tabButtonActive]}>
            <View style={[styles.tabIndicator, activeTab === tab.key && styles.tabIndicatorActive]} />
            <Text style={[styles.tabIcon, activeTab === tab.key && styles.tabActive]}>{tab.icon}</Text>
            <Text style={[styles.tabLabel, activeTab === tab.key && styles.tabActive]}>{tab.label}</Text>
          </Pressable>
        ))}
      </View>}
      {auth.clerkEnabled && <AuthModal open={Boolean(authPrompt)} prompt={authPrompt} onClose={() => setAuthPrompt(null)} />}
    </SafeAreaView>
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
        <View style={styles.screenIntro}>
            <Text style={styles.kicker}>Listings</Text>
          <Text style={styles.screenTitle}>Latest Guam homes</Text>
          <Text style={styles.screenCopy}>Search homes and rentals by village, price, features, and the details that matter on island.</Text>
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

function MapScreen({ listings, savedIds, onOpen, onToggleSaved, fullMap, onToggleFullMap }: { listings: Listing[]; savedIds: number[]; onOpen: (listing: Listing) => void; onToggleSaved: (listingId: number) => void; fullMap: boolean; onToggleFullMap: () => void }) {
  const [mapLoading, setMapLoading] = useState(true)
  const [previewListing, setPreviewListing] = useState<Listing | null>(null)
  const points = useMemo(() => listings.filter((listing) => listing.latitude && listing.longitude), [listings])
  const mapHtml = useMemo(() => buildMapHtml(points), [points])
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

function buildMapHtml(points: Listing[]) {
  const safePoints = points.map((listing) => ({
    id: listing.id,
    price: currency(listing.price, listing.listing_kind).replace('/mo', ''),
    latitude: listing.latitude,
    longitude: listing.longitude,
    title: listing.title,
    village: listing.village.name,
  }))

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

      map.on('zoomend', updateMarkerVisibility);
      map.on('moveend', updateMarkerVisibility);
      map.on('load', () => {
        if (!bounds.isEmpty()) {
          map.fitBounds(bounds, { padding: { top: 130, right: 70, bottom: 120, left: 70 }, maxZoom: 12.2, duration: 650 });
        }
        updateMarkerVisibility();
        map.once('idle', () => postMessage({ type: 'map-ready' }));
      });
    </script>
  </body>
</html>`
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

function MoreScreen({ auth, onOpenAuth }: { auth: AppAuth; onOpenAuth: (prompt?: AuthPrompt) => void }) {
  return (
    <ScrollView contentContainerStyle={styles.listContent}>
      <View style={styles.screenIntro}>
        <Text style={styles.kicker}>Resources</Text>
        <Text style={styles.screenTitle}>Island home search tools</Text>
        <Text style={styles.screenCopy}>Plan your search with local guidance for neighborhoods, schools, financing, saved homes, and relocation needs.</Text>
      </View>
      {auth.clerkEnabled ? <AccountCard auth={auth} onOpenAuth={onOpenAuth} /> : <AuthUnavailableCard />}
      {['Mortgage calculator', 'Neighborhood guide', 'School and park nearby info', 'Saved search alerts', 'Agent and brokerage contacts', 'Military relocation tools'].map((item) => (
        <View key={item} style={styles.featureRow}>
          <Text style={styles.featureBullet}>✓</Text>
          <Text style={styles.featureText}>{item}</Text>
        </View>
      ))}
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
        <Text style={styles.screenTitle}>Track showings and price alerts</Text>
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

function RequestsScreen({ auth }: { auth: AppAuth }) {
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
          <Text style={styles.screenTitle}>Showing requests and price alerts</Text>
          <Text style={styles.screenCopy}>See status, agent, brokerage, and appointment details for every signed-in request.</Text>
        </View>
      )}
      ListEmptyComponent={loading ? <CenteredState label="Loading your requests..." loading /> : <CenteredState label="No requests yet. Request a showing or add a price alert from any listing." />}
      renderItem={({ item }) => <RequestHistoryCard request={item} />}
      ListFooterComponent={error ? <Text style={styles.requestError}>{error}</Text> : null}
    />
  )
}

function RequestHistoryCard({ request }: { request: ConsumerLead }) {
  const showing = request.latest_showing_appointment
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
          <Text style={styles.requestHistoryMeta}>Agent: {request.assigned_agent?.name || 'Pending assignment'}</Text>
          {request.assigned_agent?.phone && <Text style={styles.requestHistoryMeta}>Agent phone: {request.assigned_agent.phone}</Text>}
          {request.assigned_agent?.email && <Text style={styles.requestHistoryMeta}>Agent email: {request.assigned_agent.email}</Text>}
          <Text style={styles.requestHistoryMeta}>Brokerage: {request.brokerage?.name || 'Hafa Homes'}</Text>
          {request.brokerage?.phone && <Text style={styles.requestHistoryMeta}>Brokerage phone: {request.brokerage.phone}</Text>}
        </View>
        {showing && (
          <View style={styles.showingSummaryCard}>
            <Text style={styles.requestHistoryStatus}>Showing appointment</Text>
            <Text style={styles.requestHistoryMeta}>{formatRequestDate(showing.scheduled_starts_at)} · {showing.status.replace(/_/g, ' ')} · {showing.tour_type.replace(/_/g, ' ')}</Text>
            {showing.location && <Text style={styles.requestHistoryMeta}>{showing.location}</Text>}
            {showing.consumer_notes && <Text style={styles.requestHistoryMeta}>{showing.consumer_notes}</Text>}
          </View>
        )}
        {request.message && <Text style={styles.requestHistoryMessage}>{request.message}</Text>}
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
  const [deletingAccount, setDeletingAccount] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  async function handleDeleteAccount() {
    if (!auth.getToken) return

    setDeletingAccount(true)
    setDeleteError(null)
    try {
      await deleteAccount(auth.getToken)
      await auth.signOut?.()
      Alert.alert('Account deleted', 'Your Hafa Homes account, saved homes, and account link to request history were deleted.')
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : 'Unable to delete account right now.')
    } finally {
      setDeletingAccount(false)
    }
  }

  function confirmDeleteAccount() {
    Alert.alert(
      'Delete Hafa Homes account?',
      'This permanently deletes your Hafa Homes account and synced saved homes. Showing/contact requests are retained for broker follow-up, but they will no longer be linked to your account.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: deletingAccount ? 'Deleting...' : 'Delete account', style: 'destructive', onPress: handleDeleteAccount },
      ],
    )
  }

  if (auth.isSignedIn) {
    return (
      <View style={styles.accountCard}>
        <Text style={styles.accountKicker}>Account</Text>
        <Text style={styles.accountTitle}>{auth.userName || auth.userEmail || 'Hafa Homes account'}</Text>
        <Text style={styles.accountCopy}>You are signed in. Saved homes now sync to this account; request history stays available across devices.</Text>
        <Pressable style={styles.secondaryCta} onPress={() => auth.signOut?.()} disabled={deletingAccount}><Text style={styles.secondaryCtaText}>Sign out</Text></Pressable>
        <View style={styles.dangerZone}>
          <Text style={styles.dangerTitle}>Delete account</Text>
          <Text style={styles.dangerCopy}>Permanently remove your Hafa Homes account and synced saved homes. Public showing/contact requests are preserved for follow-up, but disconnected from your account.</Text>
          {deleteError && <Text style={styles.dangerError}>{deleteError}</Text>}
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
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [pendingVerification, setPendingVerification] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return

    setMode(prompt?.initialMode ?? 'sign-in')
    setFirstName('')
    setLastName('')
    setEmail('')
    setPassword('')
    setCode('')
    setPendingVerification(false)
    setLoading(false)
    setMessage(null)
  }, [open, prompt?.initialMode])

  function switchMode(nextMode: 'sign-in' | 'sign-up') {
    setMode(nextMode)
    setPendingVerification(false)
    setMessage(null)
  }

  async function handleGoogleSignIn() {
    setLoading(true)
    setMessage(null)
    try {
      const { createdSessionId, setActive } = await startSSOFlow({
        strategy: 'oauth_google',
        redirectUrl: Linking.createURL('/oauth-native-callback'),
      })

      if (createdSessionId && setActive) {
        await setActive({ session: createdSessionId })
        onClose()
      } else {
        setMessage('Google sign-in did not finish. Please try again.')
      }
    } catch (authError: any) {
      setMessage(authError?.errors?.[0]?.longMessage || authError?.errors?.[0]?.message || 'Google sign-in failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  async function handleAppleSignIn() {
    setLoading(true)
    setMessage(null)
    try {
      const { createdSessionId, setActive } = await startAppleAuthenticationFlow()

      if (createdSessionId && setActive) {
        await setActive({ session: createdSessionId })
        onClose()
      } else {
        setMessage('Apple sign-in did not finish. Please try again.')
      }
    } catch (nativeAppleError: any) {
      try {
        const { createdSessionId, setActive } = await startSSOFlow({
          strategy: 'oauth_apple',
          redirectUrl: Linking.createURL('/oauth-native-callback'),
        })

        if (createdSessionId && setActive) {
          await setActive({ session: createdSessionId })
          onClose()
        } else {
          setMessage('Apple sign-in did not finish. Please try again.')
        }
      } catch (authError: any) {
        setMessage(authError?.errors?.[0]?.longMessage || authError?.errors?.[0]?.message || nativeAppleError?.errors?.[0]?.message || 'Apple sign-in failed. Please try again.')
      }
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
        await signUp.create({
          emailAddress: email.trim(),
          password,
          firstName: firstName.trim(),
          lastName: lastName.trim() || undefined,
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

            {!pendingVerification && (
              <>
                {Platform.OS === 'ios' && (
                  <Pressable style={[styles.socialCta, styles.appleCta]} onPress={handleAppleSignIn} disabled={loading}>
                    <View style={styles.appleCtaMark}><Text style={styles.appleCtaMarkText}>A</Text></View>
                    <Text style={styles.appleCtaText}>Continue with Apple</Text>
                  </Pressable>
                )}
                <Pressable style={styles.socialCta} onPress={handleGoogleSignIn} disabled={loading}>
                  <View style={styles.socialCtaMark}><Text style={styles.socialCtaMarkText}>G</Text></View>
                  <Text style={styles.socialCtaText}>Continue with Google</Text>
                </Pressable>
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

function ListingDetailScreen({ listing, saved, auth, onBack, onOpenAuth, onToggleSaved }: { listing: Listing; saved: boolean; auth: AppAuth; onBack: () => void; onOpenAuth: (prompt?: AuthPrompt) => void; onToggleSaved: () => void }) {
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
          <Text style={styles.sectionTitle}>Agent</Text>
          <View style={styles.agentCard}>
            <View style={styles.agentAvatar}><Text style={styles.agentInitial}>{(detailListing.agent_name || 'H').charAt(0)}</Text></View>
            <View style={styles.agentInfo}>
              <Text style={styles.agentName}>{detailListing.agent_name || 'Hafa Homes Agent'}</Text>
              <Text style={styles.agentMeta}>{detailListing.brokerage_name || 'Brokerage partner'}</Text>
            </View>
          </View>
          <Pressable disabled={Boolean(detailError)} style={[styles.primaryCta, detailError && styles.ctaDisabled]} onPress={() => setShowRequestForm(true)}>
            <Text style={styles.primaryCtaText}>Request a showing</Text>
          </Pressable>
          <Pressable
            style={styles.secondaryCta}
            onPress={() => setShowPriceTracker(true)}
          >
            <Text style={styles.secondaryCtaText}>Add price alert</Text>
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
      <ShowingRequestSheet listing={detailListing} auth={auth} open={showRequestForm} onOpenAuth={onOpenAuth} onClose={() => setShowRequestForm(false)} />
      <PriceAlertSheet listing={detailListing} auth={auth} open={showPriceTracker} onClose={() => setShowPriceTracker(false)} />
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

function ShowingRequestSheet({ listing, auth, open, onOpenAuth, onClose }: { listing: Listing; auth: AppAuth; open: boolean; onOpenAuth: (prompt?: AuthPrompt) => void; onClose: () => void }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('+1671')
  const [preferredContact, setPreferredContact] = useState('phone')
  const [preferredTime, setPreferredTime] = useState('morning')
  const [tourType, setTourType] = useState('in_person')
  const [message, setMessage] = useState(`I'm interested in ${listing.title}.`)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setMessage(`I'm interested in ${listing.title}.`)
    setSubmitted(false)
    setError(null)
    if (auth.isSignedIn) {
      setName((current) => current || auth.userName || '')
      setEmail((current) => current || auth.userEmail || '')
    }
  }, [auth.isSignedIn, auth.userEmail, auth.userName, listing.title, open])

  async function handleSubmit() {
    const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
    if (!name.trim() || !email.trim() || !emailValid) {
      setError('Please add your name and a valid email so an agent can follow up.')
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      await createLead({
        listing_id: listing.id,
        lead_type: 'showing_request',
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        preferred_contact_method: preferredContact,
        preferred_time: preferredTime,
        tour_type: tourType,
        message: `${message.trim()}\n\nListing: ${listing.title} — ${listing.address}, ${listing.village.name}`,
      }, auth.isSignedIn ? auth.getToken : undefined)
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
              </View>
              <View style={styles.requestFieldGroup}>
                <RequestInput label="Name" value={name} onChangeText={setName} placeholder="Your name" />
                <RequestInput label="Email" value={email} onChangeText={setEmail} placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none" />
                <RequestInput label="Phone" value={phone} onChangeText={setPhone} placeholder="+1671" keyboardType="phone-pad" />
                <Text style={styles.requestLabel}>Preferred contact</Text>
                <View style={styles.contactSegmentRow}>
                  {['phone', 'text', 'email'].map((option) => (
                    <Pressable key={option} onPress={() => setPreferredContact(option)} style={[styles.contactSegment, preferredContact === option && styles.contactSegmentActive]}>
                      <Text style={[styles.contactSegmentText, preferredContact === option && styles.contactSegmentTextActive]}>{option}</Text>
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
                  {['morning', 'afternoon', 'evening'].map((option) => (
                    <Pressable key={option} onPress={() => setPreferredTime(option)} style={[styles.contactSegment, preferredTime === option && styles.contactSegmentActive]}>
                      <Text style={[styles.contactSegmentText, preferredTime === option && styles.contactSegmentTextActive]}>{option}</Text>
                    </Pressable>
                  ))}
                </View>
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

function PriceAlertSheet({ listing, auth, open, onClose }: { listing: Listing; auth: AppAuth; open: boolean; onClose: () => void }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('+1671')
  const [targetPrice, setTargetPrice] = useState(String(Math.round(listing.price * 0.97)))
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setSubmitted(false)
    setError(null)
    setTargetPrice(String(Math.round(listing.price * 0.97)))
    if (auth.isSignedIn) {
      setName((current) => current || auth.userName || '')
      setEmail((current) => current || auth.userEmail || '')
    }
  }, [auth.isSignedIn, auth.userEmail, auth.userName, listing.price, open])

  async function handleSubmit() {
    const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
    if (!email.trim() || !emailValid) {
      setError('Please add a valid email for price alerts.')
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      await createLead({
        listing_id: listing.id,
        lead_type: 'price_tracker',
        name: name.trim() || 'Hafa Homes user',
        email: email.trim(),
        phone: phone.trim(),
        preferred_contact_method: 'email',
        target_price: targetPrice.trim(),
        message: `Target price: ${targetPrice.trim()}\n\nListing: ${listing.title} — ${listing.address}, ${listing.village.name}`,
      }, auth.isSignedIn ? auth.getToken : undefined)
      setSubmitted(true)
    } catch (submitError) {
      console.warn('Unable to submit price alert', submitError)
      setError(submitError instanceof Error ? submitError.message : 'We could not save this price alert yet.')
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
              <Text style={styles.kicker}>Price alert saved</Text>
              <Text style={styles.requestTitle}>We’ll watch this listing.</Text>
              <Text style={styles.requestCopy}>The Hafa Homes team can follow up when price activity matters for {listing.title}.</Text>
              <Pressable style={styles.primaryCta} onPress={onClose}><Text style={styles.primaryCtaText}>Done</Text></Pressable>
            </View>
          ) : (
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <View style={styles.sheetHandle} />
              <View style={styles.sheetHeaderRow}>
                <View style={styles.sheetHeaderCopy}>
                  <Text style={styles.kicker}>Price alert</Text>
                  <Text style={styles.requestTitle}>Set a target price</Text>
                </View>
                <Pressable onPress={onClose} style={styles.sheetCloseButton}><Text style={styles.sheetCloseText}>×</Text></Pressable>
              </View>
              <View style={styles.requestListingSummary}>
                <Text style={styles.requestListingPrice}>{currency(listing.price, listing.listing_kind)}</Text>
                <Text numberOfLines={1} style={styles.requestListingTitle}>{listing.title}</Text>
                <Text numberOfLines={1} style={styles.cardMeta}>{listing.village.name} · {listing.address}</Text>
              </View>
              <View style={styles.requestFieldGroup}>
                <RequestInput label="Target price" value={targetPrice} onChangeText={setTargetPrice} placeholder="750000" keyboardType="number-pad" />
                <RequestInput label="Email" value={email} onChangeText={setEmail} placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none" />
                <RequestInput label="Name" value={name} onChangeText={setName} placeholder="Your name" />
                <RequestInput label="Phone optional" value={phone} onChangeText={setPhone} placeholder="+1671" keyboardType="phone-pad" />
              </View>
              {error && <Text style={styles.requestError}>{error}</Text>}
              <Pressable disabled={submitting} style={[styles.primaryCta, submitting && styles.ctaDisabled]} onPress={handleSubmit}>
                <Text style={styles.primaryCtaText}>{submitting ? 'Saving alert...' : 'Save price alert'}</Text>
              </Pressable>
            </ScrollView>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

function RequestInput({ label, value, onChangeText, placeholder = '', keyboardType, autoCapitalize, secureTextEntry }: { label: string; value: string; onChangeText: (value: string) => void; placeholder?: string; keyboardType?: 'default' | 'email-address' | 'phone-pad' | 'number-pad'; autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters'; secureTextEntry?: boolean }) {
  return (
    <View>
      <Text style={styles.requestLabel}>{label}</Text>
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
  screenIntro: { backgroundColor: 'white', borderRadius: 28, padding: 18 },
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
  featureRow: { alignItems: 'center', backgroundColor: 'white', borderRadius: 18, flexDirection: 'row', gap: 10, padding: 14 },
  featureBullet: { color: colors.green2, fontSize: 16, fontWeight: '900' },
  featureText: { color: colors.ink, fontSize: 15, fontWeight: '800' },
  accountCard: { backgroundColor: colors.green, borderRadius: 26, gap: 10, marginBottom: 12, padding: 18 },
  accountKicker: { color: colors.mint, fontSize: 12, fontWeight: '900', letterSpacing: 1.8, textTransform: 'uppercase' },
  accountTitle: { color: 'white', fontSize: 22, fontWeight: '900', letterSpacing: -0.5 },
  accountCopy: { color: 'rgba(255,255,255,0.78)', fontSize: 14, fontWeight: '700', lineHeight: 21 },
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
  socialCta: { alignItems: 'center', backgroundColor: 'white', borderColor: '#eadfce', borderRadius: 20, borderWidth: 1, flexDirection: 'row', gap: 12, justifyContent: 'center', padding: 15 },
  socialCtaMark: { alignItems: 'center', backgroundColor: colors.sand, borderRadius: 999, height: 28, justifyContent: 'center', width: 28 },
  socialCtaMarkText: { color: colors.green, fontSize: 14, fontWeight: '900' },
  socialCtaText: { color: colors.ink, fontSize: 15, fontWeight: '900' },
  appleCta: { backgroundColor: colors.ink, borderColor: colors.ink },
  appleCtaMark: { alignItems: 'center', backgroundColor: 'white', borderRadius: 999, height: 28, justifyContent: 'center', width: 28 },
  appleCtaMarkText: { color: colors.ink, fontSize: 14, fontWeight: '900' },
  appleCtaText: { color: 'white', fontSize: 15, fontWeight: '900' },
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
  requestListingSummary: { backgroundColor: colors.sand, borderRadius: 22, marginTop: 16, padding: 14 },
  requestListingPrice: { color: colors.green, fontSize: 23, fontWeight: '900', letterSpacing: -0.7 },
  requestListingTitle: { color: colors.ink, fontSize: 15, fontWeight: '900', marginTop: 3 },
  requestFieldGroup: { gap: 12, marginTop: 16 },
  requestLabel: { color: colors.green, fontSize: 11, fontWeight: '900', letterSpacing: 1.1, marginBottom: 6, textTransform: 'uppercase' },
  requestInput: { backgroundColor: colors.sand, borderColor: '#eadfce', borderRadius: 18, borderWidth: 1, color: colors.ink, fontSize: 15, fontWeight: '800', minHeight: 50, paddingHorizontal: 14, paddingVertical: 12 },
  requestMessageInput: { minHeight: 96, textAlignVertical: 'top' },
  contactSegmentRow: { backgroundColor: colors.sand, borderRadius: 18, flexDirection: 'row', gap: 6, padding: 5 },
  contactSegment: { alignItems: 'center', borderRadius: 14, flex: 1, paddingVertical: 10 },
  contactSegmentActive: { backgroundColor: 'white', shadowColor: colors.green, shadowOpacity: 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  contactSegmentText: { color: colors.muted, fontSize: 13, fontWeight: '900', textTransform: 'capitalize' },
  contactSegmentTextActive: { color: colors.green },
  requestError: { color: '#a33b2f', fontSize: 13, fontWeight: '800', lineHeight: 19, marginTop: 12 },
  requestSuccess: { paddingVertical: 20 },
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
  showingSummaryCard: { backgroundColor: colors.sand, borderRadius: 16, marginTop: 10, padding: 12 },
})
