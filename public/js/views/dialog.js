// Shared dialog hit testing and dismissal policy. Game rules decide whether dismissal is allowed.
export function bindDialogDismiss({ dialog, closeButton, canDismiss = () => true, onDismiss = () => dialog.close() }) {
  const dismiss = () => { if (canDismiss()) onDismiss(); };
  const onCancel = event => { event.preventDefault?.(); dismiss(); };
  const onClick = event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dismiss();
  };
  if (closeButton) closeButton.onclick = dismiss;
  dialog.addEventListener('cancel', onCancel);
  dialog.addEventListener('click', onClick);
}
