'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

export function NavLink({ href, children, className = '', label }: {
  href: string; children: ReactNode; className?: string; label?: string;
}) {
  const pathname = usePathname();
  const active = pathname === href || (href !== '/' && pathname.startsWith(`${href}/`));
  return <Link href={href} className={`${className}${active ? ' isActive' : ''}`} aria-current={active ? 'page' : undefined} aria-label={label}>{children}</Link>;
}
