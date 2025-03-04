interface NavbarProps {
    title: string;
    onTitleClick: () => void;
}

const Navbar: React.FC<NavbarProps> = ({ title, onTitleClick }) => (
    <nav className="navbar">
        <h1 className="navbar-title cursor-pointer text-left" onClick={onTitleClick}>
            {title}
        </h1>
    </nav>
);

export default Navbar;
