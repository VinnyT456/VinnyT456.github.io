"use client";

import { useEffect, useState } from "react";

/**
 * The résumé page is mostly about its PDF, but the buttons are at the top and
 * scroll away. Once they're out of view, a small Download pill keeps the PDF one
 * click away. Desktop only (on a phone the bottom dock owns that corner).
 */
export default function ResumeDock({ href }: { href: string }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const target = document.querySelector(".rez__actions");
    if (!target) return;
    const io = new IntersectionObserver(([entry]) => setShow(!entry.isIntersecting && entry.boundingClientRect.top < 0), { threshold: 0 });
    io.observe(target);
    return () => io.disconnect();
  }, []);
  return (
    <a href={href} download className={`rez__dock${show ? " is-on" : ""}`} tabIndex={show ? 0 : -1} aria-hidden={show ? undefined : true}>
      Download PDF <span aria-hidden>↓</span>
    </a>
  );
}
