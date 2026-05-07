import { useState } from "react";
import type { Appointment } from "@/data/mockData";

interface ResolveModalProps {
  appt: Appointment;
  onCancel: () => void;
  onConfirm: (id: string, notes: string) => void;
}

export function ResolveModal({ appt, onCancel, onConfirm }: ResolveModalProps) {
  const [notes, setNotes] = useState("");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-background shadow-2xl">
        <div className="border-b border-border p-6">
          <h2 className="text-lg font-bold text-foreground">Resolve Exception</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{appt.patientName}</span> ·{" "}
            {appt.escalatedStageName}
          </p>
          <p className="mt-2 text-sm text-danger">{appt.escalationReason}</p>
        </div>
        <div className="p-6">
          <label className="block text-sm font-medium text-foreground">
            Resolution Notes <span className="text-danger">*</span>
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            className="mt-2 w-full rounded-md border border-border bg-background p-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            placeholder="Document how this was resolved..."
          />
        </div>
        <div className="flex justify-end gap-2 border-t border-border p-4">
          <button
            onClick={onCancel}
            className="rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
          >
            Cancel
          </button>
          <button
            disabled={!notes.trim()}
            onClick={() => onConfirm(appt.id, notes.trim())}
            className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-brand-foreground hover:bg-brand/90 disabled:opacity-50"
          >
            Confirm Resolution
          </button>
        </div>
      </div>
    </div>
  );
}
