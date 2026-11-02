// Both games copy the room code itself and share the manual-selection fallback.
export async function copyRoomCode(code, codeElement, notify) {
  try {
    await navigator.clipboard.writeText(code);
    notify(`房號 ${code} 已複製。`);
  } catch {
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(codeElement);
    selection.removeAllRanges();
    selection.addRange(range);
    notify(`請複製已選取的房號：${code}`);
  }
}
