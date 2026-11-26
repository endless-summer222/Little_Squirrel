import type { ReactNode, SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 24, children, ...rest }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const Search = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m16 16 4 4" />
  </Svg>
);

export const Cloud = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7 18h9.5a3.5 3.5 0 0 0 .4-7A5 5 0 0 0 7.2 9.6 4.2 4.2 0 0 0 7 18Z" />
    <path d="M9.5 13.8 11 15.3l3.2-3.4" />
  </Svg>
);

export const More = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="5.5" r="1" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
    <circle cx="12" cy="18.5" r="1" fill="currentColor" stroke="none" />
  </Svg>
);

export const GridIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="4" y="4" width="6.5" height="6.5" rx="1.6" />
    <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.6" />
    <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.6" />
    <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.6" />
  </Svg>
);

export const Gear = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 3.5v2.2M12 18.3v2.2M20.5 12h-2.2M5.7 12H3.5M18 6l-1.6 1.6M7.6 16.4 6 18M18 18l-1.6-1.6M7.6 7.6 6 6" />
  </Svg>
);

export const Plus = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 5v14M5 12h14" strokeWidth={2} />
  </Svg>
);

export const Play = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 7.5v9l7-4.5-7-4.5Z" fill="currentColor" stroke="none" />
  </Svg>
);

export const Close = (p: IconProps) => (
  <Svg {...p}>
    <path d="m6 6 12 12M18 6 6 18" />
  </Svg>
);

export const ChevronLeft = (p: IconProps) => (
  <Svg {...p}>
    <path d="m14.5 6-6 6 6 6" />
  </Svg>
);

export const ChevronRight = (p: IconProps) => (
  <Svg {...p}>
    <path d="m9.5 6 6 6-6 6" />
  </Svg>
);

export const LayersIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="m12 4 8 4.5-8 4.5-8-4.5L12 4Z" />
    <path d="m4 12.5 8 4.5 8-4.5" />
    <path d="m4 16.5 8 4.5 8-4.5" opacity=".45" />
  </Svg>
);

export const Overlay = (p: IconProps) => (
  <Svg {...p}>
    <rect x="4" y="4" width="12" height="12" rx="2" />
    <path d="M9 20h11V9" opacity=".6" />
  </Svg>
);

export const Sparkles = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 4.5 13.6 9l4.4 1.5L13.6 12 12 16.5 10.4 12 6 10.5 10.4 9 12 4.5Z" />
    <path d="M18.5 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7.7-1.8Z" />
  </Svg>
);

export const Check = (p: IconProps) => (
  <Svg {...p}>
    <path d="m5 12.5 4.5 4.5L19 7.5" strokeWidth={2} />
  </Svg>
);

export const Pencil = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4.5 19.5 8 18.8 19 7.8a1.8 1.8 0 0 0 0-2.6l-.2-.2a1.8 1.8 0 0 0-2.6 0L5.2 16l-.7 3.5Z" />
    <path d="m14.8 6.4 2.8 2.8" />
  </Svg>
);

export const Eraser = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8.5 19H20" />
    <path d="M15.5 4.8 4.9 15.4a1.6 1.6 0 0 0 0 2.3l1.4 1.4a1.6 1.6 0 0 0 2.3 0L19.2 8.5a1.6 1.6 0 0 0 0-2.3l-1.4-1.4a1.6 1.6 0 0 0-2.3 0Z" />
    <path d="m10 9 5 5" opacity=".55" />
  </Svg>
);

export const Bucket = (p: IconProps) => (
  <Svg {...p}>
    <path d="M11 4 4.8 10.2a2 2 0 0 0 0 2.8l4.2 4.2a2 2 0 0 0 2.8 0L18 11 11 4Z" />
    <path d="m7 7 7 7" opacity=".5" />
    <path d="M19.5 14.5c1 1.4 1.6 2.5 1.6 3.3a1.6 1.6 0 0 1-3.2 0c0-.8.6-1.9 1.6-3.3Z" fill="currentColor" stroke="none" />
  </Svg>
);

export const Dropper = (p: IconProps) => (
  <Svg {...p}>
    <path d="m14.5 5.5 4 4" />
    <path d="M17 3.5a2.1 2.1 0 0 1 3 3l-2 2-3-3 2-2Z" />
    <path d="m15.5 8.5-8.8 8.8-2.7.9.9-2.7L13.7 6.7" />
  </Svg>
);

export const Bulb = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9.5 18h5" />
    <path d="M10 21h4" />
    <path d="M12 3a6 6 0 0 0-3.5 10.9c.6.4.9 1 .9 1.6V16h5.2v-.5c0-.6.3-1.2.9-1.6A6 6 0 0 0 12 3Z" />
  </Svg>
);

export const Undo = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8.5 5.5 4 10l4.5 4.5" />
    <path d="M4 10h8.5a5.5 5.5 0 1 1 0 11H9" />
  </Svg>
);

export const Redo = (p: IconProps) => (
  <Svg {...p}>
    <path d="M15.5 5.5 20 10l-4.5 4.5" />
    <path d="M20 10h-8.5a5.5 5.5 0 1 0 0 11H15" />
  </Svg>
);

export const Marquee = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16" strokeDasharray="3 3" />
  </Svg>
);

export const Help = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M9.6 9.6a2.5 2.5 0 1 1 3.4 2.3c-.7.3-1 .9-1 1.6v.3" />
    <circle cx="12" cy="17" r=".9" fill="currentColor" stroke="none" />
  </Svg>
);

export const Move = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3v18M3 12h18" />
    <path d="m8 7 4-4 4 4M8 17l4 4 4-4M7 8 3 12l4 4M17 8l4 4-4 4" />
  </Svg>
);

export const Wand = (p: IconProps) => (
  <Svg {...p}>
    <path d="m5 19 9.5-9.5" />
    <path d="m13.5 4.5 1 2.5 2.5 1-2.5 1-1 2.5-1-2.5-2.5-1 2.5-1 1-2.5Z" />
    <path d="M19 13.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7.7-1.8Z" />
  </Svg>
);

export const Lasso = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 4c4.7 0 8 2.2 8 5.2 0 2.5-2.2 4.4-5.4 5" />
    <path d="M12 4C7.3 4 4 6.2 4 9.2c0 2 1.5 3.7 3.8 4.5" />
    <path d="M7.8 13.7c-.3 2 1.2 3.7 2.7 3.7M10.5 17.4c0 1.3-.8 2.6-2.2 2.6" />
  </Svg>
);

export const Ellipse = (p: IconProps) => (
  <Svg {...p}>
    <ellipse cx="12" cy="12" rx="8" ry="6.5" />
  </Svg>
);

export const RectIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="4" y="5" width="16" height="14" rx="1.5" />
  </Svg>
);

export const Folder = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3.5 7.5a2 2 0 0 1 2-2h3.2l1.8 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-11Z" />
    <path d="M3.5 9.5h17" opacity=".45" />
  </Svg>
);

export const ArrowUpDown = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 5v14M8 5 5 8.2M8 5l3 3.2M16 19V5M16 19l-3-3.2M16 19l3-3.2" />
  </Svg>
);

export const Trash = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" />
  </Svg>
);
