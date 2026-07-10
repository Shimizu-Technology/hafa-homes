import { Link } from 'react-router-dom'
import { useBrokerageContext } from '../contexts/BrokerageContext'

export function Brand({ to = '/', light = false }: { to?: string; light?: boolean }) {
  const { brokerage } = useBrokerageContext()
  const displayName = brokerage?.app_display_name || brokerage?.name || 'Hafa Homes'
  const logoUrl = brokerage?.logo_url || '/hafa-homes-mark.svg'

  return (
    <Link to={to} className="inline-flex items-center gap-3" aria-label={`${displayName} home`}>
      <img src={logoUrl} alt="" className="h-10 w-10 rounded-2xl object-cover shadow-sm" />
      <span className="leading-none">
        <span className={`block text-lg font-extrabold tracking-[-0.04em] ${light ? 'text-white' : 'text-[var(--brand-primary)]'}`}>{displayName}</span>
        <span className={`mt-1 hidden text-[10px] font-bold uppercase tracking-[0.18em] sm:block ${light ? 'text-white/58' : 'text-[#7b8a84]'}`}>Find your home on Guam</span>
      </span>
    </Link>
  )
}
