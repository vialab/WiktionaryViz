import { Moon, SunMedium } from 'lucide-react'

interface NavbarProps {
  title: string
  onTitleClick: () => void
  showBackHomeButton?: boolean
  onBackHomeClick?: () => void
  showGuideButton?: boolean
  onGuideClick?: () => void
  theme: 'dark' | 'light'
  onToggleTheme: () => void
}

const Navbar: React.FC<NavbarProps> = ({
  title,
  onTitleClick,
  showBackHomeButton,
  onBackHomeClick,
  showGuideButton,
  onGuideClick,
  theme,
  onToggleTheme,
}) => (
  <nav className="navbar flex items-center justify-between gap-4">
    <button
      type="button"
      className={theme === 'light'
        ? 'navbar-title text-left text-3xl text-slate-900 transition hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white'
        : 'navbar-title text-left text-3xl text-slate-100 transition hover:text-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-900'}
      onClick={onTitleClick}
    >
      {title}
    </button>
    <div className="flex items-center gap-2">
      {showBackHomeButton && onBackHomeClick && (
        <button
          type="button"
          onClick={onBackHomeClick}
          className={theme === 'light'
            ? 'rounded-full border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-blue-300 hover:bg-slate-50 hover:text-slate-900'
            : 'rounded-full border border-slate-600/80 bg-slate-800/90 px-3 py-2 text-sm font-medium text-slate-200 transition hover:border-cyan-300 hover:bg-slate-700 hover:text-white'}
          aria-label="Back To Home"
        >
          Back To Home
        </button>
      )}
      {showGuideButton && onGuideClick && (
        <button
          type="button"
          onClick={onGuideClick}
          aria-label="Open geospatial guide"
          className={theme === 'light'
            ? 'inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-300 bg-white text-sm font-semibold text-slate-800 transition hover:border-blue-300 hover:bg-slate-50'
            : 'inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-600/80 bg-slate-800/90 text-sm font-semibold text-slate-100 transition hover:border-cyan-300 hover:bg-slate-700'}
        >
          ?
        </button>
      )}
      <button
        type="button"
        role="switch"
        aria-checked={theme === 'light'}
        onClick={onToggleTheme}
        aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
        className={theme === 'light'
          ? 'relative inline-flex h-10 w-20 items-center rounded-full border border-slate-300 bg-slate-100 px-1 transition hover:border-blue-300 hover:bg-slate-50'
          : 'relative inline-flex h-10 w-20 items-center rounded-full border border-slate-600/80 bg-slate-800/90 px-1 transition hover:border-cyan-300 hover:bg-slate-700'}
      >
        <span
          className={theme === 'light'
            ? 'absolute left-1 flex h-8 w-8 items-center justify-center rounded-full text-slate-500 transition-opacity'
            : 'absolute left-1 flex h-8 w-8 items-center justify-center rounded-full text-slate-300 transition-opacity'}
          aria-hidden="true"
        >
          <Moon size={15} />
        </span>
        <span
          className={theme === 'light'
            ? 'absolute right-1 flex h-8 w-8 items-center justify-center rounded-full text-blue-700 transition-opacity'
            : 'absolute right-1 flex h-8 w-8 items-center justify-center rounded-full text-slate-500 transition-opacity'}
          aria-hidden="true"
        >
          <SunMedium size={15} />
        </span>
        <span
          className={theme === 'light'
            ? 'inline-flex h-8 w-8 translate-x-10 items-center justify-center rounded-full bg-white text-blue-600 shadow-sm ring-1 ring-slate-200 transition-transform duration-200'
            : 'inline-flex h-8 w-8 translate-x-0 items-center justify-center rounded-full bg-slate-950 text-slate-100 shadow-sm ring-1 ring-slate-700/60 transition-transform duration-200'}
          aria-hidden="true"
        >
          {theme === 'light' ? <SunMedium size={15} /> : <Moon size={15} />}
        </span>
      </button>
    </div>
  </nav>
)
// TODO [HIGH LEVEL]: Add a toggle for Public vs Expert mode to simplify UI for non-experts.
// TODO [LOW LEVEL]: Add a segmented control bound to a `mode` state in App, persist to URL & localStorage.
// TODO [HIGH LEVEL]: Presets/Bookmarks dropdown for saved states and lecture presets.
// TODO [LOW LEVEL]: Add a select fed by /presets and allow save current state -> POST /presets.
export default Navbar
