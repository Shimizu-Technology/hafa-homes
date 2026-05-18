import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, Route, Routes, useParams, useSearchParams } from 'react-router-dom'
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
  Menu,
  MessageSquare,
  Ruler,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Waves,
} from 'lucide-react'
import { useMutation, useQuery } from '@tanstack/react-query'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

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
    </Routes>
  )
}

function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [showFilters, setShowFilters] = useState(false)
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
      <HeroHeader kind={kind} onKindChange={(value) => setParam('kind', value)} />

      <section className="relative z-10 mx-auto -mt-10 max-w-7xl px-5">
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

      <section className="mx-auto grid max-w-7xl gap-6 px-5 py-8 lg:grid-cols-[1fr_420px]">
        <div>
          <SectionHeading
            kicker="Demo listings"
            title={`Latest Guam ${kind === 'sale' ? 'homes for sale' : 'rentals'}`}
            action={<Link to="/admin/sync" className="hidden items-center gap-2 rounded-full border border-[#d7ded9] bg-white px-4 py-2 text-sm font-semibold md:inline-flex"><DatabaseZap size={16} /> MLS sync</Link>}
          />

          {isLoading && <StateCard>Loading demo listings...</StateCard>}
          {isError && <StateCard tone="error">Start the Rails API on port 3000 or set VITE_API_URL to load seed listings.</StateCard>}
          {!isLoading && listings.length === 0 && <StateCard>No demo listings match those filters yet.</StateCard>}

          <div className="grid gap-4">
            {listings.map((listing) => <ListingCard key={listing.id} listing={listing} />)}
          </div>
        </div>

        <SearchAside listings={listings} />
      </section>
    </Shell>
  )
}

function HeroHeader({ kind, onKindChange }: { kind: 'sale' | 'rent'; onKindChange: (value: 'sale' | 'rent') => void }) {
  return (
    <section className="relative overflow-hidden bg-[#0f3d35] px-5 pb-14 pt-6 text-white">
      <div className="absolute inset-0 opacity-30 [background:radial-gradient(circle_at_20%_20%,#79d0b2,transparent_28%),radial-gradient(circle_at_85%_10%,#f5c16c,transparent_24%),linear-gradient(135deg,#0f3d35,#071b18)]" />
      <div className="relative mx-auto max-w-7xl">
        <TopNav />
        <div className="mt-14 grid gap-8 lg:grid-cols-[1fr_400px] lg:items-end">
          <div className="max-w-3xl pb-6">
            <p className="text-sm font-medium uppercase tracking-[0.24em] text-[#bdebdc]">Find your home on Guam</p>
            <h1 className="mt-3 text-5xl font-semibold leading-[0.95] tracking-[-0.06em] sm:text-7xl">
              Homes, rentals, and neighborhoods built for island life.
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-white/78">
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
  const { data, isLoading, isError } = useQuery({ queryKey: ['listing', id], queryFn: () => fetchListing(id), enabled: Boolean(id) })
  const listing = data?.listing

  return (
    <Shell compact>
      <section className="mx-auto max-w-7xl px-5 py-6">
        <Link to="/" className="inline-flex items-center gap-2 text-sm font-bold text-[#0f705e]"><ArrowLeft size={16} /> Back to search</Link>
        {isLoading && <StateCard>Loading listing...</StateCard>}
        {isError && <StateCard tone="error">Unable to load listing.</StateCard>}
        {listing && (
          <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_390px]">
            <div>
              <div className="grid gap-3 overflow-hidden rounded-[2rem] md:grid-cols-2">
                {(listing.photos?.length ? listing.photos : [{ id: 0, url: listing.primary_photo_url, position: 1, alt_text: listing.title }]).slice(0, 4).map((photo) => (
                  <img key={photo.id} src={photo.url} alt="" className="h-72 w-full object-cover first:md:col-span-2" />
                ))}
              </div>
              <div className="mt-6 rounded-[2rem] bg-white p-6 shadow-sm">
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#7b8a84]">{listing.village.name} · {listing.property_type}</p>
                <h1 className="mt-2 text-4xl font-semibold tracking-[-0.05em] md:text-5xl">{listing.title}</h1>
                <p className="mt-4 text-3xl font-bold tracking-[-0.04em]">{currency(listing.price, listing.listing_kind)}</p>
                <PropertyStats listing={listing} large />
                <p className="mt-6 max-w-3xl text-base leading-8 text-[#5f6d68]">{listing.description}</p>
                <FeaturePills features={listing.features} />
              </div>
            </div>
            <aside className="lg:sticky lg:top-6 lg:self-start">
              <div className="rounded-[2rem] border border-black/5 bg-white p-6 shadow-xl shadow-[#0f3d35]/10">
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#7b8a84]">Request info</p>
                <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">Ask about this property</h2>
                <p className="mt-3 text-sm leading-6 text-[#66746f]">Capture a lead for Mike/investor demo. Later this routes to assigned agents or property managers.</p>
                <button onClick={() => setLeadOpen(true)} className="mt-5 w-full rounded-2xl bg-[#0f3d35] px-4 py-3 text-sm font-bold text-white">Request showing</button>
                <button className="mt-3 w-full rounded-2xl border border-[#d7ded9] px-4 py-3 text-sm font-bold text-[#0f3d35]">Save listing</button>
                <dl className="mt-6 space-y-3 text-sm">
                  <InfoRow label="MLS/demo ID" value={listing.external_id || `HH-${listing.id}`} />
                  <InfoRow label="Agent" value={listing.agent_name || 'Hafa Homes Demo Team'} />
                  <InfoRow label="Brokerage" value={listing.brokerage_name || 'Demo Brokerage'} />
                </dl>
              </div>
            </aside>
          </div>
        )}
      </section>
      {listing && <LeadModal listing={listing} open={leadOpen} onClose={() => setLeadOpen(false)} />}
    </Shell>
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
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#7b8a84]">Request showing</p>
                <h2 className="mt-2 text-3xl font-semibold tracking-[-0.05em]">{listing.title}</h2>
              </div>
              <button type="button" onClick={onClose} className="rounded-full border border-[#d7ded9] px-3 py-2 text-sm font-bold">Close</button>
            </div>
            <div className="mt-5 grid gap-3">
              <Input name="name" label="Name" required />
              <Input name="email" label="Email" type="email" required />
              <Input name="phone" label="Phone" />
              <label className="grid gap-2 text-sm font-semibold text-[#304942]">
                Preferred contact
                <select name="preferred_contact_method" className="min-h-12 rounded-2xl border border-[#dce5df] px-4">
                  <option value="phone">Phone</option>
                  <option value="email">Email</option>
                  <option value="text">Text</option>
                </select>
              </label>
              <label className="grid gap-2 text-sm font-semibold text-[#304942]">
                Message
                <textarea name="message" rows={4} className="rounded-2xl border border-[#dce5df] px-4 py-3" defaultValue={`I'm interested in ${listing.title}.`} />
              </label>
            </div>
            {mutation.isError && <p className="mt-3 text-sm font-semibold text-red-700">Unable to submit right now.</p>}
            <button disabled={mutation.isPending} className="mt-5 w-full rounded-2xl bg-[#0f3d35] px-4 py-3 text-sm font-bold text-white disabled:opacity-60">
              {mutation.isPending ? 'Submitting...' : 'Submit inquiry'}
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
      <Link to="/" className="text-lg font-semibold tracking-tight">Hafa Homes</Link>
      <div className="hidden items-center gap-5 text-sm font-semibold text-white/82 md:flex">
        <Link to="/villages">Villages</Link>
        <Link to="/military">Military</Link>
        <Link to="/admin/sync">MLS sync</Link>
      </div>
      <button className="rounded-full border border-white/25 p-2 md:hidden"><Menu size={18} /></button>
    </nav>
  )
}

function MobileNav() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-black/10 bg-white/90 px-4 py-3 backdrop-blur md:hidden">
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
