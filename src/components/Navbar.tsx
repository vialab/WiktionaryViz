interface NavbarProps {
  title: string
  onTitleClick: () => void
  showGuideButton?: boolean
  onGuideClick?: () => void
}

const Navbar: React.FC<NavbarProps> = ({ title, onTitleClick, showGuideButton, onGuideClick }) => (
  <nav className="navbar flex items-center justify-between gap-4">
    <h1 className="navbar-title cursor-pointer text-left text-3xl" onClick={onTitleClick}>
      {title}
    </h1>
    {showGuideButton && onGuideClick && (
      <button
        type="button"
        onClick={onGuideClick}
        aria-label="Open geospatial guide"
        className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-600/80 bg-slate-800/90 text-sm font-semibold text-slate-100 transition hover:border-cyan-300 hover:bg-slate-700"
      >
        ?
      </button>
    )}
  </nav>
)
// TODO [HIGH LEVEL]: Add a toggle for Public vs Expert mode to simplify UI for non-experts.
// TODO [LOW LEVEL]: Add a segmented control bound to a `mode` state in App, persist to URL & localStorage.
// TODO [HIGH LEVEL]: Presets/Bookmarks dropdown for saved states and lecture presets.
// TODO [LOW LEVEL]: Add a select fed by /presets and allow save current state -> POST /presets.
export default Navbar
