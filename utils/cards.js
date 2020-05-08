// My card and deck helpers

let deck = [];
const setDeck = (newDeckArray) => {
  deck = newDeckArray;
}

const freshDeck = ['ace clubs', 'two clubs', 'three clubs', 'four clubs', 'five clubs', 'six clubs', 'seven clubs', 'eight clubs', 'nine clubs', 'ten clubs', 'jack clubs', 'queen clubs', 'king clubs', 'ace diamonds', 'two diamonds', 'three diamonds', 'four diamonds', 'five diamonds', 'six diamonds', 'seven diamonds', 'eight diamonds', 'nine diamonds', 'ten diamonds', 'jack diamonds', 'queen diamonds', 'king diamonds', 'ace hearts', 'two hearts', 'three hearts', 'four hearts', 'five hearts', 'six hearts', 'seven hearts', 'eight hearts', 'nine hearts', 'ten hearts', 'jack hearts', 'queen hearts', 'king hearts', 'ace spades', 'two spades', 'three spades', 'four spades', 'five spades', 'six spades', 'seven spades', 'eight spades', 'nine spades', 'ten spades', 'jack spades', 'queen spades', 'king spades'];

const numberEvalMap = {
  'ace': 'a',
  'two': '2',
  'three': '3',
  'four': '4',
  'five': '5',
  'six': '6',
  'seven': '7',
  'eight': '8',
  'nine': '9',
  'ten': 't',
  'jack': 'j',
  'queen': 'q',
  'king': 'k',
};

const suitEvalMap = {
  'clubs': 'c',
  'diamonds': 'd',
  'hearts': 'h',
  'spades': 's',
};

const evalMap = (cards) => {
  return cards.map(card => {
    const numberSuit = card.split(' ');
    const number = numberEvalMap[numberSuit[0]];
    const suit = suitEvalMap[numberSuit[1]];
    return [number, suit].join('');
  });
}

const drawCard = () => {
  const randomCardIndex = Math.floor((Math.random() * deck.length))
  const randomCardString = deck[randomCardIndex];

  deck.splice(randomCardIndex, 1);
  return randomCardString;
}

const shuffleTheDeck = () => {
  deck = [...freshDeck];
}

module.exports = { evalMap, drawCard, shuffleTheDeck, deck, setDeck };
