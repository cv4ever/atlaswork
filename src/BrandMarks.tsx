// Outside services' own marks, where the app names a connected account (agents-design D74, D81): drawn in their brand
// colours rather than the palette, so you recognise the service at a glance, as Google's branding asks. Decorative:
// the words beside them name the service. token-exempt: a service's own mark keeps its colours in every look.

/** Google Calendar's mark: the blue page with its folded corner and the 31. */
export function GoogleCalendarMark({ size = 16 }: { size?: 12 | 14 | 16 | 18 }) {
  return (
    <svg className="brand-mark" viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false">
      <path fill="#fff" d="M6 6h12v12H6z" />
      <path fill="#4285f4" d="M18 2H4.5A2.5 2.5 0 0 0 2 4.5V18h4V6h12z" />
      <path fill="#1967d2" d="M22 6V4.5A2.5 2.5 0 0 0 19.5 2H18v4z" />
      <path fill="#fbbc04" d="M18 6h4v12h-4z" />
      <path fill="#34a853" d="M6 18h12v4H6z" />
      <path fill="#188038" d="M2 18v1.5A2.5 2.5 0 0 0 4.5 22H6v-4z" />
      <path fill="#ea4335" d="M18 18h4l-4 4z" />
      <text x="12" y="15.6" textAnchor="middle" fontSize="7.5" fontWeight="700" fill="#4285f4" fontFamily="Arial, Helvetica, sans-serif">31</text>
    </svg>
  );
}
