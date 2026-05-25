import AsyncStorage from '@react-native-async-storage/async-storage'
import { StatusBar } from 'expo-status-bar'
import { WebView } from 'react-native-webview'
import { useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
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
        {activeTab === 'search' && (
          loading
            ? <CenteredState label="Loading Guam listings..." loading />
            : error
              ? <CenteredState label={error} />
              : <SearchScreen listings={listings} savedIds={savedListingIds} onOpen={setSelectedListing} onToggleSaved={toggleSaved} />
        )}
        {activeTab === 'map' && (
          loading
            ? <CenteredState label="Loading Guam listings..." loading />
            : error
              ? <CenteredState label={error} />
              : <MapScreen listings={listings} onOpen={setSelectedListing} />
        )}
        {activeTab === 'saved' && (
          savedStorageLoaded
            ? <SavedScreen listings={savedListings} onOpen={setSelectedListing} onToggleSaved={toggleSaved} />
            : <CenteredState label="Loading saved homes..." loading />
        )}
        {activeTab === 'agents' && <AgentsScreen listings={listings} />}
        {activeTab === 'more' && <MoreScreen />}
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

function MapScreen({ listings, onOpen }: { listings: Listing[]; onOpen: (listing: Listing) => void }) {
  const points = listings.filter((listing) => listing.latitude && listing.longitude)
  const mapHtml = useMemo(() => buildMapHtml(points), [points])

  return (
    <View style={styles.mapScreen}>
      <View style={styles.nativeMapFrame}>
        {MAPBOX_TOKEN && points.length > 0 ? (
          <WebView
            originWhitelist={['*']}
            source={{ html: mapHtml }}
            style={styles.nativeMap}
            onMessage={(event) => {
              const listingId = Number(event.nativeEvent.data)
              const listing = listings.find((item) => item.id === listingId)
              if (listing) onOpen(listing)
            }}
            scrollEnabled={false}
          />
        ) : (
          <View style={styles.mapFallback}>
            <Text style={styles.mapCanvasTitle}>{MAPBOX_TOKEN ? 'No mapped listings yet' : 'Mapbox token needed'}</Text>
            <Text style={styles.mapCanvasCopy}>{MAPBOX_TOKEN ? 'Homes with map coordinates will appear here as soon as they are available.' : 'Add EXPO_PUBLIC_MAPBOX_TOKEN to mobile/.env and restart Expo with npm run start -- --clear.'}</Text>
          </View>
        )}
        <View style={styles.mapOverlay} pointerEvents="none">
          <Text style={styles.mapTitle}>Map search</Text>
          <Text style={styles.mapCount}>{points.length} listings</Text>
        </View>
      </View>
    </View>
  )
}

function buildMapHtml(points: Listing[]) {
  const safePoints = points.map((listing) => ({
    id: listing.id,
    price: currency(listing.price, listing.listing_kind).replace('/mo', ''),
    latitude: listing.latitude,
    longitude: listing.longitude,
    title: listing.title,
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
      .marker {
        appearance: none;
        background: #0f3d35;
        border: 0;
        border-radius: 999px;
        box-shadow: 0 14px 28px rgba(15, 61, 53, 0.28);
        color: white;
        cursor: pointer;
        font: 800 13px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        min-height: 38px;
        padding: 0 14px;
        white-space: nowrap;
      }
    </style>
  </head>
  <body>
    <div id="map"></div>
    <script>
      mapboxgl.accessToken = ${JSON.stringify(MAPBOX_TOKEN || '')};
      const points = ${JSON.stringify(safePoints)};
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
      points.forEach((listing) => {
        if (!listing.latitude || !listing.longitude) return;
        const element = document.createElement('button');
        element.className = 'marker';
        element.textContent = listing.price;
        element.setAttribute('aria-label', listing.title);
        element.addEventListener('click', () => {
          window.ReactNativeWebView && window.ReactNativeWebView.postMessage(String(listing.id));
        });
        new mapboxgl.Marker({ element, anchor: 'center' })
          .setLngLat([listing.longitude, listing.latitude])
          .addTo(map);
        bounds.extend([listing.longitude, listing.latitude]);
      });

      map.on('load', () => {
        if (!bounds.isEmpty()) {
          map.fitBounds(bounds, { padding: { top: 130, right: 70, bottom: 120, left: 70 }, maxZoom: 12.2, duration: 650 });
        }
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
            onPress={() => setShowMortgageCalculator((current) => !current)}
          >
            <Text style={styles.secondaryCtaText}>{showMortgageCalculator ? 'Hide mortgage calculator' : 'Estimate mortgage payment'}</Text>
          </Pressable>
          {showMortgageCalculator && <MortgageCalculator listing={listing} />}
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
  shell: { flex: 1, backgroundColor: 'white' },
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
  tabBar: { backgroundColor: 'rgba(255,255,255,0.96)', borderTopColor: 'rgba(0,0,0,0.08)', borderTopWidth: 1, flexDirection: 'row', paddingBottom: 8, paddingTop: 8 },
  tabButton: { alignItems: 'center', borderRadius: 18, flex: 1, gap: 2, height: 68, justifyContent: 'center', marginHorizontal: 3, paddingBottom: 4, paddingTop: 3 },
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
})
