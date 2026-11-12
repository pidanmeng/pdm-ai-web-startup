import { redirect } from 'next/navigation'

/**
 * Literal `/pages/demo` compatibility alias. The canonical App Router page is
 * `/demo` (`src/app/demo/page.tsx`).
 */
export default function PagesDemoAlias() {
  redirect('/demo')
}
