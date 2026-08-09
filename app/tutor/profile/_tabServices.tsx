'use client'
// /tutor/profile — tab 1: the consultation services the expert sells, plus
// the service-type and availability block.

import type { Dispatch, SetStateAction } from 'react'
import { Btn } from '@/components/Btn'
import { Icon } from '@/components/Icon'
import { Eyebrow } from '@/components/Eyebrow'
import { PriceField } from '@/components/PriceField'
import { Field, ServiceTypeAndAvailability } from './_parts'
import { PackagesSection } from './_packages'
import { StudentsSection } from './_students'
import type { ConsEdit, ConsForm, Consultation, ProfileForm, TutorProfile } from './_types'

type Props = {
  profile: TutorProfile
  setProfile: Dispatch<SetStateAction<TutorProfile>>
  form: ProfileForm
  consultations: Consultation[]
  consForm: ConsForm
  setConsForm: Dispatch<SetStateAction<ConsForm>>
  consBusy: boolean
  consErr: string | null
  addConsultation: (e: React.FormEvent) => void
  consEdit: ConsEdit | null
  setConsEdit: Dispatch<SetStateAction<ConsEdit | null>>
  consEditBusy: boolean
  consEditErr: string | null
  startEditConsultation: (c: Consultation) => void
  cancelEditConsultation: () => void
  saveConsultation: (e: React.FormEvent) => void
  deleteConsultation: (id: string) => void
}

export function ServicesTab({ profile, setProfile, form, consultations, consForm, setConsForm, consBusy, consErr, addConsultation, consEdit, setConsEdit, consEditBusy, consEditErr, startEditConsultation, cancelEditConsultation, saveConsultation, deleteConsultation }: Props) {
  return (
    <>

        {/* Service type + Available now (Type A) */}
        {profile && (
          <div id="section-availability" className="scroll-mt-24">
            <ServiceTypeAndAvailability
              profile={profile}
              servicesCount={consultations.length}
              onSaved={(next) => setProfile(next as any)}
            />
          </div>
        )}

        {/* Consultations */}
        {profile && (
          <section id="section-consultations" className="scroll-mt-24 p-6 rounded-card border border-ink-200 bg-white space-y-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <Eyebrow tone="muted" className="mb-1">კონსულტაციის ტიპები</Eyebrow>
                <p className="text-meta text-ink-500 leading-snug max-w-[520px]">თითოეულს თავისი ხანგრძლივობა და ფასი — ჩაანაცვლებს ნაგულისხმევს.</p>
              </div>
            </div>

            <div className="space-y-2">
              {consultations.length === 0 ? (
                <div className="text-small text-ink-500">ჯერ არაფერი დამატებულა.</div>
              ) : (
                consultations.map(c => (
                  consEdit?.id === c.id ? (
                    <form key={c.id} onSubmit={saveConsultation} className="p-3 rounded-card border border-brand-200 bg-white space-y-3">
                      <Field label="სათაური">
                        <input type="text" required maxLength={80} value={consEdit.title}
                               onChange={e => setConsEdit({ ...consEdit, title: e.target.value })}
                               placeholder="მაგ. ინდივიდუალური კონსულტაცია"
                               className="w-full h-11 px-3 rounded-field border border-ink-200 bg-white text-body focus:border-brand-400 focus:outline-none" />
                      </Field>
                      <Field label="აღწერა">
                        <textarea rows={2} required maxLength={400} value={consEdit.description}
                                  onChange={e => setConsEdit({ ...consEdit, description: e.target.value })}
                                  placeholder="რას მოიცავს სესია"
                                  className="w-full px-3 py-2 rounded-field border border-ink-200 bg-white text-small focus:border-brand-400 focus:outline-none resize-y" />
                      </Field>
                      <Field label="ხანგრძლივობა (წუთი)">
                        <input type="number" inputMode="numeric" required min={5} max={240} value={consEdit.minutes}
                               onChange={e => setConsEdit({ ...consEdit, minutes: Number(e.target.value) })}
                               className="w-full sm:max-w-[200px] h-11 px-3 rounded-field border border-ink-200 bg-white text-body tabular-nums focus:border-brand-400 focus:outline-none" />
                      </Field>
                      {/* Same price control as /apply — this editor previously
                          had no guidance and no earnings preview at all. */}
                      <PriceField
                        className="pt-3 border-t border-ink-100"
                        value={consEdit.price}
                        onChange={price => setConsEdit({ ...consEdit, price })}
                        minutes={consEdit.minutes}
                        required
                      />
                      {consEditErr && <div className="p-2.5 rounded-btn bg-danger-50 border border-danger-200 text-danger-700 text-small">{consEditErr}</div>}
                      <div className="flex justify-end gap-2">
                        <Btn variant="ghost" size="sm" type="button" onClick={cancelEditConsultation} disabled={consEditBusy}>გაუქმება</Btn>
                        <Btn variant="primary" size="sm" type="submit" disabled={consEditBusy}>
                          {consEditBusy ? 'ინახება…' : 'შენახვა'}
                        </Btn>
                      </div>
                    </form>
                  ) : (
                  <div key={c.id} className="flex items-start gap-3 p-3 rounded-card border border-ink-200 bg-ink-50/40">
                    <span className="shrink-0 inline-flex items-center h-6 px-2 rounded-pill border border-ink-200 bg-ink-75 text-ink-700 font-display text-micro font-bold uppercase tabular-nums">{c.minutes} წთ</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-display text-body font-bold text-ink-900 truncate">{c.title}</div>
                      <div className="text-meta text-ink-700 leading-snug mt-0.5">{c.description}</div>
                      <div className="text-meta text-ink-500 tabular-nums mt-1">₾{c.price}</div>
                    </div>
                    <div className="shrink-0 self-center flex items-center">
                      <button type="button" onClick={() => startEditConsultation(c)} aria-label="სერვისის რედაქტირება" className="min-h-[44px] -my-2 px-3 inline-flex items-center rounded-btn font-display text-meta font-semibold text-ink-500 hover:text-ink-900 hover:bg-ink-100 transition-colors duration-fast">რედაქტირება</button>
                      <button type="button" onClick={() => deleteConsultation(c.id)} aria-label="სერვისის წაშლა" className="min-h-[44px] -my-2 px-3 -mr-2 inline-flex items-center rounded-btn font-display text-meta font-semibold text-ink-500 hover:text-danger-700 hover:bg-danger-50 transition-colors duration-fast">წაშლა</button>
                    </div>
                  </div>
                  )
                ))
              )}
            </div>

            <form onSubmit={addConsultation} className="pt-3 border-t border-ink-100 space-y-3">
              <Field label="სათაური">
                <input type="text" required maxLength={80} value={consForm.title}
                       onChange={e => setConsForm({ ...consForm, title: e.target.value })}
                       placeholder="მაგ. ინდივიდუალური კონსულტაცია"
                       className="w-full h-11 px-3 rounded-field border border-ink-200 bg-white text-body focus:border-brand-400 focus:outline-none" />
              </Field>
              <Field label="აღწერა">
                <textarea rows={2} required maxLength={400} value={consForm.description}
                          onChange={e => setConsForm({ ...consForm, description: e.target.value })}
                          placeholder="რას მოიცავს სესია"
                          className="w-full px-3 py-2 rounded-field border border-ink-200 bg-white text-small focus:border-brand-400 focus:outline-none resize-y" />
              </Field>
              <Field label="ხანგრძლივობა (წუთი)">
                <input type="number" inputMode="numeric" required min={5} max={240} value={consForm.minutes}
                       onChange={e => setConsForm({ ...consForm, minutes: Number(e.target.value) })}
                       className="w-full sm:max-w-[200px] h-11 px-3 rounded-field border border-ink-200 bg-white text-body tabular-nums focus:border-brand-400 focus:outline-none" />
              </Field>
              <PriceField
                className="pt-3 border-t border-ink-100"
                value={consForm.price}
                onChange={price => setConsForm({ ...consForm, price })}
                minutes={consForm.minutes}
                required
              />
              {consErr && <div className="p-2.5 rounded-btn bg-danger-50 border border-danger-200 text-danger-700 text-small">{consErr}</div>}
              <div className="flex justify-end">
                <Btn variant="primary" size="sm" type="submit" disabled={consBusy}>
                  {consBusy ? 'ინახება…' : 'დამატება'}
                </Btn>
              </div>
            </form>
          </section>
        )}

        {/* Teaching packages — renders nothing at all unless the vertical is
            on for this deployment; see app/tutor/profile/_packages.tsx. It
            sits AFTER consultations deliberately: a session is what most
            experts sell, a package is the second shape. */}
        {profile && <PackagesSection />}
        {/* The roster sits ABOVE nothing and BELOW packages on purpose: you
            define what you sell, then you manage who bought it. */}
        {profile && <StudentsSection />}

    </>
  )
}
