'use client'
import { useEffect, useRef, useState } from 'react'
import { Btn } from '@/components/Btn'
import { Eyebrow } from '@/components/Eyebrow'
import { Avatar } from '@/components/Avatar'
import { Icon } from '@/components/Icon'
import { useToast } from '@/components/ToastProvider'
import { ProfileCompleteness } from '@/components/ProfileCompleteness'
import { ShopfrontCard, ShopfrontLabel } from '../_components/ShopfrontCard'
import { topicLabel } from '@/lib/requestTopics'
import { useAvatarCropper } from '@/components/AvatarCropper'
import { PageHeader } from '@/components/PageHeader'
import { PriceField } from '@/components/PriceField'
import { safeHttpUrl } from '@/lib/safeUrl'
import { normalizeLangs } from '@/lib/languages'
import { LanguagePicker } from '@/components/LanguagePicker'
import { useUnsavedGuard } from '@/lib/useUnsavedGuard'
import { HEADLINE_MAX } from '@/lib/headline'
import { georgianNameError } from '@/lib/georgianText'
import {
  PWD_MIN, PWD_MIN_MSG,
  type Category, type Me, type ProfileForm, type TutorProfile,
} from './_types'
import { TabPanel } from './_parts'
import { ProfileTab } from './_tabProfile'
import { AccountTab } from './_tabAccount'

// ⚠️ THIS IS NO LONGER THE PAGE, IT IS THE EXPERT'S HALF OF IT (2026-08-21).
// /work/profile moved out of the `(expert)` route group and became a page BOTH
// halves open — see app/work/profile/page.tsx for why. Nothing below changed:
// the tabs, the state and the four handlers are what they were, and the only
// edit is that the default export became a named component the new page renders
// when the viewer holds CONSULT.
//
// ⚠️ THE „სესიები" TAB LEFT THIS PAGE (2026-08-19). What an expert SELLS — the
// consultation types, the default length, the packages, the roster — is now
// /work/services, one page with the trades side of the same question. A profile
// is who you are; a service is what you sell, and the two were being edited in
// two places under one word. Nothing was rewritten: the tab's markup and its
// four handlers moved as they were (app/work/services/_consultations.tsx).


export function ExpertProfileEditor() {
  const [me, setMe] = useState<Me>(null)
  const [profile, setProfile] = useState<TutorProfile>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [savingProfile, setSavingProfile] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [pwdMsg, setPwdMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const [categories, setCategories] = useState<Category[]>([])
  const [form, setForm] = useState<ProfileForm>({
    headline: '', bio: '',
    yearsExp: 0,
    languages: [] as string[],
    linkedinUrl: '', websiteUrl: '',
    categoryId: '' as string,
    professions: [] as string[],
  })
  // Snapshot of the last-saved form values. `dirty` drives the save button:
  // active "შეინახე ცვლილებები" when there are unsaved edits, disabled
  // "შენახულია ✓" once everything is persisted — so the tutor always knows
  // whether the public profile matches what's on screen.
  const [savedForm, setSavedForm] = useState<typeof form | null>(null)
  const dirty = savedForm !== null && JSON.stringify(form) !== JSON.stringify(savedForm)
  // …and now that `dirty` is known, refuse to lose it silently. Covers tab
  // close / reload AND in-app links (the sidebar is right there, one stray
  // click from a bio you spent ten minutes on).
  useUnsavedGuard(dirty, 'შენახული არ არის — თუ გახვალ, ცვლილებები დაიკარგება. მაინც გავიდე?')
  const [pwd, setPwd] = useState({ current: '', next: '', confirm: '' })
  // Display name lives on the account (user.fullName), edited via /api/me —
  // NOT the tutor-profile PATCH. Seeded from the /api/me load below.
  const [fullNameInput, setFullNameInput] = useState('')
  const [savingName, setSavingName] = useState(false)

  // Upcoming free-slot count — feeds the ProfileCompleteness „თავისუფალი დრო"
  // check. Booking is slot-gated, so 0 slots keeps that step incomplete.
  // Best-effort: stays 0 if the availability fetch fails.

  // Unified confirm state for EVERY destructive action on this page —
  // certificate / education / experience rows and the intro video. One modal,
  // one busy flag, one paradigm (no native confirm()).
  // ── Tabs. Panels stay MOUNTED (hidden, not unmounted) so in-progress form
  // state survives switches and every #section-* anchor stays in the DOM for
  // ProfileCompleteness deep links.
  const [activeTab, setActiveTab] = useState(0)
  const { toast } = useToast()

  // ⚠️ THE CARD'S SERVICE LIST COMES FROM THE ROW, NOT FROM A SECOND FETCH.
  // /api/me/provider omits only the two blob columns, so `services` and
  // `priceList` are already here — and they are READ-ONLY on this page:
  // /work/services owns them. Showing them anyway is the point of the card,
  // which is what a client sees, not what this screen edits.
  const shopfront = (profile?.services ?? []).map(id => {
    const map = (profile?.priceList ?? {}) as Record<string, unknown>
    const n = map[id]
    return { id, label: topicLabel(id) ?? id, price: typeof n === 'number' && n > 0 ? n : null }
  })

  // ProfileCompleteness checklist links dispatch `mcodne:reveal-section`
  // (and hard links may arrive as /tutor/profile#section-…). Activate the
  // owning tab, then scroll once the panel is visible (double rAF: state
  // flush → layout).
  useEffect(() => {
    // ⚠️ THREE TABS SINCE THE SERVICES TAB LEFT. „section-availability" and
    // „section-consultations" are not missing entries — those anchors live on
    // /work/services now, and an id this page does not own must fall through
    // (revealTab returns on an unknown id) rather than open the wrong panel.
    const SECTION_TO_TAB: Record<string, number> = {
      'section-avatar': 0, 'section-public-profile': 0,
      'section-visibility': 1,
    }
    const revealTab = (id: string) => {
      const tab = SECTION_TO_TAB[id]
      if (tab === undefined) return
      setActiveTab(tab)
      requestAnimationFrame(() => requestAnimationFrame(() => {
        document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }))
    }
    const onReveal = (e: Event) => {
      const id = (e as CustomEvent<string>).detail
      if (id) revealTab(id)
    }
    window.addEventListener('mcodne:reveal-section', onReveal)
    if (window.location.hash.startsWith('#section-')) revealTab(window.location.hash.slice(1))
    return () => window.removeEventListener('mcodne:reveal-section', onReveal)
  }, [])

  // ⚠️ `loadCredentials` STOOD HERE AND FETCHED THREE ENDPOINTS ON EVERY OPEN
  // (removed 2026-08-29) — certificates, education, experience, for the tab
  // that went with them.

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [meRes, tRes, catRes] = await Promise.all([
          fetch('/api/me').then(r => r.json()),
          fetch('/api/me/provider').then(r => r.json()),
          fetch('/api/categories').then(r => r.json()).catch(() => []),
        ])
        if (cancelled) return
        setMe(meRes?.user ?? null)
        setFullNameInput(meRes?.user?.fullName ?? '')
        // Browsable only, plus whatever they already hold (the <select> adds
        // that itself). The endpoint also serves the not-yet-advertised spheres
        // so the APPLICATION can offer them — but that is a request an admin
        // approves. Letting an expert move themselves into one would take them
        // off the site with no warning, and PATCH /api/me/provider refuses it, so
        // offering it here would only produce a 400 they cannot explain.
        const cats = Array.isArray(catRes) ? catRes : (catRes?.items ?? [])
        // EVERY sphere, hidden ones included — the same list /apply offers.
        // This filtered them out, so the editor showed 6 of 16: an expert could
        // be approved into „ჯანმრთელობა და კვება" on the application and then
        // not find it in their own profile. A hidden sphere is one with no
        // expert yet, not one nobody may join; approval and the admin re-file
        // both un-hide it the moment somebody lands there.
        setCategories(cats.filter((c: any) => c?.name))
        const p = tRes?.profile ?? null
        setProfile(p)
        if (p) {
          const initial = {
            headline: p.headline ?? '',
            bio: p.bio ?? '',
            yearsExp: p.yearsExp ?? 0,
            // Legacy rows (and pre-fix approvals) hold Georgian NAMES instead of
            // codes — normalizing on load lights up the right chips instead of
            // none, and stops a re-pick from saving both spellings side by side.
            languages: normalizeLangs(p.languages),
            linkedinUrl: p.linkedinUrl ?? '',
            websiteUrl: p.websiteUrl ?? '',
            categoryId: p.categoryId ?? '',
            professions: Array.isArray(p.professions) ? p.professions : [],
          }
          setForm(initial)
          setSavedForm(initial)
        }
      } catch {
        if (!cancelled) setErr('მონაცემების ჩატვირთვა ვერ მოხერხდა')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingProfile(true)
    try {
      const res = await fetch('/api/me/provider', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          headline: form.headline,
          bio: form.bio,
          yearsExp: Number(form.yearsExp),
          languages: form.languages,
          linkedinUrl: form.linkedinUrl,
          websiteUrl: form.websiteUrl,
          categoryId: form.categoryId || null,
          professions: form.professions,
        }),
      })
      const j = await res.json()
      // Our own validation copy (Georgian-language gate) rides in `message`;
      // throwing the generic error would drop the only actionable sentence.
      if (!j.ok) throw new Error(j.message || j.error || 'FAIL')
      setProfile(j.profile)
      setSavedForm({ ...form, languages: [...form.languages] })
      toast('პროფილი შენახულია', 'success')
    } catch (e) {
      const m = e instanceof Error && /[Ⴀ-ჿᲐ-Ჿ]/.test(e.message) ? e.message : 'შენახვა ვერ მოხერხდა — სცადე თავიდან'
      toast(m, 'error')
    } finally {
      setSavingProfile(false)
    }
  }

  // Receives the SQUARE crop from the shared cropper (never a raw camera roll
  // file), so what lands in the DB matches what the browse card renders.
  const uploadAvatar = async (file: File) => {
    setAvatarUploading(true)
    try {
      const fd = new FormData()
      fd.append('kind', 'avatar')
      fd.append('file', file)
      const res = await fetch('/api/uploads', { method: 'POST', body: fd })
      const j = await res.json()
      if (j.ok) {
        setMe(prev => prev ? { ...prev, avatarUrl: j.url } : prev)
        toast('ავატარი განახლდა', 'success')
      } else {
        toast(j.error === 'TOO_LARGE' ? 'ფაილი ძალიან დიდია (მაქს. 8MB)' : 'ატვირთვა ვერ მოხერხდა', 'error')
      }
    } catch {
      toast('ქსელის შეცდომა — სცადე თავიდან', 'error')
    } finally {
      setAvatarUploading(false)
    }
  }

  // Shared crop/zoom step — `pickAvatar` opens the picker, `avatarCropperUi`
  // (mounted in the avatar section below) carries the input + dialog.
  const { open: pickAvatar, ui: avatarCropperUi } = useAvatarCropper({ onCropped: uploadAvatar })

  // ⚠️ THE INTRO-VIDEO HANDLERS STOOD HERE (removed 2026-08-29): a save, a
  // delete and ~20 lines of YouTube-ID parsing covering every accepted URL
  // shape. Measured on the live database that day, 0 of 29 providers had a
  // video — so this parsed nothing, for nobody, on every render. It came
  // from the consultation product, where an intro clip is how somebody
  // decided to book an hour of your time; a service is sold by what you do,
  // your price, and a photo of finished work.

  // Save the account display name to /api/me (min 2 chars). Distinct from the
  // tutor-profile PATCH — this is how students see the expert's name.
  const saveName = async (e: React.FormEvent) => {
    e.preventDefault()
    const name = fullNameInput.trim()
    if (name.length < 2) {
      toast('სახელი ძალიან მოკლეა', 'error')
      return
    }
    // The SAME rule /api/me enforces, checked here so the answer arrives before
    // the round-trip. Without it the server's 400 was the first feedback — and
    // the catch below reported it as „შენახვა ვერ მოხერხდა", which names no
    // field and no reason.
    const script = georgianNameError('სახელი და გვარი', name)
    if (script) {
      toast(script, 'error')
      return
    }
    setSavingName(true)
    try {
      const res = await fetch('/api/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName: name }),
      })
      const j = await res.json().catch(() => ({} as any))
      if (!res.ok || !j.ok) {
        // `message` carries our own validation copy — same as /settings does.
        toast(j?.message || 'შენახვა ვერ მოხერხდა', 'error')
        return
      }
      setMe(prev => prev ? { ...prev, fullName: name } : prev)
      setFullNameInput(name)
      toast('სახელი შენახულია', 'success')
    } catch {
      toast('ქსელის შეცდომა — სცადე თავიდან', 'error')
    } finally {
      setSavingName(false)
    }
  }

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setPwdMsg(null)
    // Min 8 — the SAME policy /api/me/password enforces (and signup/reset). The
    // client used to allow 6, so a 7-char password was rejected server-side with
    // a generic error the expert couldn't act on.
    if (pwd.next.length < PWD_MIN) {
      setPwdMsg({ ok: false, text: PWD_MIN_MSG })
      return
    }
    if (pwd.next !== pwd.confirm) {
      setPwdMsg({ ok: false, text: 'პაროლები არ ემთხვევა' })
      return
    }
    setSavingPassword(true)
    try {
      const res = await fetch('/api/me/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: pwd.current, newPassword: pwd.next }),
      })
      const j = await res.json()
      if (!j.ok) {
        // INVALID = the body failed the server's schema, which in practice only
        // ever means „too short" here — surface the real rule, not a shrug.
        setPwdMsg({ ok: false, text: j.error === 'BAD_CURRENT' ? 'მიმდინარე პაროლი არასწორია' : j.error === 'INVALID' ? PWD_MIN_MSG : 'პაროლის შეცვლა ვერ მოხერხდა' })
      } else {
        // Success feedback is a toast everywhere on this page — inline slots
        // stay reserved for field-level errors.
        toast('პაროლი შეიცვალა', 'success')
        setPwd({ current: '', next: '', confirm: '' })
      }
    } catch {
      setPwdMsg({ ok: false, text: 'პაროლის შეცვლა ვერ მოხერხდა' })
    } finally {
      setSavingPassword(false)
    }
  }







  /* ⚠️ THE WHOLE DELETE MACHINERY WENT WITH THE CREDENTIALS TAB (2026-08-29):
     `DELETE_META`, `confirmDelete`, the `ConfirmModal` and the two state
     flags behind them. `PendingDelete` had exactly three kinds — cert, edu,
     exp — and all three were rows in the CV lists this page no longer edits.
     Nothing destructive is left on this screen. */

  return (
    <div>
        <PageHeader
          className="mb-6"
          title="პროფილი"
          sub="როგორ გხედავენ კლიენტები"
          actions={profile && (
            <div className="flex items-center gap-2">
              {/* ⚠️ A SECOND „ჩემი სერვისები" BUTTON STOOD HERE AND ITS OWN
                  NOTE SAID WHEN TO REMOVE IT (removed 2026-08-29). It was a
                  signpost for the 2026-08-19 move of the „სესიები" tab —
                  „until the rail carries that item this is the only trace of
                  the move a returning expert would see". The rail has carried
                  it since 2026-08-21 (components/tutor/navConfig →
                  WORKSPACE_NAV, unconditional), so this was a duplicate of a
                  nav row already on screen, two elements to the left. */}
              <a
                href={`/experts/${profile.id}?preview=1`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-btn bg-white border border-ink-200 hover:border-ink-300 text-ink-800 font-display font-semibold text-small transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              >
                <Icon.external className="w-3.5 h-3.5" />
                ნახე შენი პროფილი
              </a>
            </div>
          )}
        />

        {err && (
          <div className="mb-4 p-4 rounded-card bg-danger-50 border border-danger-200 text-danger-700 text-small">{err}</div>
        )}

        {loading ? (
          <div className="p-12 rounded-card border border-ink-200 bg-white flex items-center justify-center text-ink-400">
            <span aria-hidden className="inline-block w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full motion-safe:animate-spin" />
            <span className="ml-3 text-small">იტვირთება…</span>
          </div>
        ) : (
          <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-8 lg:items-start">
            {/* Main column: tab bar + one visible panel at a time. The old
                page-local section rail is redundant next to the workspace
                sidebar; tabs cut the ~5000px wall to one group. */}
            <div className="min-w-0">
              {/* Mobile: completeness compact above the tabs */}
              {profile && (
                <div className="lg:hidden mb-5">
                  <ProfileCompleteness
                    profile={profile}
                    avatarUrl={me?.avatarUrl ?? null}
                    variant="compact"
                    alwaysShow
                  />
                </div>
              )}

              <div className="flex border-b border-ink-200 mb-6 overflow-x-auto scrollbar-hide rail-fade-end" role="tablist" aria-label="პროფილის სექციები">
                {['პროფილი', 'ანგარიში'].map((label, i) => {
                  const on = activeTab === i
                  return (
                    <button
                      key={label}
                      type="button"
                      role="tab"
                      aria-selected={on}
                      onClick={() => setActiveTab(i)}
                      className={`relative inline-flex items-center pb-3 px-1 mr-5 font-display text-small font-semibold whitespace-nowrap transition-colors duration-fast ${
                        on ? 'text-ink-900' : 'text-ink-500 hover:text-ink-800'
                      }`}
                    >
                      {label}
                      {on && <span className="absolute left-0 right-0 -bottom-px h-[2px] bg-brand-500 rounded-full" />}
                    </button>
                  )
                })}
              </div>

              {/* One-line orientation for the active tab — each tab is now a
                  single clear theme, so a plain-Georgian sub tells the expert
                  what belongs here. */}
              <p className="-mt-3 mb-6 text-small text-ink-500 leading-snug">
                {[
                  'ვინ ხარ — ფოტო, სათაური, ბიო.',
                  'ხილვადობა და პარამეტრები.',
                ][activeTab]}
              </p>

              <div className="space-y-10">

            {/* ——— Tab 0: პროფილი ——— */}
            <TabPanel active={activeTab === 0}>
        <ProfileTab
          me={me}
          profile={profile}
          loading={loading}
          form={form}
          setForm={setForm}
          dirty={dirty}
          savingProfile={savingProfile}
          saveProfile={saveProfile}
          avatarUploading={avatarUploading}
          pickAvatar={pickAvatar}
          avatarCropperUi={avatarCropperUi}
          categories={categories}
        />
            </TabPanel>

            {/* ⚠️ TAB 1 WAS „კვალიფიკაცია" AND IT SOLD NOTHING (removed
                2026-08-29). Certificates, education and experience — three
                add-forms, three lists, three endpoints. Owner: „რითი
                დაგიჯერებს აღარ გვჭირდება, ეს ხომ სერვისებს ყიდის".
                Measured on the live database the same day: 4 of 29 providers
                had a certificate, 8 an education row, 5 a job. The public
                block that drew them went too.

                ——— Tab 1 is now ანგარიში: visibility, response time, password. ——— */}
            <TabPanel active={activeTab === 1}>
        <AccountTab
          profile={profile}
          setProfile={setProfile}
          form={form}
          fullNameInput={fullNameInput}
          setFullNameInput={setFullNameInput}
          savingName={savingName}
          saveName={saveName}
          pwd={pwd}
          setPwd={setPwd}
          savingPassword={savingPassword}
          pwdMsg={pwdMsg}
          changePassword={changePassword}
          toast={toast}
        />
            </TabPanel>

              {/* Bottom step navigation — walk the tabs like a wizard
                  (fill → შემდეგი), not only via the top tab bar. Scrolls to the
                  top of the new tab so you always land at its start. */}
              <div className="flex items-center justify-between gap-3 pt-5 mt-2 border-t border-ink-100">
                {activeTab > 0
                  ? <Btn variant="secondary" size="md" onClick={() => { setActiveTab(activeTab - 1); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>უკან</Btn>
                  : <span />}
                {activeTab < 1
                  ? <Btn variant="primary" size="md" onClick={() => { setActiveTab(activeTab + 1); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>შემდეგი</Btn>
                  : (profile && <a href={`/experts/${profile.id}?preview=1`} target="_blank" rel="noopener noreferrer" className="h-11 px-5 rounded-btn bg-brand-600 hover:bg-brand-700 text-white font-display font-semibold text-body inline-flex items-center gap-2 transition-colors duration-fast"><Icon.external className="w-4 h-4" /> ნახე შენი პროფილი</a>)}
              </div>

              </div>
            </div>

            {/* Desktop: completeness lives in a sticky right rail */}
            <aside className="hidden lg:block lg:sticky lg:top-[84px]">
              {profile && (
                <div className="flex flex-col gap-4">
                  {/* ⚠️ THE CARD LEADS, THE PERCENTAGE FOLLOWS (2026-08-29).
                      This page's own subtitle is „როგორ გხედავენ კლიენტები" and
                      it kept that promise with a LINK — open a tab, look, come
                      back, forget what you changed. The card is the promise
                      kept; the checklist stays underneath, because „what is
                      still missing" is a real second question, just not the
                      first one.

                      It reads the FORM, not the saved row: `form.headline` and
                      `form.bio` are what the person is typing, so the card
                      moves while they type rather than after they save. */}
                  <div>
                    <ShopfrontLabel />
                    <ShopfrontCard
                      name={fullNameInput || me?.fullName || ''}
                      avatarUrl={me?.avatarUrl ?? null}
                      headline={form.headline || null}
                      services={shopfront}
                      verified={false}
                    />
                  </div>
                  <ProfileCompleteness
                    profile={profile}
                    avatarUrl={me?.avatarUrl ?? null}
                    variant="card"
                    alwaysShow
                  />
                </div>
              )}
            </aside>
          </div>
        )}

    </div>
  )
}

// Group heading — titles each of the 4 section groups (საჯარო პროფილი /
// სერვისები და ფასი / კვალიფიკაცია / ანგარიში) that the left-rail nav links to.
/* One tab's content. `hidden` (not unmount) keeps form state alive and every
   #section-* anchor findable for ProfileCompleteness deep links. */