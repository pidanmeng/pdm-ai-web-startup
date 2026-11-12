import * as React from 'react'

import { cn } from '@/lib/utils'

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'placeholder:text-muted-foreground/70 flex min-h-24 w-full resize-none rounded-xl border border-transparent bg-transparent px-0 py-1 text-[15px] leading-7 outline-none transition-[color,box-shadow] disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}

export { Textarea }
