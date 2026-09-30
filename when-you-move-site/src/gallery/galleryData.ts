export const pieces = [
  { id: '01', color: '#e97851', ink: '#602f24', shape: 'circle' },
  { id: '02', color: '#c5ced7', ink: '#42566b', shape: 'bars' },
  { id: '03', color: '#dedf92', ink: '#656c38', shape: 'arch' },
  { id: '04', color: '#af9ebe', ink: '#574461', shape: 'square' },
  { id: '05', color: '#a9c8b3', ink: '#3f6552', shape: 'lines' },
] as const
export type Piece = typeof pieces[number]
