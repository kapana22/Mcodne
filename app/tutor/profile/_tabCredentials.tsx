'use client'
// /tutor/profile — tab 2: diplomas, education and work experience.

import type { Dispatch, SetStateAction } from 'react'
import { Btn } from '@/components/Btn'
import { Icon } from '@/components/Icon'
import { Eyebrow } from '@/components/Eyebrow'
import { safeHttpUrl } from '@/lib/safeUrl'
import { AddDisclosure, Field } from './_parts'
import type { CertForm, Certificate, EduForm, Education, ExpForm, Experience, ProfileForm, TutorProfile } from './_types'

type Props = {
  profile: TutorProfile
  form: ProfileForm
  certificates: Certificate[]
  certForm: CertForm
  setCertForm: Dispatch<SetStateAction<CertForm>>
  certBusy: boolean
  certUploading: boolean
  certUploadErr: string | null
  certFileRef: React.RefObject<HTMLInputElement | null>
  onCertFile: (f: File) => void
  addCertificate: (e: React.FormEvent) => void
  deleteCertificate: (id: string) => void
  education: Education[]
  eduForm: EduForm
  setEduForm: Dispatch<SetStateAction<EduForm>>
  eduBusy: boolean
  addEducation: (e: React.FormEvent) => void
  deleteEducation: (id: string) => void
  experience: Experience[]
  expForm: ExpForm
  setExpForm: Dispatch<SetStateAction<ExpForm>>
  expBusy: boolean
  addExperience: (e: React.FormEvent) => void
  deleteExperience: (id: string) => void
}

export function CredentialsTab({ profile, form, certificates, certForm, setCertForm, certBusy, certUploading, certUploadErr, certFileRef, onCertFile, addCertificate, deleteCertificate, education, eduForm, setEduForm, eduBusy, addEducation, deleteEducation, experience, expForm, setExpForm, expBusy, addExperience, deleteExperience }: Props) {
  return (
    <>

        {/* Certificates */}
        {profile && (
          <section id="section-certificates" className="scroll-mt-24 p-6 rounded-card border border-ink-200 bg-white space-y-4">
            <Eyebrow tone="muted" className="mb-2">სერტიფიკატები</Eyebrow>

            <div className="space-y-2">
              {certificates.length === 0 ? (
                <div className="text-small text-ink-500">ჯერ არაფერი დამატებულა.</div>
              ) : (
                certificates.map(c => {
                  // Resolve the document EXACTLY as the public profile does.
                  // This row used to test `safeHttpUrl(c.fileUrl)` alone and
                  // never looked at `hasFile`, so a certificate stored the
                  // modern way (bytes served from /api/certificates/<id>/file)
                  // had no „გახსნა" link here at all — the expert could not
                  // open their own upload from their own editor.
                  const href = c.hasFile ? `/api/certificates/${c.id}/file` : safeHttpUrl(c.fileUrl)
                  return (
                  <div key={c.id} className="flex items-center gap-3 p-3 rounded-card border border-ink-200 bg-ink-50/40">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <div className="font-display text-body font-bold text-ink-900 truncate">{c.title}</div>
                        {c.verified && (
                          <span className="inline-flex items-center h-4 px-1.5 rounded-pill bg-brand-50 border border-brand-200 text-brand-800 font-display text-micro font-bold uppercase">გადამოწმებული</span>
                        )}
                      </div>
                      <div className="text-meta text-ink-500 tabular-nums">{[c.issuer?.trim(), c.year].filter(Boolean).join(' · ')}</div>
                      {/* The public profile hides a document-less certificate
                          outright (an empty frame under „გადამოწმებული
                          აღინიშნება" reads as a credential that FAILED to
                          verify). Without this line the expert would have no
                          way to know that: their row looks complete here.
                          All five certificates on the live roster are in this
                          state — a zod `max(500)` on `fileUrl` rejected every
                          base64 scan before 2026-07-29, so the upload appeared
                          to succeed and stored nothing. */}
                      {!href && (
                        <p className="mt-1 flex items-start gap-1.5 text-meta text-warning-700 leading-snug">
                          <Icon.warn className="w-3.5 h-3.5 shrink-0 mt-px" />
                          <span>ფაილი არ აიტვირთა — პროფილზე არ ჩანს. წაშალე და დაამატე თავიდან.</span>
                        </p>
                      )}
                    </div>
                    {href && (
                      <a href={href} target="_blank" rel="noopener noreferrer" className="font-display text-meta font-semibold text-brand-700 hover:text-brand-800">გახსნა</a>
                    )}
                    <button type="button" onClick={() => deleteCertificate(c.id)} aria-label="სერტიფიკატის წაშლა" className="min-h-[44px] -my-2 px-3 -mr-2 inline-flex items-center rounded-btn font-display text-meta font-semibold text-ink-500 hover:text-danger-700 hover:bg-danger-50 transition-colors duration-fast">წაშლა</button>
                  </div>
                  )
                })
              )}
            </div>

            <AddDisclosure label="სერტიფიკატის დამატება" forceOpen={certificates.length === 0}>
            <form onSubmit={addCertificate} className="pt-3 border-t border-ink-100 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="სახელი">
                  <input type="text" required maxLength={200} value={certForm.title}
                         onChange={e => setCertForm({ ...certForm, title: e.target.value })}
                         placeholder="მაგ. სერტიფიკატის სახელი"
                         className="w-full h-11 px-3 rounded-field border border-ink-200 bg-white text-body text-ink-900 focus:border-brand-400 focus:outline-none" />
                </Field>
                <Field label="გამცემი">
                  <input type="text" required maxLength={200} value={certForm.issuer}
                         onChange={e => setCertForm({ ...certForm, issuer: e.target.value })}
                         placeholder="მაგ. გამცემი ორგანიზაცია"
                         className="w-full h-11 px-3 rounded-field border border-ink-200 bg-white text-body text-ink-900 focus:border-brand-400 focus:outline-none" />
                </Field>
                <Field label="წელი">
                  <input type="number" inputMode="numeric" required min={1900} max={2100} value={certForm.year}
                         onChange={e => setCertForm({ ...certForm, year: Number(e.target.value) })}
                         className="w-full h-11 px-3 rounded-field border border-ink-200 bg-white text-body tabular-nums text-ink-900 focus:border-brand-400 focus:outline-none" />
                </Field>
                <Field label="ფაილი — PDF ან სურათი (არასავალდებულო)">
                  <div className="flex items-center gap-2 flex-wrap">
                    <input
                      ref={certFileRef}
                      type="file"
                      accept="application/pdf,image/jpeg,image/png,image/webp"
                      className="hidden"
                      onChange={e => e.target.files?.[0] && onCertFile(e.target.files[0])}
                    />
                    <Btn variant="secondary" size="sm" type="button" onClick={() => certFileRef.current?.click()} disabled={certUploading}>
                      {certUploading ? 'იტვირთება…' : certForm.fileUrl ? 'შეცვლა' : 'ფაილის არჩევა'}
                    </Btn>
                    {certForm.fileUrl && (
                      <span className="inline-flex items-center gap-1.5 text-meta text-ink-700 truncate max-w-[240px]">
                        {certForm.fileName || 'ატვირთულია'}
                        <button type="button" onClick={() => setCertForm({ ...certForm, fileUrl: '', fileName: '' })} className="ml-1 text-ink-400 hover:text-danger-600 text-body" aria-label="მოხსნა">×</button>
                      </span>
                    )}
                  </div>
                  {certUploadErr && <div className="mt-1.5 text-meta text-danger-600">{certUploadErr}</div>}
                </Field>
              </div>
              <div className="flex justify-end">
                <Btn variant="primary" size="sm" type="submit" disabled={certBusy || certUploading}>
                  {certBusy ? 'ინახება…' : 'დაამატე'}
                </Btn>
              </div>
            </form>
            </AddDisclosure>
          </section>
        )}

        {/* Education */}
        {profile && (
          <section id="section-education" className="scroll-mt-24 p-6 rounded-card border border-ink-200 bg-white space-y-4">
            <Eyebrow tone="muted" className="mb-2">განათლება</Eyebrow>

            <div className="space-y-2">
              {education.length === 0 ? (
                <div className="text-small text-ink-500">ჯერ არაფერი დამატებულა.</div>
              ) : (
                education.map(e => (
                  <div key={e.id} className="flex items-center gap-3 p-3 rounded-card border border-ink-200 bg-ink-50/40">
                    <div className="flex-1 min-w-0">
                      <div className="font-display text-body font-bold text-ink-900 truncate">{e.school}</div>
                      <div className="text-meta text-ink-700">{e.degree}{e.field ? ` · ${e.field}` : ''}</div>
                      <div className="text-meta text-ink-500 tabular-nums">{e.startYear} – {e.endYear ?? 'დღემდე'}</div>
                    </div>
                    <button type="button" onClick={() => deleteEducation(e.id)} aria-label="განათლების ჩანაწერის წაშლა" className="min-h-[44px] -my-2 px-3 -mr-2 inline-flex items-center rounded-btn font-display text-meta font-semibold text-ink-500 hover:text-danger-700 hover:bg-danger-50 transition-colors duration-fast">წაშლა</button>
                  </div>
                ))
              )}
            </div>

            <AddDisclosure label="განათლების დამატება" forceOpen={education.length === 0}>
            <form onSubmit={addEducation} className="pt-3 border-t border-ink-100 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="სასწავლებელი">
                  <input type="text" required maxLength={200} value={eduForm.school}
                         onChange={e => setEduForm({ ...eduForm, school: e.target.value })}
                         placeholder="ილიას სახ. უნივერსიტეტი"
                         className="w-full h-11 px-3 rounded-field border border-ink-200 bg-white text-body text-ink-900 focus:border-brand-400 focus:outline-none" />
                </Field>
                <Field label="ხარისხი">
                  <input type="text" required maxLength={200} value={eduForm.degree}
                         onChange={e => setEduForm({ ...eduForm, degree: e.target.value })}
                         placeholder="მაგ. ბაკალავრი / მაგისტრი"
                         className="w-full h-11 px-3 rounded-field border border-ink-200 bg-white text-body text-ink-900 focus:border-brand-400 focus:outline-none" />
                </Field>
                <Field label="დარგი (არასავალდებულო)">
                  <input type="text" maxLength={200} value={eduForm.field}
                         onChange={e => setEduForm({ ...eduForm, field: e.target.value })}
                         placeholder="მაგ. დარგი"
                         className="w-full h-11 px-3 rounded-field border border-ink-200 bg-white text-body text-ink-900 focus:border-brand-400 focus:outline-none" />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="დაწყების წელი">
                    <input type="number" inputMode="numeric" required min={1900} max={2100} value={eduForm.startYear}
                           onChange={e => setEduForm({ ...eduForm, startYear: Number(e.target.value) })}
                           className="w-full h-11 px-3 rounded-field border border-ink-200 bg-white text-body tabular-nums text-ink-900 focus:border-brand-400 focus:outline-none" />
                  </Field>
                  <Field label="დასრულების წელი">
                    <input type="number" inputMode="numeric" min={1900} max={2100} value={eduForm.endYear}
                           onChange={e => setEduForm({ ...eduForm, endYear: e.target.value })}
                           placeholder="ცარიელი — დღემდე"
                           className="w-full h-11 px-3 rounded-field border border-ink-200 bg-white text-body tabular-nums text-ink-900 focus:border-brand-400 focus:outline-none" />
                  </Field>
                </div>
              </div>
              <div className="flex justify-end">
                <Btn variant="primary" size="sm" type="submit" disabled={eduBusy}>
                  {eduBusy ? 'ინახება…' : 'დაამატე'}
                </Btn>
              </div>
            </form>
            </AddDisclosure>
          </section>
        )}

        {/* Experience */}
        {profile && (
          <section id="section-experience" className="scroll-mt-24 p-6 rounded-card border border-ink-200 bg-white space-y-4">
            <Eyebrow tone="muted" className="mb-2">სამუშაო გამოცდილება</Eyebrow>

            <div className="space-y-2">
              {experience.length === 0 ? (
                <div className="text-small text-ink-500">ჯერ არაფერი დამატებულა.</div>
              ) : (
                experience.map(x => (
                  <div key={x.id} className="flex items-start gap-3 p-3 rounded-card border border-ink-200 bg-ink-50/40">
                    <div className="flex-1 min-w-0">
                      <div className="font-display text-body font-bold text-ink-900 truncate">{x.role}</div>
                      <div className="text-meta text-ink-700 truncate">{x.company}</div>
                      <div className="text-meta text-ink-500 tabular-nums">{x.startYear} – {x.endYear ?? 'ახლა'}</div>
                      {x.description && <div className="mt-1 text-meta text-ink-600 leading-[1.5]">{x.description}</div>}
                    </div>
                    <button type="button" onClick={() => deleteExperience(x.id)} aria-label="გამოცდილების ჩანაწერის წაშლა" className="min-h-[44px] -my-2 px-3 -mr-2 self-center inline-flex items-center rounded-btn font-display text-meta font-semibold text-ink-500 hover:text-danger-700 hover:bg-danger-50 transition-colors duration-fast">წაშლა</button>
                  </div>
                ))
              )}
            </div>

            <AddDisclosure label="გამოცდილების დამატება" forceOpen={experience.length === 0}>
            <form onSubmit={addExperience} className="pt-3 border-t border-ink-100 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="კომპანია">
                  <input type="text" required maxLength={200} value={expForm.company}
                         onChange={e => setExpForm({ ...expForm, company: e.target.value })}
                         placeholder="მაგ. კომპანია"
                         className="w-full h-11 px-3 rounded-field border border-ink-200 bg-white text-body text-ink-900 focus:border-brand-400 focus:outline-none" />
                </Field>
                <Field label="პოზიცია">
                  <input type="text" required maxLength={200} value={expForm.role}
                         onChange={e => setExpForm({ ...expForm, role: e.target.value })}
                         placeholder="მაგ. პოზიცია"
                         className="w-full h-11 px-3 rounded-field border border-ink-200 bg-white text-body text-ink-900 focus:border-brand-400 focus:outline-none" />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="დაწყების წელი">
                    <input type="number" inputMode="numeric" required min={1900} max={2100} value={expForm.startYear}
                           onChange={e => setExpForm({ ...expForm, startYear: Number(e.target.value) })}
                           className="w-full h-11 px-3 rounded-field border border-ink-200 bg-white text-body tabular-nums text-ink-900 focus:border-brand-400 focus:outline-none" />
                  </Field>
                  <Field label="დასრულების წელი">
                    <input type="number" inputMode="numeric" min={1900} max={2100} value={expForm.endYear}
                           onChange={e => setExpForm({ ...expForm, endYear: e.target.value })}
                           placeholder="ცარიელი — ახლა"
                           className="w-full h-11 px-3 rounded-field border border-ink-200 bg-white text-body tabular-nums text-ink-900 focus:border-brand-400 focus:outline-none" />
                  </Field>
                </div>
                <Field label="აღწერა (არასავალდებულო)">
                  <textarea rows={2} maxLength={2000} value={expForm.description}
                            onChange={e => setExpForm({ ...expForm, description: e.target.value })}
                            placeholder="მოკლე აღწერა"
                            className="w-full px-3 py-2 rounded-field border border-ink-200 bg-white text-small text-ink-900 focus:border-brand-400 focus:outline-none resize-y" />
                </Field>
              </div>
              <div className="flex justify-end">
                <Btn variant="primary" size="sm" type="submit" disabled={expBusy}>
                  {expBusy ? 'ინახება…' : 'დაამატე'}
                </Btn>
              </div>
            </form>
            </AddDisclosure>
          </section>
        )}

    </>
  )
}
