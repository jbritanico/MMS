function Dashboard() {
  return (
    <div className="status-screen">
      <style>{`
        .build-scene {
          width: 220px;
          margin: 0 auto 20px;
        }
        .build-ground { stroke: var(--neu-shadow-dark); stroke-width: 2; }

        .build-panel {
          transform-origin: 165px 150px;
          animation: build-panel-rise 5s ease-in-out infinite;
        }
        .build-bar1 { transform-origin: 138px 150px; animation: build-bar-grow 5s ease-in-out infinite; }
        .build-bar2 { transform-origin: 155px 150px; animation: build-bar-grow 5s ease-in-out infinite 0.15s; }
        .build-bar3 { transform-origin: 172px 150px; animation: build-bar-grow 5s ease-in-out infinite 0.3s; }
        .build-bar4 { transform-origin: 189px 150px; animation: build-bar-grow 5s ease-in-out infinite 0.45s; }

        .build-line {
          stroke-dasharray: 90;
          stroke-dashoffset: 90;
          animation: build-line-draw 5s ease-in-out infinite;
        }
        .build-dot { animation: build-fade-in 5s ease-in-out infinite; }

        .build-arm {
          transform-origin: 78px 108px;
          animation: build-pencil-move 0.8s ease-in-out infinite;
        }
        .build-spark {
          animation: build-spark-flash 0.8s ease-in-out infinite;
        }

        @keyframes build-panel-rise {
          0%   { transform: scaleY(0); }
          14%  { transform: scaleY(0); }
          30%  { transform: scaleY(1); }
          94%  { transform: scaleY(1); }
          100% { transform: scaleY(0); }
        }
        @keyframes build-bar-grow {
          0%   { transform: scaleY(0); }
          32%  { transform: scaleY(0); }
          50%  { transform: scaleY(1); }
          94%  { transform: scaleY(1); }
          100% { transform: scaleY(0); }
        }
        @keyframes build-line-draw {
          0%   { stroke-dashoffset: 90; opacity: 0; }
          55%  { stroke-dashoffset: 90; opacity: 1; }
          78%  { stroke-dashoffset: 0; opacity: 1; }
          94%  { stroke-dashoffset: 0; opacity: 1; }
          100% { opacity: 0; }
        }
        @keyframes build-fade-in {
          0%   { opacity: 0; }
          75%  { opacity: 0; }
          85%  { opacity: 1; }
          94%  { opacity: 1; }
          100% { opacity: 0; }
        }
        @keyframes build-pencil-move {
          0%, 100% { transform: rotate(-12deg) translateY(0); }
          50%      { transform: rotate(10deg) translateY(3px); }
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

        <g className="build-panel">
          <rect x="125" y="55" width="80" height="95" rx="6" fill="#f4f6fa" stroke="#c7d3e8" strokeWidth="1.5" />
        </g>

        <g>
          <rect className="build-bar1" x="132" y="118" width="10" height="32" rx="2" fill="#2f6fed" />
          <rect className="build-bar2" x="149" y="102" width="10" height="48" rx="2" fill="#5b8bf0" />
          <rect className="build-bar3" x="166" y="126" width="10" height="24" rx="2" fill="#2f6fed" />
          <rect className="build-bar4" x="183" y="94" width="10" height="56" rx="2" fill="#5b8bf0" />
        </g>

        <polyline className="build-line" points="133,88 150,72 167,80 184,62"
          fill="none" stroke="#c2760c" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        <circle className="build-dot" cx="184" cy="62" r="3.5" fill="#c2760c" />

        <g>
          <rect x="55" y="110" width="26" height="42" rx="12" fill="#2f6fed" />
          <circle cx="68" cy="98" r="14" fill="#f4cf9e" />
          <path d="M56 92 a14 12 0 0 1 26 -1 q-4 -6 -13 -6 q-9 0 -13 7z" fill="#3d2b1f" />
          <rect x="58" y="150" width="8" height="16" rx="3" fill="#3d2b1f" />
          <rect x="74" y="150" width="8" height="16" rx="3" fill="#3d2b1f" />

          <rect x="94" y="112" width="18" height="24" rx="2" fill="#e7eaf0" stroke="#b9bfca" strokeWidth="1.2" />
          <line x1="97" y1="118" x2="108" y2="118" stroke="#b9bfca" strokeWidth="1.2" />
          <line x1="97" y1="123" x2="108" y2="123" stroke="#b9bfca" strokeWidth="1.2" />
          <line x1="97" y1="128" x2="104" y2="128" stroke="#b9bfca" strokeWidth="1.2" />

          <g className="build-arm">
            <rect x="76" y="104" width="8" height="24" rx="4" fill="#2f6fed" />
            <rect x="86" y="118" width="16" height="4" rx="2" fill="#5f5e5a" transform="rotate(-20 88 120)" />
          </g>
          <circle className="build-spark" cx="102" cy="118" r="3.5" fill="#2f6fed" />
        </g>
      </svg>

      <h2>In Progress</h2>
      <p>Dashboard is being built — fleet-wide compliance and status will land here.</p>
    </div>
  );
}

export default Dashboard;
