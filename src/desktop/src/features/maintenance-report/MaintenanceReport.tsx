function MaintenanceReport() {
    return (
        <div className="status-screen">
            <style>{`
        .build-scene {
          width: 220px;
          margin: 0 auto 20px;
        }
        .build-ground { stroke: var(--neu-shadow-dark); stroke-width: 2; }

        .build-frame {
          transform-origin: 165px 150px;
          animation: build-frame-rise 4.5s ease-in-out infinite;
        }
        .build-gear-big {
          transform-origin: 165px 105px;
          animation: build-gear-drop 4.5s ease-in-out infinite, build-gear-spin 3s linear infinite;
        }
        .build-gear-small {
          transform-origin: 192px 118px;
          animation: build-gear2-drop 4.5s ease-in-out infinite, build-gear-spin-rev 2s linear infinite;
        }
        .build-arm {
          transform-origin: 78px 108px;
          animation: build-wrench-turn 1s ease-in-out infinite;
        }
        .build-spark {
          animation: build-spark-flash 1s ease-in-out infinite;
        }
        .build-bolt {
          animation: build-fade-in 4.5s ease-in-out infinite;
        }

        @keyframes build-frame-rise {
          0%   { transform: scaleY(0); }
          18%  { transform: scaleY(0); }
          38%  { transform: scaleY(1); }
          92%  { transform: scaleY(1); }
          100% { transform: scaleY(0); }
        }
        @keyframes build-gear-drop {
          0%   { opacity: 0; transform: translateY(-20px); }
          42%  { opacity: 0; transform: translateY(-20px); }
          60%  { opacity: 1; transform: translateY(0); }
          92%  { opacity: 1; transform: translateY(0); }
          100% { opacity: 0; transform: translateY(-20px); }
        }
        @keyframes build-gear2-drop {
          0%   { opacity: 0; transform: translateY(-16px); }
          50%  { opacity: 0; transform: translateY(-16px); }
          66%  { opacity: 1; transform: translateY(0); }
          92%  { opacity: 1; transform: translateY(0); }
          100% { opacity: 0; transform: translateY(-16px); }
        }
        @keyframes build-gear-spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes build-gear-spin-rev {
          from { transform: rotate(0deg); }
          to   { transform: rotate(-360deg); }
        }
        @keyframes build-fade-in {
          0%   { opacity: 0; }
          40%  { opacity: 0; }
          55%  { opacity: 1; }
          92%  { opacity: 1; }
          100% { opacity: 0; }
        }
        @keyframes build-wrench-turn {
          0%, 100% { transform: rotate(-15deg); }
          50%      { transform: rotate(20deg); }
        }
        @keyframes build-spark-flash {
          0%, 40%, 100% { opacity: 0; }
          50%           { opacity: 1; }
          60%           { opacity: 0; }
        }
      `}</style>

            <svg className="build-scene" viewBox="0 0 220 170" xmlns="http://www.w3.org/2000/svg">
                <line className="build-ground" x1="10" y1="160" x2="210" y2="160" />

                <rect x="120" y="146" width="90" height="14" rx="2" fill="#b9bfca" />

                <g className="build-frame">
                    <rect x="128" y="120" width="70" height="30" rx="4" fill="#c7d3e8" stroke="#8fa3c9" strokeWidth="1.5" />
                    <rect x="140" y="150" width="6" height="10" fill="#8fa3c9" />
                    <rect x="180" y="150" width="6" height="10" fill="#8fa3c9" />
                </g>

                <g className="build-gear-big">
                    <circle cx="165" cy="105" r="20" fill="#c2760c" />
                    <circle cx="165" cy="105" r="7" fill="#e7eaf0" />
                    <g stroke="#c2760c" strokeWidth="6">
                        <line x1="165" y1="80" x2="165" y2="90" />
                        <line x1="165" y1="120" x2="165" y2="130" />
                        <line x1="140" y1="105" x2="150" y2="105" />
                        <line x1="180" y1="105" x2="190" y2="105" />
                        <line x1="147" y1="87" x2="154" y2="94" />
                        <line x1="176" y1="116" x2="183" y2="123" />
                        <line x1="183" y1="87" x2="176" y2="94" />
                        <line x1="154" y1="116" x2="147" y2="123" />
                    </g>
                </g>

                <g className="build-gear-small">
                    <circle cx="192" cy="118" r="11" fill="#2f6fed" />
                    <circle cx="192" cy="118" r="4" fill="#e7eaf0" />
                    <g stroke="#2f6fed" strokeWidth="4">
                        <line x1="192" y1="103" x2="192" y2="109" />
                        <line x1="192" y1="127" x2="192" y2="133" />
                        <line x1="177" y1="118" x2="183" y2="118" />
                        <line x1="201" y1="118" x2="207" y2="118" />
                    </g>
                </g>

                <rect className="build-bolt" x="149" y="130" width="8" height="8" fill="#5f5e5a" />

                <g>
                    <rect x="55" y="110" width="26" height="42" rx="12" fill="#2f6fed" />
                    <circle cx="68" cy="98" r="14" fill="#f4cf9e" />
                    <path d="M56 92 a14 12 0 0 1 26 -1 q-4 -6 -13 -6 q-9 0 -13 7z" fill="#3d2b1f" />
                    <rect x="58" y="150" width="8" height="16" rx="3" fill="#3d2b1f" />
                    <rect x="74" y="150" width="8" height="16" rx="3" fill="#3d2b1f" />

                    <g className="build-arm">
                        <rect x="76" y="104" width="8" height="24" rx="4" fill="#2f6fed" />
                        <rect x="79" y="98" width="6" height="16" rx="2" fill="#5f5e5a" transform="rotate(-30 82 100)" />
                        <rect x="86" y="92" width="10" height="6" rx="1.5" fill="#5f5e5a" transform="rotate(-30 82 100)" />
                    </g>
                    <circle className="build-spark" cx="98" cy="94" r="4" fill="#2f6fed" />
                </g>
            </svg>

            <h2>In Progress</h2>
            <p>Maintenance Report is being built — MR-I, MR-II, and MR-III entry will land here.</p>
        </div>
    );
}

export default MaintenanceReport;
