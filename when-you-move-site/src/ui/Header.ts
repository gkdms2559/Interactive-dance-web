export function createHeader(): HTMLElement {
  const element = document.createElement('header'); element.className = 'header'
  element.innerHTML = '<span>WHEN YOU MOVE</span><button type="button" class="about">ABOUT</button>'
  return element
}
