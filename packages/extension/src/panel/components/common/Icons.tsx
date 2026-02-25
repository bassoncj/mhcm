interface IconProps {
  size?: number;
  class?: string;
}

export function IconStore({ size = 16, class: cls }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={cls}>
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

export function IconListOrdered({ size = 16, class: cls }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={cls}>
      <path d="M11 8H16M16 12H11M16 16H11M6 20H18C19.1046 20 20 19.1046 20 18V6C20 4.89543 19.1046 4 18 4H6C4.89543 4 4 4.89543 4 6V18C4 19.1046 4.89543 20 6 20Z" />
      <path d="M8 8H8.001" />
      <path d="M8 12H8.001" />
      <path d="M8 16H8.001" />
    </svg>
  );
}

export function IconClock({ size = 16, class: cls }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={cls}>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

export function IconShield({ size = 16, class: cls }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={cls}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

export function IconSettings({ size = 16, class: cls }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={cls}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

export function IconUser({ size = 16, class: cls }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={cls}>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

export function IconLogOut({ size = 16, class: cls }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={cls}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

export function IconSearch({ size = 16, class: cls }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={cls}>
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

export function IconChevronDown({ size = 16, class: cls }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={cls}>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

export function IconChevronUp({ size = 16, class: cls }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={cls}>
      <polyline points="18 15 12 9 6 15" />
    </svg>
  );
}

export function IconChevronLeft({ size = 16, class: cls }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={cls}>
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

export function IconChevronRight({ size = 16, class: cls }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={cls}>
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

export function IconPlus({ size = 16, class: cls }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={cls}>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

export function IconX({ size = 16, class: cls }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={cls}>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

export function IconCheckCircle({ size = 16, class: cls }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={cls}>
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

export function IconXCircle({ size = 16, class: cls }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={cls}>
      <circle cx="12" cy="12" r="10" />
      <line x1="15" y1="9" x2="9" y2="15" />
      <line x1="9" y1="9" x2="15" y2="15" />
    </svg>
  );
}

export function IconLoader({ size = 16, class: cls }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={cls}>
      <line x1="12" y1="2" x2="12" y2="6" />
      <line x1="12" y1="18" x2="12" y2="22" />
      <line x1="4.93" y1="4.93" x2="7.76" y2="7.76" />
      <line x1="16.24" y1="16.24" x2="19.07" y2="19.07" />
      <line x1="2" y1="12" x2="6" y2="12" />
      <line x1="18" y1="12" x2="22" y2="12" />
      <line x1="4.93" y1="19.07" x2="7.76" y2="16.24" />
      <line x1="16.24" y1="7.76" x2="19.07" y2="4.93" />
    </svg>
  );
}

export function IconMail({ size = 16, class: cls }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={cls}>
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
      <polyline points="22,6 12,13 2,6" />
    </svg>
  );
}

export function IconWifi({ size = 16, class: cls }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={cls}>
      <path d="M5 12.55a11 11 0 0 1 14.08 0" />
      <path d="M1.42 9a16 16 0 0 1 21.16 0" />
      <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
      <line x1="12" y1="20" x2="12.01" y2="20" />
    </svg>
  );
}

export function IconWifiOff({ size = 16, class: cls }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={cls}>
      <line x1="1" y1="1" x2="23" y2="23" />
      <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
      <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
      <path d="M10.71 5.05A16 16 0 0 1 22.56 9" />
      <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
      <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
      <line x1="12" y1="20" x2="12.01" y2="20" />
    </svg>
  );
}

export function IconSun({ size = 16, class: cls }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={cls}>
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  );
}

export function IconMoon({ size = 16, class: cls }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={cls}>
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

export function IconRefreshCw({ size = 16, class: cls }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={cls}>
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  );
}

export function IconMoreVertical({ size = 16, class: cls }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={cls}>
      <circle cx="12" cy="12" r="1" />
      <circle cx="12" cy="5" r="1" />
      <circle cx="12" cy="19" r="1" />
    </svg>
  );
}

export function IconTrendingUp({ size = 16, class: cls }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={cls}>
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
      <polyline points="17 6 23 6 23 12" />
    </svg>
  );
}

export function IconMap({ size = 16, class: cls }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={cls}>
      <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
      <line x1="8" y1="2" x2="8" y2="18" />
      <line x1="16" y1="6" x2="16" y2="22" />
    </svg>
  );
}

export function IconTrendingDown({ size = 16, class: cls }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={cls}>
      <polyline points="23 18 13.5 8.5 8.5 13.5 1 6" />
      <polyline points="17 18 23 18 23 12" />
    </svg>
  );
}

export function IconHome({ size = 16, class: cls }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={cls}>
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

export function IconStar({ size = 16, class: cls }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={cls}>
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

export function IconStarFilled({ size = 16, class: cls }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={cls}>
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

export function IconTag({ size = 16, class: cls }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={cls}>
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
      <line x1="7" y1="7" x2="7.01" y2="7" />
    </svg>
  );
}

export function IconArrowLeft({ size = 16, class: cls }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={cls}>
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
    </svg>
  );
}

export function IconFilter({ size = 16, class: cls }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={cls}>
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
  );
}

export function IconHelpCircle({ size = 16, class: cls }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={cls}>
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

export function IconHeart({ size = 16, class: cls }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={cls}>
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

export function IconPin({ size = 16, class: cls }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={cls}>
      <line x1="12" y1="17" x2="12" y2="22" />
      <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z" />
    </svg>
  );
}

export function IconPinOff({ size = 16, class: cls }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={cls}>
      <line x1="2" y1="2" x2="22" y2="22" />
      <line x1="12" y1="17" x2="12" y2="22" />
      <path d="M9 9v1.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V17h12" />
      <path d="M15 9.34V6h1a2 2 0 0 0 0-4H7.89" />
    </svg>
  );
}

export function IconBell({ size = 16, class: cls }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={cls}>
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

export function IconBellFilled({ size = 16, class: cls }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={cls}>
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

export function IconEdit({ size = 16, class: cls }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={cls}>
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

export function IconCrosshair({ size = 16, class: cls }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={cls}>
      <circle cx="12" cy="12" r="10" />
      <line x1="22" y1="12" x2="18" y2="12" />
      <line x1="6" y1="12" x2="2" y2="12" />
      <line x1="12" y1="6" x2="12" y2="2" />
      <line x1="12" y1="22" x2="12" y2="18" />
    </svg>
  );
}

export function IconCheck({ size = 16, class: cls }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={cls}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export function IconAlertTriangle({ size = 16, class: cls }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={cls}>
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

export function IconEllipsis({ size = 16, class: cls }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={cls}>
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
      <circle cx="5" cy="12" r="1" />
    </svg>
  );
}

export function IconWand({ size = 16, class: cls }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={cls}>
      <path d="m15 4-1 1 4 4 1-1a2.83 2.83 0 1 0-4-4Z" />
      <path d="m14 5-9 9 4 4 9-9" />
      <path d="m5 14-2 2 4 4 2-2" />
      <line x1="9" y1="2" x2="9" y2="5" />
      <line x1="2" y1="9" x2="5" y2="9" />
      <line x1="18" y1="13" x2="21" y2="13" />
    </svg>
  );
}

export function IconPuzzle({ size = 16, class: cls }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={cls}>
      <path d="M4 4H9a3 3 0 0 0 6 0H20V9a3 3 0 0 0 0 6V20H15a3 3 0 0 1-6 0H4Z" />
    </svg>
  );
}

export function IconDiamond({ size = 16, class: cls }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={cls}>
      <path d="M6 3H18L22 8 12 22 2 8ZM8 8H16M8 8 12 22M16 8 12 22" />
    </svg>
  );
}

export function IconLightbulb({ size = 16, class: cls }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={cls}>
      <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" />
      <path d="M9 18h6" />
      <path d="M10 22h4" />
    </svg>
  );
}

export function IconUsers({ size = 16, class: cls }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={cls}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

export function IconEye({ size = 16, class: cls }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={cls}>
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function IconEyeOff({ size = 16, class: cls }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={cls}>
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

export function IconMouse({ size = 16, class: cls }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" fill="currentColor" class={cls}>
      <path d="M387.255,14.077c-67.996,0-123.172,54.422-124.606,122.082h-13.403c-2.514-66.686-57.208-119.987-124.501-119.996C55.848,16.172,0.005,71.992,0,140.894c0.024,61.933,45.17,113.102,104.35,122.865l106.8,151.262l0.024-0.019c2.288,3.438,4.973,6.528,7.979,9.23c-0.823,3.125-1.402,6.343-1.402,9.717c0,21.125,17.126,38.252,38.252,38.252c21.12,0,38.248-17.127,38.248-38.252c0-3.374-0.58-6.592-1.398-9.708c3.007-2.711,5.695-5.801,7.99-9.239l0.022,0.019l108.509-153.689C467.69,250.861,511.978,200.152,512,138.816C511.995,69.915,456.148,14.077,387.255,14.077z M400.631,238.074l-5.295,0.698L280.718,401.111l-0.129,0.202c-0.473,0.744-1.213,1.37-1.792,2.068c-6.381-4.771-14.218-7.695-22.794-7.695c-8.578,0-16.414,2.924-22.794,7.695c-0.575-0.698-1.31-1.314-1.779-2.059l-0.138-0.221L118.259,241.025l-5.41-0.635c-49.734-5.883-88.4-48.171-88.376-99.496c0.008-27.726,11.206-52.712,29.371-70.896c18.184-18.156,43.175-29.354,70.901-29.363c27.726,0.009,52.712,11.207,70.897,29.363c18.165,18.184,29.362,43.17,29.372,70.896c0.005,1.83-0.175,4.036-0.354,6.711l-0.842,13.026h64.733l-1.122-13.266c-0.257-3.024-0.44-5.855-0.44-8.55c0.008-27.726,11.206-52.722,29.371-70.905c18.184-18.156,43.17-29.354,70.896-29.362c27.727,0.008,52.717,11.206,70.902,29.362c18.166,18.183,29.362,43.179,29.372,70.905C487.551,189.636,449.644,231.519,400.631,238.074z" />
      <polygon points="95.823,395.034 192.166,433.976 197.811,420.002 101.469,381.07" />
      <rect x="139.285" y="422.574" transform="matrix(-0.335 -0.9422 0.9422 -0.335 -250.3301 770.7174)" width="15.064" height="102.251" />
      <rect x="313.238" y="463.829" transform="matrix(-0.9272 -0.3746 0.3746 -0.9272 527.1981 1045.2096)" width="103.9" height="15.071" />
      <rect x="314.065" y="397.656" transform="matrix(0.9422 -0.3351 0.3351 0.9422 -114.6626 145.798)" width="102.245" height="15.065" />
      <path d="M124.745,90.268c-27.96,0-50.626,22.661-50.626,50.626c0,27.957,22.665,50.635,50.626,50.635s50.626-22.678,50.626-50.635C175.37,112.929,152.705,90.268,124.745,90.268z" />
      <path d="M387.255,88.181c-27.965,0-50.63,22.679-50.63,50.635c0,27.965,22.665,50.627,50.63,50.627c27.961,0,50.626-22.662,50.626-50.627C437.882,110.86,415.216,88.181,387.255,88.181z" />
      <path d="M204.582,274.588c-9.157,0-16.589,7.427-16.589,16.584s7.432,16.584,16.589,16.584c9.156,0,16.588-7.427,16.588-16.584S213.738,274.588,204.582,274.588z" />
      <path d="M307.424,274.588c-9.175,0-16.603,7.427-16.603,16.584s7.428,16.584,16.603,16.584c9.156,0,16.584-7.427,16.584-16.584S316.58,274.588,307.424,274.588z" />
    </svg>
  );
}

export function IconLootBag({ size = 16, class: cls }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 511.767 511.767" fill="currentColor" class={cls}>
      <path d="M434.341,197.071c-13.394-23.214-26.923-40.881-38.306-53.074l32.147-76.376c3.434-5.757,5.189-12.434,4.721-19.308c-0.039-0.555-0.039-0.555-0.071-0.925c-0.016-0.19-0.043-0.557-0.043-0.557c-3.442-40.091-50.27-60.585-82.405-36.521c-11.991,8.961-24.698,14.281-37.068,14.281c-10.092,0-18.203-2.464-24.97-6.812c-19.82-12.751-45.121-12.751-64.951,0.007c-6.732,4.336-14.86,6.805-24.938,6.805c-12.371,0-25.078-5.321-37.086-14.294C129.253-13.755,82.424,6.739,78.983,46.83c-0.027,0.22-0.027,0.22-0.075,0.859c-0.035,0.526-0.035,0.526-0.052,0.822c-0.457,6.686,1.291,13.323,4.696,19.07l32.181,76.415c-11.383,12.193-24.912,29.86-38.306,53.075c-30.006,52.006-47.975,114.328-47.975,186.717v16.256c0,37.17,21.868,70.907,55.835,85.5c38.832,16.706,94.622,26.223,170.597,26.223s131.765-9.517,170.607-26.227c33.957-14.589,55.825-48.326,55.825-85.495v-16.256C482.316,311.399,464.346,249.078,434.341,197.071z M135.813,44.461c18.76,14.019,39.721,22.796,62.644,22.796c18.407,0,34.527-4.898,48.031-13.595c5.76-3.706,13.014-3.706,18.784,0.006c13.544,8.702,29.629,13.589,48.044,13.589c22.922,0,43.884-8.777,62.626-22.783c5.001-3.745,12.259-1.123,13.987,4.259l0,0l-0.362,0.648l-32.989,78.377H155.191l-33.009-78.381l-0.276-0.497l0,0C123.862,43.248,130.927,40.803,135.813,44.461z M439.649,400.045c0,20.239-11.828,38.486-30.01,46.298c-33.004,14.199-83.18,22.758-153.755,22.758s-120.751-8.56-153.745-22.754c-18.192-7.816-30.02-26.063-30.02-46.302v-16.256c0-64.605,15.871-119.648,42.265-165.395c9.169-15.891,18.953-29.454,28.669-40.676c2.504-2.891,4.725-5.32,6.603-7.284h68.442c-5.8,15.338-7.968,29.824-8.16,40.684c-0.003,2.927-0.307,5.742-0.92,8.79c-1.842,9.164-6.304,19.714-12.624,30.644c-3.201,5.535-6.653,10.787-10.095,15.545c-2.021,2.794-3.535,4.736-4.279,5.636c-7.51,9.078-6.24,22.526,2.838,30.036c9.078,7.51,22.526,6.24,30.036-2.838c4.798-5.8,11.612-15.218,18.437-27.022c8.451-14.617,14.629-29.221,17.518-43.594c1.147-5.709,1.753-11.317,1.753-16.818c0.024-1.173,0.301-4.586,1.062-9.179c0.56-3.38,1.304-6.749,2.219-10.057c0.914,3.306,1.656,6.673,2.215,10.05c0.76,4.594,1.037,8.008,1.065,9.561c-0.215,19.347,6.778,35.524,18.538,47.307c7.09,7.104,14.33,11.28,20.112,13.385c11.071,4.031,23.314-1.676,27.345-12.747c4.031-11.071-1.676-23.314-12.747-27.345c-0.374-0.136-2.367-1.286-4.51-3.433c-3.882-3.89-6.162-9.164-6.075-17.317c-0.195-11.372-2.36-25.936-8.156-41.286h68.445c1.878,1.964,4.099,4.393,6.603,7.284c9.716,11.221,19.501,24.785,28.669,40.676c26.394,45.747,42.265,100.79,42.265,165.395V400.045z" />
      <path d="M299.815,298.434c-19.489,0-37.225,8.835-49.048,23.106c-4.799-1.148-9.801-1.773-14.952-1.773c-35.355,0-64,28.645-64,64c0,35.355,28.645,64,64,64c19.782,0,37.459-8.972,49.197-23.065c4.8,1.138,9.759,1.732,14.803,1.732c35.355,0,64-28.645,64-64S335.171,298.434,299.815,298.434z M214.482,383.767c0-11.791,9.542-21.333,21.333-21.333c4.377,0,8.44,1.319,11.824,3.576l0.121,0.082c0.084,0.057,0.163,0.12,0.246,0.178c0.385,0.269,0.761,0.55,1.127,0.843c0.153,0.122,0.305,0.245,0.454,0.371c0.435,0.368,0.859,0.747,1.263,1.148c0.062,0.062,0.12,0.127,0.181,0.189c0.39,0.397,0.765,0.81,1.124,1.236c0.062,0.074,0.126,0.146,0.187,0.221c0.393,0.482,0.767,0.98,1.118,1.495c0.039,0.058,0.076,0.117,0.115,0.174c0.354,0.531,0.69,1.076,0.996,1.64c0.002,0.003,0.004,0.006,0.006,0.01c0.305,0.562,0.58,1.142,0.834,1.733c0.038,0.088,0.075,0.177,0.112,0.266c0.243,0.586,0.465,1.182,0.656,1.793c0.013,0.041,0.023,0.084,0.036,0.125c0.176,0.574,0.323,1.161,0.451,1.755c0.022,0.103,0.047,0.205,0.068,0.309c0.121,0.607,0.214,1.225,0.282,1.849c0.014,0.127,0.024,0.254,0.035,0.381c0.059,0.646,0.099,1.298,0.099,1.96c0,2.085-0.429,4.333-1.335,6.89l-0.954,2.692c-3.509,6.966-10.705,11.751-19.044,11.751C224.024,405.101,214.482,395.559,214.482,383.767z M299.815,383.767c0-1.003-0.03-2.001-0.076-2.996c-0.016-0.344-0.042-0.685-0.063-1.027c-0.04-0.645-0.087-1.288-0.147-1.929c-0.038-0.409-0.08-0.817-0.125-1.224c-0.064-0.568-0.137-1.132-0.215-1.696c-0.06-0.431-0.117-0.863-0.185-1.291c-0.088-0.553-0.192-1.101-0.294-1.65c-0.148-0.792-0.311-1.577-0.487-2.358c-0.108-0.475-0.21-0.952-0.329-1.424c-0.131-0.522-0.276-1.037-0.42-1.554c-0.11-0.395-0.219-0.79-0.336-1.182c-0.156-0.523-0.32-1.042-0.489-1.559c-0.124-0.38-0.253-0.757-0.384-1.134c-0.179-0.514-0.359-1.027-0.55-1.536c-0.142-0.377-0.294-0.749-0.443-1.123c-0.251-0.63-0.507-1.258-0.778-1.878c-0.285-0.654-0.575-1.306-0.881-1.949c-0.196-0.41-0.405-0.812-0.609-1.218c-0.226-0.45-0.452-0.9-0.688-1.344c-0.207-0.388-0.421-0.77-0.635-1.153c-0.259-0.463-0.523-0.924-0.793-1.38c-0.208-0.351-0.418-0.701-0.633-1.048c-0.314-0.507-0.637-1.008-0.965-1.506c-0.188-0.286-0.372-0.574-0.565-0.856c-0.491-0.721-0.995-1.432-1.516-2.132c-0.041-0.055-0.078-0.111-0.119-0.166c-0.007-0.009-0.013-0.019-0.02-0.028c3.576-2.74,8.008-4.326,12.745-4.326c11.791,0,21.333,9.542,21.333,21.333S311.607,383.767,299.815,383.767z" />
    </svg>
  );
}

export function IconCheese({ size = 16, class: cls }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={cls}>
      <path d="M21 9V13C20.3333 13 19 13.4 19 15C19 16.6 20.3333 17 21 17V20H4.49998C2.00001 15 2.00002 6 11 4L21 9ZM21 9H4.99998" />
      <path d="M8 16H8.001" />
      <path d="M13 13H13.001" />
      <path d="M15 16H15.001" />
    </svg>
  );
}

export function IconBag({ size = 16, class: cls }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class={cls}>
      <path d="M3.74181 20.5545C4.94143 22 7.17414 22 11.6395 22H12.3607C16.8261 22 19.0589 22 20.2585 20.5545M3.74181 20.5545C2.54219 19.1091 2.95365 16.9146 3.77657 12.5257C4.36179 9.40452 4.65441 7.84393 5.7653 6.92196M3.74181 20.5545C3.74181 20.5545 3.74181 20.5545 3.74181 20.5545ZM20.2585 20.5545C21.4581 19.1091 21.0466 16.9146 20.2237 12.5257C19.6385 9.40452 19.3459 7.84393 18.235 6.92196M20.2585 20.5545C20.2585 20.5545 20.2585 20.5545 20.2585 20.5545ZM18.235 6.92196C17.1241 6 15.5363 6 12.3607 6H11.6395C8.46398 6 6.8762 6 5.7653 6.92196M18.235 6.92196C18.235 6.92196 18.235 6.92196 18.235 6.92196ZM5.7653 6.92196C5.7653 6.92196 5.7653 6.92196 5.7653 6.92196Z" />
      <path d="M15 11L16 17" stroke-linecap="round" />
      <path d="M9 11L8 17" stroke-linecap="round" />
      <path d="M9 6V5C9 3.34315 10.3431 2 12 2C13.6569 2 15 3.34315 15 5V6" stroke-linecap="round" />
    </svg>
  );
}

export function IconPower({ size = 16, class: cls }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={cls}>
      <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
      <line x1="12" y1="2" x2="12" y2="12" />
    </svg>
  );
}

export function IconFileText({ size = 16, class: cls }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={cls}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  );
}

export function IconBoxes({ size = 16, class: cls }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={cls}>
      {/* Top box */}
      <rect x="7.5" y="1" width="9" height="9" rx="1.5" />
      <line x1="12" y1="1" x2="12" y2="4.5" />
      {/* Bottom-left box */}
      <rect x="1" y="12" width="9" height="9" rx="1.5" />
      <line x1="5.5" y1="12" x2="5.5" y2="15.5" />
      {/* Bottom-right box */}
      <rect x="14" y="12" width="9" height="9" rx="1.5" />
      <line x1="18.5" y1="12" x2="18.5" y2="15.5" />
    </svg>
  );
}
