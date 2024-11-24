interface NavbarProps {
    sections: string[];
    onSectionChange: (sectionId: string) => void;
}

const Navbar: React.FC<NavbarProps> = ({ sections, onSectionChange }) => (
    <nav className="navbar">
        <ul className="navbar-list">
            {sections.map((id) => (
                <li key={id} className="navbar-item">
                    <button onClick={() => onSectionChange(id)}>{id.replace('-', ' ').toUpperCase()}</button>
                </li>
            ))}
        </ul>
    </nav>
);

export default Navbar;
