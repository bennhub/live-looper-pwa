// Native <dialog> confirm helper - closes cleanly on Escape for free.

export function confirmDialog(message: string, confirmLabel = "Confirm"): Promise<boolean> {
  return new Promise((resolve) => {
    const dialog = document.createElement("dialog");
    dialog.className = "confirm-dialog";
    const text = document.createElement("p");
    text.textContent = message;
    const actions = document.createElement("div");
    actions.className = "dialog-actions";
    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.textContent = "Cancel";
    const confirmBtn = document.createElement("button");
    confirmBtn.type = "button";
    confirmBtn.className = "danger";
    confirmBtn.textContent = confirmLabel;
    actions.append(cancelBtn, confirmBtn);
    dialog.append(text, actions);
    document.body.appendChild(dialog);

    let resolved = false;
    const finish = (value: boolean) => {
      if (resolved) return;
      resolved = true;
      resolve(value);
      dialog.close();
    };
    cancelBtn.addEventListener("click", () => finish(false));
    confirmBtn.addEventListener("click", () => finish(true));
    dialog.addEventListener("close", () => {
      finish(false); // Escape or backdrop dismiss counts as cancel
      dialog.remove();
    });
    dialog.showModal();
  });
}
