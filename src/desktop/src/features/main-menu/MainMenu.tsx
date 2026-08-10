type Screen = "assets" | "reports" | "dashboard" | "admin";

interface MainMenuProps {
    onNavigate: (screen: Screen) => void;
}

const OPTIONS: { id: Screen; label: string; desc: string; icon: JSX.Element }[] = [
    {
        id: "assets",
        label: "Asset Registry",
        desc: "Manage equipment and fixed asset records",
        icon: (
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="3" y="4" width="18" height="4" rx="1.2" stroke="currentColor" strokeWidth="1.6" />
                <path d="M4 8V18a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V8" stroke="currentColor" strokeWidth="1.6" />
                <path d="M10 12h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
        ),
    },
    {
        id: "reports",
        label: "Maintenance Report",
        desc: "MR-I, MR-II, MR-III report entry",
        icon: (
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M14.7 6.3a3 3 0 0 1-4 4L6 15l3 3 4.7-4.7a3 3 0 0 1 4-4l-2.3 2.3-1.7-1.7 2.3-2.3z"
                    stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                <path d="M5 19l-1 2 2-1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
        ),
    },
    {
        id: "dashboard",
        label: "Dashboard",
        desc: "Fleet-wide compliance and status",
        icon: (
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="4" y="12" width="4" height="8" rx="1" stroke="currentColor" strokeWidth="1.6" />
                <rect x="10" y="7" width="4" height="13" rx="1" stroke="currentColor" strokeWidth="1.6" />
                <rect x="16" y="4" width="4" height="16" rx="1" stroke="currentColor" strokeWidth="1.6" />
            </svg>
        ),
    },
    {
        id: "admin",
        label: "Administration",
        desc: "Users, MR-code definitions, settings",
        icon: (
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.6" />
                <path d="M12 3v2M12 19v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M3 12h2M19 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"
                    stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
        ),
    },
];

function MainMenu({ onNavigate }: MainMenuProps) {
    return (
        <div className="menu-grid">
            {OPTIONS.map((opt) => (
                <div key={opt.id} className="menu-card" onClick={() => onNavigate(opt.id)}>
                    <div className="menu-icon-wrap">{opt.icon}</div>
                    <h3>{opt.label}</h3>
                    <p>{opt.desc}</p>
                </div>
            ))}
        </div>
    );
}

export default MainMenu;