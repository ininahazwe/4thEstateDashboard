import { ReactNode } from 'react';

/* Jeu d'icônes au trait (1.6px, coins arrondis), même famille visuelle que
   les icônes lucide du portfolio — inline pour ne pas ajouter de dépendance. */

export type IconName =
  | 'grid' | 'layers' | 'share' | 'home' | 'search' | 'users' | 'map' | 'calendar'
  | 'shield' | 'arrowLeft' | 'arrowUpRight' | 'plus' | 'x' | 'bell' | 'logout'
  | 'lock' | 'folder' | 'file' | 'sliders' | 'chevron' | 'minus' | 'pin' | 'tag'
  | 'activity' | 'download' | 'person' | 'mic' | 'link' | 'fit' | 'help'
  | 'phone' | 'star' | 'ban' | 'pivot' | 'book' | 'edit' | 'trash';

const PATHS: Record<IconName, ReactNode> = {
  grid: (<><rect x="3.5" y="3.5" width="7" height="7" rx="2" /><rect x="13.5" y="3.5" width="7" height="7" rx="2" /><rect x="3.5" y="13.5" width="7" height="7" rx="2" /><rect x="13.5" y="13.5" width="7" height="7" rx="2" /></>),
  layers: (<><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 13 9 5 9-5" /></>),
  share: (<><circle cx="18" cy="5.5" r="2.5" /><circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="18.5" r="2.5" /><path d="m8.2 13.2 7.6 4.1M15.8 6.7l-7.6 4.1" /></>),
  home: (<path d="M3.7 10.4 12 3.6l8.3 6.8v8.2c0 1-.8 1.8-1.8 1.8H5.5c-1 0-1.8-.8-1.8-1.8v-8.2Z" />),
  search: (<><circle cx="11" cy="11" r="7" /><path d="m16.2 16.2 4.3 4.3" /></>),
  users: (<><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5" /><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.8c1.9.8 3.1 2.6 3.5 5.2" /></>),
  map: (<><path d="M9 4 3 6.5V20l6-2.5 6 2.5 6-2.5V4l-6 2.5L9 4Z" /><path d="M9 4v13.5M15 6.5V20" /></>),
  calendar: (<><rect x="3.5" y="5" width="17" height="15.5" rx="3" /><path d="M3.5 10h17M8.5 3v4M15.5 3v4" /></>),
  shield: (<path d="M12 3 4.5 6v5.5c0 4.6 3.1 8.3 7.5 9.5 4.4-1.2 7.5-4.9 7.5-9.5V6L12 3Z" />),
  arrowLeft: (<path d="M19 12H5m6-6-6 6 6 6" />),
  arrowUpRight: (<path d="M7 17 17 7M8 7h9v9" />),
  plus: (<path d="M12 5v14M5 12h14" />),
  x: (<path d="M6 6l12 12M18 6 6 18" />),
  bell: (<><path d="M6 16v-5a6 6 0 1 1 12 0v5l1.5 2h-15L6 16Z" /><path d="M10 20.5a2 2 0 0 0 4 0" /></>),
  logout: (<><path d="M15 4.5h3.4c1 0 1.8.8 1.8 1.8v11.4c0 1-.8 1.8-1.8 1.8H15" /><path d="M11 8.4 15 12l-4 3.6" /><path d="M15 12H3.6" /></>),
  lock: (<><rect x="5" y="10.5" width="14" height="10" rx="2.5" /><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" /></>),
  folder: (<path d="M3.5 7.5c0-1.1.9-2 2-2h4l2 2.5h7c1.1 0 2 .9 2 2v7.5c0 1.1-.9 2-2 2h-13c-1.1 0-2-.9-2-2V7.5Z" />),
  file: (<><path d="M14 3.5H7c-1.1 0-2 .9-2 2v13c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V8.5l-5-5Z" /><path d="M14 3.5v5h5M9 13h6M9 16.5h4" /></>),
  sliders: (<><path d="M4 7h10M18 7h2M4 17h2M10 17h10" /><circle cx="16" cy="7" r="2" /><circle cx="8" cy="17" r="2" /></>),
  chevron: (<path d="m9 6 6 6-6 6" />),
  minus: (<path d="M5 12h14" />),
  pin: (<><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z" /><circle cx="12" cy="10" r="2.3" /></>),
  tag: (<><path d="M3.5 12.6V5.5c0-1.1.9-2 2-2h7.1l8 8-9.1 9.1-8-8Z" /><circle cx="8.3" cy="8.3" r="1.4" /></>),
  activity: (<path d="M3 12h4l3-7 4 14 3-7h4" />),
  download: (<path d="M12 4v11m-4.5-4.5L12 15l4.5-4.5M5 19.5h14" />),
  person: (<><circle cx="12" cy="8" r="3.8" /><path d="M4.5 20.5c1-4 4-6 7.5-6s6.5 2 7.5 6" /></>),
  mic: (<><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" /></>),
  link: (<><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></>),
  fit: (<path d="M4 9V5.5C4 4.7 4.7 4 5.5 4H9M15 4h3.5c.8 0 1.5.7 1.5 1.5V9M20 15v3.5c0 .8-.7 1.5-1.5 1.5H15M9 20H5.5c-.8 0-1.5-.7-1.5-1.5V15" />),
  help: (<><circle cx="12" cy="12" r="9" /><path d="M9.6 9.3a2.5 2.5 0 0 1 4.8 1c0 1.7-2.4 2.2-2.4 3.7M12 17.2h.01" /></>),
  phone: (<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z" />),
  star: (<path d="m12 3 2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6-4.5-4.2 6.1-.7L12 3Z" />),
  ban: (<><circle cx="12" cy="12" r="8.5" /><path d="m6 6 12 12" /></>),
  pivot: (<><path d="M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3" /><path d="M18 3v4h-4M6 21v-4h4" /></>),
  book: (<><path d="M5 4.5h11a3 3 0 0 1 3 3v12H8a3 3 0 0 1-3-3v-12Z" /><path d="M9 9h6M9 12.5h6M9 16h3" /></>),
  edit: (<><path d="M4 20h4L19 9l-4-4L4 16v4Z" /><path d="m13.5 6.5 4 4" /></>),
  trash: (<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13" />),
};

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg
      className="ws-i"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}
