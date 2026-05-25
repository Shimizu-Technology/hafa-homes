import AsyncStorage from '@react-native-async-storage/async-storage'
import { StatusBar } from 'expo-status-bar'
import { useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Linking,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'

type TabKey = 'search' | 'map' | 'saved' | 'agents' | 'more'
type ListingKind = 'sale' | 'rent'

type Feature = {
  id: number
  name: string
  slug: string
}

type Village = {
  id: number
  name: string
  slug: string
  region?: string
}

type ListingPhoto = {
  id: number
  url: string
  position: number
  alt_text?: string
}

type Listing = {
  id: number
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

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000'
const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN
const FALLBACK_IMAGE = 'https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?auto=format&fit=crop&w=1200&q=80'
const SAVED_LISTING_IDS_KEY = 'hafaHomes:savedListingIds'
const SAVED_LISTINGS_KEY = 'hafaHomes:savedListings'

type MapboxModule = typeof import('@rnmapbox/maps').default
let Mapbox: MapboxModule | null = null

try {
  // @rnmapbox/maps needs a custom Expo dev build. Keep Expo Go usable by falling back if the native module is unavailable.
  Mapbox = require('@rnmapbox/maps').default as MapboxModule
  if (MAPBOX_TOKEN) Mapbox.setAccessToken(MAPBOX_TOKEN)
} catch (mapboxError) {
  console.warn('Native Mapbox module unavailable; showing fallback map state.', mapboxError)
}

const tabs: Array<{ key: TabKey; label: string; icon: string }> = [
  { key: 'search', label: 'Search', icon: '⌂' },
  { key: 'map', label: 'Map', icon: '⌖' },
  { key: 'saved', label: 'Saved', icon: '♡' },
  { key: 'agents', label: 'Agents', icon: '◎' },
  { key: 'more', label: 'More', icon: '☰' },
]

function currency(value: number, kind: ListingKind) {
  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value)

  return kind === 'rent' ? `${formatted}/mo` : formatted
}

async function fetchListings(kind: ListingKind): Promise<Listing[]> {
  const response = await fetch(`${API_URL}/api/v1/listings?kind=${kind}`)
  if (!response.ok) throw new Error('Unable to load listings')
  const json = await response.json()
  return json.listings ?? []
}

export default function App() {
  const [activeTab, setActiveTab] = useState<TabKey>('map')
  const [kind, setKind] = useState<ListingKind>('sale')
  const [listings, setListings] = useState<Listing[]>([])
  const [listingCache, setListingCache] = useState<Record<number, Listing>>({})
  const [selectedListing, setSelectedListing] = useState<Listing | null>(null)
  const [savedListingIds, setSavedListingIds] = useState<number[]>([])
  const [savedStorageLoaded, setSavedStorageLoaded] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadSavedListings() {
      try {
        const [savedIdsJson, savedListingsJson] = await Promise.all([
          AsyncStorage.getItem(SAVED_LISTING_IDS_KEY),
          AsyncStorage.getItem(SAVED_LISTINGS_KEY),
        ])
        if (cancelled) return

        const persistedIds = savedIdsJson ? JSON.parse(savedIdsJson) : []
        const persistedListings = savedListingsJson ? JSON.parse(savedListingsJson) : []

        if (Array.isArray(persistedIds)) {
          setSavedListingIds(persistedIds.filter((id): id is number => typeof id === 'number'))
        }

        if (Array.isArray(persistedListings)) {
          setListingCache((current) => {
            const next = { ...current }
            persistedListings.forEach((listing) => {
              if (listing && typeof listing.id === 'number') next[listing.id] = listing as Listing
            })
            return next
          })
        }
      } catch (storageError) {
        console.warn('Unable to load saved Hafa Homes listings', storageError)
      } finally {
        if (!cancelled) setSavedStorageLoaded(true)
      }
    }

    loadSavedListings()

    return () => {
      cancelled = true
    }
  }, [])

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

  const savedListings = useMemo(
    () => savedListingIds.map((id) => listingCache[id]).filter((listing): listing is Listing => Boolean(listing)),
    [listingCache, savedListingIds],
  )

  useEffect(() => {
    if (!savedStorageLoaded) return

    Promise.all([
      AsyncStorage.setItem(SAVED_LISTING_IDS_KEY, JSON.stringify(savedListingIds)),
      AsyncStorage.setItem(SAVED_LISTINGS_KEY, JSON.stringify(savedListings)),
    ]).catch((storageError) => console.warn('Unable to persist saved Hafa Homes listings', storageError))
  }, [savedListingIds, savedListings, savedStorageLoaded])

  function toggleSaved(listingId: number) {
    const listingToCache = listingCache[listingId] ?? listings.find((listing) => listing.id === listingId) ?? selectedListing

    if (listingToCache && !listingCache[listingId]) {
      setListingCache((current) => ({ ...current, [listingId]: listingToCache }))
    }

    setSavedListingIds((current) => (
      current.includes(listingId) ? current.filter((id) => id !== listingId) : [...current, listingId]
    ))
  }

  if (selectedListing) {
    return (
      <ListingDetailScreen
        listing={selectedListing}
        saved={savedListingIds.includes(selectedListing.id)}
        onBack={() => setSelectedListing(null)}
        onToggleSaved={() => toggleSaved(selectedListing.id)}
      />
    )
  }

  return (
    <SafeAreaView style={styles.shell}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <View style={styles.brandRow}>
          <View style={styles.brandMark}><Image source={require('./assets/hafa-homes-icon.png')} style={styles.brandMarkImage} /></View>
          <View>
            <Text style={styles.brandTitle}>Hafa Homes</Text>
            <Text style={styles.brandSubtitle}>Guam real estate app</Text>
          </View>
        </View>
        <View style={styles.searchBar}>
          <Text style={styles.searchIcon}>⌕</Text>
          <TextInput placeholder="Address, village, or MLS" placeholderTextColor="#53645f" style={styles.searchInput} />
        </View>
        <View style={styles.segmentedControl}>
          {(['sale', 'rent'] as const).map((option) => (
            <Pressable key={option} onPress={() => setKind(option)} style={[styles.segmentButton, kind === option && styles.segmentButtonActive]}>
              <Text style={[styles.segmentText, kind === option && styles.segmentTextActive]}>{option === 'sale' ? 'Buy' : 'Rent'}</Text>
            </Pressable>
          ))}
          <Text style={styles.resultCount}>{listings.length} found</Text>
        </View>
      </View>

      <View style={styles.content}>
        {loading && <CenteredState label="Loading Guam listings..." loading />}
        {error && <CenteredState label={error} />}
        {!loading && !error && activeTab === 'search' && (
          <SearchScreen listings={listings} savedIds={savedListingIds} onOpen={setSelectedListing} onToggleSaved={toggleSaved} />
        )}
        {!loading && !error && activeTab === 'map' && (
          <MapScreen listings={listings} onOpen={setSelectedListing} />
        )}
        {!loading && !error && activeTab === 'saved' && (
          <SavedScreen listings={savedListings} onOpen={setSelectedListing} onToggleSaved={toggleSaved} />
        )}
        {!loading && !error && activeTab === 'agents' && <AgentsScreen listings={listings} />}
        {!loading && !error && activeTab === 'more' && <MoreScreen />}
      </View>

      <View style={styles.tabBar}>
        {tabs.map((tab) => (
          <Pressable key={tab.key} onPress={() => setActiveTab(tab.key)} style={[styles.tabButton, activeTab === tab.key && styles.tabButtonActive]}>
            <View style={[styles.tabIndicator, activeTab === tab.key && styles.tabIndicatorActive]} />
            <Text style={[styles.tabIcon, activeTab === tab.key && styles.tabActive]}>{tab.icon}</Text>
            <Text style={[styles.tabLabel, activeTab === tab.key && styles.tabActive]}>{tab.label}</Text>
          </Pressable>
        ))}
      </View>
    </SafeAreaView>
  )
}

function SearchScreen({ listings, savedIds, onOpen, onToggleSaved }: { listings: Listing[]; savedIds: number[]; onOpen: (listing: Listing) => void; onToggleSaved: (listingId: number) => void }) {
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

function MapScreen({ listings, onOpen }: { listings: Listing[]; onOpen: (listing: Listing) => void }) {
  const points = listings.filter((listing) => listing.latitude && listing.longitude)
  const NativeMapbox = Mapbox

  return (
    <View style={styles.mapScreen}>
      <View style={styles.nativeMapFrame}>
        {MAPBOX_TOKEN && NativeMapbox ? (
          <NativeMapbox.MapView style={styles.nativeMap} styleURL={NativeMapbox.StyleURL.Outdoors} logoEnabled={false} attributionEnabled>
            <NativeMapbox.Camera
              bounds={points.length > 1 ? {
                ne: [Math.max(...points.map((listing) => listing.longitude ?? 144.7937)), Math.max(...points.map((listing) => listing.latitude ?? 13.4443))],
                sw: [Math.min(...points.map((listing) => listing.longitude ?? 144.7937)), Math.min(...points.map((listing) => listing.latitude ?? 13.4443))],
                paddingBottom: 120,
                paddingLeft: 70,
                paddingRight: 70,
                paddingTop: 130,
              } : undefined}
              centerCoordinate={[144.7937, 13.4443]}
              zoomLevel={10.2}
              animationDuration={700}
            />
            {points.map((listing) => (
              <NativeMapbox.MarkerView key={listing.id} coordinate={[listing.longitude ?? 144.7937, listing.latitude ?? 13.4443]} anchor={{ x: 0.5, y: 0.5 }}>
                <Pressable onPress={() => onOpen(listing)} style={styles.mapMarker}>
                  <Text style={styles.mapMarkerText}>{currency(listing.price, listing.listing_kind).replace('/mo', '')}</Text>
                </Pressable>
              </NativeMapbox.MarkerView>
            ))}
          </NativeMapbox.MapView>
        ) : (
          <View style={styles.mapFallback}>
            <Text style={styles.mapCanvasTitle}>{MAPBOX_TOKEN ? 'Native map build needed' : 'Mapbox token needed'}</Text>
            <Text style={styles.mapCanvasCopy}>
              {MAPBOX_TOKEN
                ? 'The Mapbox token is configured. Run npm run ios:dev or npm run android:dev so Expo builds the native Mapbox module.'
                : 'Add EXPO_PUBLIC_MAPBOX_TOKEN to mobile/.env, restart Expo with --clear, then run a custom development build.'}
            </Text>
          </View>
        )}
        <View style={styles.mapOverlay} pointerEvents="box-none">
          <Text style={styles.mapTitle}>Map search</Text>
          <Text style={styles.mapCount}>{points.length} listings</Text>
        </View>
      </View>
    </View>
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

function AgentsScreen({ listings }: { listings: Listing[] }) {
  const agentNames = Array.from(new Set(listings.map((listing) => listing.agent_name).filter((name): name is string => Boolean(name))))

  return (
    <ScrollView contentContainerStyle={styles.listContent}>
      <View style={styles.screenIntro}>
        <Text style={styles.kicker}>Local experts</Text>
        <Text style={styles.screenTitle}>Agents and brokerages</Text>
        <Text style={styles.screenCopy}>Connect with Guam real estate professionals for showings, questions, financing guidance, and neighborhood advice.</Text>
      </View>
      {(agentNames.length ? agentNames : ['Listing Agent', 'Relocation Specialist', 'Rental Advisor']).slice(0, 6).map((agent, index) => (
        <View key={agent} style={styles.agentCard}>
          <View style={styles.agentAvatar}><Text style={styles.agentInitial}>{agent.charAt(0)}</Text></View>
          <View style={styles.agentInfo}>
            <Text style={styles.agentName}>{agent}</Text>
            <Text style={styles.agentMeta}>{index % 2 === 0 ? 'Brokerage partner' : 'Hafa Homes network'}</Text>
          </View>
          <Text style={styles.agentCta}>Contact</Text>
        </View>
      ))}
    </ScrollView>
  )
}

function MoreScreen() {
  return (
    <ScrollView contentContainerStyle={styles.listContent}>
      <View style={styles.screenIntro}>
        <Text style={styles.kicker}>Resources</Text>
        <Text style={styles.screenTitle}>Island home search tools</Text>
        <Text style={styles.screenCopy}>Plan your search with local guidance for neighborhoods, schools, financing, saved homes, and relocation needs.</Text>
      </View>
      {['Mortgage calculator', 'Neighborhood guide', 'School and park nearby info', 'Saved search alerts', 'Military relocation tools'].map((item) => (
        <View key={item} style={styles.featureRow}>
          <Text style={styles.featureBullet}>✓</Text>
          <Text style={styles.featureText}>{item}</Text>
        </View>
      ))}
    </ScrollView>
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

function ListingDetailScreen({ listing, saved, onBack, onToggleSaved }: { listing: Listing; saved: boolean; onBack: () => void; onToggleSaved: () => void }) {
  const [imageUri, setImageUri] = useState(listing.photos?.[0]?.url || listing.primary_photo_url || FALLBACK_IMAGE)

  return (
    <SafeAreaView style={styles.shell}>
      <StatusBar style="light" />
      <ScrollView style={styles.detailScroll} contentContainerStyle={styles.detailContent}>
        <View style={styles.detailHeader}>
          <Pressable onPress={onBack} style={styles.backButton}><Text style={styles.backButtonText}>← Back</Text></Pressable>
          <Pressable onPress={onToggleSaved} style={[styles.detailSaveButton, saved && styles.saveButtonActive]}><Text style={[styles.saveText, saved && styles.saveTextActive]}>{saved ? '♥' : '♡'}</Text></Pressable>
        </View>
        <Image source={{ uri: imageUri }} onError={() => setImageUri(FALLBACK_IMAGE)} style={styles.detailImage} />
        <View style={styles.detailPanel}>
          <Text style={styles.priceLarge}>{currency(listing.price, listing.listing_kind)}</Text>
          <Text style={styles.detailTitle}>{listing.title}</Text>
          <Text style={styles.cardMeta}>{listing.village.name} · {listing.address}</Text>
          <Text style={styles.detailStats}>{listing.beds} beds · {listing.baths} baths · {listing.square_feet?.toLocaleString() ?? '—'} sqft</Text>
          <Text style={styles.sectionTitle}>Local details</Text>
          <Text style={styles.detailCopy}>{listing.description || 'Explore this Guam listing, request a showing, save it for later, or ask an agent for next steps.'}</Text>
          <Text style={styles.sectionTitle}>Agent</Text>
          <View style={styles.agentCard}>
            <View style={styles.agentAvatar}><Text style={styles.agentInitial}>{(listing.agent_name || 'H').charAt(0)}</Text></View>
            <View style={styles.agentInfo}>
              <Text style={styles.agentName}>{listing.agent_name || 'Hafa Homes Agent'}</Text>
              <Text style={styles.agentMeta}>{listing.brokerage_name || 'Brokerage partner'}</Text>
            </View>
          </View>
          <Pressable style={styles.primaryCta} onPress={() => Linking.openURL(`mailto:hello@hafahomes.com?subject=Showing request for ${encodeURIComponent(listing.title)}`)}>
            <Text style={styles.primaryCtaText}>Request a showing</Text>
          </Pressable>
          <Pressable
            style={styles.secondaryCta}
            onPress={() => Alert.alert('Mortgage estimate coming soon', 'The native app roadmap includes a guided mortgage calculator with down payment, rate, term, and monthly payment estimates.')}
          >
            <Text style={styles.secondaryCtaText}>Estimate mortgage payment</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
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
  brandRow: { alignItems: 'center', flexDirection: 'row', gap: 12, marginBottom: 16 },
  brandMark: { alignItems: 'center', backgroundColor: '#0b312b', borderRadius: 18, height: 52, justifyContent: 'center', overflow: 'hidden', width: 52 },
  brandMarkImage: { height: 52, width: 52 },
  brandMarkText: { color: colors.amber, fontSize: 18, fontWeight: '900' },
  brandTitle: { color: 'white', fontSize: 28, fontWeight: '900', letterSpacing: -0.8 },
  brandSubtitle: { color: '#bdebdc', fontSize: 12, fontWeight: '700', marginTop: 2, textTransform: 'uppercase' },
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
  listContent: { gap: 14, padding: 16, paddingBottom: 110 },
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
  tabBar: { backgroundColor: 'rgba(255,255,255,0.96)', borderTopColor: 'rgba(0,0,0,0.08)', borderTopWidth: 1, bottom: 0, flexDirection: 'row', left: 0, paddingBottom: 18, paddingTop: 8, position: 'absolute', right: 0 },
  tabButton: { alignItems: 'center', borderRadius: 18, flex: 1, gap: 2, marginHorizontal: 3, paddingBottom: 4, paddingTop: 3 },
  tabButtonActive: { backgroundColor: colors.mint },
  tabIndicator: { backgroundColor: 'transparent', borderRadius: 999, height: 3, marginBottom: 2, width: 24 },
  tabIndicatorActive: { backgroundColor: colors.green },
  tabIcon: { color: colors.muted, fontSize: 22, fontWeight: '800' },
  tabLabel: { color: colors.muted, fontSize: 11, fontWeight: '800' },
  tabActive: { color: colors.green },
  centeredState: { alignItems: 'center', flex: 1, gap: 12, justifyContent: 'center', padding: 24 },
  centeredText: { color: colors.muted, fontSize: 15, fontWeight: '700', lineHeight: 22, textAlign: 'center' },
  mapScreen: { flex: 1 },
  nativeMapFrame: { backgroundColor: '#9fd2eb', flex: 1, overflow: 'hidden' },
  nativeMap: { flex: 1 },
  mapFallback: { alignItems: 'center', backgroundColor: '#9fd2eb', flex: 1, justifyContent: 'center', padding: 28 },
  mapOverlay: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.94)', borderRadius: 24, flexDirection: 'row', justifyContent: 'space-between', left: 14, padding: 16, position: 'absolute', right: 14, top: 14 },
  mapTitle: { color: colors.ink, fontSize: 20, fontWeight: '900' },
  mapCount: { backgroundColor: colors.mint, borderRadius: 999, color: colors.green, fontSize: 14, fontWeight: '900', overflow: 'hidden', paddingHorizontal: 14, paddingVertical: 8 },
  mapCanvasTitle: { color: colors.green, fontSize: 20, fontWeight: '900', textAlign: 'center' },
  mapCanvasCopy: { color: colors.muted, fontSize: 14, fontWeight: '700', lineHeight: 21, marginTop: 8, textAlign: 'center' },
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
  detailScroll: { backgroundColor: colors.sand },
  detailContent: { paddingBottom: 28 },
  detailHeader: { alignItems: 'center', backgroundColor: colors.green, flexDirection: 'row', justifyContent: 'space-between', padding: 16 },
  backButton: { backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 10 },
  backButtonText: { color: 'white', fontSize: 14, fontWeight: '900' },
  detailSaveButton: { alignItems: 'center', backgroundColor: 'white', borderRadius: 999, height: 42, justifyContent: 'center', width: 42 },
  detailImage: { backgroundColor: '#dbe8df', height: 330, width: '100%' },
  detailPanel: { backgroundColor: 'white', borderTopLeftRadius: 32, borderTopRightRadius: 32, marginTop: -26, padding: 20 },
  priceLarge: { color: colors.ink, fontSize: 32, fontWeight: '900', letterSpacing: -1.2 },
  detailTitle: { color: colors.ink, fontSize: 25, fontWeight: '900', letterSpacing: -0.8, marginTop: 6 },
  detailStats: { color: '#324640', fontSize: 15, fontWeight: '900', marginTop: 14 },
  sectionTitle: { color: colors.green, fontSize: 17, fontWeight: '900', marginTop: 24 },
  detailCopy: { color: colors.muted, fontSize: 15, fontWeight: '600', lineHeight: 24, marginTop: 8 },
  primaryCta: { alignItems: 'center', backgroundColor: colors.green, borderRadius: 20, marginTop: 22, padding: 16 },
  primaryCtaText: { color: 'white', fontSize: 15, fontWeight: '900' },
  secondaryCta: { alignItems: 'center', backgroundColor: colors.mint, borderRadius: 20, marginTop: 10, padding: 16 },
  secondaryCtaText: { color: colors.green, fontSize: 15, fontWeight: '900' },
})
