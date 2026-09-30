export function createFooter(): HTMLElement {
  const element = document.createElement('footer'); element.className = 'footer'
  element.innerHTML = '<span>© WHEN YOU MOVE</span><span>INTERACTIVE ARCHIVE</span>'
  return element
}
