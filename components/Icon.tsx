import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement>
const base = 'currentColor'

const S = (props: IconProps) => ({
  'aria-hidden': true,
  focusable: false,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: base,
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  ...props,
})

// Shared drawings referenced under more than one name (aliases stay one component).
const calendar = (p: IconProps) => (<svg {...S(p)}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>)
const category = (p: IconProps) => (<svg {...S(p)}><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>)

export const Icon = {
  search: (p: IconProps) => (<svg {...S(p)}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>),
  star: (p: IconProps) => (<svg viewBox="0 0 24 24" fill="currentColor" {...p}><path d="m12 2 2.95 6.5L22 9.3l-5.2 4.9 1.4 7L12 17.8 5.8 21.2l1.4-7L2 9.3l7.05-.8L12 2Z" /></svg>),
  check: (p: IconProps) => (<svg {...S(p)} strokeWidth={2.2}><path d="m4 12 5 5L20 6" /></svg>),
  arrow: (p: IconProps) => (<svg {...S(p)}><path d="M5 12h14M13 5l7 7-7 7" /></svg>),
  back: (p: IconProps) => (<svg {...S(p)}><path d="M19 12H5M11 19l-7-7 7-7" /></svg>),
  lock: (p: IconProps) => (<svg {...S(p)}><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>),
  calendar,
  cal: calendar,
  clock: (p: IconProps) => (<svg {...S(p)}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>),
  video: (p: IconProps) => (<svg {...S(p)}><rect x="2.5" y="6" width="13" height="12" rx="2" /><path d="m15.5 10 6-3v10l-6-3" /></svg>),
  chat: (p: IconProps) => (<svg {...S(p)} strokeWidth={1.7}><path d="M21 11.5a8.4 8.4 0 0 1-9 8.5 8.6 8.6 0 0 1-3.5-.7L3 21l1.7-5.5A8.5 8.5 0 1 1 21 11.5Z" /></svg>),
  user: (p: IconProps) => (<svg {...S(p)}><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-7 8-7s8 3 8 7" /></svg>),
  bell: (p: IconProps) => (<svg {...S(p)} strokeWidth={1.7}><path d="M6 9a6 6 0 0 1 12 0v4l2 3H4l2-3V9Z" /><path d="M10 19a2 2 0 1 0 4 0" /></svg>),
  heart: (p: IconProps) => (<svg {...S(p)}><path d="M20.8 6.6a5.4 5.4 0 0 0-8.8-1.7 5.4 5.4 0 0 0-8.8 6.4c1.6 3.3 8.8 8.7 8.8 8.7s7.2-5.4 8.8-8.7a5.4 5.4 0 0 0 0-4.7Z" /></svg>),
  heartFilled: (p: IconProps) => (<svg viewBox="0 0 24 24" fill="currentColor" {...p}><path d="M20.8 6.6a5.4 5.4 0 0 0-8.8-1.7 5.4 5.4 0 0 0-8.8 6.4c1.6 3.3 8.8 8.7 8.8 8.7s7.2-5.4 8.8-8.7a5.4 5.4 0 0 0 0-4.7Z" /></svg>),
  settings: (p: IconProps) => (<svg {...S(p)}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.9 2.9l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.2-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.9-2.9l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1.2 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.9-2.9l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.6V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.9 2.9l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.6 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.6 1Z" /></svg>),
  mic: (p: IconProps) => (<svg {...S(p)}><rect x="9" y="3" width="6" height="12" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>),
  cam: (p: IconProps) => (<svg {...S(p)}><rect x="2.5" y="6" width="13" height="12" rx="2" /><path d="m15.5 10 6-3v10l-6-3" /></svg>),
  share: (p: IconProps) => (<svg {...S(p)}><rect x="3" y="5" width="18" height="12" rx="2" /><path d="M8 21h8M12 17v4" /></svg>),
  end: (p: IconProps) => (<svg {...S(p)}><path d="M22 16.9v3a2 2 0 0 1-2 2 20 20 0 0 1-19-19 2 2 0 0 1 2-2h3a2 2 0 0 1 2 1.7l.6 3a2 2 0 0 1-.5 2L6.5 9.5a16 16 0 0 0 8 8l1.9-1.9a2 2 0 0 1 2-.5l3 .6a2 2 0 0 1 1.6 2Z" /></svg>),
  home: (p: IconProps) => (<svg {...S(p)}><path d="m3 10 9-7 9 7" /><path d="M5 9v11a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9" /></svg>),
  logout: (p: IconProps) => (<svg {...S(p)}><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" /><path d="M10 17l5-5-5-5M15 12H3" /></svg>),
  close: (p: IconProps) => (<svg {...S(p)} strokeWidth={2}><path d="m6 6 12 12M18 6 6 18" /></svg>),
  menu: (p: IconProps) => (<svg {...S(p)}><path d="M4 7h16M4 12h16M4 17h16" /></svg>),
  chevR: (p: IconProps) => (<svg {...S(p)}><path d="m9 6 6 6-6 6" /></svg>),
  chevL: (p: IconProps) => (<svg {...S(p)}><path d="m15 6-6 6 6 6" /></svg>),
  chevD: (p: IconProps) => (<svg {...S(p)}><path d="m6 9 6 6 6-6" /></svg>),
  spark: (p: IconProps) => (<svg {...S(p)}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8" /></svg>),
  money: (p: IconProps) => (<svg {...S(p)}><rect x="2.5" y="6" width="19" height="13" rx="2" /><circle cx="12" cy="12.5" r="2.5" /></svg>),
  doc: (p: IconProps) => (<svg {...S(p)} strokeWidth={1.7}><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6Z" /></svg>),
  category,
  grid: category,
  list: (p: IconProps) => (<svg {...S(p)} strokeWidth={1.7}><path d="M8 6h13M8 12h13M8 18h13" /><circle cx="4" cy="6" r="1" /><circle cx="4" cy="12" r="1" /><circle cx="4" cy="18" r="1" /></svg>),
  sliders: (p: IconProps) => (<svg {...S(p)} strokeWidth={1.7}><path d="M4 6h13M20 6h-2M4 12h7M14 12h6M4 18h10M17 18h3" /><circle cx="18" cy="6" r="2" /><circle cx="12.5" cy="12" r="2" /><circle cx="15.5" cy="18" r="2" /></svg>),
  graph: (p: IconProps) => (<svg {...S(p)} strokeWidth={1.7}><path d="M3 17 9 11l4 4 8-9M14 4h7v7" /></svg>),
  plus: (p: IconProps) => (<svg {...S(p)} strokeWidth={2}><path d="M12 5v14M5 12h14" /></svg>),
  more: (p: IconProps) => (<svg viewBox="0 0 24 24" fill="currentColor" {...p}><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></svg>),
  globe: (p: IconProps) => (<svg {...S(p)} strokeWidth={1.7}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" /></svg>),
  // ⚠️ A PIN, BECAUSE THE GLOBE WAS DOING TWO JOBS (2026-08-20). One catalogue
  // draws two kinds of card side by side, and both put their meta line behind
  // the globe: on a consultation it meant LANGUAGES („ქართული, ინგლისური"),
  // on a service it meant CITIES („თბილისი, რუსთავი"). The same mark for two
  // different facts, adjacent on one screen, is a mark that says nothing.
  // Same 24-box, same stroke, same construction as its neighbours.
  pin: (p: IconProps) => (<svg {...S(p)} strokeWidth={1.7}><path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11Z" /><circle cx="12" cy="10" r="2.6" /></svg>),
  x: (p: IconProps) => (<svg {...S(p)} strokeWidth={2}><path d="m6 6 12 12M18 6 6 18" /></svg>),
  xC: (p: IconProps) => (<svg {...S(p)} strokeWidth={2}><path d="m6 6 12 12M18 6 6 18" /></svg>),
  download: (p: IconProps) => (<svg {...S(p)} strokeWidth={1.7}><path d="M12 4v12m0 0 5-5m-5 5-5-5M4 20h16" /></svg>),
  upload: (p: IconProps) => (<svg {...S(p)} strokeWidth={1.7}><path d="M12 20V8m0 0 5 5m-5-5-5 5M4 20h16" /></svg>),
  users: (p: IconProps) => (<svg {...S(p)} strokeWidth={1.7}><circle cx="9" cy="8" r="4" /><path d="M2 21c0-4 3-7 7-7s7 3 7 7M16 4a4 4 0 0 1 0 8M22 21c0-3-2-5.5-5-6.5" /></svg>),
  shield: (p: IconProps) => (<svg {...S(p)} strokeWidth={1.7}><path d="M12 3 4 6v6c0 5 3.5 8.5 8 9 4.5-.5 8-4 8-9V6l-8-3Z" /></svg>),
  shieldCheck: (p: IconProps) => (<svg {...S(p)} strokeWidth={1.7}><path d="M12 3 4 6v6c0 5 3.5 8.5 8 9 4.5-.5 8-4 8-9V6l-8-3Z" /><path d="m9 12 2 2 4-4" /></svg>),
  wallet: (p: IconProps) => (<svg {...S(p)} strokeWidth={1.7}><path d="M3 7a2 2 0 0 1 2-2h11l4 4v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" /><circle cx="16" cy="14" r="1.4" /></svg>),
  flag: (p: IconProps) => (<svg {...S(p)} strokeWidth={1.7}><path d="M4 21V4M4 4h13l-2 4 2 4H4" /></svg>),
  pulse: (p: IconProps) => (<svg {...S(p)} strokeWidth={1.7}><path d="M3 12h4l3-8 4 16 3-8h4" /></svg>),
  bolt: (p: IconProps) => (<svg {...S(p)} strokeWidth={1.7}><path d="m13 2-8 12h6l-1 8 8-12h-6l1-8Z" /></svg>),
  warn: (p: IconProps) => (<svg {...S(p)} strokeWidth={1.7}><path d="M12 3 2 21h20L12 3Z" /><path d="M12 10v5M12 18h0" /></svg>),
  trend: (p: IconProps) => (<svg {...S(p)} strokeWidth={1.7}><path d="M3 17 9 11l4 4 8-9M14 4h7v7" /></svg>),
  mail: (p: IconProps) => (<svg {...S(p)} strokeWidth={1.7}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m4 7 8 5.5L20 7" /></svg>),
  phone: (p: IconProps) => (<svg {...S(p)} strokeWidth={1.7}><path d="M22 16.9v3a2 2 0 0 1-2 2 20 20 0 0 1-19-19 2 2 0 0 1 2-2h3a2 2 0 0 1 2 1.7l.6 3a2 2 0 0 1-.5 2L6.5 9.5a16 16 0 0 0 8 8l1.9-1.9a2 2 0 0 1 2-.5l3 .6a2 2 0 0 1 1.6 2Z" /></svg>),
  eye: (p: IconProps) => (<svg {...S(p)}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></svg>),
  eyeOff: (p: IconProps) => (<svg {...S(p)}><path d="m3 3 18 18M10.6 6.1A10 10 0 0 1 12 6c6.5 0 10 7 10 7a17 17 0 0 1-3.1 4M6.4 7.6A17 17 0 0 0 2 12s3.5 7 10 7c1.3 0 2.5-.2 3.6-.7M9.9 9.9a3 3 0 0 0 4.2 4.2" /></svg>),
  external: (p: IconProps) => (<svg {...S(p)}><path d="M14 4h6v6M20 4l-9 9M18 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5" /></svg>),
  camera: (p: IconProps) => (<svg {...S(p)}><path d="M3 8a2 2 0 0 1 2-2h2.5l1.5-2h6l1.5 2H19a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8Z" /><circle cx="12" cy="13" r="3.5" /></svg>),
  paperclip: (p: IconProps) => (<svg {...S(p)} strokeWidth={1.7}><path d="m20.5 11.5-8.2 8.2a5.3 5.3 0 0 1-7.5-7.5l8.5-8.5a3.5 3.5 0 0 1 5 5l-8.5 8.5a1.8 1.8 0 0 1-2.5-2.5l7.9-7.9" /></svg>),
  send: (p: IconProps) => (<svg {...S(p)} strokeWidth={1.7}><path d="M21 3 10 14M21 3l-7 18-3-8-8-3 18-7Z" /></svg>),
  refresh: (p: IconProps) => (<svg {...S(p)} strokeWidth={1.7}><path d="M3 12a9 9 0 0 1 15.5-6L21 4M21 4v6h-6M21 12a9 9 0 0 1-15.5 6L3 20M3 20v-6h6" /></svg>),
  pause: (p: IconProps) => (<svg {...S(p)} strokeWidth={1.7}><path d="M8 5v14M16 5v14" /></svg>),
  play: (p: IconProps) => (<svg viewBox="0 0 24 24" fill="currentColor" {...p}><path d="M8 5v14l11-7L8 5Z" /></svg>),
  info: (p: IconProps) => (<svg {...S(p)}><circle cx="12" cy="12" r="9" /><path d="M12 16v-5M12 8v.01" /></svg>),
  edit: (p: IconProps) => (<svg {...S(p)} strokeWidth={1.7}><path d="M12 20h9M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" /></svg>),
  award: (p: IconProps) => (<svg {...S(p)} strokeWidth={1.7}><circle cx="12" cy="9" r="6" /><path d="m9 14-2 7 5-3 5 3-2-7" /></svg>),
  briefcase: (p: IconProps) => (<svg {...S(p)} strokeWidth={1.7}><rect x="2.5" y="7" width="19" height="13" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>),
  thumb: (p: IconProps) => (<svg {...S(p)} strokeWidth={1.7}><path d="M7 11V20H4a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1Z" /><path d="M7 11V8a4 4 0 0 1 4-4l1.5 5h6a2 2 0 0 1 2 2.3l-1.3 7A2 2 0 0 1 17.2 20H7" /></svg>),
  quote: (p: IconProps) => (<svg viewBox="0 0 24 24" fill="currentColor" {...p}><path d="M7 7h4v4H8c0 2 1 3 3 3v3c-3.5 0-6-2-6-6V7Zm9 0h4v4h-3c0 2 1 3 3 3v3c-3.5 0-6-2-6-6V7Z" opacity=".8" /></svg>),
}


