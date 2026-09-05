/** Print only the element marked with .print-guide-root. */
export const printWelcomeGuide = () => {
  document.body.classList.add("printing-guide");
  const cleanup = () => {
    document.body.classList.remove("printing-guide");
    window.removeEventListener("afterprint", cleanup);
  };
  window.addEventListener("afterprint", cleanup);
  window.print();
  // Safari/iOS may not fire afterprint reliably
  setTimeout(cleanup, 1000);
};
