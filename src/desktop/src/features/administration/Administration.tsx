function Administration() {
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
        .build-node-top { animation: build-fade-in 5s ease-in-out infinite; }
        .build-node-l {
          transform-origin: 143px 118px;
          animation: build-node-drop 5s ease-in-out infinite;
        }
        .build-node-r {
          transform-origin: 187px 118px;
          animation: build-node-drop 5s ease-in-out infinite 0.2s;
        }
        .build-link-l {
          stroke-dasharray: 30;
          stroke-dashoffset: 30;
          animation: build-link-draw 5s ease-in-out infinite;
        }
        .build-link-r {
          stroke-dasharray: 30;
          stroke-dashoffset: 30;
          animation: build-link-draw 5s ease-in-out infinite 0.2s;
        }

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
        @keyframes build-fade-in {
          0%   { opacity: 0; }
          34%  { opacity: 0; }
          46%  { opacity: 1; }
          94%  { opacity: 1; }
          100% { opacity: 0; }
        }
        @keyframes build-node-drop {
          0%   { opacity: 0; transform: translateY(-14px); }
          52%  { opacity: 0; transform: translateY(-14px); }
          68%  { opacity: 1; transform: translateY(0); }
          94%  { opacity: 1; transform: translateY(0); }
          100% { opacity: 0; transform: translateY(-14px); }
        }
        @keyframes build-link-draw {
          0%   { stroke-dashoffset: 30; opacity: 0; }
          64%  { stroke-dashoffset: 30; opacity: 1; }
          80%  { stroke-dashoffset: 0; opacity: 1; }
          94%  { stroke-dashoffset: 0; opacity: 1; }
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

        <line className="build-link-l" x1="165" y1="90" x2="143" y2="108" stroke="#8fa3c9" strokeWidth="2" />
        <line className="build-link-r" x1="165" y1="90" x2="187" y2="108" stroke="#8fa3c9" strokeWidth="2" />

        <g className="build-node-top">
          <rect x="150" y="72" width="30" height="18" rx="3" fill="#2f6fed" />
          <line x1="156" y1="78" x2="174" y2="78" stroke="#e7eaf0" strokeWidth="2" strokeLinecap="round" />
          <line x1="156" y1="83" x2="168" y2="83" stroke="#e7eaf0" strokeWidth="2" strokeLinecap="round" />
        </g>

        <g className="build-node-l">
          <rect x="128" y="110" width="30" height="18" rx="3" fill="#5b8bf0" />
          <line x1="134" y1="116" x2="152" y2="116" stroke="#e7eaf0" strokeWidth="2" strokeLinecap="round" />
          <line x1="134" y1="121" x2="146" y2="121" stroke="#e7eaf0" strokeWidth="2" strokeLinecap="round" />
        </g>

        <g className="build-node-r">
          <rect x="172" y="110" width="30" height="18" rx="3" fill="#5b8bf0" />
          <line x1="178" y1="116" x2="196" y2="116" stroke="#e7eaf0" strokeWidth="2" strokeLinecap="round" />
          <line x1="178" y1="121" x2="190" y2="121" stroke="#e7eaf0" strokeWidth="2" strokeLinecap="round" />
        </g>

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
      <p>Administration is being built — user management, MR-code definitions, and system configuration will land here.</p>
    </div>
  );
}

export default Administration;