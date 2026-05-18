import { useMemo, useState } from 'react'
import { Link, Route, Routes } from 'react-router-dom'
import { Home, Map, Search, SlidersHorizontal, Waves } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

type Village = {
  id: number
  name: string
  slug: string
  region: string
}

type Feature = {
  id: number
  name: string
  slug: string
  category: string
}

type Listing = {
  id: number
  title: string
  listing_kind: 'sale' | 'rent'
  property_type: string
  price: number
  address: string
  village: Village
  beds: number
  baths: number
  square_feet: number
  primary_photo_url: string
  features: Feature[]
}

type ListingsResponse = {
  listings: Listing[]
}

async function fetchListings(kind = 'sale'): Promise<ListingsResponse> {
  const response = await fetch(`${API_URL}/api/v1/listings?kind=${kind}`)
  if (!response.ok) throw new Error('Unable to load listings')
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
      <Route path="/" element={<HomePage />} />
      <Route path="/military" element={<InfoPage title="Military relocation" />} />
      <Route path="/villages" element={<InfoPage title="Guam village guide" />} />
      <Route path="/saved" element={<InfoPage title="Saved homes" />} />
    </Routes>
  )
}

function HomePage() {
  const [kind, setKind] = useState<'sale' | 'rent'>('sale')
  const { data, isLoading, isError } = useQuery({
    queryKey: ['listings', kind],
    queryFn: () => fetchListings(kind),
  })

  const listings = data?.listings ?? []
  const featuredListing = useMemo(() => listings[0], [listings])

  return (
    <main className="min-h-screen bg-[#f6f1e8] text-[#17211f]">
      <section className="relative overflow-hidden bg-[#0f3d35] px-5 pb-8 pt-6 text-white">
        <div className="absolute inset-0 opacity-30 [background:radial-gradient(circle_at_20%_20%,#79d0b2,transparent_28%),radial-gradient(circle_at_85%_10%,#f5c16c,transparent_24%),linear-gradient(135deg,#0f3d35,#071b18)]" />
        <div className="relative mx-auto max-w-6xl">
          <nav className="flex items-center justify-between">
            <Link to="/" className="text-lg font-semibold tracking-tight">Hafa Homes</Link>
            <Link to="/saved" className="rounded-full border border-white/25 px-4 py-2 text-sm text-white/90">Saved</Link>
          </nav>

          <div className="mt-14 max-w-2xl pb-6">
            <p className="text-sm font-medium uppercase tracking-[0.24em] text-[#bdebdc]">Find your home on Guam</p>
            <h1 className="mt-3 text-5xl font-semibold leading-[0.95] tracking-[-0.06em] sm:text-7xl">
              Homes, rentals, and neighborhoods built for island life.
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-white/78">
              Search by village, base commute, pets, furnished rentals, ocean views, typhoon-ready features, and the details that matter on Guam.
            </p>
          </div>
        </div>
      </section>

      <section className="relative z-10 mx-auto -mt-8 max-w-6xl px-5">
        <div className="rounded-[2rem] border border-black/5 bg-white p-4 shadow-2xl shadow-[#0f3d35]/10">
          <div className="grid gap-3 md:grid-cols-[auto_1fr_auto] md:items-center">
            <div className="flex rounded-full bg-[#edf4ef] p-1">
              {(['sale', 'rent'] as const).map((option) => (
                <button
                  key={option}
                  onClick={() => setKind(option)}
                  className={`rounded-full px-5 py-2 text-sm font-semibold capitalize transition ${kind === option ? 'bg-[#0f3d35] text-white shadow' : 'text-[#48615b]'}`}
                >
                  {option === 'sale' ? 'Buy' : 'Rent'}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-3 rounded-2xl border border-[#dce5df] px-4 py-3 text-[#50625e]">
              <Search size={18} />
              <span className="text-sm">Search village, address, base, or feature</span>
            </div>
            <button className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#e99f3e] px-5 py-3 text-sm font-bold text-[#25170b]">
              <SlidersHorizontal size={18} /> Filters
            </button>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {['Near Andersen AFB', 'Near Navy Base', 'Pet friendly', 'Furnished', 'Ocean view', 'Typhoon shutters'].map((chip) => (
              <span key={chip} className="rounded-full bg-[#f6f1e8] px-3 py-2 text-xs font-semibold text-[#53645f]">
                {chip}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-6 px-5 py-8 lg:grid-cols-[1fr_0.82fr]">
        <div>
          <div className="mb-4 flex items-end justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#7b8a84]">Demo listings</p>
              <h2 className="text-3xl font-semibold tracking-[-0.04em]">Latest Guam {kind === 'sale' ? 'homes for sale' : 'rentals'}</h2>
            </div>
            <button className="hidden items-center gap-2 rounded-full border border-[#d7ded9] bg-white px-4 py-2 text-sm font-semibold md:inline-flex">
              <Map size={16} /> Map view
            </button>
          </div>

          {isLoading && <p className="rounded-2xl bg-white p-5 text-[#53645f]">Loading demo listings...</p>}
          {isError && <p className="rounded-2xl bg-white p-5 text-red-700">Start the Rails API on port 3000 to load live seed listings.</p>}

          <div className="grid gap-4">
            {listings.map((listing) => (
              <article key={listing.id} className="overflow-hidden rounded-[1.7rem] border border-black/5 bg-white shadow-sm md:grid md:grid-cols-[220px_1fr]">
                <img src={listing.primary_photo_url} alt="" className="h-56 w-full object-cover md:h-full" />
                <div className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-2xl font-bold tracking-[-0.04em]">{currency(listing.price, listing.listing_kind)}</p>
                      <h3 className="mt-1 text-lg font-semibold">{listing.title}</h3>
                      <p className="mt-1 text-sm text-[#66746f]">{listing.village.name} · {listing.address}</p>
                    </div>
                    <span className="rounded-full bg-[#e9f5ef] px-3 py-1 text-xs font-bold uppercase tracking-wide text-[#0f705e]">{listing.listing_kind}</span>
                  </div>
                  <div className="mt-4 flex gap-4 text-sm font-semibold text-[#324640]">
                    <span>{listing.beds} beds</span>
                    <span>{listing.baths} baths</span>
                    <span>{listing.square_feet?.toLocaleString()} sqft</span>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {listing.features.slice(0, 4).map((feature) => (
                      <span key={feature.id} className="rounded-full bg-[#f6f1e8] px-3 py-1 text-xs font-semibold text-[#6b6254]">{feature.name}</span>
                    ))}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>

        <aside className="space-y-4">
          <div className="rounded-[2rem] bg-[#173f38] p-6 text-white shadow-xl shadow-[#173f38]/15">
            <Waves className="text-[#bdebdc]" />
            <h2 className="mt-5 text-3xl font-semibold tracking-[-0.05em]">Built around Guam search patterns.</h2>
            <p className="mt-3 text-sm leading-6 text-white/75">A demo foundation for MLS sync, military relocation, rentals, village insights, and local lead capture.</p>
          </div>

          {featuredListing && (
            <div className="rounded-[2rem] border border-black/5 bg-white p-5">
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#7b8a84]">Featured</p>
              <h3 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">{featuredListing.title}</h3>
              <p className="mt-3 text-sm leading-6 text-[#66746f]">This demo listing is seeded from the Rails API and structured for future authorized MLS/IDX import.</p>
              <button className="mt-5 w-full rounded-2xl bg-[#0f3d35] px-4 py-3 text-sm font-bold text-white">Request showing</button>
            </div>
          )}
        </aside>
      </section>

      <MobileNav />
    </main>
  )
}

function InfoPage({ title }: { title: string }) {
  return (
    <main className="min-h-screen bg-[#f6f1e8] px-5 py-8 text-[#17211f]">
      <div className="mx-auto max-w-3xl rounded-[2rem] bg-white p-8 shadow-sm">
        <Link to="/" className="text-sm font-bold text-[#0f705e]">Back to search</Link>
        <h1 className="mt-6 text-4xl font-semibold tracking-[-0.05em]">{title}</h1>
        <p className="mt-4 leading-7 text-[#66746f]">Placeholder MVP screen. Next step is to build this into the Guam-specific content and workflow page documented in the build plan.</p>
      </div>
      <MobileNav />
    </main>
  )
}

function MobileNav() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-black/10 bg-white/90 px-4 py-3 backdrop-blur md:hidden">
      <div className="mx-auto grid max-w-md grid-cols-4 text-center text-xs font-semibold text-[#53645f]">
        <Link to="/" className="flex flex-col items-center gap-1"><Home size={19} /> Search</Link>
        <Link to="/villages" className="flex flex-col items-center gap-1"><Map size={19} /> Villages</Link>
        <Link to="/military" className="flex flex-col items-center gap-1"><Waves size={19} /> Military</Link>
        <Link to="/saved" className="flex flex-col items-center gap-1"><Home size={19} /> Saved</Link>
      </div>
    </nav>
  )
}

export default App
