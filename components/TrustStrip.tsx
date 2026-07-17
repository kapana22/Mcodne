import { Icon } from './Icon'

export function TrustStrip() {
  return (
    <div className="flex items-center gap-2 text-[12px] text-ink-500">
      <Icon.lock className="w-3.5 h-3.5 text-ink-400" />
      <span>გადახდა დაცულია</span>
      <span className="font-semibold text-ink-700">TBC</span>
      <span className="text-ink-300">·</span>
      <span className="font-semibold text-ink-700">BOG</span>
    </div>
  )
}
