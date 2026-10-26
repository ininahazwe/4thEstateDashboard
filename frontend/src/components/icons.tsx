import { ReactNode } from 'react';

/* Jeu d'icônes au trait (1.6px, coins arrondis), même famille visuelle que
   les icônes lucide du portfolio — inline pour ne pas ajouter de dépendance. */

export type IconName =
  | 'grid' | 'layers' | 'share' | 'home' | 'search' | 'users' | 'map' | 'calendar'
  | 'shield' | 'arrowLeft' | 'arrowUpRight' | 'plus' | 'x' | 'bell' | 'logout'
  | 'lock' | 'folder' | 'file';

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
