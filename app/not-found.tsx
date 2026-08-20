import type { Metadata } from 'next'
import { NotFoundClient } from './NotFoundClient'

// Server wrapper so this route can carry its own metadata. It used to be a
// single 'use client' file, which meant a 404 inherited the ROOT metadata —
// every missing URL served the home page's title and description, and none of
// them were marked noindex.
export const metadata: Metadata = {
  title: 'გვერდი ვერ მოიძებნა — მცოდნე',
  description: 'ეს გვერდი აღარ არსებობს. იპოვე ექსპერტი, კატეგორია ან სტატია მცოდნეზე.',
  // A 404 already returns the right status, but an explicit noindex stops the
  // URL being kept as a candidate while the crawler re-checks it.
  robots: { index: false, follow: true },
}

export default function NotFound() {
  return <NotFoundClient />
}
