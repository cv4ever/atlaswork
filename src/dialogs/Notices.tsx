// What the app says back: the confirmation dialog, the storage alert and the toast.
import { useEffect } from "react";
import { Archive, Trash2, X } from "lucide-react";
import { useApp, useUi, useWorkbench } from "../appContext.ts";
import Dialog from "../Dialog.tsx";

export function ConfirmDialog() {
  const { actions } = useApp();
  const confirming = useUi((state) => state.confirming);
  if (!confirming) return null;
  const close = () => actions.setUi({ confirming: null });
  return (
    <Dialog title={confirming.title} onClose={close}>
      <div className="dialog-body"><p className="confirm-body">{confirming.body}</p>
        {confirming.also && <label className="checkbox-label confirm-also">
          <input type="checkbox" checked={confirming.also.on}
            onChange={() => actions.setUi({ confirming: { ...confirming, also: { ...confirming.also!, on: !confirming.also!.on } } })} />
          {confirming.also.label}</label>}
      </div>
      <div className="dialog-footer">
        <button className="quiet-button" onClick={close}>Keep it</button>
        <button className={`primary-button ${confirming.danger ? "danger-button" : ""}`} onClick={() => { confirming.run(confirming.also?.on); close(); }}>
          {confirming.danger ? <Trash2 size={16} /> : <Archive size={16} />}{confirming.action}
        </button>
      </div>
    </Dialog>
  );
}

export function StorageAlert() {
  const { actions, workbench } = useApp();
  const storageError = useWorkbench((snapshot) => snapshot.storageError);
  if (!storageError) return null;
  return (
    <div className="storage-error" role="alert">
      Your latest changes may not be saved: {storageError}
      <button onClick={() => void workbench.retrySaving()}>Retry saving</button>
      <button onClick={() => void actions.exportBackup()}>Export a copy</button>
    </div>
  );
}

/** What the app says back; a toast with buttons (`toastAction`: Undo, Sort with Atlas) shows them and stays 10 seconds instead of 6. */
export function Toast() {
  const { actions } = useApp();
  const toast = useUi((state) => state.toast);
  const action = useUi((state) => state.toastAction?.for === state.toast ? state.toastAction : null);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => actions.setUi({ toast: "" }), action ? 10000 : 6000);
    return () => clearTimeout(timer);
  }, [toast, action, actions]);
  if (!toast) return null;
  return (
    <div className="toast" role="status">
      <span>{toast}</span>
      {action?.buttons.map((button) => (
        <button key={button.label} className="text-button toast-action" onClick={() => { actions.setUi({ toast: "", toastAction: null }); button.run(); }}>{button.label}</button>
      ))}
      <button className="icon-button" aria-label="Dismiss notification" onClick={() => actions.setUi({ toast: "" })}><X size={14} /></button>
    </div>
  );
}
