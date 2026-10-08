/** Web polish stays isolated from the native render tree. */
export function StudioEffects() {
  return <style>{`
    #studio-revenue {
      background: radial-gradient(ellipse at 100% 0%, rgba(43,151,126,.38), transparent 65%), linear-gradient(125deg, #172c28, #233f36);
      position: relative;
      overflow: hidden;
      box-shadow: 0 16px 38px -22px rgba(10,65,49,.5);
    }
    #studio-revenue::before {
      content: ''; position: absolute; width: 300px; height: 300px;
      border: 1px solid rgba(185,240,214,.12); border-radius: 50%;
      top: -190px; right: -60px; pointer-events: none;
      box-shadow: 0 0 0 38px rgba(185,240,214,.035), 0 0 0 76px rgba(185,240,214,.025);
    }
    @media (prefers-reduced-motion: no-preference) {
      [role="button"], button { transition: background-color 160ms ease, border-color 160ms ease, box-shadow 160ms ease, transform 160ms ease; }
      @media (hover: hover) {
        [role="button"]:not([aria-disabled="true"]):hover, button:not(:disabled):hover { box-shadow: 0 5px 14px -8px rgba(22,48,39,.32); transform: translateY(-1px); }
      }
    }
    [role="button"]:focus-visible, [role="tab"]:focus-visible, button:focus-visible { outline: 2px solid #087B69; outline-offset: 3px; }
  `}</style>;
}
