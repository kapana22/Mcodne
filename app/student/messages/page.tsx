import { Icon } from '@/components/Icon'

// Index route of the student messages center: on desktop the right pane's
// "pick a conversation" placeholder (the list renders from the layout); on
// mobile the list IS the page, so this renders nothing visible (the layout
// hides this pane below lg).
export default function StudentMessagesIndexPage() {
  return (
    <div className="flex-1 hidden lg:flex flex-col items-center justify-center text-center p-8 bg-ink-50/40">
      <span className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-white border border-ink-200 text-ink-400 mb-3">
        <Icon.chat className="w-6 h-6" />
      </span>
      <div className="font-display text-body font-semibold text-ink-700">აირჩიე მიმოწერა</div>
      <p className="text-small text-ink-500 mt-1 max-w-[280px]">
        ხილულია მხოლოდ შენ და ექსპერტისთვის.
      </p>
    </div>
  )
}
