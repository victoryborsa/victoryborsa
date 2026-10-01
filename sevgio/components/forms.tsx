"use client";
import { createContext, useActionState, useContext, useEffect, useRef, useTransition } from "react";
import { useFormStatus } from "react-dom";
import type { ActionState } from "@/lib/validate.ts";

// ActionForm submits by hand (see below), so it tells its buttons when it's busy.
const Busy = createContext<boolean | null>(null);

export function SubmitButton({ children, className = "btn btn-primary", pendingText, ...rest }: { children: React.ReactNode; className?: string; pendingText?: string } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const status = useFormStatus();
  const busy = useContext(Busy);
  const pending = busy ?? status.pending;
  const { name, value, onClick, ...other } = rest;
  // A named button (e.g. Accept vs Decline) copies its value into a hidden field, so the choice always reaches the server.
  const remember = (e: React.MouseEvent<HTMLButtonElement>) => {
    const form = e.currentTarget.form;
    if (form && name) {
      let h = form.querySelector<HTMLInputElement>(`input[type=hidden][data-submitter="${name}"]`);
      if (!h) { h = document.createElement("input"); h.type = "hidden"; h.name = name; h.dataset.submitter = name; form.appendChild(h); }
      h.value = String(value ?? "");
    }
    onClick?.(e);
  };
  return (
    <button type="submit" className={className} disabled={pending || other.disabled} aria-busy={pending} onClick={remember} {...other}>
      {pending ? pendingText || "Working…" : children}
    </button>
  );
}

/** A form bound to a server action that shows its success or error message in place. */
export function ActionForm({
  action, children, className = "stack", id, resetOnOk = false, confirmText,
}: {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  children: React.ReactNode; className?: string; id?: string; resetOnOk?: boolean; confirmText?: string;
}) {
  const [state, formAction] = useActionState(action, null);
  const [busy, startBusy] = useTransition();
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state?.ok && resetOnOk) ref.current?.reset(); }, [state, resetOnOk]);
  return (
    <form
      ref={ref}
      className={className}
      id={id}
      noValidate
      onSubmit={e => {
        // Submitting by hand (instead of <form action>) keeps what the person typed when the server sends back an error;
        // React would otherwise reset every field to its saved value.
        e.preventDefault();
        if (confirmText && !window.confirm(confirmText)) return;
        const fd = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
        startBusy(() => formAction(fd));
      }}
    >
      <Busy.Provider value={busy}>{children}</Busy.Provider>
      {state?.error && <div className="notice error" role="alert">{state.error}</div>}
      {state?.ok && <div className="notice ok" role="status">{state.ok}</div>}
    </form>
  );
}
