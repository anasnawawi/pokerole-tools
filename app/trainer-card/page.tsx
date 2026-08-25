"use client";
/* This page used to hold its own read-only trainer/Pokémon card view; those
   cards now render directly on the Characters page (above the Sheet and
   Party forms — see app/components/TrainerCards.tsx), so a GM never has to
   leave the editable sheet just to glance at them. Kept as a redirect,
   rather than deleted outright, so an old bookmark or saved link still goes
   somewhere useful instead of 404ing. */
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function TrainerCardRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/characters"); }, [router]);
  return null;
}
