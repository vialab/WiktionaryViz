interface NavbarProps {
  title: string
  onTitleClick: () => void
}

const Navbar: React.FC<NavbarProps> = ({ title, onTitleClick }) => (
  <nav className="navbar">
    <h1 className="navbar-title cursor-pointer text-left text-3xl" onClick={onTitleClick}>
      {title}
    </h1>
  </nav>
)
// TODO [HIGH LEVEL]: Add a toggle for Public vs Expert mode to simplify UI for non-experts.
// TODO [LOW LEVEL]: Add a segmented control bound to a `mode` state in App, persist to URL & localStorage.
// TODO [HIGH LEVEL]: Presets/Bookmarks dropdown for saved states and lecture presets.
// TODO [LOW LEVEL]: Add a select fed by /presets and allow save current state -> POST /presets.
export default Navbar
