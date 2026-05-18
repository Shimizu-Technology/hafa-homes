import { Link } from 'react-router-dom'

export function Brand({ to = '/', light = false }: { to?: string; light?: boolean }) {
  return (
    <Link to={to} className="inline-flex items-center gap-3" aria-label="Hafa Homes home">
      <img src="/hafa-homes-mark.svg" alt="" className="h-10 w-10 rounded-2xl shadow-sm" />
      <span className="leading-none">
        <span className={`block text-lg font-extrabold tracking-[-0.04em] ${light ? 'text-white' : 'text-[#0f3d35]'}`}>Hafa Homes</span>
        <span className={`mt-1 hidden text-[10px] font-bold uppercase tracking-[0.18em] sm:block ${light ? 'text-white/58' : 'text-[#7b8a84]'}`}>Find your home on Guam</span>
      </span>
    </Link>
  )
}
