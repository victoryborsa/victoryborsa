"use client";
import { useState } from "react";

/** A password box with an eye button to show or hide what was typed. */
export function PasswordInput(props: Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "className">) {
  const [show, setShow] = useState(false);
  return (
    <span className="pw-wrap">
      <input {...props} className="input" type={show ? "text" : "password"} autoCapitalize="off" spellCheck={false} />
      <button type="button" className="pw-eye" onClick={() => setShow(s => !s)} aria-label={show ? "Hide what you typed" : "Show what you typed"} aria-pressed={show} title={show ? "Hide" : "Show"}>
        {show ? (
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M3 3l18 18M10.6 5.1A10.4 10.4 0 0 1 12 5c5 0 9 4.5 10 7-.4 1-1.3 2.4-2.6 3.8M6.1 6.7C4.2 8 2.7 10 2 12c1 2.5 5 7 10 7 1.7 0 3.3-.5 4.7-1.3M9.9 9.9a3 3 0 0 0 4.2 4.2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
        ) : (
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M2 12c1-2.5 5-7 10-7s9 4.5 10 7c-1 2.5-5 7-10 7S3 14.5 2 12z" fill="none" stroke="currentColor" strokeWidth="1.8" /><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="1.8" /></svg>
        )}
      </button>
    </span>
  );
}
