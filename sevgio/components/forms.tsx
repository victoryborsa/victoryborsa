"use client";
import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import type { ActionState } from "@/lib/validate.ts";

export function SubmitButton({ children, className = "btn btn-primary", pendingText, ...rest }: { children: React.ReactNode; className?: string; pendingText?: string } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { pending } = useFormStatus();
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
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state?.ok && resetOnOk) ref.current?.reset(); }, [state, resetOnOk]);
  return (
    <form
      ref={ref}
      action={formAction}
      className={className}
      id={id}
      noValidate
      onSubmit={e => { if (confirmText && !window.confirm(confirmText)) e.preventDefault(); }}
    >
      {children}
      {state?.error && <div className="notice error" role="alert">{state.error}</div>}
      {state?.ok && <div className="notice ok" role="status">{state.ok}</div>}
    </form>
  );
}
