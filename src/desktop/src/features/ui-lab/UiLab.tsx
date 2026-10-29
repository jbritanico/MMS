import { useState } from "react";
import LiquidGlassTest from "./LiquidGlassTest";
import SkeuomorphismTest from "./SkeuomorphismTest";
import MacOsTest from "./MacOsTest";

type Style = "skeuomorphism" | "macos" | "liquid-glass";

// UI Lab: one switch to flip between the style samples. Add a new sample as another entry here.
function UiLab() {
    const [style, setStyle] = useState<Style>("skeuomorphism");
    const options: { id: Style; label: string }[] = [
        { id: "skeuomorphism", label: "Skeuomorphism" },
        { id: "macos", label: "macOS" },
        { id: "liquid-glass", label: "Liquid glass" },
    ];
    return (
        <div style={{ position: "relative", minHeight: "100%" }}>
            <div style={{ position: "fixed", top: 14, right: 20, zIndex: 50, display: "flex", gap: 6, padding: 4, borderRadius: 12, background: "rgba(20,20,24,0.55)", backdropFilter: "blur(8px)" }}>
                {options.map((o) => (
                    <button
                        key={o.id}
                        onClick={() => setStyle(o.id)}
                        style={{
                            padding: "6px 14px", fontSize: 12, fontWeight: 700, borderRadius: 9, border: "none", cursor: "pointer",
                            background: style === o.id ? "#fff" : "transparent", color: style === o.id ? "#111" : "#eee",
                        }}
                    >
                        {o.label}
                    </button>
                ))}
            </div>
            {style === "skeuomorphism" ? <SkeuomorphismTest /> : style === "macos" ? <MacOsTest /> : <LiquidGlassTest />}
        </div>
    );
}

export default UiLab;
