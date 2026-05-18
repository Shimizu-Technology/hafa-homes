import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, Route, Routes, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Brand } from './components/Brand'
import {
  ArrowLeft,
  Bath,
  BedDouble,
  Bell,
  CheckCircle2,
  ChevronRight,
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
  Ruler,
  Search,
  Share2,
  ShieldCheck,
  SlidersHorizontal,
  TrendingUp,
  Waves,
  X,
} from 'lucide-react'
import { useMutation, useQuery } from '@tanstack/react-query'
import 'mapbox-gl/dist/mapbox-gl.css'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'
const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN

type Village = {
  id: number
  name: string
  slug: string
  region: string
  description?: string
  latitude?: number
  longitude?: number
  active_listings_count?: number
}

type Feature = {
  id: number
  name: string
  slug: string
  category: string
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
  primary_photo_url: string
  photos?: { id: number; url: string; position: number; alt_text: string }[]
  features: Feature[]
}

type ListingsResponse = { listings: Listing[] }
type ListingResponse = { listing: Listing }
type VillagesResponse = { villages: Village[] }
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

type Lead = {
  id: number
  lead_type: string
  name: string
  email: string
  phone: string
  preferred_contact_method: string
  message: string
  status: string
  listing_id?: number
  created_at: string
  listing?: { id: number; title: string; price: number; listing_kind: 'sale' | 'rent'; village: string } | null
}

type LeadsResponse = { leads: Lead[] }

type LeadPayload = {
  lead_type: string
  name: string
  email: string
  phone: string
  preferred_contact_method: string
  message: string
  listing_id?: number
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

async function fetchSyncRuns(): Promise<SyncRunsResponse> {
  const response = await fetch(`${API_URL}/api/v1/data_sync_runs`)
  if (!response.ok) throw new Error('Unable to load sync runs')
  return response.json()
}

async function fetchLeads(): Promise<LeadsResponse> {
  const response = await fetch(`${API_URL}/api/v1/leads`)
  if (!response.ok) throw new Error('Unable to load leads')
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
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lead: payload }),
  })
  if (!response.ok) throw new Error('Unable to submit lead')
  return response.json()
}

function currency(value: number, kind: string) {
  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value)

  return kind === 'rent' ? `${formatted}/mo` : formatted
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<SearchPage />} />
      <Route path="/listings/:id" element={<ListingDetailPage />} />
      <Route path="/villages" element={<VillagesPage />} />
      <Route path="/villages/:slug" element={<VillageDetailPage />} />
      <Route path="/military" element={<MilitaryPage />} />
      <Route path="/saved" element={<SavedPage />} />
      <Route path="/admin/sync" element={<SyncPage />} />
      <Route path="/admin/leads" element={<LeadsPage />} />
    </Routes>
  )
}

function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [showFilters, setShowFilters] = useState(false)
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list')
  const [saveSearchOpen, setSaveSearchOpen] = useState(false)
  const [fullMapOpen, setFullMapOpen] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
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

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(searchParams)
    if (value) next.set(key, value)
    else next.delete(key)
    setSearchParams(next)
  }

  function toggleFeature(slug: string) {
    const nextFeatures = featureList.includes(slug)
      ? featureList.filter((item) => item !== slug)
      : [...featureList, slug]
    setParam('features', nextFeatures.join(','))
  }

  return (
    <Shell>
      <MobileAppSearchHeader
        kind={kind}
        viewMode={viewMode}
        listingsCount={listings.length}
        onKindChange={(value) => setParam('kind', value)}
        onViewModeChange={setViewMode}
        onFilterClick={() => setShowFilters((value) => !value)}
        onMenuClick={() => setMobileMenuOpen(true)}
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
            <div className="mt-5 grid gap-4 border-t border-[#edf0ec] pt-5 md:grid-cols-3">
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
              kicker="Demo listings"
              title={`Latest Guam ${kind === 'sale' ? 'homes for sale' : 'rentals'}`}
              action={
                <div className="hidden items-center gap-2 md:flex">
                  <button onClick={() => setSaveSearchOpen(true)} className="inline-flex items-center gap-2 rounded-full border border-[#d7ded9] bg-white px-4 py-2 text-sm font-semibold"><Bell size={16} /> Save search</button>
                  <button onClick={() => setViewMode(viewMode === 'list' ? 'map' : 'list')} className="inline-flex items-center gap-2 rounded-full border border-[#d7ded9] bg-white px-4 py-2 text-sm font-semibold"><Map size={16} /> {viewMode === 'list' ? 'Map view' : 'List view'}</button>
                  <Link to="/admin/sync" className="inline-flex items-center gap-2 rounded-full border border-[#d7ded9] bg-white px-4 py-2 text-sm font-semibold"><DatabaseZap size={16} /> MLS sync</Link>
                </div>
              }
            />
          </div>

          {isLoading && <StateCard>Loading demo listings...</StateCard>}
          {isError && <StateCard tone="error">Start the Rails API on port 3000 or set VITE_API_URL to load seed listings.</StateCard>}
          {!isLoading && listings.length === 0 && <StateCard>No demo listings match those filters yet.</StateCard>}

          {viewMode === 'map' ? (
            <MapPanel listings={listings} onExpand={() => setFullMapOpen(true)} />
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
      <div className="px-4 pb-3 pt-3">
        <div className="flex items-center justify-between gap-3">
          <Brand light />
          <button onClick={onMenuClick} className="grid h-11 w-11 place-items-center rounded-full border border-white/20 text-white/86">
            <Menu size={22} />
          </button>
        </div>
        <div className="mt-4 grid grid-cols-[1fr_auto] gap-2">
          <div className="flex min-h-12 items-center gap-2 rounded-2xl bg-white px-3 text-[#53645f]">
            <Search size={17} />
            <span className="text-sm font-semibold">Address, village, or MLS</span>
          </div>
          <button className="rounded-2xl bg-[#e99f3e] px-4 text-sm font-bold text-[#25170b]">Save</button>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-sm font-bold">
          <button onClick={onFilterClick} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-white/10 text-white/86"><SlidersHorizontal size={17} /> Filter</button>
          <button onClick={() => onViewModeChange('map')} className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl ${viewMode === 'map' ? 'bg-white text-[#0f3d35]' : 'bg-white/10 text-white/86'}`}><Map size={17} /> Map</button>
          <button onClick={() => onViewModeChange('list')} className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl ${viewMode === 'list' ? 'bg-white text-[#0f3d35]' : 'bg-white/10 text-white/86'}`}><Menu size={17} /> List</button>
        </div>
        <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl bg-white/10 p-1 text-sm font-bold">
          {(['sale', 'rent'] as const).map((option) => (
            <button
              key={option}
              onClick={() => onKindChange(option)}
              className={`min-h-10 flex-1 rounded-xl capitalize ${kind === option ? 'bg-white text-[#0f3d35]' : 'text-white/75'}`}
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
            <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs text-white/70">
              <div className="rounded-2xl bg-white/10 p-3"><strong className="block text-lg text-white">MLS</strong> ready</div>
              <div className="rounded-2xl bg-white/10 p-3"><strong className="block text-lg text-white">PWA</strong> first</div>
              <div className="rounded-2xl bg-white/10 p-3"><strong className="block text-lg text-white">Guam</strong> local</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function ListingCard({ listing }: { listing: Listing }) {
  return (
    <article className="group overflow-hidden rounded-[1.7rem] border border-black/5 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-xl hover:shadow-[#0f3d35]/10 md:grid md:grid-cols-[240px_1fr]">
      <Link to={`/listings/${listing.id}`} className="block overflow-hidden">
        <img src={listing.primary_photo_url} alt="" className="h-56 w-full object-cover transition duration-500 group-hover:scale-105 md:h-full" />
      </Link>
      <div className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-2xl font-bold tracking-[-0.04em]">{currency(listing.price, listing.listing_kind)}</p>
            <Link to={`/listings/${listing.id}`} className="mt-1 block text-lg font-semibold transition hover:text-[#0f705e]">{listing.title}</Link>
            <p className="mt-1 flex items-center gap-1 text-sm text-[#66746f]"><MapPin size={14} /> {listing.village.name} · {listing.address}</p>
          </div>
          <span className="rounded-full bg-[#e9f5ef] px-3 py-1 text-xs font-bold uppercase tracking-wide text-[#0f705e]">{listing.listing_kind}</span>
        </div>
        <PropertyStats listing={listing} />
        <FeaturePills features={listing.features.slice(0, 4)} />
        <div className="mt-5 flex items-center justify-between">
          <Link to={`/listings/${listing.id}`} className="inline-flex items-center gap-2 text-sm font-bold text-[#0f3d35]">View details <ChevronRight size={16} /></Link>
          <button className="rounded-full border border-[#d7ded9] p-2 text-[#53645f]"><Heart size={17} /></button>
        </div>
      </div>
    </article>
  )
}

function ListingDetailPage() {
  const { id = '' } = useParams()
  const [leadOpen, setLeadOpen] = useState(false)
  const [priceTrackerOpen, setPriceTrackerOpen] = useState(false)
  const [saved, setSaved] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [photoIndex, setPhotoIndex] = useState(0)
  const { data, isLoading, isError } = useQuery({ queryKey: ['listing', id], queryFn: () => fetchListing(id), enabled: Boolean(id) })
  const listing = data?.listing
  const photos = listing?.photos?.length ? listing.photos : listing ? [{ id: 0, url: listing.primary_photo_url, position: 1, alt_text: listing.title }] : []

  async function shareListing() {
    if (!listing) return
    const shareData = { title: listing.title, text: `${listing.title} — ${currency(listing.price, listing.listing_kind)}`, url: window.location.href }
    if (navigator.share) await navigator.share(shareData)
    else await navigator.clipboard?.writeText(window.location.href)
  }

  return (
    <main className="min-h-screen bg-[#f6f1e8] pb-28 text-[#17211f] md:pb-0">
      {isLoading && <div className="p-5"><StateCard>Loading listing...</StateCard></div>}
      {isError && <div className="p-5"><StateCard tone="error">Unable to load listing.</StateCard></div>}
      {listing && (
        <>
          <div className="safe-top sticky top-0 z-40 border-b border-white/10 bg-[#0f3d35] px-4 pb-4 pt-5 text-white shadow-xl shadow-[#0f3d35]/15 md:hidden">
            <div className="flex items-center justify-between gap-3">
              <Link to="/" className="inline-flex min-h-12 items-center gap-2 rounded-full bg-white/10 px-4 text-sm font-bold"><ArrowLeft size={18} /> Search</Link>
              <div className="flex items-center gap-2">
                <button onClick={() => setLeadOpen(true)} className="min-h-12 rounded-2xl bg-[#e99f3e] px-5 text-sm font-bold text-[#25170b]">Schedule tour</button>
                <button onClick={() => setMenuOpen(true)} className="grid h-12 w-12 place-items-center rounded-full bg-white/10"><Menu size={20} /></button>
              </div>
            </div>
          </div>

          <div className="hidden bg-[#0f3d35] px-5 py-5 text-white md:block"><div className="mx-auto max-w-7xl"><TopNav /></div></div>

          <section className="mx-auto max-w-7xl md:px-5 md:py-6">
            <Link to="/" className="mb-6 hidden items-center gap-2 text-sm font-bold text-[#0f705e] md:inline-flex"><ArrowLeft size={16} /> Back to search</Link>
            <div className="grid gap-6 lg:grid-cols-[1fr_390px]">
              <div>
                <div className="relative mx-4 mt-5 overflow-hidden rounded-[2rem] bg-[#0f3d35] shadow-xl shadow-[#0f3d35]/10 md:mx-0 md:mt-0">
                  <img
                    src={photos[photoIndex]?.url || listing.primary_photo_url}
                    alt=""
                    className="h-[40svh] min-h-[300px] w-full object-cover md:h-[560px]"
                  />
                  {photos.length > 1 && (
                    <>
                      <button onClick={() => setPhotoIndex((photoIndex - 1 + photos.length) % photos.length)} className="absolute left-3 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-[#0f3d35] shadow-lg"><ChevronLeft size={22} /></button>
                      <button onClick={() => setPhotoIndex((photoIndex + 1) % photos.length)} className="absolute right-3 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-[#0f3d35] shadow-lg"><ChevronRightIcon size={22} /></button>
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
                </div>
              </div>

              <aside className="hidden lg:sticky lg:top-6 lg:block lg:self-start">
                <div className="rounded-[2rem] border border-black/5 bg-white p-6 shadow-xl shadow-[#0f3d35]/10">
                  <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#7b8a84]">Request info</p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">Ask about this property</h2>
                  <p className="mt-3 text-sm leading-6 text-[#66746f]">Schedule a tour, track price changes, or save this listing for later.</p>
                  <button onClick={() => setLeadOpen(true)} className="mt-5 w-full rounded-2xl bg-[#0f3d35] px-4 py-3 text-sm font-bold text-white">Schedule Tour</button>
                  <button onClick={() => setPriceTrackerOpen(true)} className="mt-3 w-full rounded-2xl border border-[#d7ded9] px-4 py-3 text-sm font-bold text-[#0f3d35]">Add price tracker</button>
                  <dl className="mt-6 space-y-3 text-sm">
                    <InfoRow label="MLS/demo ID" value={listing.external_id || `HH-${listing.id}`} />
                    <InfoRow label="Agent" value={listing.agent_name || 'Hafa Homes Demo Team'} />
                    <InfoRow label="Brokerage" value={listing.brokerage_name || 'Demo Brokerage'} />
                  </dl>
                </div>
              </aside>
            </div>
          </section>

          <nav className="safe-bottom fixed inset-x-0 bottom-0 z-50 mx-4 mb-3 grid grid-cols-3 rounded-[1.5rem] border border-black/5 bg-white/95 px-3 pt-3 text-center text-xs font-bold text-[#0f3d35] shadow-2xl shadow-[#0f3d35]/15 backdrop-blur md:hidden">
            <button onClick={shareListing} className="flex min-h-16 flex-col items-center justify-center gap-1"><Share2 size={23} /> Share</button>
            <button onClick={() => setPriceTrackerOpen(true)} className="flex min-h-16 flex-col items-center justify-center gap-1"><TrendingUp size={23} /> Price alert</button>
            <button onClick={() => setSaved((value) => !value)} className="flex min-h-16 flex-col items-center justify-center gap-1"><Heart size={25} fill={saved ? '#0f3d35' : 'none'} /> {saved ? 'Saved' : 'Save'}</button>
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

function VillageDetailPage() {
  const { slug = '' } = useParams()
  const { data: villagesData } = useQuery({ queryKey: ['villages'], queryFn: fetchVillages })
  const { data: listingsData } = useQuery({ queryKey: ['listings', slug], queryFn: () => fetchListings({ village: slug }) })
  const village = villagesData?.villages.find((item) => item.slug === slug)
  return (
    <Shell compact>
      <ContentHeader kicker={village?.region || 'Village'} title={village?.name || 'Guam village'} description={village?.description || 'Village detail and matching demo listings.'} />
      <section className="mx-auto grid max-w-7xl gap-4 px-5 pb-10 lg:grid-cols-[1fr_360px]">
        <div className="grid gap-4">
          {listingsData?.listings.map((listing) => <ListingCard key={listing.id} listing={listing} />)}
        </div>
        <div className="rounded-[2rem] bg-[#173f38] p-6 text-white lg:self-start">
          <Compass className="text-[#bdebdc]" />
          <h2 className="mt-4 text-2xl font-semibold tracking-[-0.04em]">Market snapshot placeholder</h2>
          <p className="mt-3 text-sm leading-6 text-white/75">Later this area can show median price, average rent, days on market, and commute notes.</p>
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
  return (
    <Shell compact>
      <ContentHeader kicker="Retention loop" title="Saved listings and alerts will keep buyers and renters coming back." description="This demo screen explains the saved-search loop while auth is deferred. Clerk can be added when the investor wants accounts." />
      <section className="mx-auto grid max-w-5xl gap-5 px-5 pb-10 md:grid-cols-3">
        <ConceptCard icon={<Heart />} title="Favorites" description="Save listings and compare homes/rentals across villages." />
        <ConceptCard icon={<Bell />} title="Listing alerts" description="Notify users when matching rentals hit the market or prices change." />
        <ConceptCard icon={<MessageSquare />} title="Agent follow-up" description="Turn saved intent into warmer buyer, renter, and seller conversations." />
      </section>
    </Shell>
  )
}

function SyncPage() {
  const { data, isLoading } = useQuery({ queryKey: ['sync-runs'], queryFn: fetchSyncRuns })
  return (
    <Shell compact>
      <ContentHeader kicker="MLS readiness" title="A visible sync layer for future authorized MLS integration." description="The app is structured so RETS, RESO, IDX APIs, CSVs, or brokerage feeds can normalize into Hafa Homes listings." />
      <section className="mx-auto max-w-5xl px-5 pb-10">
        <div className="rounded-[2rem] bg-[#101f1c] p-6 text-white shadow-2xl shadow-[#0f3d35]/20">
          <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-5">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#bdebdc]">Sync monitor</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-[-0.05em]">Demo MLS Adapter</h2>
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
    </Shell>
  )
}


function MapPanel({ listings, onExpand, immersive = false }: { listings: Listing[]; onExpand?: () => void; immersive?: boolean }) {
  const points = listings.filter((listing) => listing.latitude && listing.longitude)
  const mapHeight = immersive ? 'h-[100svh]' : 'h-[calc(100svh-330px)] min-h-[420px] max-h-[560px] md:h-auto md:max-h-none md:min-h-[760px]'

  if (!MAPBOX_TOKEN) {
    return <FallbackMapPanel listings={listings} onExpand={onExpand} immersive={immersive} />
  }

  return (
    <div className={`relative overflow-hidden border border-black/5 bg-[#dbe8df] shadow-sm ${immersive ? 'h-[100svh] rounded-none' : 'rounded-none md:rounded-[2rem]'}`}>
      <RealMap listings={points} immersive={immersive} className={mapHeight} />
      <MapOverlayHeader listingsCount={points.length} onExpand={onExpand} realMap />
      {!immersive && (
        <div className="absolute bottom-5 left-5 z-10 hidden max-w-md rounded-3xl bg-white/92 p-4 text-sm leading-6 text-[#53645f] shadow-xl shadow-[#0f3d35]/10 backdrop-blur md:block">
          Tap a price marker to open the listing details. Use full map for the best search experience.
        </div>
      )}
    </div>
  )
}

function RealMap({ listings, className, immersive }: { listings: Listing[]; className: string; immersive: boolean }) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<any>(null)
  const mapboxRef = useRef<any>(null)
  const markersRef = useRef<any[]>([])
  const [mapReady, setMapReady] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    let cancelled = false

    async function initializeMap() {
      const mapboxModule = await import('mapbox-gl')
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

    initializeMap()

    return () => {
      cancelled = true
      markersRef.current.forEach((marker) => marker.remove())
      markersRef.current = []
      mapRef.current?.remove()
      mapRef.current = null
      mapboxRef.current = null
      setMapReady(false)
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
      markerElement.addEventListener('click', () => navigate(`/listings/${listing.id}`))

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
  }, [immersive])

  return <div ref={containerRef} className={`w-full ${className}`} />
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

function FallbackMapPanel({ listings, onExpand, immersive = false }: { listings: Listing[]; onExpand?: () => void; immersive?: boolean }) {
  const points = listings.filter((listing) => listing.latitude && listing.longitude)
  const mapHeight = immersive ? 'h-[100svh]' : 'h-[calc(100svh-330px)] min-h-[420px] max-h-[560px] md:h-auto md:max-h-none md:min-h-[760px]'

  return (
    <div className={`overflow-hidden border border-black/5 bg-[#dbe8df] shadow-sm ${immersive ? 'h-[100svh] rounded-none' : 'rounded-none md:rounded-[2rem]'}`}>
      <div className={`relative ${mapHeight} bg-[radial-gradient(circle_at_30%_20%,rgba(15,112,94,0.18),transparent_24%),radial-gradient(circle_at_70%_70%,rgba(233,159,62,0.22),transparent_26%),linear-gradient(135deg,#e8f0ea,#c9ddd1)] p-3 md:p-5`}>
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
            <p className="mt-3 text-sm leading-6 text-[#66746f]">The API stored this saved search. Alerts can be wired to email/SMS later.</p>
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
              <Input name="name" label="Search name" defaultValue="My Guam home search" required />
              <Input name="email" label="Email" type="email" required />
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

function LeadsPage() {
  const { data, isLoading, isError } = useQuery({ queryKey: ['leads'], queryFn: fetchLeads })
  return (
    <Shell compact>
      <ContentHeader kicker="Admin lead inbox" title="A lightweight inbox for showing requests and buyer/renter interest." description="This proves the lead-capture loop: search, listing detail, inquiry, admin follow-up. Full auth and assignment can come later." />
      <section className="mx-auto max-w-6xl px-5 pb-10">
        {isLoading && <StateCard>Loading leads...</StateCard>}
        {isError && <StateCard tone="error">Unable to load leads.</StateCard>}
        <div className="grid gap-4">
          {data?.leads.map((lead) => (
            <article key={lead.id} className="rounded-[2rem] bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#0f705e]">{lead.lead_type.replaceAll('_', ' ')}</p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">{lead.name}</h2>
                  <div className="mt-2 flex flex-wrap gap-3 text-sm font-semibold text-[#53645f]">
                    <span className="inline-flex items-center gap-1"><Mail size={15} /> {lead.email}</span>
                    {lead.phone && <span className="inline-flex items-center gap-1"><Phone size={15} /> {lead.phone}</span>}
                  </div>
                </div>
                <span className="rounded-full bg-[#e9f5ef] px-3 py-1 text-xs font-bold uppercase tracking-wide text-[#0f705e]">{lead.status}</span>
              </div>
              {lead.listing && <p className="mt-4 rounded-2xl bg-[#f6f1e8] p-3 text-sm font-semibold text-[#304942]">Interested in {lead.listing.title} · {lead.listing.village} · {currency(lead.listing.price, lead.listing.listing_kind)}</p>}
              {lead.message && <p className="mt-4 text-sm leading-6 text-[#66746f]">{lead.message}</p>}
            </article>
          ))}
          {data?.leads.length === 0 && <StateCard>No leads yet. Submit a request from a listing detail page to test the flow.</StateCard>}
        </div>
      </section>
    </Shell>
  )
}

function MobileMenuDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null

  const links = [
    ['Search', '/'],
    ['Villages', '/villages'],
    ['Military relocation', '/military'],
    ['Saved homes', '/saved'],
    ['MLS sync', '/admin/sync'],
    ['Lead inbox', '/admin/leads'],
  ]

  return (
    <div className="fixed inset-0 z-[90] bg-black/45 backdrop-blur-sm md:hidden">
      <div className="safe-top absolute bottom-0 right-0 top-0 w-[84vw] max-w-sm bg-[#0f3d35] p-5 text-white shadow-2xl">
        <div className="flex items-center justify-between gap-4">
          <Brand light />
          <button onClick={onClose} className="grid h-11 w-11 place-items-center rounded-full bg-white/10"><X size={20} /></button>
        </div>
        <div className="mt-8 grid gap-3">
          {links.map(([label, href]) => (
            <Link key={href} to={href} onClick={onClose} className="rounded-2xl bg-white/10 px-4 py-4 text-lg font-bold text-white/90">
              {label}
            </Link>
          ))}
        </div>
        <div className="absolute bottom-6 left-5 right-5 rounded-3xl bg-white/10 p-4 text-sm leading-6 text-white/72">
          Hafa Homes is a Guam-first housing search demo built around map search, local filters, and agent workflows.
        </div>
      </div>
    </div>
  )
}

function PriceTrackerModal({ listing, open, onClose }: { listing: Listing; open: boolean; onClose: () => void }) {
  const mutation = useMutation({ mutationFn: createLead })
  if (!open) return null

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    mutation.mutate({
      listing_id: listing.id,
      lead_type: 'price_tracker',
      name: String(form.get('name') || 'Price tracker user'),
      email: String(form.get('email') || ''),
      phone: String(form.get('phone') || ''),
      preferred_contact_method: 'email',
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
            <p className="mt-3 text-sm leading-6 text-[#66746f]">We captured the target price. Later this can become a dedicated alerts workflow.</p>
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
              <Input name="email" label="Email for alerts" type="email" required />
              <Input name="name" label="Name" defaultValue="Hafa Homes user" />
              <Input name="phone" label="Phone optional" />
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
  if (!open) return null

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    mutation.mutate({
      listing_id: listing.id,
      lead_type: 'showing_request',
      name: String(form.get('name') || ''),
      email: String(form.get('email') || ''),
      phone: String(form.get('phone') || ''),
      preferred_contact_method: String(form.get('preferred_contact_method') || 'phone'),
      message: String(form.get('message') || ''),
    })
  }

  return (
    <div className="fixed inset-0 z-[70] grid place-items-end bg-black/45 p-3 backdrop-blur-sm md:place-items-center">
      <div className="w-full max-w-lg rounded-[2rem] bg-white p-6 shadow-2xl">
        {mutation.isSuccess ? (
          <div className="py-8 text-center">
            <CheckCircle2 className="mx-auto text-[#0f705e]" size={44} />
            <h2 className="mt-4 text-3xl font-semibold tracking-[-0.05em]">Inquiry captured</h2>
            <p className="mt-3 text-sm leading-6 text-[#66746f]">This lead is stored in the Rails API. Later we can route it to agents or property managers.</p>
            <button onClick={onClose} className="mt-6 w-full rounded-2xl bg-[#0f3d35] px-4 py-3 text-sm font-bold text-white">Close</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#0f705e]">Schedule Tour</p>
                <h2 className="mt-2 text-3xl font-semibold tracking-[-0.05em]">Request a showing</h2>
              </div>
              <button type="button" onClick={onClose} className="rounded-full border border-[#d7ded9] px-3 py-2 text-sm font-bold">Close</button>
            </div>
            <div className="mt-5 rounded-3xl bg-[#f6f1e8] p-4">
              <div className="flex items-center gap-4">
                <img src="/hafa-homes-mark.svg" alt="" className="h-16 w-16 rounded-2xl" />
                <div>
                  <p className="text-lg font-bold text-[#17211f]">Hafa Homes Demo Team</p>
                  <p className="text-sm font-semibold text-[#66746f]">hello@hafahomes.com</p>
                  <p className="text-sm font-semibold text-[#66746f]">(671) 555-0199</p>
                </div>
              </div>
              <p className="mt-4 text-sm font-semibold text-[#304942]">{listing.address}</p>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <button type="button" className="rounded-2xl border-2 border-[#17a9df] px-4 py-3 text-sm font-bold text-[#17a9df]">In Person</button>
              <button type="button" className="rounded-2xl border border-[#d7ded9] px-4 py-3 text-sm font-bold text-[#304942]">Virtual</button>
            </div>
            <div className="mt-5 grid grid-cols-4 gap-2 text-center text-xs font-bold text-[#53645f]">
              {['Wed 13', 'Thu 14', 'Fri 15', 'Sat 16'].map((day, index) => (
                <button key={day} type="button" className={`rounded-2xl border px-2 py-3 ${index === 0 ? 'border-[#17a9df] text-[#17a9df]' : 'border-[#d7ded9]'}`}>{day}</button>
              ))}
            </div>
            <div className="mt-5 grid gap-3">
              <Input name="name" label="Name" required />
              <Input name="email" label="Email" type="email" required />
              <Input name="phone" label="Phone" />
              <label className="grid gap-2 text-sm font-semibold text-[#304942]">
                Select time
                <select name="preferred_contact_method" className="min-h-12 rounded-2xl border border-[#dce5df] px-4">
                  <option value="morning">Morning</option>
                  <option value="afternoon">Afternoon</option>
                  <option value="evening">Evening</option>
                </select>
              </label>
              <label className="grid gap-2 text-sm font-semibold text-[#304942]">
                Message
                <textarea name="message" rows={4} className="rounded-2xl border border-[#dce5df] px-4 py-3" defaultValue={`I'm interested in ${listing.title}.`} />
              </label>
            </div>
            {mutation.isError && <p className="mt-3 text-sm font-semibold text-red-700">Unable to submit right now.</p>}
            <button disabled={mutation.isPending} className="mt-5 w-full rounded-2xl bg-[#0f3d35] px-4 py-3 text-sm font-bold text-white disabled:opacity-60">
              {mutation.isPending ? 'Submitting...' : 'Request Tour'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

function Shell({ children, compact = false }: { children: React.ReactNode; compact?: boolean }) {
  return (
    <main className="min-h-screen bg-[#f6f1e8] pb-20 text-[#17211f] md:pb-0">
      {compact && <div className="bg-[#0f3d35] px-5 py-5 text-white"><div className="mx-auto max-w-7xl"><TopNav /></div></div>}
      {children}
      <MobileNav />
    </main>
  )
}

function TopNav() {
  return (
    <nav className="flex items-center justify-between">
      <Brand light />
      <div className="hidden items-center gap-5 text-sm font-semibold text-white/82 md:flex">
        <Link to="/villages">Villages</Link>
        <Link to="/military">Military</Link>
        <Link to="/admin/sync">MLS sync</Link>
        <Link to="/admin/leads">Leads</Link>
      </div>
      <button className="rounded-full border border-white/25 p-2 md:hidden"><Menu size={18} /></button>
    </nav>
  )
}

function MobileNav() {
  return (
    <nav className="safe-bottom fixed inset-x-0 bottom-0 z-50 border-t border-black/10 bg-white/90 px-4 pt-3 backdrop-blur md:hidden">
      <div className="mx-auto grid max-w-md grid-cols-4 text-center text-xs font-semibold text-[#53645f]">
        <Link to="/" className="flex flex-col items-center gap-1"><Home size={19} /> Search</Link>
        <Link to="/villages" className="flex flex-col items-center gap-1"><Map size={19} /> Villages</Link>
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
        <h2 className="mt-5 text-3xl font-semibold tracking-[-0.05em]">Built around Guam search patterns.</h2>
        <p className="mt-3 text-sm leading-6 text-white/75">A demo foundation for MLS sync, military relocation, rentals, village insights, and local lead capture.</p>
      </div>
      <div className="rounded-[2rem] border border-black/5 bg-white p-5">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#7b8a84]">Market pulse</p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <MiniStat label="Shown" value={listings.length.toString()} />
          <MiniStat label="Source" value="Demo" />
          <MiniStat label="Alerts" value="Ready" />
          <MiniStat label="PWA" value="On" />
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

function ConceptCard({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return <div className="rounded-[2rem] bg-white p-6 shadow-sm"><div className="text-[#0f705e]">{icon}</div><h2 className="mt-5 text-2xl font-semibold tracking-[-0.04em]">{title}</h2><p className="mt-3 text-sm leading-6 text-[#66746f]">{description}</p></div>
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl bg-[#f6f1e8] p-4"><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#7b8a84]">{label}</p><p className="mt-1 text-xl font-bold tracking-[-0.04em]">{value}</p></div>
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="rounded-2xl bg-white/10 p-4"><p className="text-xs font-bold uppercase tracking-[0.16em] text-white/50">{label}</p><p className="mt-1 text-3xl font-bold tracking-[-0.05em]">{value}</p></div>
}

function Input({ label, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return <label className="grid gap-2 text-sm font-semibold text-[#304942]">{label}<input {...props} className="min-h-12 rounded-2xl border border-[#dce5df] px-4" /></label>
}

export default App
