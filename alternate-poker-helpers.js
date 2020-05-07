
// Alternates in case I prefer to store them in the database and map them on print.
// Currently i store them printable and map them on evaluation, which is less processor intensive, but uses more space.

// Alternatively, i change the classes in angular to just use these.

// My poker helpers
const freshDeck = ['ac','2c','3c','4c','5c','6c','7c','8c','9c','tc','jc','qc','kc','ad','2d','3d','4d','5d','6d','7d','8d','9d','td','jd','qd','kd','ah','2h','3h','4h','5h','6h','7h','8h','9h','th','jh','qh','kh','as','2s','3s','4s','5s','6s','7s','8s','9s','ts','js','qs','ks'];
const numberPrintMap = {
    'a': 'ace',
    '2': 'two',
    '3': 'three',
    '4': 'four',
    '5': 'five',
    '6': 'six',
    '7': 'seven',
    '8': 'eight',
    '9': 'nine',
    't': 'ten',
    'j': 'jack',
    'q': 'queen',
    'k': 'king',
};
const suitPrintMap = {
    'c': 'clubs',
    'd': 'diamonds',
    'h': 'hearts',
    's': 'spades',
};
const printMap = (cards) => {
  return cards.map(card => {
    const numberSuit = card.split('');
    const number = numberPrintMap[numberSuit[0]];
    const suit = suitPrintMap[numberSuit[1]];
    return [number, suit].join(' ');
  });
}
