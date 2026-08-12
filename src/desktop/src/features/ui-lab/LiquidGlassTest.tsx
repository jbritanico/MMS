import { useState } from "react";

function LiquidGlassTest() {
    const [toggled, setToggled] = useState(false);
    const [slider, setSlider] = useState(50);
    const [text, setText] = useState("");
    const [textarea, setTextarea] = useState("");
    const [dropdown, setDropdown] = useState("option-1");
    const [checkbox1, setCheckbox1] = useState(true);
    const [checkbox2, setCheckbox2] = useState(false);
    const [radio, setRadio] = useState("a");
    const [activeTab, setActiveTab] = useState<"tab1" | "tab2" | "tab3">("tab1");

    return (
        <div className="liquid-scene">
            <div className="liquid-blob liquid-blob-a" />
            <div className="liquid-blob liquid-blob-b" />
            <div className="liquid-blob liquid-blob-c" />

            <div className="liquid-content">
                <div className="glass-card">
                    <h2 className="glass-title">Liquid glass control gallery</h2>
                    <p className="glass-text">Every core control rendered in the frosted-glass style.</p>

                    <div className="glass-tabs">
                        {(["tab1", "tab2", "tab3"] as const).map((t) => (
                            <button
                                key={t}
                                className={`glass-tab ${activeTab === t ? "active" : ""}`}
                                onClick={() => setActiveTab(t)}
                            >
                                {t === "tab1" ? "Inputs" : t === "tab2" ? "Selection" : "Actions"}
                            </button>
                        ))}
                    </div>

                    {activeTab === "tab1" && (
                        <>
                            <div className="glass-field">
                                <label className="glass-label">Text input</label>
                                <input
                                    type="text"
                                    className="glass-input"
                                    placeholder="Type something..."
                                    value={text}
                                    onChange={(e) => setText(e.target.value)}
                                />
                            </div>

                            <div className="glass-field">
                                <label className="glass-label">Textarea</label>
                                <textarea
                                    className="glass-input glass-textarea"
                                    placeholder="Multi-line text..."
                                    value={textarea}
                                    onChange={(e) => setTextarea(e.target.value)}
                                />
                            </div>

                            <div className="glass-field">
                                <label className="glass-label">Dropdown</label>
                                <select className="glass-input" value={dropdown} onChange={(e) => setDropdown(e.target.value)}>
                                    <option value="option-1">Option 1</option>
                                    <option value="option-2">Option 2</option>
                                    <option value="option-3">Option 3</option>
                                </select>
                            </div>
                        </>
                    )}

                    {activeTab === "tab2" && (
                        <>
                            <div className="glass-row">
                                <span className="glass-label">Enable effect</span>
                                <button className={`glass-toggle ${toggled ? "on" : ""}`} onClick={() => setToggled(!toggled)} aria-label="Toggle">
                                    <span className="glass-toggle-knob" />
                                </button>
                            </div>

                            <div className="glass-row">
                                <span className="glass-label">Intensity</span>
                                <input type="range" min={0} max={100} value={slider}
                                    onChange={(e) => setSlider(Number(e.target.value))} className="glass-slider" />
                            </div>

                            <div className="glass-field">
                                <label className="glass-check-row">
                                    <input type="checkbox" className="glass-checkbox" checked={checkbox1}
                                        onChange={(e) => setCheckbox1(e.target.checked)} />
                                    <span>Checkbox, checked default</span>
                                </label>
                                <label className="glass-check-row">
                                    <input type="checkbox" className="glass-checkbox" checked={checkbox2}
                                        onChange={(e) => setCheckbox2(e.target.checked)} />
                                    <span>Checkbox, unchecked default</span>
                                </label>
                            </div>

                            <div className="glass-field">
                                <label className="glass-check-row">
                                    <input type="radio" className="glass-radio" name="glass-radio" checked={radio === "a"}
                                        onChange={() => setRadio("a")} />
                                    <span>Radio option A</span>
                                </label>
                                <label className="glass-check-row">
                                    <input type="radio" className="glass-radio" name="glass-radio" checked={radio === "b"}
                                        onChange={() => setRadio("b")} />
                                    <span>Radio option B</span>
                                </label>
                            </div>

                            <div className="glass-field">
                                <span className="glass-label">Progress</span>
                                <div className="glass-progress">
                                    <div className="glass-progress-fill" style={{ width: `${slider}%` }} />
                                </div>
                            </div>
                        </>
                    )}

                    {activeTab === "tab3" && (
                        <div className="glass-actions">
                            <button className="glass-button glass-button-primary">Primary</button>
                            <button className="glass-button glass-button-secondary">Secondary</button>
                            <button className="glass-button glass-button-danger">Danger</button>
                            <button className="glass-button glass-button-icon" aria-label="Icon action">
                                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                                </svg>
                            </button>
                        </div>
                    )}
                </div>

                <div className="glass-card glass-card-small">
                    <p className="glass-text">A second overlapping panel, to see how stacked glass reads.</p>
                    <span className="glass-badge">Badge</span>
                </div>
            </div>
        </div>
    );
}

export default LiquidGlassTest;