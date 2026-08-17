-- Best-effort rollback: removes the seeded windows and the stored pattern.
-- ⚠️ TIME-BOXED BY NECESSITY — once an expert edits their own calendar there is
-- no way to tell their rows from the seeded ones, so run this SOON after the
-- script or not at all.
DELETE FROM "AvailabilitySlot"
 WHERE "createdAt" >= NOW() - INTERVAL '1 hour'
   AND "booked" = false
   AND "tutorId" IN (
     SELECT id FROM "TutorProfile"
      WHERE slug IN ('lazare-jeladze','zura-modebadze','teona','giorgi','nino-gakhokia')
   );
