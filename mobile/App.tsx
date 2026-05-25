import AsyncStorage from '@react-native-async-storage/async-storage'
import { StatusBar } from 'expo-status-bar'
import { WebView } from 'react-native-webview'
import { useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
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

const tabs: Array<{ key: TabKey; label: string; icon: string }> = [
  { key: 'search', label: 'Search', icon: '⌂' },
  { key: 'map', label: 'Map', icon: '⌖' },
  { key: 'saved', label: 'Saved', icon: '♡' },
  { key: 'agents', label: 'Agents', icon: '◎' },
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

async function createLead(payload: {
  listing_id: number
  lead_type: 'showing_request'
  name: string
  email: string
  phone: string
  preferred_contact_method: string
  message: string
}) {
  const response = await fetch(`${API_URL}/api/v1/leads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lead: payload }),
  })

  if (!response.ok) throw new Error('Unable to send request')
  return response.json()
}

export default function App() {
  const [activeTab, setActiveTab] = useState<TabKey>('map')
  const [kind, setKind] = useState<ListingKind>('sale')
  const [searchQuery, setSearchQuery] = useState('')
  const [listings, setListings] = useState<Listing[]>([])
  const [listingCache, setListingCache] = useState<Record<number, Listing>>({})
  const [selectedListing, setSelectedListing] = useState<Listing | null>(null)
  const [savedListingIds, setSavedListingIds] = useState<number[]>([])
  const [savedStorageLoaded, setSavedStorageLoaded] = useState(false)
  const [savedStorageWritable, setSavedStorageWritable] = useState(false)
  const [fullMapOpen, setFullMapOpen] = useState(false)
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

        if (!cancelled) {
          setSavedStorageWritable(true)
          setSavedStorageLoaded(true)
        }
      } catch (storageError) {
        console.warn('Unable to load saved Hafa Homes listings', storageError)
        if (!cancelled) setSavedStorageLoaded(true)
      }
    }

    loadSavedListings()

    return () => {
      cancelled = true
    }
  }, [])

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
    if (!savedStorageLoaded || !savedStorageWritable) return

    Promise.all([
      AsyncStorage.setItem(SAVED_LISTING_IDS_KEY, JSON.stringify(savedListingIds)),
      AsyncStorage.setItem(SAVED_LISTINGS_KEY, JSON.stringify(savedListings)),
    ]).catch((storageError) => console.warn('Unable to persist saved Hafa Homes listings', storageError))
  }, [savedListingIds, savedListings, savedStorageLoaded, savedStorageWritable])

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
      {!(activeTab === 'map' && fullMapOpen) && <View style={styles.header}>
        <View style={styles.brandRow}>
          <View style={styles.brandMark}><Image source={require('./assets/hafa-homes-icon.png')} style={styles.brandMarkImage} /></View>
          <View>
            <Text style={styles.brandTitle}>Hafa Homes</Text>
            <Text style={styles.brandSubtitle}>Guam real estate app</Text>
          </View>
        </View>
        <View style={styles.searchBar}>
          <Text style={styles.searchIcon}>⌕</Text>
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Address, village, or MLS"
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
          savedStorageLoaded
            ? <SavedScreen listings={savedListings} onOpen={setSelectedListing} onToggleSaved={toggleSaved} />
            : <CenteredState label="Loading saved homes..." loading />
        )}
        {activeTab === 'agents' && <AgentsScreen listings={listings} />}
        {activeTab === 'more' && <MoreScreen />}
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
    </SafeAreaView>
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
    setMapLoading(Boolean(MAPBOX_TOKEN && points.length > 0))
    setPreviewListing(null)
  }, [mapHtml, points.length])

  return (
    <View style={styles.mapScreen}>
      <View style={styles.nativeMapFrame}>
        {MAPBOX_TOKEN && points.length > 0 ? (
          <WebView
            originWhitelist={['*']}
            source={mapSource}
            style={styles.nativeMap}
            onLoadEnd={() => setMapLoading(false)}
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
        postMessage({ type: 'map-ready' });
      });
    </script>
  </body>
</html>`
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

function ListingDetailScreen({ listing, saved, onBack, onToggleSaved }: { listing: Listing; saved: boolean; onBack: () => void; onToggleSaved: () => void }) {
  const [imageUri, setImageUri] = useState(listing.photos?.[0]?.url || listing.primary_photo_url || FALLBACK_IMAGE)
  const [showMortgageCalculator, setShowMortgageCalculator] = useState(false)
  const [showRequestForm, setShowRequestForm] = useState(false)

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
          <Pressable style={styles.primaryCta} onPress={() => setShowRequestForm(true)}>
            <Text style={styles.primaryCtaText}>Request a showing</Text>
          </Pressable>
          {listing.listing_kind === 'sale' && (
            <>
              <Pressable
                style={styles.secondaryCta}
                onPress={() => setShowMortgageCalculator((current) => !current)}
              >
                <Text style={styles.secondaryCtaText}>{showMortgageCalculator ? 'Hide mortgage calculator' : 'Estimate mortgage payment'}</Text>
              </Pressable>
              {showMortgageCalculator && <MortgageCalculator listing={listing} />}
            </>
          )}
        </View>
      </ScrollView>
      <ShowingRequestSheet listing={listing} open={showRequestForm} onClose={() => setShowRequestForm(false)} />
    </SafeAreaView>
  )
}

function ShowingRequestSheet({ listing, open, onClose }: { listing: Listing; open: boolean; onClose: () => void }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [preferredContact, setPreferredContact] = useState('phone')
  const [message, setMessage] = useState(`I'm interested in ${listing.title}.`)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setMessage(`I'm interested in ${listing.title}.`)
    setSubmitted(false)
    setError(null)
  }, [listing.title, open])

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
        message: `${message.trim()}\n\nListing: ${listing.title} — ${listing.address}, ${listing.village.name}`,
      })
      setSubmitted(true)
    } catch (submitError) {
      console.warn('Unable to submit showing request', submitError)
      setError('We could not send the request yet. Please try again in a moment.')
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
              <Text style={styles.requestCopy}>The Hafa Homes team can follow up about {listing.title} and help coordinate next steps.</Text>
              <Pressable style={styles.primaryCta} onPress={onClose}><Text style={styles.primaryCtaText}>Done</Text></Pressable>
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
                <RequestInput label="Phone" value={phone} onChangeText={setPhone} placeholder="(671) 555-0123" keyboardType="phone-pad" />
                <Text style={styles.requestLabel}>Preferred contact</Text>
                <View style={styles.contactSegmentRow}>
                  {['phone', 'text', 'email'].map((option) => (
                    <Pressable key={option} onPress={() => setPreferredContact(option)} style={[styles.contactSegment, preferredContact === option && styles.contactSegmentActive]}>
                      <Text style={[styles.contactSegmentText, preferredContact === option && styles.contactSegmentTextActive]}>{option}</Text>
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

function RequestInput({ label, value, onChangeText, placeholder, keyboardType, autoCapitalize }: { label: string; value: string; onChangeText: (value: string) => void; placeholder: string; keyboardType?: 'default' | 'email-address' | 'phone-pad'; autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters' }) {
  return (
    <View>
      <Text style={styles.requestLabel}>{label}</Text>
      <TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor="#7b8a84" keyboardType={keyboardType} autoCapitalize={autoCapitalize} style={styles.requestInput} />
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
})
