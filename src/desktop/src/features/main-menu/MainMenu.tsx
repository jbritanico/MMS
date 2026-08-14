import { useState } from "react";
import { THEMES, type Theme } from "../../lib/theme";

type Screen = "assets" | "reports" | "dashboard" | "admin" | "uilab";
type MrLevel = "MR-I" | "MR-II" | "MR-III";


interface MainMenuProps {
    onNavigate: (screen: Screen, mrLevel?: MrLevel) => void;
    currentTheme: Theme;
    onThemeChange: (theme: Theme) => void;
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

const MR_LEVELS: { id: MrLevel; short: string; desc: string }[] = [
    { id: "MR-I", short: "I", desc: "Field inspection" },
    { id: "MR-II", short: "II", desc: "Scheduled maintenance" },
    { id: "MR-III", short: "III", desc: "Major overhaul" },
];

function MainMenu({ onNavigate, currentTheme, onThemeChange }: MainMenuProps) {
    const [pickerOpen, setPickerOpen] = useState(false);
    const [themePickerOpen, setThemePickerOpen] = useState(false);

    function handleThemeSelect(t: Theme) {
        onThemeChange(t);
        setThemePickerOpen(false);
    }

    function handleCardClick(id: Screen) {
        if (id === "reports") {
            setPickerOpen(true);
        } else {
            onNavigate(id);
        }
    }

    function handleSelectLevel(level: MrLevel) {
        setPickerOpen(false);
        onNavigate("reports", level);
    }

    return (
        <>
            <div className="menu-grid">
                {OPTIONS.map((opt) => (
                    <div key={opt.id} className="menu-card" onClick={() => handleCardClick(opt.id)}>
                        <div className="menu-icon-wrap">{opt.icon}</div>
                        <h3>{opt.label}</h3>
                        <p>{opt.desc}</p>
                    </div>
                ))}
            </div>

            <button className="uilab-fab" aria-label="UI Lab" onClick={() => onNavigate("uilab")}>
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.6" />
                    <path d="M8 12c0-2 1.5-3.5 4-3.5S16 10 16 12s-1.5 3.5-4 3.5S8 14 8 12z" stroke="currentColor" strokeWidth="1.6" />
                </svg>
            </button>

            <button className="theme-fab" aria-label="Change theme" onClick={() => setThemePickerOpen((v) => !v)}>
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.6" />
                    <path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"
                        stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
            </button>

            {themePickerOpen && (
                <div className="theme-picker-overlay" onClick={() => setThemePickerOpen(false)}>
                    <div className="theme-picker" onClick={(e) => e.stopPropagation()}>
                        {THEMES.map((t) => (
                            <button
                                key={t.id}
                                className={`theme-option ${currentTheme === t.id ? "active" : ""}`}
                                onClick={() => handleThemeSelect(t.id)}
                            >
                                <span className="theme-swatch" style={{ background: t.swatch }} />
                                <span>{t.label}</span>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {pickerOpen && (
                <div className="level-picker-overlay" onClick={() => setPickerOpen(false)}>
                    <div className="level-picker">
                        {MR_LEVELS.map((lvl, i) => (
                            <div
                                key={lvl.id}
                                className="level-orb"
                                style={{ animationDelay: `${i * 90}ms` }}
                                onClick={(e) => { e.stopPropagation(); handleSelectLevel(lvl.id); }}
                            >
                                <span className="level-orb-short">{lvl.short}</span>
                                <span className="level-orb-label">{lvl.id}</span>
                                <span className="level-orb-desc">{lvl.desc}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </>
    );
}

export default MainMenu;